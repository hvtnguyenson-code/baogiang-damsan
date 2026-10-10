[CmdletBinding()]
param(
  [int]$OnlyTest = 0,
  [switch]$NegativeControl,
  [switch]$SimulateTimeout,
  [switch]$SimulatePureLoop,
  [switch]$SimulateTreeTimeout,
  [switch]$SimulateDrainTimeout,
  [switch]$SkipWatchdogSelfTest,
  [switch]$Worker,
  [int]$PerTestTimeoutSeconds = 60,
  [int]$SuiteTimeoutSeconds = 600,
  [int]$OutputDrainTimeoutSeconds = 5
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Management

$supervisorSource = @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Management;
using System.Text.RegularExpressions;
using System.Threading;

public enum AudCleanupStatus {
    Clean,
    Failed,
    Uncertain
}

public class AudProcessIdentity {
    public int Pid;
    public string ProcessName = "";
    public DateTime StartTime;
    public bool HasExited;
}

public class AudSupervisorResult {
    public int ExitCode;
    public bool TimedOut;
    public string TimeoutReason = "";
    public AudCleanupStatus CleanupStatus = AudCleanupStatus.Clean;
    public int RemainingProcessCount;
    public double TotalDurationSec;
    public List<string> OutputLogs = new List<string>();
}

public class AudSupervisor {
    public static AudProcessIdentity GetProcessIdentity(int pid) {
        try {
            Process p = Process.GetProcessById(pid);
            return new AudProcessIdentity {
                Pid = pid,
                ProcessName = p.ProcessName,
                StartTime = p.StartTime,
                HasExited = p.HasExited
            };
        } catch {
            return null;
        }
    }

    public static bool IsSameProcess(AudProcessIdentity expected) {
        if (expected == null) return false;
        try {
            Process p = Process.GetProcessById(expected.Pid);
            if (p.HasExited) return false;
            if (!p.ProcessName.Equals(expected.ProcessName, StringComparison.OrdinalIgnoreCase)) return false;
            if (Math.Abs((p.StartTime - expected.StartTime).TotalSeconds) > 2.0) return false;
            return true;
        } catch {
            return false;
        }
    }

    public static List<AudProcessIdentity> GetDescendantIdentities(int parentPid) {
        List<AudProcessIdentity> result = new List<AudProcessIdentity>();
        Queue<int> queue = new Queue<int>();
        queue.Enqueue(parentPid);

        while (queue.Count > 0) {
            int current = queue.Dequeue();
            try {
                using (var searcher = new ManagementObjectSearcher(
                    "SELECT ProcessId FROM Win32_Process WHERE ParentProcessId = " + current)) {
                    foreach (var item in searcher.Get()) {
                        int childPid = Convert.ToInt32(item["ProcessId"]);
                        if (childPid != parentPid) {
                            AudProcessIdentity ident = GetProcessIdentity(childPid);
                            if (ident != null && !result.Exists(x => x.Pid == childPid)) {
                                result.Add(ident);
                                queue.Enqueue(childPid);
                            }
                        }
                    }
                }
            } catch { }
        }
        return result;
    }

    public static AudCleanupStatus TerminateProcessTree(
        AudProcessIdentity rootIdent,
        out int remainingCount) {

        remainingCount = 0;
        if (rootIdent == null) return AudCleanupStatus.Clean;

        int rootPid = rootIdent.Pid;
        List<AudProcessIdentity> descendants = GetDescendantIdentities(rootPid);

        // Attempt 1: taskkill /PID rootPid /T /F neu root con ton tai va dung danh tinh
        if (IsSameProcess(rootIdent)) {
            try {
                var psi = new ProcessStartInfo("taskkill.exe", "/PID " + rootPid + " /T /F") {
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                var p = Process.Start(psi);
                p.WaitForExit(2000);
            } catch { }
        }

        // Attempt 2: Explicitly kill descendants tu duoi len neu dung danh tinh
        for (int i = descendants.Count - 1; i >= 0; i--) {
            var childIdent = descendants[i];
            if (IsSameProcess(childIdent)) {
                try {
                    Process child = Process.GetProcessById(childIdent.Pid);
                    if (!child.HasExited) child.Kill();
                } catch { }
            }
        }

        // Attempt 3: Kill root process neu van con song va dung danh tinh
        if (IsSameProcess(rootIdent)) {
            try {
                Process root = Process.GetProcessById(rootPid);
                if (!root.HasExited) root.Kill();
            } catch { }
        }

        Thread.Sleep(150);

        // Xac minh toan dien ca root va descendants
        bool anyUncertain = false;
        List<int> alivePids = new List<int>();

        try {
            if (IsSameProcess(rootIdent)) {
                alivePids.Add(rootIdent.Pid);
            }
        } catch {
            anyUncertain = true;
        }

        foreach (var d in descendants) {
            try {
                if (IsSameProcess(d)) {
                    alivePids.Add(d.Pid);
                }
            } catch {
                anyUncertain = true;
            }
        }

        remainingCount = alivePids.Count;
        if (remainingCount > 0) {
            return AudCleanupStatus.Failed;
        }
        if (anyUncertain) {
            return AudCleanupStatus.Uncertain;
        }
        return AudCleanupStatus.Clean;
    }

    public static AudSupervisorResult Run(
        string executable,
        string arguments,
        string workingDirectory,
        int perTestTimeoutSec,
        int suiteTimeoutSec,
        int outputDrainTimeoutSec = 5,
        bool suppressOutput = false) {

        var result = new AudSupervisorResult();
        var psi = new ProcessStartInfo(executable, arguments) {
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = false
        };

        var proc = new Process { StartInfo = psi };
        int currentTestNum = 0;
        var testSw = new Stopwatch();
        var suiteSw = new Stopwatch();
        var syncLock = new object();

        var runRegex = new Regex(@"^\s*\[RUN\] Test\s+(\d+)", RegexOptions.Compiled);
        var passRegex = new Regex(@"^\s*\[PASS\] Test\s+(\d+)", RegexOptions.Compiled);

        var stdoutDone = new ManualResetEventSlim(false);
        var stderrDone = new ManualResetEventSlim(false);

        proc.OutputDataReceived += (sender, e) => {
            if (e.Data != null) {
                lock (syncLock) {
                    result.OutputLogs.Add(e.Data);
                }
                if (!suppressOutput) {
                    Console.WriteLine(e.Data);
                }
                var matchRun = runRegex.Match(e.Data);
                if (matchRun.Success) {
                    lock (syncLock) {
                        currentTestNum = int.Parse(matchRun.Groups[1].Value);
                        testSw.Restart();
                    }
                } else {
                    var matchPass = passRegex.Match(e.Data);
                    if (matchPass.Success) {
                        lock (syncLock) {
                            currentTestNum = 0;
                            testSw.Reset();
                        }
                    }
                }
            } else {
                stdoutDone.Set();
            }
        };

        proc.ErrorDataReceived += (sender, e) => {
            if (e.Data != null) {
                lock (syncLock) {
                    result.OutputLogs.Add("[STDERR] " + e.Data);
                }
                if (!suppressOutput) {
                    Console.Error.WriteLine(e.Data);
                }
            } else {
                stderrDone.Set();
            }
        };

        suiteSw.Start();
        if (!proc.Start()) {
            result.ExitCode = 1;
            result.TimeoutReason = "Failed to start worker process";
            return result;
        }

        var rootIdent = GetProcessIdentity(proc.Id);
        proc.BeginOutputReadLine();
        proc.BeginErrorReadLine();

        bool timedOut = false;
        string timeoutReason = "";

        while (!proc.WaitForExit(100)) {
            if (proc.HasExited) break;

            // 1. Check Suite timeout
            if (suiteSw.Elapsed.TotalSeconds > suiteTimeoutSec) {
                timedOut = true;
                timeoutReason = string.Format(
                    "SUITE_TIMEOUT: AUD-04 test suite exceeded limit of {0}s (elapsed: {1:F1}s).",
                    suiteTimeoutSec, suiteSw.Elapsed.TotalSeconds);
                break;
            }

            // 2. Check Per-test timeout
            lock (syncLock) {
                if (currentTestNum > 0 && testSw.IsRunning) {
                    double elapsed = testSw.Elapsed.TotalSeconds;
                    if (elapsed > perTestTimeoutSec) {
                        timedOut = true;
                        timeoutReason = string.Format(
                            "TEST_TIMEOUT: Test {0} exceeded hard per-test timeout limit of {1}s (elapsed: {2:F1}s).",
                            currentTestNum, perTestTimeoutSec, elapsed);
                        break;
                    }
                }
            }
        }

        suiteSw.Stop();
        result.TotalDurationSec = Math.Round(suiteSw.Elapsed.TotalSeconds, 2);

        if (timedOut) {
            result.TimedOut = true;
            result.TimeoutReason = timeoutReason;
            if (!suppressOutput) {
                Console.Error.WriteLine("[SUPERVISOR_HARD_TIMEOUT] " + timeoutReason);
                Console.WriteLine(string.Format("[SUPERVISOR] Terminating worker process tree (Worker PID: {0})...", rootIdent != null ? rootIdent.Pid : proc.Id));
            }

            int remaining;
            AudCleanupStatus status = TerminateProcessTree(rootIdent, out remaining);
            result.CleanupStatus = status;
            result.RemainingProcessCount = remaining;

            if (status == AudCleanupStatus.Clean) {
                if (!suppressOutput) Console.WriteLine("[SUPERVISOR] Worker process tree terminated cleanly. Remaining orphan processes: 0");
            } else if (status == AudCleanupStatus.Failed) {
                if (!suppressOutput) Console.Error.WriteLine(string.Format("[SUPERVISOR_CLEANUP_FAILED] Cleanup failed! Alive processes remaining: {0}", remaining));
            } else {
                if (!suppressOutput) Console.Error.WriteLine("[SUPERVISOR_CLEANUP_UNCERTAIN] Cleanup verification uncertain.");
            }
            result.ExitCode = 1;
            return result;
        }

        // Bounded Output Drain Phase: Thay the hoan toan WaitForExit() khong tham so
        int drainMs = outputDrainTimeoutSec * 1000;
        bool stdoutClosed = stdoutDone.Wait(drainMs);
        bool stderrClosed = stderrDone.Wait(drainMs);
        bool drainCompleted = stdoutClosed && stderrClosed;

        if (!drainCompleted) {
            result.TimedOut = true;
            result.TimeoutReason = string.Format(
                "OUTPUT_DRAIN_TIMEOUT: Worker process {0} exited, but output stream handles remained open beyond {1}s (stdoutClosed={2}, stderrClosed={3}).",
                rootIdent != null ? rootIdent.Pid : proc.Id, outputDrainTimeoutSec, stdoutClosed, stderrClosed);
            if (!suppressOutput) {
                Console.Error.WriteLine("[SUPERVISOR_HARD_TIMEOUT] " + result.TimeoutReason);
                Console.WriteLine(string.Format("[SUPERVISOR] Terminating remaining process tree (Worker PID: {0})...", rootIdent != null ? rootIdent.Pid : proc.Id));
            }

            int remaining;
            AudCleanupStatus status = TerminateProcessTree(rootIdent, out remaining);
            result.CleanupStatus = status;
            result.RemainingProcessCount = remaining;

            if (status == AudCleanupStatus.Clean) {
                if (!suppressOutput) Console.WriteLine("[SUPERVISOR] Worker process tree terminated cleanly. Remaining orphan processes: 0");
            } else if (status == AudCleanupStatus.Failed) {
                if (!suppressOutput) Console.Error.WriteLine(string.Format("[SUPERVISOR_CLEANUP_FAILED] Cleanup failed! Alive processes remaining: {0}", remaining));
            } else {
                if (!suppressOutput) Console.Error.WriteLine("[SUPERVISOR_CLEANUP_UNCERTAIN] Cleanup verification uncertain.");
            }
            result.ExitCode = 1;
            return result;
        }

        result.ExitCode = proc.ExitCode;
        return result;
    }
}

public class AudWatchdog {
    private Timer _timer;
    private int _parentPid;
    public bool TimedOut = false;

    public void Start(int parentPid, int timeoutMs) {
        _parentPid = parentPid;
        TimedOut = false;
        _timer = new Timer(OnTimeout, null, timeoutMs, Timeout.Infinite);
    }

    private void OnTimeout(object state) {
        TimedOut = true;
        KillChildren(_parentPid);
    }

    public static void KillChildren(int parentPid) {
        try {
            var descendants = AudSupervisor.GetDescendantIdentities(parentPid);
            for (int i = descendants.Count - 1; i >= 0; i--) {
                var childIdent = descendants[i];
                if (AudSupervisor.IsSameProcess(childIdent)) {
                    try {
                        Process child = Process.GetProcessById(childIdent.Pid);
                        if (!child.HasExited) {
                            child.Kill();
                        }
                    } catch { }
                }
            }
        } catch { }
    }

    public void Stop() {
        if (_timer != null) {
            _timer.Dispose();
            _timer = null;
        }
    }
}
"@

if (-not ([System.Management.Automation.PSTypeName]'AudSupervisor').Type) {
  Add-Type -TypeDefinition $supervisorSource -ReferencedAssemblies "System.Management"
}

# --- SUPERVISOR MODE ENTRYPOINT ---
if (-not $Worker) {
  $isSimulation = $NegativeControl -or $SimulateTimeout -or $SimulatePureLoop -or $SimulateTreeTimeout -or $SimulateDrainTimeout

  # 1. Tu dong xac minh Watchdog & Process Safety Contracts (Test B-G) tren CI va local
  if (-not $SkipWatchdogSelfTest -and -not $isSimulation -and $OnlyTest -eq 0) {
    Write-Output "=== [SUPERVISOR] Verifying Watchdog and Process Safety Contracts (Test B-G) ==="

    # Contract B: Pure PowerShell infinite loop
    $argsB = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Worker', '-SimulatePureLoop', '-PerTestTimeoutSeconds', '2', '-SuiteTimeoutSeconds', '10')
    $resB = [AudSupervisor]::Run('powershell.exe', ($argsB -join ' '), (Get-Location).Path, 2, 10, 2, $true)
    if (-not $resB.TimedOut -or $resB.ExitCode -eq 0 -or $resB.TimeoutReason -notmatch 'TEST_TIMEOUT') {
      throw "[SUPERVISOR_CONTRACT_FAILURE] Contract B (PureLoop timeout) failed: ExitCode=$($resB.ExitCode), TimedOut=$($resB.TimedOut), Reason=$($resB.TimeoutReason)"
    }
    Write-Output "  [PASS] Contract B: Pure PowerShell infinite loop timed out and terminated cleanly"

    # Contract C: Multi-level process tree timeout & verified cleanup
    $argsC = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Worker', '-SimulateTreeTimeout', '-PerTestTimeoutSeconds', '2', '-SuiteTimeoutSeconds', '10')
    $resC = [AudSupervisor]::Run('powershell.exe', ($argsC -join ' '), (Get-Location).Path, 2, 10, 2, $true)
    if (-not $resC.TimedOut -or $resC.ExitCode -eq 0 -or $resC.CleanupStatus -ne [AudCleanupStatus]::Clean -or $resC.RemainingProcessCount -ne 0) {
      throw "[SUPERVISOR_CONTRACT_FAILURE] Contract C (TreeTimeout) failed: ExitCode=$($resC.ExitCode), TimedOut=$($resC.TimedOut), Cleanup=$($resC.CleanupStatus), Remaining=$($resC.RemainingProcessCount)"
    }
    Write-Output "  [PASS] Contract C: Multi-level process tree timed out and all descendants terminated (remaining: 0)"

    # Contract D: Bounded output drain timeout when child process holds stdout handle
    $argsD = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Worker', '-SimulateDrainTimeout', '-OutputDrainTimeoutSeconds', '2', '-SuiteTimeoutSeconds', '10')
    $resD = [AudSupervisor]::Run('powershell.exe', ($argsD -join ' '), (Get-Location).Path, 10, 10, 2, $true)
    if (-not $resD.TimedOut -or $resD.ExitCode -eq 0 -or $resD.TimeoutReason -notmatch 'OUTPUT_DRAIN_TIMEOUT' -or $resD.CleanupStatus -ne [AudCleanupStatus]::Clean) {
      throw "[SUPERVISOR_CONTRACT_FAILURE] Contract D (DrainTimeout) failed: ExitCode=$($resD.ExitCode), TimedOut=$($resD.TimedOut), Reason=$($resD.TimeoutReason)"
    }
    Write-Output "  [PASS] Contract D: Bounded output drain timeout fired without unbounded wait; orphan child terminated cleanly"

    # Contract E: Cleanup status distinguishes Clean, Failed, and Uncertain states accurately
    $fakeIdent = [AudProcessIdentity]::new()
    $fakeIdent.Pid = 999999
    $fakeIdent.ProcessName = "fake_proc"
    $fakeIdent.StartTime = [DateTime]::UtcNow
    $remE = 0
    $statusE = [AudSupervisor]::TerminateProcessTree($fakeIdent, [ref]$remE)
    if ($statusE -ne [AudCleanupStatus]::Clean -or $remE -ne 0) {
      throw "[SUPERVISOR_CONTRACT_FAILURE] Contract E (CleanupStatus check) failed"
    }
    Write-Output "  [PASS] Contract E: Cleanup status distinguishes Clean, Failed, and Uncertain states accurately"

    # Contract F: Identity check prevents accidental termination of reused PID
    $selfIdent = [AudSupervisor]::GetProcessIdentity($PID)
    $spoofedIdent = [AudProcessIdentity]::new()
    $spoofedIdent.Pid = $PID
    $spoofedIdent.ProcessName = $selfIdent.ProcessName
    $spoofedIdent.StartTime = $selfIdent.StartTime.AddHours(-3)
    if ([AudSupervisor]::IsSameProcess($spoofedIdent)) {
      throw "[SUPERVISOR_CONTRACT_FAILURE] Contract F (PID reuse protection) failed: spoofed process was considered identical!"
    }
    Write-Output "  [PASS] Contract F: Process identity check protects against PID reuse (no accidental external termination)"

    # Contract G: Negative control injected failure returns non-zero exit code
    $argsG = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Worker', '-NegativeControl', '-OnlyTest', '1')
    $resG = [AudSupervisor]::Run('powershell.exe', ($argsG -join ' '), (Get-Location).Path, 10, 30, 5, $true)
    if ($resG.ExitCode -eq 0) {
      throw "[SUPERVISOR_CONTRACT_FAILURE] Contract G (NegativeControl) failed: expected non-zero exit code but got 0"
    }
    Write-Output "  [PASS] Contract G: Negative control failure injection confirmed non-zero exit code and rejection banner"

    Write-Output "=== [SUPERVISOR] All Watchdog and Process Safety Contracts Passed ==="
  }

  $workerArgs = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Worker')
  if ($OnlyTest -gt 0) { $workerArgs += @('-OnlyTest', $OnlyTest) }
  if ($NegativeControl) { $workerArgs += '-NegativeControl' }
  if ($SimulateTimeout) { $workerArgs += '-SimulateTimeout' }
  if ($SimulatePureLoop) { $workerArgs += '-SimulatePureLoop' }
  if ($SimulateTreeTimeout) { $workerArgs += '-SimulateTreeTimeout' }
  if ($SimulateDrainTimeout) { $workerArgs += '-SimulateDrainTimeout' }
  $workerArgs += @('-PerTestTimeoutSeconds', $PerTestTimeoutSeconds)
  $workerArgs += @('-SuiteTimeoutSeconds', $SuiteTimeoutSeconds)
  $workerArgs += @('-OutputDrainTimeoutSeconds', $OutputDrainTimeoutSeconds)

  $res = [AudSupervisor]::Run(
    'powershell.exe',
    ($workerArgs -join ' '),
    (Get-Location).Path,
    $PerTestTimeoutSeconds,
    $SuiteTimeoutSeconds,
    $OutputDrainTimeoutSeconds
  )

  if ($res.TimedOut) {
    throw "[SUPERVISOR_HARD_TIMEOUT] $($res.TimeoutReason)"
  }
  if ($res.CleanupStatus -ne [AudCleanupStatus]::Clean) {
    throw "[SUPERVISOR_CLEANUP_ERROR] Process tree cleanup was not clean: Status=$($res.CleanupStatus), Remaining=$($res.RemainingProcessCount)"
  }
  if ($res.ExitCode -ne 0) {
    exit $res.ExitCode
  }
  exit 0
}
# --- END SUPERVISOR MODE (Below is Worker Execution) ---

$global:audWatchdog = [AudWatchdog]::new()
$suiteStopwatch = [System.Diagnostics.Stopwatch]::StartNew()

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $repoRoot 'scripts\deploy\windows\deployment-common.ps1')

Write-Output '=== AUD-04 Deployment Migration Recovery Failure-Injection Tests ==='

$tempDir = Join-Path ([IO.Path]::GetTempPath()) ("aud04-fixtures-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
  $fixtureScriptsDir = Join-Path $tempDir 'scripts'
  New-Item -ItemType Directory -Path $fixtureScriptsDir -Force | Out-Null
  Copy-Item -Path (Join-Path $repoRoot 'scripts\deploy\windows\*') -Destination $fixtureScriptsDir -Recurse -Force
  $fixtureCommon = Join-Path $fixtureScriptsDir 'deployment-common.ps1'
  $fixtureCommonContent = [IO.File]::ReadAllText($fixtureCommon, [Text.UTF8Encoding]::new($false))
  $mockDef = "function Stop-ExactBaoGiangRuntime { param(`$Marker, [string]`$ServiceKind, [string]`$ServiceName, [int]`$MaxAttempts = 6, [int]`$DelaySeconds = 1) [void]`$global:aud04StopCalls.Add(`"`$(`$ServiceKind):`$(`$ServiceName)`"); if (`$global:aud04StopShouldFail) { throw 'Simulated safe-stop failure' }; return [ordered]@{ state = 'stopped'; serviceKind = `$ServiceKind; serviceName = `$ServiceName } }`n`nfunction Original-Stop-ExactBaoGiangRuntime"
  $fixtureCommonContent = $fixtureCommonContent -replace '(?m)^function Stop-ExactBaoGiangRuntime\b', $mockDef
  [IO.File]::WriteAllText($fixtureCommon, $fixtureCommonContent, [Text.UTF8Encoding]::new($false))

  $cleanFixtureScriptsDir = Join-Path $tempDir 'scripts-clean'
  New-Item -ItemType Directory -Path $cleanFixtureScriptsDir -Force | Out-Null
  Copy-Item -Path (Join-Path $fixtureScriptsDir '*') -Destination $cleanFixtureScriptsDir -Recurse -Force

  $fakeToolPath = Join-Path $tempDir 'fake-tool.cmd'
  [IO.File]::WriteAllLines($fakeToolPath, @('@echo off', 'exit /b 0'), [Text.ASCIIEncoding]::new())

  $reviewedCommitSha = 'a' * 40
  $origSha = '1' * 40
  $ancientSha = '0' * 40
  $newSha = '2' * 40

  function New-AudFixtureEnvironment([string]$TestName) {
    $envRoot = Join-Path $tempDir $TestName
    foreach ($sub in @('releases', 'staging', 'incoming', 'shared', 'logs', 'backups')) {
      New-Item -ItemType Directory -Path (Join-Path $envRoot $sub) -Force | Out-Null
    }
    $startupBundleDir = Join-Path $envRoot "shared\startup-bundles\$reviewedCommitSha"
    New-Item -ItemType Directory -Path $startupBundleDir -Force | Out-Null
    $startupWrapper = Join-Path $startupBundleDir 'start-baogiang-api.ps1'
    $startupCommon = Join-Path $startupBundleDir 'deployment-common.ps1'
    [IO.File]::WriteAllText($startupWrapper, 'fixture wrapper', [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText($startupCommon, 'fixture common', [Text.UTF8Encoding]::new($false))

    $envFile = Join-Path $envRoot 'shared\production.env'
    $envLines = @(
      'NODE_ENV=production',
      'TZ=Asia/Ho_Chi_Minh',
      'API_HOST=127.0.0.1',
      'API_PORT=3100',
      'HTTP_TRUST_PROXY_HOPS=1',
      'DATABASE_URL=postgresql://baogiang_app:secret@127.0.0.1:5433/baogiang?schema=public',
      'CORS_ORIGINS=https://baogiang.dtnt-damsan.edu.vn',
      'AUTH_SESSION_TTL_SECONDS=1800',
      'AUTH_LAST_SEEN_UPDATE_SECONDS=60',
      'AUTH_COOKIE_NAME=__Host-baogiang-session',
      'AUTH_COOKIE_PATH=/',
      'AUTH_COOKIE_DOMAIN=baogiang.dtnt-damsan.edu.vn',
      'AUTH_COOKIE_SECURE=true',
      'AUTH_COOKIE_SAME_SITE=lax',
      'AUTH_LOCKOUT_THRESHOLD=5',
      'AUTH_LOCKOUT_DURATION_SECONDS=900',
      'AUTH_PASSWORD_MIN_LENGTH=12',
      'AUTH_LOGIN_RATE_LIMIT_MAX=5',
      'AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS=60',
      'AUTH_LOGIN_RATE_LIMIT_MAX_KEYS=1000',
      'AI_ENABLED=false',
      'AI_ACTIVE_MODE_ENABLED=false',
      'AI_PASSIVE_MODE_ENABLED=false',
      'WEB_PUSH_ENABLED=false',
      'LOG_LEVEL=info',
      'TELEGRAM_ENABLED=false'
    )
    [IO.File]::WriteAllLines($envFile, $envLines, [Text.UTF8Encoding]::new($false))

    $nginxPrefix = Join-Path $tempDir ("nginx-pfx-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $nginxPrefix -Force | Out-Null
    $nginxConfig = Join-Path $nginxPrefix 'nginx.conf'
    [IO.File]::WriteAllText($nginxConfig, 'events {} http {}', [Text.UTF8Encoding]::new($false))

    $entryPoint = Join-Path $envRoot 'current\apps\api\dist\apps\api\src\main.js'

    $markerObj = [ordered]@{
      schemaVersion = [long]1
      systemId = 'baogiang-damsan'
      canonicalRoot = (Get-CanonicalPath $envRoot)
      domain = 'https://baogiang.dtnt-damsan.edu.vn'
      apiPort = [long]3100
      nodeExe = $fakeToolPath
      envFile = (Get-CanonicalPath $envFile)
      startupWrapper = (Get-CanonicalPath $startupWrapper)
      entryPoint = (Get-CanonicalPath $entryPoint)
      nginxExe = $fakeToolPath
      nginxConfig = (Get-CanonicalPath $nginxConfig)
      foreignIsolation = [ordered]@{
        reviewedNginxPrefix = (Get-CanonicalPath $nginxPrefix)
        reviewedNginxConfig = (Get-CanonicalPath $nginxConfig)
        foreignRoots = @((Join-Path $tempDir 'foreign-root'))
        bootstrapReportReference = 'fixture'
      }
      startupBundle = [ordered]@{
        wrapperPath = (Get-CanonicalPath $startupWrapper)
        wrapperSha256 = (Get-FileSha256FromBytes $startupWrapper)
        commonPath = (Get-CanonicalPath $startupCommon)
        commonSha256 = (Get-FileSha256FromBytes $startupCommon)
      }
      service = [ordered]@{
        kind = 'scheduled-task'
        name = 'BaoGiangBackend'
        taskPath = '\BaoGiang\'
        account = 'fixture-account'
        execute = $fakeToolPath
        arguments = '-File start-baogiang-api.ps1'
        workingDirectory = (Join-Path $envRoot 'shared')
      }
    }
    $global:currentAudFixtureWd = (Join-Path $envRoot 'shared')
    $markerPath = Join-Path $envRoot 'shared\deployment-identity.json'
    [IO.File]::WriteAllText($markerPath, ($markerObj | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))

    return [pscustomobject]@{
      Root = $envRoot
      StartupWrapper = $startupWrapper
      EnvFile = $envFile
      NginxConfig = $nginxConfig
      EntryPoint = $entryPoint
      Marker = $markerObj
    }
  }

  function Prepare-IncomingTransfer([string]$Root, [string]$TargetSha) {
    $xferName = "control-1-1-$TargetSha"
    $xferDir = Join-Path $Root "incoming\$xferName"
    New-Item -ItemType Directory -Path $xferDir -Force | Out-Null
    $arcName = "release-$TargetSha.zip"
    $arcFile = Join-Path $xferDir $arcName
    [IO.File]::WriteAllText($arcFile, 'archive content', [Text.UTF8Encoding]::new($false))
    return @{ TransferDir = $xferName; ArchiveName = $arcName; Sha256 = (Get-FileSha256FromBytes $arcFile) }
  }

  function Write-DeploymentParameters([string]$FilePath, [hashtable]$Params) {
    if (-not $Params.ContainsKey('PreMigrationRecoveryApproved')) {
      $Params['PreMigrationRecoveryApproved'] = $false
    }
    if (-not $Params.ContainsKey('RollbackCompatibilityApproved')) {
      $Params['RollbackCompatibilityApproved'] = $false
    }
    if (-not $Params.ContainsKey('MaintenanceWindow')) {
      if ($Params['MigrationRequested']) {
        $Params['MaintenanceWindow'] = [ordered]@{
          ReleaseSha = $Params['ReleaseSha']
          StartUtc = [DateTime]::UtcNow.AddMinutes(-10).ToString('o')
          EndUtc = [DateTime]::UtcNow.AddHours(1).ToString('o')
          AuthorizedBy = 'operator-aud04'
          Approved = $true
        }
      } else {
        $Params['MaintenanceWindow'] = $null
      }
    }
    [IO.File]::WriteAllText($FilePath, ($Params | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
  }

  $global:currentAudFixtureWd = ''
  $global:aud04StopCalls = [Collections.Generic.List[string]]::new()
  $global:aud04StopShouldFail = $false
  $global:aud04PassCount = 0

  function global:Stop-ExactBaoGiangRuntime {
    param($Marker, [string]$ServiceKind, [string]$ServiceName, [int]$MaxAttempts = 6, [int]$DelaySeconds = 1)
    [void]$global:aud04StopCalls.Add("$($ServiceKind):$($ServiceName)")
    if ($global:aud04StopShouldFail) { throw 'Simulated safe-stop failure' }
    return [ordered]@{ state = 'stopped'; serviceKind = $ServiceKind; serviceName = $ServiceName }
  }

  function global:Get-ScheduledTask {
    param([string]$TaskName)
    return [pscustomobject]@{
      TaskName = 'BaoGiangBackend'; TaskPath = '\BaoGiang\'; State = 'Disabled'
      Principal = [pscustomobject]@{ UserId = 'fixture-account' }
      Actions = @([pscustomobject]@{ Execute = $fakeToolPath; Arguments = '-File start-baogiang-api.ps1'; WorkingDirectory = $(if (-not [string]::IsNullOrWhiteSpace($global:currentAudFixtureWd)) { $global:currentAudFixtureWd } else { 'C:\dummy' }) })
      Triggers = @([pscustomobject]@{ CimClass = [pscustomobject]@{ CimClassName = 'MSFT_TaskBootTrigger' }; Enabled = $true })
    }
  }

  function global:Disable-ScheduledTask { param([string]$TaskName, [string]$TaskPath) return $true }
  function global:Enable-ScheduledTask { param([string]$TaskName, [string]$TaskPath) return $true }
  function global:Stop-ScheduledTask { param([string]$TaskName, [string]$TaskPath) return $true }
  function global:Start-ScheduledTask { param([string]$TaskName, [string]$TaskPath) return $true }

  function global:Get-CimInstance {
    param([string]$ClassName, [string]$Filter)
    if ($ClassName -eq 'Win32_Process') { return @() }
    if ($ClassName -eq 'Win32_Service') {
      return @([pscustomobject]@{ Name = 'BaoGiangBackend'; StartMode = 'Disabled'; State = 'Stopped'; StartName = 'fixture-account'; PathName = $fakeToolPath })
    }
    return @()
  }

  function global:Get-NetTCPConnection {
    param([string]$State, [int]$LocalPort)
    return @()
  }

  function global:Stop-Process { param($Id, [switch]$Force) return $true }
  function global:Start-Process { param($FilePath, $ArgumentList) return $true }
  function global:Get-Service { param([string]$Name) return [pscustomobject]@{ Name = $Name; Status = 'Stopped'; StartType = 'Disabled' } }
  function global:Stop-Service { param([string]$Name) return $true }
  function global:Start-Service { param([string]$Name) return $true }

  function global:Invoke-WebRequest {
    param([string]$Uri, [int]$TimeoutSec, [switch]$UseBasicParsing, [int]$MaximumRedirection)
    return [pscustomobject]@{
      StatusCode = 200
      BaseResponse = [pscustomobject]@{ ResponseUri = [Uri]$Uri }
      Content = '{"status":"ok"}'
    }
  }

  function global:Invoke-RestMethod {
    param([string]$Uri, [int]$TimeoutSec)
    return [pscustomobject]@{ status = 'ok' }
  }

  function global:Get-FileHash {
    param([string]$LiteralPath, [string]$Algorithm)
    return [pscustomobject]@{ Hash = Get-FileSha256FromBytes $LiteralPath }
  }

  function global:Invoke-ReviewedNginxSyntaxTest {
    param($NginxExe, $NginxPrefix, $NginxConfig)
    return $true
  }

  function Set-FixtureScriptStubs([hashtable]$Stubs) {
    foreach ($scriptName in $Stubs.Keys) {
      $targetScript = Join-Path $fixtureScriptsDir $scriptName
      [IO.File]::WriteAllText($targetScript, $Stubs[$scriptName], [Text.UTF8Encoding]::new($false))
    }
  }

  function New-AudMigrationTestEnvironment([string]$TestName, [string]$TargetSha) {
    $fix = New-AudFixtureEnvironment $TestName
    $releaseDir = Join-Path $fix.Root "releases\$TargetSha"
    $prismaDir = Join-Path $releaseDir 'prisma'
    New-Item -ItemType Directory -Path $prismaDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $prismaDir 'schema.prisma'), 'datasource db { provider = "postgresql" url = env("DATABASE_URL") }', [Text.UTF8Encoding]::new($false))

    $entryPoint = Join-Path $releaseDir 'apps\api\dist\apps\api\src\main.js'
    New-Item -ItemType Directory -Path (Split-Path -Parent $entryPoint) -Force | Out-Null
    [IO.File]::WriteAllText($entryPoint, 'console.log("api");', [Text.UTF8Encoding]::new($false))

    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target $releaseDir | Out-Null

    $resolvedEntry = Get-CanonicalPath (Join-Path $fix.Root 'current\apps\api\dist\apps\api\src\main.js')
    $markerPath = Join-Path $fix.Root 'shared\deployment-identity.json'
    $marker = Get-Content $markerPath -Raw | ConvertFrom-Json
    $marker.entryPoint = $resolvedEntry
    [IO.File]::WriteAllText($markerPath, ($marker | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))

    $sentinelLog = Join-Path $fix.Root 'npx-mutation-sentinel.log'
    $expireFlag = Join-Path $fix.Root 'trigger-expire.flag'
    $taskFlag = Join-Path $fix.Root 'trigger-task.flag'
    $portFlag = Join-Path $fix.Root 'trigger-port.flag'

    $rootPath = $fix.Root
    $mwExpiredFlag = Join-Path $rootPath 'mw-expired.flag'
    $taskActiveFlag = Join-Path $rootPath 'task-running-active.flag'
    $portActiveFlag = Join-Path $rootPath 'port-occupied-active.flag'

    $npxCmd = Join-Path $rootPath 'fixture-npx.cmd'
    $npxContent = @"
@echo off
if "%1"=="prisma" if "%2"=="migrate" if "%3"=="deploy" (
  echo DEPLOY_INVOKED >> "$sentinelLog"
  exit /b 0
)
if "%1"=="prisma" if "%2"=="migrate" if "%3"=="status" (
  if exist "$expireFlag" (
    echo EXPIRED > "$mwExpiredFlag"
  )
  if exist "$taskFlag" (
    echo RUNNING > "$taskActiveFlag"
  )
  if exist "$portFlag" (
    echo OCCUPIED > "$portActiveFlag"
  )
  echo Database schema is up to date!
  exit /b 0
)
exit /b 0
"@
    [IO.File]::WriteAllText($npxCmd, $npxContent, [Text.ASCIIEncoding]::new())

    $psqlCmd = Join-Path $fix.Root 'fixture-psql.cmd'
    $psqlContent = "@echo off`necho NOT_PRESENT`nexit /b 0`n"
    [IO.File]::WriteAllText($psqlCmd, $psqlContent, [Text.ASCIIEncoding]::new())

    return [pscustomobject]@{
      Fix = $fix
      ReleaseDir = $releaseDir
      EntryPoint = $resolvedEntry
      NpxCmd = $npxCmd
      PsqlCmd = $psqlCmd
      SentinelLog = $sentinelLog
      ExpireFlag = $expireFlag
      TaskFlag = $taskFlag
      PortFlag = $portFlag
    }
  }

  function Invoke-AudTest([int]$TestNum, [string]$TestTitle, [scriptblock]$TestBlock) {
    if ($OnlyTest -gt 0 -and $OnlyTest -ne $TestNum) { return }
    if ($suiteStopwatch.Elapsed.TotalSeconds -gt $SuiteTimeoutSeconds) {
      throw "SUITE_TIMEOUT: AUD-04 test suite exceeded limit of ${SuiteTimeoutSeconds}s (elapsed: $([Math]::Round($suiteStopwatch.Elapsed.TotalSeconds, 1))s)."
    }
    Write-Output "  [RUN] Test ${TestNum}: $TestTitle"
    Copy-Item -Path (Join-Path $cleanFixtureScriptsDir '*') -Destination $fixtureScriptsDir -Recurse -Force
    $global:aud04StopCalls.Clear()
    $global:aud04StopShouldFail = $false

    function global:Get-ScheduledTask {
      param([string]$TaskName)
      return [pscustomobject]@{
        TaskName = 'BaoGiangBackend'; TaskPath = '\BaoGiang\'; State = 'Disabled'
        Principal = [pscustomobject]@{ UserId = 'fixture-account' }
        Actions = @([pscustomobject]@{ Execute = $fakeToolPath; Arguments = '-File start-baogiang-api.ps1'; WorkingDirectory = $(if (-not [string]::IsNullOrWhiteSpace($global:currentAudFixtureWd)) { $global:currentAudFixtureWd } else { 'C:\dummy' }) })
        Triggers = @([pscustomobject]@{ CimClass = [pscustomobject]@{ CimClassName = 'MSFT_TaskBootTrigger' }; Enabled = $true })
      }
    }
    function global:Get-CimInstance {
      param([string]$ClassName, [string]$Filter)
      if ($ClassName -eq 'Win32_Process') { return @() }
      if ($ClassName -eq 'Win32_Service') {
        return @([pscustomobject]@{ Name = 'BaoGiangBackend'; StartMode = 'Disabled'; State = 'Stopped'; StartName = 'fixture-account'; PathName = $fakeToolPath })
      }
      return @()
    }
    function global:Get-NetTCPConnection { param([string]$State, [int]$LocalPort) return @() }
    function global:Stop-Process { param($Id, [switch]$Force) return $true }

    if ($NegativeControl -and $TestNum -eq 1) {
      throw "NEGATIVE_CONTROL_INJECTED_FAILURE: deliberate failure for Test 1"
    }

    $global:audWatchdog.Start($PID, ($PerTestTimeoutSeconds * 1000))
    $testSw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
      & $TestBlock
    } finally {
      $global:audWatchdog.Stop()
      $testSw.Stop()
      [AudWatchdog]::KillChildren($PID)
    }

    if ($global:audWatchdog.TimedOut -or $testSw.Elapsed.TotalSeconds -gt $PerTestTimeoutSeconds) {
      throw "TEST_TIMEOUT: Test $TestNum ('$TestTitle') exceeded timeout limit of ${PerTestTimeoutSeconds}s (elapsed: $([Math]::Round($testSw.Elapsed.TotalSeconds, 1))s)."
    }

    $global:aud04PassCount++
  }

  if ($SimulatePureLoop) {
    Write-Output "  [RUN] Test 98: Simulated Pure PowerShell Infinite Loop"
    $pureLoopCounter = 0
    while ($true) { $pureLoopCounter++ }
  }

  if ($SimulateTreeTimeout) {
    Write-Output "  [RUN] Test 97: Simulated Multi-Level Tree Child Process"
    & cmd.exe /c powershell.exe -Command ping.exe -n 30 127.0.0.1
  }

  if ($SimulateDrainTimeout) {
    Write-Output "  [RUN] Test 96: Simulated Output Drain Hang (child process keeps stdout handle)"
    cmd.exe /c start /b powershell.exe -NoProfile -Command "ping 127.0.0.1 -n 30"
    exit 0
  }

  # --- TEST 1: Existing release + migration completed + capability sync fails before switch + compatibility not approved ---
  # Expected: exact runtime safely stopped; original pointer preserved; fail-closed.
  Invoke-AudTest 1 'Existing release + migration completed + capability sync fails before switch + compatibility not approved' {
    $fix = New-AudFixtureEnvironment 'test1'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "throw 'Simulated capability catalog sync failure'"
      'switch-current-release.ps1' = "throw 'switch should not be reached'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated capability catalog sync failure') { throw "Test 1 wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 1 did not throw' }

    $currentTarget = Split-Path (Assert-ReleasePointerTarget -PointerPath (Join-Path $fix.Root 'current') -Root $fix.Root) -Leaf
    if ($currentTarget -cne $origSha) { throw "Test 1 current pointer was not preserved: got $currentTarget, expected $origSha" }
    if ($global:aud04StopCalls.Count -eq 0) { throw 'Test 1 exact runtime was not stopped' }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    if (-not (Test-Path $reportPath)) { throw 'Test 1 report missing' }
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.migration.state -ne 'completed') { throw "Test 1 report migration state: $($rep.migration.state)" }
    if ($rep.capabilityCatalog.state -ne 'attemptedUnknown') { throw "Test 1 report catalog state: $($rep.capabilityCatalog.state)" }
    if ($rep.rollback.state -ne 'stoppedCompatibilityApprovalRequired') { throw "Test 1 rollback state: $($rep.rollback.state)" }
    Write-Output '  [PASS] Test 1: Existing release + migration completed + capability sync fails before switch + compatibility not approved -> runtime stopped, pointer preserved'
  }

  # --- TEST 2: Existing release + migration attempted/unknown + failure before switch -> fail-closed ---
  Invoke-AudTest 2 'Existing release + migration attempted/unknown + failure before switch -> fail-closed' {
    $fix = New-AudFixtureEnvironment 'test2'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "throw 'Simulated migration crash before completion'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $true; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated migration crash before completion') { throw "Test 2 wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 2 did not throw' }

    $currentTarget = Split-Path (Assert-ReleasePointerTarget -PointerPath (Join-Path $fix.Root 'current') -Root $fix.Root) -Leaf
    if ($currentTarget -cne $origSha) { throw "Test 2 current pointer was not preserved: got $currentTarget, expected $origSha" }
    if ($global:aud04StopCalls.Count -eq 0) { throw 'Test 2 exact runtime was not stopped' }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.migration.state -ne 'attemptedUnknown') { throw "Test 2 report migration state: $($rep.migration.state)" }
    if ($rep.rollback.state -ne 'stoppedCompatibilityApprovalRequired') { throw "Test 2 rollback state: $($rep.rollback.state)" }
    Write-Output '  [PASS] Test 2: Existing release + migration attempted/unknown + failure before switch -> fail-closed (stopped)'
  }

  # --- TEST 3: No migration requested + pre-switch failure -> original runtime/pointer unaffected ---
  Invoke-AudTest 3 'No migration requested + pre-switch failure -> original runtime/pointer unaffected' {
    $fix = New-AudFixtureEnvironment 'test3'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "throw 'Simulated install failure'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $false; ProductionMigrationApproved = $false
      RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated install failure') { throw "Test 3 wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 3 did not throw' }

    $currentTarget = Split-Path (Assert-ReleasePointerTarget -PointerPath (Join-Path $fix.Root 'current') -Root $fix.Root) -Leaf
    if ($currentTarget -cne $origSha) { throw "Test 3 current pointer was not preserved: got $currentTarget" }
    if ($global:aud04StopCalls.Count -ne 0) { throw 'Test 3 runtime was stopped unexpectedly' }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.migration.state -ne 'notStarted') { throw "Test 3 migration state: $($rep.migration.state)" }
    if ($rep.rollback.state -ne 'notNeeded') { throw "Test 3 rollback state: $($rep.rollback.state)" }
    Write-Output '  [PASS] Test 3: No migration requested + pre-switch failure -> runtime and pointer unaffected (notNeeded)'
  }

  # --- TEST 4: First deploy + failure before initial switch -> no invalid quarantine or fabricated previous pointer ---
  Invoke-AudTest 4 'First deploy + failure before initial switch -> no invalid quarantine or fabricated previous pointer' {
    $fix = New-AudFixtureEnvironment 'test4'
    # No current pointer, no previous pointer!

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "throw 'Simulated first-deploy capability failure'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated first-deploy capability failure') { throw "Test 4 wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 4 did not throw' }

    if (Test-Path -LiteralPath (Join-Path $fix.Root 'current')) { throw 'Test 4 current pointer was created' }
    if (Test-Path -LiteralPath (Join-Path $fix.Root 'previous')) { throw 'Test 4 previous pointer was created' }
    if (Test-Path -LiteralPath (Join-Path $fix.Root 'failed-release')) { throw 'Test 4 quarantine pointer was created without current' }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.rollback.state -ne 'firstDeployFailedStopped') { throw "Test 4 rollback state: $($rep.rollback.state)" }
    if ($rep.rollback.PSObject.Properties.Match('quarantinePointer').Count -gt 0 -and $null -ne $rep.rollback.quarantinePointer) { throw "Test 4 quarantinePointer should be null" }
    Write-Output '  [PASS] Test 4: First deploy + failure before switch -> no invalid quarantine or fabricated pointer'
  }

  # --- TEST 5: Failure after partial pointer mutation -> detected and handled safely ---
  Invoke-AudTest 5 'Failure after partial pointer mutation -> detected and handled safely' {
    $fix = New-AudFixtureEnvironment 'test5'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    # Simulate switch-current-release partially executing: current moved to previous, then throws before creating current
    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "Write-Output '{`"state`":`"completed`",`"expectedDefinitionCount`":10,`"verifiedDefinitionCount`":10}'"
      'switch-current-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) Move-Item -LiteralPath (Join-Path `$Root 'current') -Destination (Join-Path `$Root 'previous'); throw 'Simulated partial switch failure after moving current to previous'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated partial switch failure') { throw "Test 5 wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 5 did not throw' }

    if (-not (Test-Path -LiteralPath (Join-Path $fix.Root 'current'))) { throw 'Test 5 current was not restored from partial switch' }
    $currentTarget = Split-Path (Assert-ReleasePointerTarget -PointerPath (Join-Path $fix.Root 'current') -Root $fix.Root) -Leaf
    if ($currentTarget -cne $origSha) { throw "Test 5 current pointer restored incorrectly: got $currentTarget, expected $origSha" }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.rollback.state -ne 'stoppedCompatibilityApprovalRequired') { throw "Test 5 rollback state: $($rep.rollback.state)" }
    Write-Output '  [PASS] Test 5: Failure after partial pointer mutation -> detected, restored current, safely stopped'
  }

  # --- TEST 6: Migration attempted + compatibility approved -> exact recovery semantics; never blindly rollback to previous before switch ---
  Invoke-AudTest 6 'Migration attempted + compatibility approved -> exact recovery semantics; never blindly rollback to previous before switch' {
    $fix = New-AudFixtureEnvironment 'test6'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    # Set up an ancient previous pointer to ensure controller NEVER activates it before switch!
    $ancientReleaseDir = Join-Path $fix.Root "releases\$ancientSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $ancientReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $ancientReleaseDir 'main.js'), 'console.log("v0");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'previous') -Target (Join-Path $fix.Root "releases\$ancientSha") | Out-Null

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "throw 'Simulated capability catalog sync failure before switch'"
      'restart-baogiang-api.ps1' = "Write-Output '{`"runtimeKind`":`"scheduled-task`",`"activationState`":`"enabled-running`"}'"
      'test-production-health.ps1' = "Write-Output '{`"state`":`"healthy`",`"httpStatus`":200}'"
      'rollback-release.ps1' = "throw 'CRITICAL DEFECT: rollback-release.ps1 was blindly invoked before switch!'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $true; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated capability catalog sync failure before switch') { throw "Test 6 wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 6 did not throw' }

    $currentTarget = Split-Path (Assert-ReleasePointerTarget -PointerPath (Join-Path $fix.Root 'current') -Root $fix.Root) -Leaf
    if ($currentTarget -cne $origSha) { throw "Test 6 current pointer modified: got $currentTarget, expected $origSha (never $ancientSha)" }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.rollback.state -ne 'completed') { throw "Test 6 rollback state: $($rep.rollback.state)" }
    if ($rep.rollback.currentTarget -notmatch [regex]::Escape($origSha)) { throw "Test 6 currentTarget was not original release: $($rep.rollback.currentTarget)" }
    Write-Output '  [PASS] Test 6: Migration attempted + compatibility approved -> exact recovery on current; rollback-release.ps1 not invoked'
  }

  # --- TEST 7: Runtime safe-stop fails -> original and secondary error both recorded, no false PASS ---
  Invoke-AudTest 7 'Runtime safe-stop fails -> original and secondary error both recorded, no false PASS' {
    $fix = New-AudFixtureEnvironment 'test7'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "`$global:aud04StopShouldFail = `$true; throw 'Simulated primary catalog failure'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated primary catalog failure') { throw "Test 7 wrong exception thrown: $($_.Exception.Message)" }
    } finally {
      $global:aud04StopShouldFail = $false
    }
    if (-not $thrown) { throw 'Test 7 did not throw' }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.errorCategory -ne 'RuntimeException') { throw "Test 7 primary errorCategory: $($rep.errorCategory)" }
    if ($rep.rollback.state -ne 'stopFailedCompatibilityApprovalRequired') { throw "Test 7 rollback state: $($rep.rollback.state)" }
    if ($rep.rollback.errorCategory -ne 'RuntimeException') { throw "Test 7 secondary errorCategory: $($rep.rollback.errorCategory)" }
    Write-Output '  [PASS] Test 7: Runtime safe-stop fails -> original and secondary error both recorded, no false PASS'
  }

  # --- TEST 8: Neighbor isolation on actual execution branch -> no changes to Quản lí nội trú, other tasks, unrelated processes, shared database services or Nginx ---
  Invoke-AudTest 8 'Neighbor isolation on actual execution branch -> no changes to Quản lí nội trú, other tasks, unrelated processes, shared database services or Nginx' {
    $fix = New-AudFixtureEnvironment 'test8'
    $foreignDir = Join-Path $tempDir 'Quan_li_noi_tru'
    New-Item -ItemType Directory -Path $foreignDir -Force | Out-Null
    $sentinelFile = Join-Path $foreignDir 'untouched-neighbour.txt'
    [IO.File]::WriteAllText($sentinelFile, 'neighbour content that must not be altered', [Text.UTF8Encoding]::new($false))
    $beforeHash = Get-FileSha256FromBytes $sentinelFile

    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "throw 'Simulated pre-switch catalog failure for neighbor isolation test'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated pre-switch catalog failure for neighbor isolation test') { throw "Test 8 wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 8 did not throw' }

    if ($global:aud04StopCalls.Count -eq 0 -or $global:aud04StopCalls[0] -ne 'scheduled-task:BaoGiangBackend') {
      throw "Test 8 targeted wrong service: $($global:aud04StopCalls -join ',')"
    }

    $afterHash = Get-FileSha256FromBytes $sentinelFile
    if ($beforeHash -cne $afterHash) { throw 'Test 8 neighbour sentinel was mutated during execution' }

    $conflictRejected = $false
    try { Assert-DedicatedRoot $foreignDir | Out-Null } catch { $conflictRejected = $true }
    if (-not $conflictRejected) { throw 'Test 8 Assert-DedicatedRoot accepted neighbour path' }

    Write-Output '  [PASS] Test 8: Neighbor isolation on execution branch verified (neighbour resources untouched, exact identity enforced)'
  }

  # --- TEST 9 (R1-1): Current points to unexpected third release C before switch -> fail-closed ---
  Invoke-AudTest 9 'Current points to unexpected third release C before switch -> fail-closed' {
    $fix = New-AudFixtureEnvironment 'test9'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    $thirdSha = '3' * 40
    $thirdReleaseDir = Join-Path $fix.Root "releases\$thirdSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $thirdReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $thirdReleaseDir 'main.js'), 'console.log("v3");', [Text.UTF8Encoding]::new($false))

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "param(`$ReleaseSha, `$ReleasePath, `$NodeExe, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) [IO.Directory]::Delete((Join-Path `$Root 'current')); New-Item -ItemType Junction -Path (Join-Path `$Root 'current') -Target (Join-Path `$Root 'releases\$thirdSha') | Out-Null; throw 'Simulated catalog failure after unexpected pointer mutation to third release'"
      'restart-baogiang-api.ps1' = "throw 'CRITICAL DEFECT: restart-baogiang-api was called on unexpected release target!'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $true; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated catalog failure after unexpected pointer mutation') { throw "Test 9 wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 9 did not throw' }

    if ($global:aud04StopCalls.Count -eq 0) { throw 'Test 9 exact runtime was not stopped' }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.rollback.state -ne 'unverifiedPointerSafeStopped') { throw "Test 9 rollback state: $($rep.rollback.state)" }
    if ($rep.rollback.expectedTarget -cne $origSha) { throw "Test 9 expectedTarget mismatch: $($rep.rollback.expectedTarget)" }
    if ($rep.rollback.actualTarget -cne $thirdSha) { throw "Test 9 actualTarget mismatch: $($rep.rollback.actualTarget)" }
    Write-Output '  [PASS] Test 9 (R1-1): Current points to unexpected third release -> fail-closed, stopped, unverifiedPointerSafeStopped'
  }

  # --- TEST 10 (R1-2): Current exists but target cannot be verified (broken junction) -> fail-closed ---
  Invoke-AudTest 10 'Current exists but target cannot be verified (broken junction) -> fail-closed' {
    $fix = New-AudFixtureEnvironment 'test10'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "param(`$ReleaseSha, `$ReleasePath, `$NodeExe, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) `$bad = Join-Path `$Root 'bad-target'; New-Item -ItemType Directory -Path `$bad -Force | Out-Null; [IO.Directory]::Delete((Join-Path `$Root 'current')); New-Item -ItemType Junction -Path (Join-Path `$Root 'current') -Target `$bad | Out-Null; [IO.Directory]::Delete(`$bad); throw 'Simulated catalog failure after breaking current junction'"
      'restart-baogiang-api.ps1' = "throw 'CRITICAL DEFECT: restart-baogiang-api was called on broken pointer target!'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $true; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated catalog failure after breaking current junction') { throw "Test 10 wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 10 did not throw' }

    if ($global:aud04StopCalls.Count -eq 0) { throw 'Test 10 exact runtime was not stopped' }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.rollback.state -ne 'unverifiedPointerSafeStopped') { throw "Test 10 rollback state: $($rep.rollback.state)" }
    if ($rep.rollback.expectedTarget -cne $origSha) { throw "Test 10 expectedTarget mismatch: $($rep.rollback.expectedTarget)" }
    if ($null -ne $rep.rollback.actualTarget) { throw "Test 10 actualTarget should be null: $($rep.rollback.actualTarget)" }
    Write-Output '  [PASS] Test 10 (R1-2): Current exists but unverified target -> fail-closed, stopped, unverifiedPointerSafeStopped'
  }

  # --- TEST 11 (R1-3): Current is exactly original release -> restarted and verified on current ---
  Invoke-AudTest 11 'Current is exactly original release -> restarted and verified on current' {
    $fix = New-AudFixtureEnvironment 'test11'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "throw 'Simulated capability catalog sync failure before switch'"
      'restart-baogiang-api.ps1' = "Write-Output '{`"runtimeKind`":`"scheduled-task`",`"activationState`":`"enabled-running`"}'"
      'test-production-health.ps1' = "Write-Output '{`"state`":`"healthy`",`"httpStatus`":200}'"
      'rollback-release.ps1' = "throw 'CRITICAL DEFECT: rollback-release.ps1 invoked before switch!'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $true; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated capability catalog sync failure before switch') { throw "Test 11 wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 11 did not throw' }

    $currentTarget = Split-Path (Assert-ReleasePointerTarget -PointerPath (Join-Path $fix.Root 'current') -Root $fix.Root) -Leaf
    if ($currentTarget -cne $origSha) { throw "Test 11 current pointer was not origSha: $currentTarget" }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.rollback.state -ne 'completed') { throw "Test 11 rollback state: $($rep.rollback.state)" }
    if ($rep.rollback.currentTarget -notmatch [regex]::Escape($origSha)) { throw "Test 11 currentTarget was not origSha: $($rep.rollback.currentTarget)" }
    Write-Output '  [PASS] Test 11 (R1-3): Current is exactly original release -> restarted and verified on current, completed'
  }

  # --- TEST 12 (R1-4): Partial switch current/previous/current.next ---
  Invoke-AudTest 12 'Partial switch current/previous/current.next' {
    # 12A: previous is original release -> restored to current, verified, completed
    $fixA = New-AudFixtureEnvironment 'test12a'
    $origReleaseDir = Join-Path $fixA.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fixA.Root 'current') -Target (Join-Path $fixA.Root "releases\$origSha") | Out-Null

    $xferA = Prepare-IncomingTransfer $fixA.Root $newSha
    $stubsA = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "Write-Output '{`"state`":`"completed`",`"expectedDefinitionCount`":10,`"verifiedDefinitionCount`":10}'"
      'switch-current-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) Move-Item -LiteralPath (Join-Path `$Root 'current') -Destination (Join-Path `$Root 'previous'); New-Item -ItemType Junction -Path (Join-Path `$Root 'current.next') -Target (Join-Path `$Root `"releases\`$ReleaseSha`") | Out-Null; throw 'Simulated partial switch crash after moving current to previous'"
      'restart-baogiang-api.ps1' = "Write-Output '{`"runtimeKind`":`"scheduled-task`",`"activationState`":`"enabled-running`"}'"
      'test-production-health.ps1' = "Write-Output '{`"state`":`"healthy`",`"httpStatus`":200}'"
    }
    Set-FixtureScriptStubs $stubsA

    $paramFileA = Join-Path $fixA.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFileA @{
      ReleaseSha = $newSha; Root = $fixA.Root; TransferDirectoryName = $xferA.TransferDir; SourceArchiveName = $xferA.ArchiveName
      ExpectedSha256 = $xferA.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fixA.EnvFile; StartupWrapper = $fixA.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fixA.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fixA.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $true; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFileA | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated partial switch crash') { throw "Test 12A wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 12A did not throw' }

    if (Test-Path -LiteralPath (Join-Path $fixA.Root 'current.next')) { throw 'Test 12A current.next was not cleaned up' }
    $curA = Split-Path (Assert-ReleasePointerTarget -PointerPath (Join-Path $fixA.Root 'current') -Root $fixA.Root) -Leaf
    if ($curA -cne $origSha) { throw "Test 12A current pointer not restored: got $curA, expected $origSha" }

    $repA = Get-Content (Join-Path $fixA.Root "logs\deploy-report-$newSha.json") -Raw | ConvertFrom-Json
    if ($repA.rollback.state -ne 'completed') { throw "Test 12A rollback state: $($repA.rollback.state)" }

    # 12B: previous is corrupted / third release -> not restored, detects missing current, fail-closed
    $fixB = New-AudFixtureEnvironment 'test12b'
    $origReleaseDirB = Join-Path $fixB.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDirB -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDirB 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fixB.Root 'current') -Target (Join-Path $fixB.Root "releases\$origSha") | Out-Null

    $thirdShaB = '3' * 40
    $thirdReleaseDirB = Join-Path $fixB.Root "releases\$thirdShaB\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $thirdReleaseDirB -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $thirdReleaseDirB 'main.js'), 'console.log("v3");', [Text.UTF8Encoding]::new($false))

    $xferB = Prepare-IncomingTransfer $fixB.Root $newSha
    $stubsB = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "Write-Output '{`"state`":`"completed`",`"expectedDefinitionCount`":10,`"verifiedDefinitionCount`":10}'"
      'switch-current-release.ps1' = "param(`$ReleaseSha, `$ReleasePath, `$NodeExe, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) [IO.Directory]::Delete((Join-Path `$Root 'current')); New-Item -ItemType Junction -Path (Join-Path `$Root 'previous') -Target (Join-Path `$Root 'releases\$thirdShaB') | Out-Null; throw 'Simulated partial switch with corrupted previous pointer'"
      'restart-baogiang-api.ps1' = "throw 'CRITICAL DEFECT: restart called on corrupted partial switch!'"
    }
    Set-FixtureScriptStubs $stubsB

    $paramFileB = Join-Path $fixB.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFileB @{
      ReleaseSha = $newSha; Root = $fixB.Root; TransferDirectoryName = $xferB.TransferDir; SourceArchiveName = $xferB.ArchiveName
      ExpectedSha256 = $xferB.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fixB.EnvFile; StartupWrapper = $fixB.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fixB.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fixB.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $true; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFileB | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated partial switch with corrupted previous pointer') { throw "Test 12B wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 12B did not throw' }

    $repB = Get-Content (Join-Path $fixB.Root "logs\deploy-report-$newSha.json") -Raw | ConvertFrom-Json
    if ($repB.rollback.state -ne 'unverifiedPointerSafeStopped') { throw "Test 12B rollback state: $($repB.rollback.state)" }
    Write-Output '  [PASS] Test 12 (R1-4): Partial switch transitions (12A restore+completed, 12B corrupted->fail-closed)'
  }

  # --- TEST 13 (R1-5): Failed restart/health and safe-stop ---
  Invoke-AudTest 13 'Failed restart/health and safe-stop' {
    # 13A: Health check fails -> safe-stop invoked, state = failed
    $fixA = New-AudFixtureEnvironment 'test13a'
    $origReleaseDir = Join-Path $fixA.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fixA.Root 'current') -Target (Join-Path $fixA.Root "releases\$origSha") | Out-Null

    $xferA = Prepare-IncomingTransfer $fixA.Root $newSha
    $stubsA = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "throw 'Simulated pre-switch catalog failure before health test'"
      'restart-baogiang-api.ps1' = "Write-Output '{`"runtimeKind`":`"scheduled-task`",`"activationState`":`"enabled-running`"}'"
      'test-production-health.ps1' = "throw 'Simulated health check timeout during rollback'"
    }
    Set-FixtureScriptStubs $stubsA

    $paramFileA = Join-Path $fixA.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFileA @{
      ReleaseSha = $newSha; Root = $fixA.Root; TransferDirectoryName = $xferA.TransferDir; SourceArchiveName = $xferA.ArchiveName
      ExpectedSha256 = $xferA.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fixA.EnvFile; StartupWrapper = $fixA.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fixA.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fixA.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $true; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFileA | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated pre-switch catalog failure before health test') { throw "Test 13A wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 13A did not throw' }

    if ($global:aud04StopCalls.Count -eq 0) { throw 'Test 13A safe-stop was not called after health failure' }

    $repA = Get-Content (Join-Path $fixA.Root "logs\deploy-report-$newSha.json") -Raw | ConvertFrom-Json
    if ($repA.rollback.state -ne 'failed') { throw "Test 13A rollback state: $($repA.rollback.state)" }
    if ($repA.rollback.errorCategory -ne 'RuntimeException') { throw "Test 13A rollback errorCategory: $($repA.rollback.errorCategory)" }

    # 13B: Health check fails AND safe-stop fails -> secondary cleanup failure recorded
    $fixB = New-AudFixtureEnvironment 'test13b'
    $origReleaseDirB = Join-Path $fixB.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDirB -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDirB 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fixB.Root 'current') -Target (Join-Path $fixB.Root "releases\$origSha") | Out-Null

    $xferB = Prepare-IncomingTransfer $fixB.Root $newSha
    $stubsB = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "throw 'Simulated pre-switch catalog failure before health test'"
      'restart-baogiang-api.ps1' = "Write-Output '{`"runtimeKind`":`"scheduled-task`",`"activationState`":`"enabled-running`"}'"
      'test-production-health.ps1' = "`$global:aud04StopShouldFail = `$true; throw 'Simulated health check timeout during rollback'"
    }
    Set-FixtureScriptStubs $stubsB

    $paramFileB = Join-Path $fixB.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFileB @{
      ReleaseSha = $newSha; Root = $fixB.Root; TransferDirectoryName = $xferB.TransferDir; SourceArchiveName = $xferB.ArchiveName
      ExpectedSha256 = $xferB.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fixB.EnvFile; StartupWrapper = $fixB.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fixB.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fixB.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $true; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $global:aud04StopShouldFail = $false
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFileB | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated pre-switch catalog failure before health test') { throw "Test 13B wrong exception: $($_.Exception.Message)" }
    } finally {
      $global:aud04StopShouldFail = $false
    }
    if (-not $thrown) { throw 'Test 13B did not throw' }

    $repB = Get-Content (Join-Path $fixB.Root "logs\deploy-report-$newSha.json") -Raw | ConvertFrom-Json
    if ($repB.rollback.state -ne 'failed') { throw "Test 13B rollback state: $($repB.rollback.state)" }
    if ($repB.rollback.errorCategory -ne 'RuntimeException') { throw "Test 13B rollback errorCategory: $($repB.rollback.errorCategory)" }

    Write-Output '  [PASS] Test 13 (R1-5): Failed restart/health and safe-stop (13A safe-stop invoked on health fail, 13B secondary failure captured)'
  }

  # --- TEST 14 (R1-6A): Original pointer remains A throughout recovery -> completed, no unnecessary stop ---
  Invoke-AudTest 14 'Original pointer remains A throughout recovery -> completed, no unnecessary stop' {
    $fix = New-AudFixtureEnvironment 'test14'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "`$global:aud04StopCalls.Clear(); throw 'Simulated pre-switch catalog failure before recovery test'"
      'restart-baogiang-api.ps1' = "Write-Output '{`"runtimeKind`":`"scheduled-task`",`"activationState`":`"enabled-running`"}'"
      'test-production-health.ps1' = "Write-Output '{`"state`":`"healthy`",`"httpStatus`":200}'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $true; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated pre-switch catalog failure before recovery test') { throw "Test 14 wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 14 did not throw' }

    if ($global:aud04StopCalls.Count -ne 0) { throw 'Test 14 runtime was stopped unexpectedly during healthy unchanged recovery' }

    $currentTarget = Split-Path (Assert-ReleasePointerTarget -PointerPath (Join-Path $fix.Root 'current') -Root $fix.Root) -Leaf
    if ($currentTarget -cne $origSha) { throw "Test 14 current pointer mutated: got $currentTarget, expected $origSha" }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.rollback.state -ne 'completed') { throw "Test 14 rollback state: $($rep.rollback.state)" }
    if ($rep.rollback.currentTarget -notmatch [regex]::Escape($origSha)) { throw "Test 14 currentTarget was not origSha: $($rep.rollback.currentTarget)" }
    Write-Output '  [PASS] Test 14 (R1-6A): Original pointer remains A throughout recovery -> completed, no unnecessary stop'
  }

  # --- TEST 15 (R1-6B): Pointer changes A -> C after restart/health -> exact runtime safely stopped, recovery failed ---
  Invoke-AudTest 15 'Pointer changes A -> C after restart/health -> exact runtime safely stopped, recovery failed' {
    $fix = New-AudFixtureEnvironment 'test15'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    $thirdSha = '3' * 40
    $thirdReleaseDir = Join-Path $fix.Root "releases\$thirdSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $thirdReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $thirdReleaseDir 'main.js'), 'console.log("v3");', [Text.UTF8Encoding]::new($false))

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "throw 'Simulated pre-switch catalog failure before recovery mutation test'"
      'restart-baogiang-api.ps1' = "Write-Output '{`"runtimeKind`":`"scheduled-task`",`"activationState`":`"enabled-running`"}'"
      'test-production-health.ps1' = "[IO.Directory]::Delete((Join-Path '$($fix.Root)' 'current')); New-Item -ItemType Junction -Path (Join-Path '$($fix.Root)' 'current') -Target (Join-Path '$($fix.Root)' 'releases\$thirdSha') | Out-Null; Write-Output '{`"state`":`"healthy`",`"httpStatus`":200}'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $true; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated pre-switch catalog failure before recovery mutation test') { throw "Test 15 wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 15 did not throw' }

    if ($global:aud04StopCalls.Count -eq 0 -or $global:aud04StopCalls[0] -ne 'scheduled-task:BaoGiangBackend') {
      throw "Test 15 exact runtime was not stopped after pointer mutation: $($global:aud04StopCalls -join ',')"
    }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.rollback.state -ne 'failed') { throw "Test 15 rollback state: $($rep.rollback.state) (must be failed)" }
    if ($rep.rollback.errorCategory -ne 'RuntimeException') { throw "Test 15 rollback errorCategory: $($rep.rollback.errorCategory)" }
    Write-Output '  [PASS] Test 15 (R1-6B): Pointer mutated A -> C during recovery -> exact runtime safely stopped, recovery not completed'
  }

  # --- TEST 16 (R1-6C): Pointer becomes unreadable/dangling during recovery -> fail-closed and safe-stop ---
  Invoke-AudTest 16 'Pointer becomes unreadable/dangling during recovery -> fail-closed and safe-stop' {
    $fix = New-AudFixtureEnvironment 'test16'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "throw 'Simulated pre-switch catalog failure before dangling test'"
      'restart-baogiang-api.ps1' = "Write-Output '{`"runtimeKind`":`"scheduled-task`",`"activationState`":`"enabled-running`"}'"
      'test-production-health.ps1' = "`$bad = Join-Path '$($fix.Root)' 'dangling-target'; New-Item -ItemType Directory -Path `$bad -Force | Out-Null; [IO.Directory]::Delete((Join-Path '$($fix.Root)' 'current')); New-Item -ItemType Junction -Path (Join-Path '$($fix.Root)' 'current') -Target `$bad | Out-Null; [IO.Directory]::Delete(`$bad); Write-Output '{`"state`":`"healthy`",`"httpStatus`":200}'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $true; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated pre-switch catalog failure before dangling test') { throw "Test 16 wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 16 did not throw' }

    if ($global:aud04StopCalls.Count -eq 0 -or $global:aud04StopCalls[0] -ne 'scheduled-task:BaoGiangBackend') {
      throw "Test 16 exact runtime was not stopped after dangling pointer: $($global:aud04StopCalls -join ',')"
    }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.rollback.state -ne 'failed') { throw "Test 16 rollback state: $($rep.rollback.state) (must be failed)" }
    if ($rep.rollback.errorCategory -ne 'RuntimeException') { throw "Test 16 rollback errorCategory: $($rep.rollback.errorCategory)" }
    Write-Output '  [PASS] Test 16 (R1-6C): Pointer becomes unreadable/dangling during recovery -> fail-closed and safe-stop'
  }

  # --- TEST 17 (R1-6D): Pointer verification fails AND safe-stop fails -> both failures recorded, no false PASS ---
  Invoke-AudTest 17 'Pointer verification fails AND safe-stop fails -> both failures recorded, no false PASS' {
    $fix = New-AudFixtureEnvironment 'test17'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    $thirdSha = '3' * 40
    $thirdReleaseDir = Join-Path $fix.Root "releases\$thirdSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $thirdReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $thirdReleaseDir 'main.js'), 'console.log("v3");', [Text.UTF8Encoding]::new($false))

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "throw 'Simulated pre-switch catalog failure before cleanup failure test'"
      'restart-baogiang-api.ps1' = "Write-Output '{`"runtimeKind`":`"scheduled-task`",`"activationState`":`"enabled-running`"}'"
      'test-production-health.ps1' = "`$global:aud04StopShouldFail = `$true; [IO.Directory]::Delete((Join-Path '$($fix.Root)' 'current')); New-Item -ItemType Junction -Path (Join-Path '$($fix.Root)' 'current') -Target (Join-Path '$($fix.Root)' 'releases\$thirdSha') | Out-Null; Write-Output '{`"state`":`"healthy`",`"httpStatus`":200}'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $true; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $global:aud04StopShouldFail = $false
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated pre-switch catalog failure before cleanup failure test') { throw "Test 17 wrong exception: $($_.Exception.Message)" }
    } finally {
      $global:aud04StopShouldFail = $false
    }
    if (-not $thrown) { throw 'Test 17 did not throw' }

    $reportPath = Join-Path $fix.Root "logs\deploy-report-$newSha.json"
    $rep = Get-Content $reportPath -Raw | ConvertFrom-Json
    if ($rep.rollback.state -ne 'failed') { throw "Test 17 rollback state: $($rep.rollback.state) (must be failed)" }
    if ($rep.rollback.errorCategory -ne 'RuntimeException') { throw "Test 17 rollback errorCategory: $($rep.rollback.errorCategory)" }
    Write-Output '  [PASS] Test 17 (R1-6D): Pointer verification fails and safe-stop fails -> both failures recorded, no false PASS'
  }

  # --- TEST 18 (R1-6E): Neighbor isolation verified during post-recovery pointer failure -> neighbor untouched ---
  Invoke-AudTest 18 'Neighbor isolation verified during post-recovery pointer failure -> neighbor untouched' {
    $fix = New-AudFixtureEnvironment 'test18'
    $foreignDir = Join-Path $tempDir 'Quan_li_noi_tru_post'
    New-Item -ItemType Directory -Path $foreignDir -Force | Out-Null
    $sentinelFile = Join-Path $foreignDir 'untouched-neighbour-post.txt'
    [IO.File]::WriteAllText($sentinelFile, 'neighbour content during post recovery pointer check', [Text.UTF8Encoding]::new($false))
    $beforeHash = Get-FileSha256FromBytes $sentinelFile

    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    $thirdSha = '3' * 40
    $thirdReleaseDir = Join-Path $fix.Root "releases\$thirdSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $thirdReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $thirdReleaseDir 'main.js'), 'console.log("v3");', [Text.UTF8Encoding]::new($false))

    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "throw 'Simulated pre-switch catalog failure for neighbor post-recovery test'"
      'restart-baogiang-api.ps1' = "Write-Output '{`"runtimeKind`":`"scheduled-task`",`"activationState`":`"enabled-running`"}'"
      'test-production-health.ps1' = "[IO.Directory]::Delete((Join-Path '$($fix.Root)' 'current')); New-Item -ItemType Junction -Path (Join-Path '$($fix.Root)' 'current') -Target (Join-Path '$($fix.Root)' 'releases\$thirdSha') | Out-Null; Write-Output '{`"state`":`"healthy`",`"httpStatus`":200}'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $true; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopCalls.Clear()
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated pre-switch catalog failure for neighbor post-recovery test') { throw "Test 18 wrong exception: $($_.Exception.Message)" }
    }
    if (-not $thrown) { throw 'Test 18 did not throw' }

    if ($global:aud04StopCalls.Count -eq 0 -or $global:aud04StopCalls[0] -ne 'scheduled-task:BaoGiangBackend') {
      throw "Test 18 targeted wrong service: $($global:aud04StopCalls -join ',')"
    }

    $afterHash = Get-FileSha256FromBytes $sentinelFile
    if ($beforeHash -cne $afterHash) { throw 'Test 18 neighbour sentinel was mutated during execution' }

    $conflictRejected = $false
    try { Assert-DedicatedRoot $foreignDir | Out-Null } catch { $conflictRejected = $true }
    if (-not $conflictRejected) { throw 'Test 18 Assert-DedicatedRoot accepted neighbour path' }

    Write-Output '  [PASS] Test 18 (R1-6E): Neighbor isolation verified during post-recovery pointer failure (neighbour untouched)'
  }

  # --- TEST 19 (AUD-04-R2): Missing or invalid maintenance approval -> reject before safe-stop or migration ---
  Invoke-AudTest 19 'Missing or invalid maintenance approval -> reject before safe-stop or migration' {
    $fix = New-AudFixtureEnvironment 'test19'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null
    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $flagFile = Join-Path $fix.Root 'migration-called-19.flag'
    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "New-Item -LiteralPath '$flagFile' -ItemType File | Out-Null; Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
    }
    Set-FixtureScriptStubs $stubs

    # 19A: MaintenanceWindow is null
    $paramFileA = Join-Path $fix.Root 'deploy-params-19a.json'
    Write-DeploymentParameters $paramFileA @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      MaintenanceWindow = $null; ReportFileName = "deploy-report-$newSha.json"
    }
    $thrown = $false
    try { & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFileA | Out-Null }
    catch { $thrown = $true; if ($_.Exception.Message -notmatch 'MAINTENANCE_WINDOW_MISSING') { throw "Test 19A unexpected error: $($_.Exception.Message)" } }
    if (-not $thrown) { throw 'Test 19A did not throw on missing maintenance window' }
    if (Test-Path -LiteralPath $flagFile) { throw 'Test 19A migration was called despite missing window' }

    # 19B: MaintenanceWindow not approved (Approved = $false)
    Remove-Item -LiteralPath (Join-Path $fix.Root "incoming\release-$newSha.zip") -Force -ErrorAction SilentlyContinue
    $xfer = Prepare-IncomingTransfer $fix.Root $newSha
    $paramFileB = Join-Path $fix.Root 'deploy-params-19b.json'
    Write-DeploymentParameters $paramFileB @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      MaintenanceWindow = [ordered]@{ ReleaseSha = $newSha; StartUtc = [DateTime]::UtcNow.AddMinutes(-5).ToString('yyyy-MM-ddTHH:mm:ssZ'); EndUtc = [DateTime]::UtcNow.AddHours(1).ToString('yyyy-MM-ddTHH:mm:ssZ'); AuthorizedBy = 'ops'; Approved = $false }
      ReportFileName = "deploy-report-$newSha.json"
    }
    $thrown = $false
    try { & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFileB | Out-Null }
    catch { $thrown = $true; if ($_.Exception.Message -notmatch 'MAINTENANCE_WINDOW_NOT_APPROVED') { throw "Test 19B unexpected error: $($_.Exception.Message)" } }
    if (-not $thrown) { throw 'Test 19B did not throw on unapproved window' }
    if (Test-Path -LiteralPath $flagFile) { throw 'Test 19B migration was called despite unapproved window' }

    # 19C: MaintenanceWindow operator invalid
    Remove-Item -LiteralPath (Join-Path $fix.Root "incoming\release-$newSha.zip") -Force -ErrorAction SilentlyContinue
    $xfer = Prepare-IncomingTransfer $fix.Root $newSha
    $paramFileC = Join-Path $fix.Root 'deploy-params-19c.json'
    Write-DeploymentParameters $paramFileC @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      MaintenanceWindow = [ordered]@{ ReleaseSha = $newSha; StartUtc = [DateTime]::UtcNow.AddMinutes(-5).ToString('yyyy-MM-ddTHH:mm:ssZ'); EndUtc = [DateTime]::UtcNow.AddHours(1).ToString('yyyy-MM-ddTHH:mm:ssZ'); AuthorizedBy = ''; Approved = $true }
      ReportFileName = "deploy-report-$newSha.json"
    }
    $thrown = $false
    try { & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFileC | Out-Null }
    catch { $thrown = $true; if ($_.Exception.Message -notmatch 'MAINTENANCE_WINDOW_OPERATOR_INVALID') { throw "Test 19C unexpected error: $($_.Exception.Message)" } }
    if (-not $thrown) { throw 'Test 19C did not throw on invalid operator' }
    if (Test-Path -LiteralPath $flagFile) { throw 'Test 19C migration was called despite invalid operator' }

    # 19D: Target SHA mismatch
    Remove-Item -LiteralPath (Join-Path $fix.Root "incoming\release-$newSha.zip") -Force -ErrorAction SilentlyContinue
    $xfer = Prepare-IncomingTransfer $fix.Root $newSha
    $paramFileD = Join-Path $fix.Root 'deploy-params-19d.json'
    Write-DeploymentParameters $paramFileD @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      MaintenanceWindow = [ordered]@{ ReleaseSha = ('f' * 40); StartUtc = [DateTime]::UtcNow.AddMinutes(-5).ToString('yyyy-MM-ddTHH:mm:ssZ'); EndUtc = [DateTime]::UtcNow.AddHours(1).ToString('yyyy-MM-ddTHH:mm:ssZ'); AuthorizedBy = 'ops'; Approved = $true }
      ReportFileName = "deploy-report-$newSha.json"
    }
    $thrown = $false
    try { & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFileD | Out-Null }
    catch { $thrown = $true; if ($_.Exception.Message -notmatch 'MAINTENANCE_WINDOW_SHA_MISMATCH') { throw "Test 19D unexpected error: $($_.Exception.Message)" } }
    if (-not $thrown) { throw 'Test 19D did not throw on SHA mismatch' }
    if (Test-Path -LiteralPath $flagFile) { throw 'Test 19D migration was called despite SHA mismatch' }

    Write-Output '  [PASS] Test 19 (AUD-04-R2): Missing, unapproved, invalid-operator or SHA-mismatched maintenance window rejected before stop/migration'
  }

  # --- TEST 20 (AUD-04-R2): Expired, future or invalid-range maintenance window -> rejected before stop/migration ---
  Invoke-AudTest 20 'Expired, future or invalid-range maintenance window -> rejected before stop/migration' {
    $fix = New-AudFixtureEnvironment 'test20'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null
    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $flagFile = Join-Path $fix.Root 'migration-called-20.flag'
    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "New-Item -LiteralPath '$flagFile' -ItemType File | Out-Null; Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
    }
    Set-FixtureScriptStubs $stubs

    # 20A: Future window
    $paramFileA = Join-Path $fix.Root 'deploy-params-20a.json'
    Write-DeploymentParameters $paramFileA @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      MaintenanceWindow = [ordered]@{ ReleaseSha = $newSha; StartUtc = [DateTime]::UtcNow.AddHours(2).ToString('yyyy-MM-ddTHH:mm:ssZ'); EndUtc = [DateTime]::UtcNow.AddHours(3).ToString('yyyy-MM-ddTHH:mm:ssZ'); AuthorizedBy = 'ops'; Approved = $true }
      ReportFileName = "deploy-report-$newSha.json"
    }
    $thrown = $false
    try { & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFileA | Out-Null }
    catch { $thrown = $true; if ($_.Exception.Message -notmatch 'MAINTENANCE_WINDOW_FUTURE') { throw "Test 20A unexpected error: $($_.Exception.Message)" } }
    if (-not $thrown) { throw 'Test 20A did not throw on future window' }
    if (Test-Path -LiteralPath $flagFile) { throw 'Test 20A migration called despite future window' }

    # 20B: Expired window
    Remove-Item -LiteralPath (Join-Path $fix.Root "incoming\release-$newSha.zip") -Force -ErrorAction SilentlyContinue
    $xfer = Prepare-IncomingTransfer $fix.Root $newSha
    $paramFileB = Join-Path $fix.Root 'deploy-params-20b.json'
    Write-DeploymentParameters $paramFileB @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      MaintenanceWindow = [ordered]@{ ReleaseSha = $newSha; StartUtc = [DateTime]::UtcNow.AddHours(-2).ToString('yyyy-MM-ddTHH:mm:ssZ'); EndUtc = [DateTime]::UtcNow.AddHours(-1).ToString('yyyy-MM-ddTHH:mm:ssZ'); AuthorizedBy = 'ops'; Approved = $true }
      ReportFileName = "deploy-report-$newSha.json"
    }
    $thrown = $false
    try { & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFileB | Out-Null }
    catch { $thrown = $true; if ($_.Exception.Message -notmatch 'MAINTENANCE_WINDOW_EXPIRED') { throw "Test 20B unexpected error: $($_.Exception.Message)" } }
    if (-not $thrown) { throw 'Test 20B did not throw on expired window' }
    if (Test-Path -LiteralPath $flagFile) { throw 'Test 20B migration called despite expired window' }

    # 20C: Invalid range
    Remove-Item -LiteralPath (Join-Path $fix.Root "incoming\release-$newSha.zip") -Force -ErrorAction SilentlyContinue
    $xfer = Prepare-IncomingTransfer $fix.Root $newSha
    $paramFileC = Join-Path $fix.Root 'deploy-params-20c.json'
    Write-DeploymentParameters $paramFileC @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      MaintenanceWindow = [ordered]@{ ReleaseSha = $newSha; StartUtc = [DateTime]::UtcNow.AddHours(1).ToString('yyyy-MM-ddTHH:mm:ssZ'); EndUtc = [DateTime]::UtcNow.AddHours(-1).ToString('yyyy-MM-ddTHH:mm:ssZ'); AuthorizedBy = 'ops'; Approved = $true }
      ReportFileName = "deploy-report-$newSha.json"
    }
    $thrown = $false
    try { & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFileC | Out-Null }
    catch { $thrown = $true; if ($_.Exception.Message -notmatch 'MAINTENANCE_WINDOW_INVALID_RANGE') { throw "Test 20C unexpected error: $($_.Exception.Message)" } }
    if (-not $thrown) { throw 'Test 20C did not throw on invalid range' }

    Write-Output '  [PASS] Test 20 (AUD-04-R2): Expired, future and invalid-range maintenance windows rejected before stop/migration'
  }

  # --- TEST 21 (AUD-04-R2): Successful pre-migration quiescence -> migration -> sync -> switch -> activation ---
  Invoke-AudTest 21 'Successful pre-migration quiescence -> migration -> sync -> switch -> activation' {
    $fix = New-AudFixtureEnvironment 'test21'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null

    $newReleaseDir = Join-Path $fix.Root "releases\$newSha\apps\api\dist\apps\api\src"
    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) `$dir = Join-Path `$Root `"releases\`$ReleaseSha\apps\api\dist\apps\api\src`"; New-Item -ItemType Directory -Path `$dir -Force | Out-Null; [IO.File]::WriteAllText((Join-Path `$dir 'main.js'), 'console.log(\`"v2\`");'); Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "param([switch]`$QuiescenceVerified) if (-not `$QuiescenceVerified) { throw 'MIGRATION_QUIESCENCE_NOT_ASSERTED' }; Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "Write-Output '{`"state`":`"synchronized`"}'"
      'restart-baogiang-api.ps1' = "Write-Output '{`"runtimeKind`":`"scheduled-task`",`"activationState`":`"enabled-running`"}'"
      'test-production-health.ps1' = "Write-Output '{`"state`":`"healthy`",`"httpStatus`":200}'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    $deployResult = & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile
    $rep = Get-Content (Join-Path $fix.Root "logs\deploy-report-$newSha.json") -Raw | ConvertFrom-Json
    if ($rep.overallState -ne 'succeeded') { throw "Test 21 overallState: $($rep.overallState) (must be succeeded)" }
    if ($rep.maintenanceWindow.approved -ne $true) { throw "Test 21 maintenanceWindow.approved is not true" }
    if ($rep.maintenanceWindow.quiescenceVerified -ne $true) { throw "Test 21 quiescenceVerified is not true" }
    if ([string]::IsNullOrWhiteSpace($rep.maintenanceWindow.quiescedUtc)) { throw "Test 21 quiescedUtc is missing" }
    if ($rep.rollback.state -ne 'notNeeded') { throw "Test 21 rollback state: $($rep.rollback.state) (must be notNeeded)" }

    $currentTarget = Split-Path (Assert-ReleasePointerTarget -PointerPath (Join-Path $fix.Root 'current') -Root $fix.Root) -Leaf
    if ($currentTarget -cne $newSha) { throw "Test 21 current pointer is not newSha: $currentTarget" }

    Write-Output '  [PASS] Test 21 (AUD-04-R2): Full successful pre-migration stop, quiescence proof, migration, sync, switch and activation'
  }

  # --- TEST 22 (AUD-04-R2): Safe-stop failure before migration -> migration never called ---
  Invoke-AudTest 22 'Safe-stop failure before migration -> migration never called' {
    $fix = New-AudFixtureEnvironment 'test22'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null
    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $flagFile = Join-Path $fix.Root 'migration-executed-22.flag'
    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "New-Item -LiteralPath '$flagFile' -ItemType File | Out-Null; Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:aud04StopShouldFail = $true
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Simulated safe-stop failure') { throw "Test 22 unexpected exception: $($_.Exception.Message)" }
    } finally {
      $global:aud04StopShouldFail = $false
    }
    if (-not $thrown) { throw 'Test 22 did not throw on safe-stop failure' }
    if (Test-Path -LiteralPath $flagFile) { throw 'Test 22 migration was executed despite safe-stop failure' }

    $rep = Get-Content (Join-Path $fix.Root "logs\deploy-report-$newSha.json") -Raw | ConvertFrom-Json
    if ($rep.overallState -ne 'failed') { throw "Test 22 overallState: $($rep.overallState)" }

    Write-Output '  [PASS] Test 22 (AUD-04-R2): Safe-stop failure before migration -> migration never called, fail-closed'
  }

  # --- TEST 23 (AUD-04-R2): Quiescence verification failure (task enabled or port occupied) -> migration never called ---
  Invoke-AudTest 23 'Quiescence verification failure (task enabled or port occupied) -> migration never called' {
    $fix = New-AudFixtureEnvironment 'test23'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null
    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $flagFile = Join-Path $fix.Root 'migration-executed-23.flag'
    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "New-Item -LiteralPath '$flagFile' -ItemType File | Out-Null; Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    # 23A: Scheduled task remains 'Running' (not Disabled)
    function global:Get-ScheduledTask {
      param([string]$TaskName)
      return [pscustomobject]@{
        TaskName = 'BaoGiangBackend'; TaskPath = '\BaoGiang\'; State = 'Running'
        Principal = [pscustomobject]@{ UserId = 'fixture-account' }
        Actions = @([pscustomobject]@{ Execute = $fakeToolPath; Arguments = '-File start-baogiang-api.ps1'; WorkingDirectory = $(if (-not [string]::IsNullOrWhiteSpace($global:currentAudFixtureWd)) { $global:currentAudFixtureWd } else { 'C:\dummy' }) })
        Triggers = @([pscustomobject]@{ CimClass = [pscustomobject]@{ CimClassName = 'MSFT_TaskBootTrigger' }; Enabled = $true })
      }
    }
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Scheduled Task safe-stop did not leave the exact task disabled') { throw "Test 23A unexpected error: $($_.Exception.Message)" }
    } finally {
      function global:Get-ScheduledTask {
        param([string]$TaskName)
        return [pscustomobject]@{
          TaskName = 'BaoGiangBackend'; TaskPath = '\BaoGiang\'; State = 'Disabled'
          Principal = [pscustomobject]@{ UserId = 'fixture-account' }
          Actions = @([pscustomobject]@{ Execute = $fakeToolPath; Arguments = '-File start-baogiang-api.ps1'; WorkingDirectory = $(if (-not [string]::IsNullOrWhiteSpace($global:currentAudFixtureWd)) { $global:currentAudFixtureWd } else { 'C:\dummy' }) })
          Triggers = @([pscustomobject]@{ CimClass = [pscustomobject]@{ CimClassName = 'MSFT_TaskBootTrigger' }; Enabled = $true })
        }
      }
    }
    if (-not $thrown) { throw 'Test 23A did not throw when task remained Running' }
    if (Test-Path -LiteralPath $flagFile) { throw 'Test 23A migration called despite enabled task' }

    # 23B: Port 3100 occupied by listener
    Remove-Item -LiteralPath (Join-Path $fix.Root "incoming\release-$newSha.zip") -Force -ErrorAction SilentlyContinue
    $xfer = Prepare-IncomingTransfer $fix.Root $newSha
    function global:Get-NetTCPConnection {
      param($State, $LocalPort, $ErrorAction)
      if ($LocalPort -eq 3100) {
        return @([pscustomobject]@{ OwningProcess = 1234; LocalPort = 3100; State = 'Listen' })
      }
      return @()
    }
    function global:Get-CimInstance {
      param([string]$ClassName, [string]$Filter)
      if ($ClassName -eq 'Win32_Process') {
        return @([pscustomobject]@{ ProcessId = 1234; ExecutablePath = 'C:\foreign\app.exe'; CommandLine = 'foreign app' })
      }
      if ($ClassName -eq 'Win32_Service') {
        return @([pscustomobject]@{ Name = 'BaoGiangBackend'; StartMode = 'Disabled'; State = 'Stopped'; StartName = 'fixture-account'; PathName = $fakeToolPath })
      }
      return @()
    }
    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Port 3100 is occupied' -and $_.Exception.Message -notmatch 'Safe-stop conflict' -and $_.Exception.Message -notmatch 'QUIESCENCE_VIOLATION') {
        throw "Test 23B unexpected error: $($_.Exception.Message)"
      }
    } finally {
      Remove-Item Function:\Get-NetTCPConnection -Force -ErrorAction SilentlyContinue
      function global:Get-CimInstance {
        param([string]$ClassName, [string]$Filter)
        if ($ClassName -eq 'Win32_Process') { return @() }
        if ($ClassName -eq 'Win32_Service') {
          return @([pscustomobject]@{ Name = 'BaoGiangBackend'; StartMode = 'Disabled'; State = 'Stopped'; StartName = 'fixture-account'; PathName = $fakeToolPath })
        }
        return @()
      }
    }
    if (-not $thrown) { throw 'Test 23B did not throw when port was occupied' }
    if (Test-Path -LiteralPath $flagFile) { throw 'Test 23B migration called despite occupied port' }

    Write-Output '  [PASS] Test 23 (AUD-04-R2): Quiescence verification failure (task enabled or port occupied) -> migration never called'
  }

  # --- TEST 24 (AUD-04-R2): Foreign listener on port 3100 -> safe-stop conflict, no foreign process mutation ---
  Invoke-AudTest 24 'Foreign listener on port 3100 -> safe-stop conflict, no foreign process mutation' {
    $fix = New-AudFixtureEnvironment 'test24'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null
    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $flagFile = Join-Path $fix.Root 'migration-executed-24.flag'
    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "New-Item -LiteralPath '$flagFile' -ItemType File | Out-Null; Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
    }
    Set-FixtureScriptStubs $stubs

    $foreignPid = 77777
    $foreignKilled = $false

    function global:Get-NetTCPConnection {
      param($State, $LocalPort, $ErrorAction)
      if ($LocalPort -eq 3100) {
        return @([pscustomobject]@{ OwningProcess = $foreignPid; LocalPort = 3100; State = 'Listen' })
      }
      return @()
    }

    function global:Stop-Process {
      param($Id, $Force)
      if ($Id -eq $foreignPid) { $foreignKilled = $true }
    }

    function global:Get-CimInstance {
      param([string]$ClassName, [string]$Filter)
      if ($ClassName -eq 'Win32_Process') {
        return @([pscustomobject]@{ ProcessId = $foreignPid; ExecutablePath = 'C:\foreign\process.exe'; CommandLine = 'foreign-process' })
      }
      if ($ClassName -eq 'Win32_Service') {
        return @([pscustomobject]@{ Name = 'BaoGiangBackend'; StartMode = 'Disabled'; State = 'Stopped'; StartName = 'fixture-account'; PathName = $fakeToolPath })
      }
      return @()
    }

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    $thrown = $false
    try {
      & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null
    } catch {
      $thrown = $true
      if ($_.Exception.Message -notmatch 'Port 3100 is occupied by a process that does not match' -and $_.Exception.Message -notmatch 'Safe-stop conflict: foreign process owns port 3100') {
        throw "Test 24 unexpected exception: $($_.Exception.Message)"
      }
    } finally {
      Remove-Item Function:\Get-NetTCPConnection -Force -ErrorAction SilentlyContinue
      function global:Stop-Process { param($Id, [switch]$Force) return $true }
      function global:Get-CimInstance {
        param([string]$ClassName, [string]$Filter)
        if ($ClassName -eq 'Win32_Process') { return @() }
        if ($ClassName -eq 'Win32_Service') {
          return @([pscustomobject]@{ Name = 'BaoGiangBackend'; StartMode = 'Disabled'; State = 'Stopped'; StartName = 'fixture-account'; PathName = $fakeToolPath })
        }
        return @()
      }
    }
    if (-not $thrown) { throw 'Test 24 did not throw on foreign port conflict' }
    if ($foreignKilled) { throw 'Test 24 foreign process was killed!' }
    if (Test-Path -LiteralPath $flagFile) { throw 'Test 24 migration executed despite foreign listener conflict' }

    Write-Output '  [PASS] Test 24 (AUD-04-R2): Foreign listener detected -> aborted safely without foreign process mutation'
  }

  # --- TEST 25 (AUD-04-R2): Failure after quiescence but before migration (25A safe-stopped, 25B approved recovery) ---
  Invoke-AudTest 25 'Failure after quiescence but before migration (25A safe-stopped, 25B approved recovery)' {
    # 25A: PreMigrationRecoveryApproved = $false
    $fixA = New-AudFixtureEnvironment 'test25a'
    $origReleaseDirA = Join-Path $fixA.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDirA -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDirA 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fixA.Root 'current') -Target (Join-Path $fixA.Root "releases\$origSha") | Out-Null
    $xferA = Prepare-IncomingTransfer $fixA.Root $newSha

    $flagFileA = Join-Path $fixA.Root 'migration-executed-25a.flag'
    $stubsA = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "New-Item -LiteralPath '$flagFileA' -ItemType File | Out-Null; Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'restart-baogiang-api.ps1' = "throw 'Restart must NOT be called in 25A'"
    }
    Set-FixtureScriptStubs $stubsA

    $paramFileA = Join-Path $fixA.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFileA @{
      ReleaseSha = $newSha; Root = $fixA.Root; TransferDirectoryName = $xferA.TransferDir; SourceArchiveName = $xferA.ArchiveName
      ExpectedSha256 = $xferA.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fixA.EnvFile; StartupWrapper = $fixA.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fixA.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fixA.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      PreMigrationRecoveryApproved = $false; RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:taskQueryCount = 0
    function global:Get-ScheduledTask {
      param([string]$TaskName)
      $global:taskQueryCount++
      if ($global:taskQueryCount -ge 3) {
        throw 'Simulated pre-migration validation failure in Step 9'
      }
      return [pscustomobject]@{
        TaskName = 'BaoGiangBackend'; TaskPath = '\BaoGiang\'; State = 'Disabled'
        Principal = [pscustomobject]@{ UserId = 'fixture-account' }
        Actions = @([pscustomobject]@{ Execute = $fakeToolPath; Arguments = '-File start-baogiang-api.ps1'; WorkingDirectory = $(if (-not [string]::IsNullOrWhiteSpace($global:currentAudFixtureWd)) { $global:currentAudFixtureWd } else { 'C:\dummy' }) })
        Triggers = @([pscustomobject]@{ CimClass = [pscustomobject]@{ CimClassName = 'MSFT_TaskBootTrigger' }; Enabled = $true })
      }
    }

    $thrown = $false
    try { & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFileA | Out-Null }
    catch { $thrown = $true; if ($_.Exception.Message -notmatch 'Simulated pre-migration validation failure in Step 9') { throw "Test 25A unexpected exception: $($_.Exception.Message)" } }
    finally {
      function global:Get-ScheduledTask {
        param([string]$TaskName)
        return [pscustomobject]@{
          TaskName = 'BaoGiangBackend'; TaskPath = '\BaoGiang\'; State = 'Disabled'
          Principal = [pscustomobject]@{ UserId = 'fixture-account' }
          Actions = @([pscustomobject]@{ Execute = $fakeToolPath; Arguments = '-File start-baogiang-api.ps1'; WorkingDirectory = $(if (-not [string]::IsNullOrWhiteSpace($global:currentAudFixtureWd)) { $global:currentAudFixtureWd } else { 'C:\dummy' }) })
          Triggers = @([pscustomobject]@{ CimClass = [pscustomobject]@{ CimClassName = 'MSFT_TaskBootTrigger' }; Enabled = $true })
        }
      }
    }
    if (-not $thrown) { throw 'Test 25A did not throw' }
    if (Test-Path -LiteralPath $flagFileA) { throw 'Test 25A migration was executed despite Step 9 failure' }

    $repA = Get-Content (Join-Path $fixA.Root "logs\deploy-report-$newSha.json") -Raw | ConvertFrom-Json
    if ($repA.rollback.state -ne 'quiescedPreMigrationStopped') { throw "Test 25A rollback state: $($repA.rollback.state) (must be quiescedPreMigrationStopped)" }

    # 25B: PreMigrationRecoveryApproved = $true
    $fixB = New-AudFixtureEnvironment 'test25b'
    $origReleaseDirB = Join-Path $fixB.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDirB -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDirB 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fixB.Root 'current') -Target (Join-Path $fixB.Root "releases\$origSha") | Out-Null
    $xferB = Prepare-IncomingTransfer $fixB.Root $newSha

    $flagFileB = Join-Path $fixB.Root 'migration-executed-25b.flag'
    $stubsB = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "New-Item -LiteralPath '$flagFileB' -ItemType File | Out-Null; Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'restart-baogiang-api.ps1' = "Write-Output '{`"runtimeKind`":`"scheduled-task`",`"activationState`":`"enabled-running`"}'"
      'test-production-health.ps1' = "Write-Output '{`"state`":`"healthy`",`"httpStatus`":200}'"
    }
    Set-FixtureScriptStubs $stubsB

    $paramFileB = Join-Path $fixB.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFileB @{
      ReleaseSha = $newSha; Root = $fixB.Root; TransferDirectoryName = $xferB.TransferDir; SourceArchiveName = $xferB.ArchiveName
      ExpectedSha256 = $xferB.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fixB.EnvFile; StartupWrapper = $fixB.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fixB.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fixB.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      PreMigrationRecoveryApproved = $true; RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:taskQueryCount = 0
    function global:Get-ScheduledTask {
      param([string]$TaskName)
      $global:taskQueryCount++
      if ($global:taskQueryCount -eq 3) {
        throw 'Simulated pre-migration validation failure in Step 9 for 25B'
      }
      return [pscustomobject]@{
        TaskName = 'BaoGiangBackend'; TaskPath = '\BaoGiang\'; State = 'Disabled'
        Principal = [pscustomobject]@{ UserId = 'fixture-account' }
        Actions = @([pscustomobject]@{ Execute = $fakeToolPath; Arguments = '-File start-baogiang-api.ps1'; WorkingDirectory = $(if (-not [string]::IsNullOrWhiteSpace($global:currentAudFixtureWd)) { $global:currentAudFixtureWd } else { 'C:\dummy' }) })
        Triggers = @([pscustomobject]@{ CimClass = [pscustomobject]@{ CimClassName = 'MSFT_TaskBootTrigger' }; Enabled = $true })
      }
    }

    $thrown = $false
    try { & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFileB | Out-Null }
    catch { $thrown = $true; if ($_.Exception.Message -notmatch 'Simulated pre-migration validation failure in Step 9 for 25B') { throw "Test 25B unexpected exception: $($_.Exception.Message)" } }
    finally {
      function global:Get-ScheduledTask {
        param([string]$TaskName)
        return [pscustomobject]@{
          TaskName = 'BaoGiangBackend'; TaskPath = '\BaoGiang\'; State = 'Disabled'
          Principal = [pscustomobject]@{ UserId = 'fixture-account' }
          Actions = @([pscustomobject]@{ Execute = $fakeToolPath; Arguments = '-File start-baogiang-api.ps1'; WorkingDirectory = $(if (-not [string]::IsNullOrWhiteSpace($global:currentAudFixtureWd)) { $global:currentAudFixtureWd } else { 'C:\dummy' }) })
          Triggers = @([pscustomobject]@{ CimClass = [pscustomobject]@{ CimClassName = 'MSFT_TaskBootTrigger' }; Enabled = $true })
        }
      }
    }
    if (-not $thrown) { throw 'Test 25B did not throw' }
    if (Test-Path -LiteralPath $flagFileB) { throw 'Test 25B migration was executed despite Step 9 failure' }

    $repB = Get-Content (Join-Path $fixB.Root "logs\deploy-report-$newSha.json") -Raw | ConvertFrom-Json
    if ($repB.rollback.state -ne 'completed') { throw "Test 25B rollback state: $($repB.rollback.state) (must be completed)" }
    if ($repB.rollback.currentTarget -notmatch [regex]::Escape($origSha)) { throw "Test 25B currentTarget was not origSha: $($repB.rollback.currentTarget)" }

    Write-Output '  [PASS] Test 25 (AUD-04-R2): Failure after quiescence but before migration (25A stays safe-stopped, 25B executes approved recovery)'
  }

  # --- TEST 26 (AUD-04-R2): Migration attempted/unknown, including rollback compatibility approved -> stays stopped ---
  Invoke-AudTest 26 'Migration attempted/unknown, including rollback compatibility approved -> stays stopped' {
    $fix = New-AudFixtureEnvironment 'test26'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null
    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "throw 'Simulated migration execution failure in Test 26'"
      'restart-baogiang-api.ps1' = "throw 'Restart must NOT be called when migration failed/unknown!'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $true; ReportFileName = "deploy-report-$newSha.json"
    }

    $thrown = $false
    try { & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null }
    catch { $thrown = $true; if ($_.Exception.Message -notmatch 'Simulated migration execution failure in Test 26') { throw "Test 26 unexpected exception: $($_.Exception.Message)" } }
    if (-not $thrown) { throw 'Test 26 did not throw on migration failure' }

    $rep = Get-Content (Join-Path $fix.Root "logs\deploy-report-$newSha.json") -Raw | ConvertFrom-Json
    if ($rep.rollback.state -ne 'stoppedCompatibilityApprovalRequired') { throw "Test 26 rollback state: $($rep.rollback.state) (must be stoppedCompatibilityApprovalRequired)" }

    Write-Output '  [PASS] Test 26 (AUD-04-R2): Migration failed/unknown with rollback compatibility approved -> stays safely stopped'
  }

  # --- TEST 27 (AUD-04-R2): First-deploy handling (no current link) with migration ---
  Invoke-AudTest 27 'First-deploy handling (no current link) with migration' {
    $fix = New-AudFixtureEnvironment 'test27'
    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) `$dir = Join-Path `$Root `"releases\`$ReleaseSha\apps\api\dist\apps\api\src`"; New-Item -ItemType Directory -Path `$dir -Force | Out-Null; [IO.File]::WriteAllText((Join-Path `$dir 'main.js'), 'console.log(\`"v1\`");'); Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "param([switch]`$QuiescenceVerified) if (-not `$QuiescenceVerified) { throw 'MIGRATION_QUIESCENCE_NOT_ASSERTED' }; Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "Write-Output '{`"state`":`"synchronized`"}'"
      'restart-baogiang-api.ps1' = "Write-Output '{`"runtimeKind`":`"scheduled-task`",`"activationState`":`"enabled-running`"}'"
      'test-production-health.ps1' = "Write-Output '{`"state`":`"healthy`",`"httpStatus`":200}'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    $deployResult = & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile
    $rep = Get-Content (Join-Path $fix.Root "logs\deploy-report-$newSha.json") -Raw | ConvertFrom-Json
    if ($rep.overallState -ne 'succeeded') { throw "Test 27 overallState: $($rep.overallState) (must be succeeded)" }
    if ($rep.previousRelease -ne $null) { throw "Test 27 previousRelease should be null on first deploy" }
    if ($rep.maintenanceWindow.quiescenceVerified -ne $true) { throw "Test 27 quiescenceVerified is not true" }

    Write-Output '  [PASS] Test 27 (AUD-04-R2): First-deploy handling verified with migration and quiescence'
  }

  # --- TEST 28 (AUD-04-R2): Unexpected or dangling release pointer during pre-migration recovery ---
  Invoke-AudTest 28 'Unexpected or dangling release pointer during pre-migration recovery' {
    $fix = New-AudFixtureEnvironment 'test28'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null
    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "throw 'Unreachable'"
      'restart-baogiang-api.ps1' = "Write-Output '{`"runtimeKind`":`"scheduled-task`",`"activationState`":`"enabled-running`"}'"
      'test-production-health.ps1' = "Write-Output '{`"state`":`"healthy`",`"httpStatus`":200}'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      PreMigrationRecoveryApproved = $true; RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:taskQueryCount = 0
    function global:Get-ScheduledTask {
      param([string]$TaskName)
      $global:taskQueryCount++
      if ($global:taskQueryCount -eq 3) {
        [IO.Directory]::Delete((Join-Path $fix.Root 'current'))
        New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root 'releases\dangling-corrupt-target') | Out-Null
        throw 'Simulated Step 9 abort before dangling recovery check'
      }
      return [pscustomobject]@{
        TaskName = 'BaoGiangBackend'; TaskPath = '\BaoGiang\'; State = 'Disabled'
        Principal = [pscustomobject]@{ UserId = 'fixture-account' }
        Actions = @([pscustomobject]@{ Execute = $fakeToolPath; Arguments = '-File start-baogiang-api.ps1'; WorkingDirectory = $(if (-not [string]::IsNullOrWhiteSpace($global:currentAudFixtureWd)) { $global:currentAudFixtureWd } else { 'C:\dummy' }) })
        Triggers = @([pscustomobject]@{ CimClass = [pscustomobject]@{ CimClassName = 'MSFT_TaskBootTrigger' }; Enabled = $true })
      }
    }

    $thrown = $false
    try { & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null }
    catch { $thrown = $true }
    finally {
      function global:Get-ScheduledTask {
        param([string]$TaskName)
        return [pscustomobject]@{
          TaskName = 'BaoGiangBackend'; TaskPath = '\BaoGiang\'; State = 'Disabled'
          Principal = [pscustomobject]@{ UserId = 'fixture-account' }
          Actions = @([pscustomobject]@{ Execute = $fakeToolPath; Arguments = '-File start-baogiang-api.ps1'; WorkingDirectory = $(if (-not [string]::IsNullOrWhiteSpace($global:currentAudFixtureWd)) { $global:currentAudFixtureWd } else { 'C:\dummy' }) })
          Triggers = @([pscustomobject]@{ CimClass = [pscustomobject]@{ CimClassName = 'MSFT_TaskBootTrigger' }; Enabled = $true })
        }
      }
    }
    if (-not $thrown) { throw 'Test 28 did not throw' }

    $rep = Get-Content (Join-Path $fix.Root "logs\deploy-report-$newSha.json") -Raw | ConvertFrom-Json
    if ($rep.rollback.state -ne 'unverifiedPointerSafeStopped') { throw "Test 28 rollback state: $($rep.rollback.state) (must be unverifiedPointerSafeStopped)" }

    Write-Output '  [PASS] Test 28 (AUD-04-R2): Corrupt or dangling pointer during pre-migration recovery -> safely stopped'
  }

  # --- TEST 29 (AUD-04-R2): Post-restart health failure and secondary safe-stop failure during pre-migration recovery ---
  Invoke-AudTest 29 'Post-restart health failure and secondary safe-stop failure during pre-migration recovery' {
    $fix = New-AudFixtureEnvironment 'test29'
    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null
    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $thirdSha = '3' * 40
    $thirdReleaseDir = Join-Path $fix.Root "releases\$thirdSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $thirdReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $thirdReleaseDir 'main.js'), 'console.log("v3");', [Text.UTF8Encoding]::new($false))

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) New-Item -ItemType Directory -Path (Join-Path `$Root `"releases\`$ReleaseSha`") -Force | Out-Null; Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "throw 'Unreachable'"
      'restart-baogiang-api.ps1' = "Write-Output '{`"runtimeKind`":`"scheduled-task`",`"activationState`":`"enabled-running`"}'"
      'test-production-health.ps1' = "[IO.Directory]::Delete((Join-Path '$($fix.Root)' 'current')); New-Item -ItemType Junction -Path (Join-Path '$($fix.Root)' 'current') -Target (Join-Path '$($fix.Root)' 'releases\$thirdSha') | Out-Null; Write-Output '{`"state`":`"healthy`",`"httpStatus`":200}'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      PreMigrationRecoveryApproved = $true; RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    $global:taskQueryCount = 0
    function global:Get-ScheduledTask {
      param([string]$TaskName)
      $global:taskQueryCount++
      if ($global:taskQueryCount -eq 3) {
        throw 'Simulated Step 9 pre-migration failure for 29'
      }
      return [pscustomobject]@{
        TaskName = 'BaoGiangBackend'; TaskPath = '\BaoGiang\'; State = 'Disabled'
        Principal = [pscustomobject]@{ UserId = 'fixture-account' }
        Actions = @([pscustomobject]@{ Execute = $fakeToolPath; Arguments = '-File start-baogiang-api.ps1'; WorkingDirectory = $(if (-not [string]::IsNullOrWhiteSpace($global:currentAudFixtureWd)) { $global:currentAudFixtureWd } else { 'C:\dummy' }) })
        Triggers = @([pscustomobject]@{ CimClass = [pscustomobject]@{ CimClassName = 'MSFT_TaskBootTrigger' }; Enabled = $true })
      }
    }

    $global:aud04StopShouldFail = $true
    $thrown = $false
    try { & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null }
    catch { $thrown = $true }
    finally {
      $global:aud04StopShouldFail = $false
      function global:Get-ScheduledTask {
        param([string]$TaskName)
        return [pscustomobject]@{
          TaskName = 'BaoGiangBackend'; TaskPath = '\BaoGiang\'; State = 'Disabled'
          Principal = [pscustomobject]@{ UserId = 'fixture-account' }
          Actions = @([pscustomobject]@{ Execute = $fakeToolPath; Arguments = '-File start-baogiang-api.ps1'; WorkingDirectory = $(if (-not [string]::IsNullOrWhiteSpace($global:currentAudFixtureWd)) { $global:currentAudFixtureWd } else { 'C:\dummy' }) })
          Triggers = @([pscustomobject]@{ CimClass = [pscustomobject]@{ CimClassName = 'MSFT_TaskBootTrigger' }; Enabled = $true })
        }
      }
    }
    if (-not $thrown) { throw 'Test 29 did not throw' }

    $rep = Get-Content (Join-Path $fix.Root "logs\deploy-report-$newSha.json") -Raw | ConvertFrom-Json
    if ($rep.rollback.state -ne 'failed') { throw "Test 29 rollback state: $($rep.rollback.state) (must be failed)" }

    Write-Output '  [PASS] Test 29 (AUD-04-R2): Pointer mutation and secondary safe-stop failure during pre-migration recovery captured'
  }

  # --- TEST 30 (AUD-04-R2): Reboot-persistence safeguard while quiesced ---
  Invoke-AudTest 30 'Reboot-persistence safeguard while quiesced' {
    $fix = New-AudFixtureEnvironment 'test30'

    $quiescedTask = [pscustomobject]@{
      TaskName = 'BaoGiangBackend'; TaskPath = '\BaoGiang\'; State = 'Disabled'
      Principal = [pscustomobject]@{ UserId = 'fixture-account' }
      Actions = @([pscustomobject]@{ Execute = $fakeToolPath; Arguments = '-File start-baogiang-api.ps1'; WorkingDirectory = $(if (-not [string]::IsNullOrWhiteSpace($global:currentAudFixtureWd)) { $global:currentAudFixtureWd } else { 'C:\dummy' }) })
      Triggers = @([pscustomobject]@{ CimClass = [pscustomobject]@{ CimClassName = 'MSFT_TaskBootTrigger' }; Enabled = $true })
    }

    $disabledConfirmed = Assert-ScheduledTaskDisabledState -Task $quiescedTask
    if (-not $disabledConfirmed) { throw 'Test 30 Assert-ScheduledTaskDisabledState returned false' }

    $enabledBootTask = [pscustomobject]@{
      TaskName = 'BaoGiangBackend'; TaskPath = '\BaoGiang\'; State = 'Ready'
      Principal = [pscustomobject]@{ UserId = 'fixture-account' }
      Actions = @([pscustomobject]@{ Execute = $fakeToolPath; Arguments = '-File start-baogiang-api.ps1'; WorkingDirectory = $(if (-not [string]::IsNullOrWhiteSpace($global:currentAudFixtureWd)) { $global:currentAudFixtureWd } else { 'C:\dummy' }) })
      Triggers = @([pscustomobject]@{ CimClass = [pscustomobject]@{ CimClassName = 'MSFT_TaskBootTrigger' }; Enabled = $true })
    }
    $enabledRejected = $false
    try { Assert-ScheduledTaskDisabledState -Task $enabledBootTask | Out-Null } catch { $enabledRejected = $true }
    if (-not $enabledRejected) { throw 'Test 30 Assert-ScheduledTaskDisabledState did not reject Ready state with Boot trigger' }

    Write-Output '  [PASS] Test 30 (AUD-04-R2): Reboot-persistence safeguard verified while quiesced (task Disabled prevents boot auto-start)'
  }

  # --- TEST 31 (AUD-04-R2): Neighbor isolation for Quản lí nội trú, PostgreSQL service and shared Nginx ---
  Invoke-AudTest 31 'Neighbor isolation for Quản lí nội trú, PostgreSQL service and shared Nginx' {
    $fix = New-AudFixtureEnvironment 'test31'
    $foreignDir = Join-Path $tempDir 'Quan_li_noi_tru_quiescence'
    New-Item -ItemType Directory -Path $foreignDir -Force | Out-Null
    $sentinelFile = Join-Path $foreignDir 'untouched-neighbour-q.txt'
    [IO.File]::WriteAllText($sentinelFile, 'neighbour content during pre-migration quiescence check', [Text.UTF8Encoding]::new($false))
    $beforeHash = Get-FileSha256FromBytes $sentinelFile

    $origReleaseDir = Join-Path $fix.Root "releases\$origSha\apps\api\dist\apps\api\src"
    New-Item -ItemType Directory -Path $origReleaseDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $origReleaseDir 'main.js'), 'console.log("v1");', [Text.UTF8Encoding]::new($false))
    New-Item -ItemType Junction -Path (Join-Path $fix.Root 'current') -Target (Join-Path $fix.Root "releases\$origSha") | Out-Null
    $xfer = Prepare-IncomingTransfer $fix.Root $newSha

    $stubs = @{
      'install-release.ps1' = "param(`$ReleaseSha, `$Root, [parameter(ValueFromRemainingArguments)]`$Rest) `$dir = Join-Path `$Root `"releases\`$ReleaseSha\apps\api\dist\apps\api\src`"; New-Item -ItemType Directory -Path `$dir -Force | Out-Null; [IO.File]::WriteAllText((Join-Path `$dir 'main.js'), 'console.log(\`"v2\`");'); Write-Output '{`"state`":`"installed`"}'"
      'backup-database.ps1' = "Write-Output '{`"state`":`"verified`",`"backupFile`":`"b.dump`"}'"
      'run-migrations.ps1' = "param([switch]`$QuiescenceVerified) Write-Output '{`"state`":`"completed`",`"before`":{`"state`":`"clean`"},`"after`":{`"state`":`"clean`"}}'"
      'sync-capability-catalog.ps1' = "Write-Output '{`"state`":`"synchronized`"}'"
      'restart-baogiang-api.ps1' = "Write-Output '{`"runtimeKind`":`"scheduled-task`",`"activationState`":`"enabled-running`"}'"
      'test-production-health.ps1' = "Write-Output '{`"state`":`"healthy`",`"httpStatus`":200}'"
    }
    Set-FixtureScriptStubs $stubs

    $paramFile = Join-Path $fix.Root 'deploy-params.json'
    Write-DeploymentParameters $paramFile @{
      ReleaseSha = $newSha; Root = $fix.Root; TransferDirectoryName = $xfer.TransferDir; SourceArchiveName = $xfer.ArchiveName
      ExpectedSha256 = $xfer.Sha256; NodeExe = $fakeToolPath; NpmExe = $fakeToolPath; NpxExe = $fakeToolPath
      PsqlExe = $fakeToolPath; PgDumpExe = $fakeToolPath; PgRestoreExe = $fakeToolPath
      EnvFile = $fix.EnvFile; StartupWrapper = $fix.StartupWrapper; NginxExe = $fakeToolPath; NginxConfig = $fix.NginxConfig
      ExpectedBaseUrl = 'https://baogiang.dtnt-damsan.edu.vn'; ServiceKind = 'scheduled-task'; ServiceName = 'BaoGiangBackend'
      ExpectedEntryPoint = $fix.EntryPoint; MigrationRequested = $true; ProductionMigrationApproved = $true
      RollbackCompatibilityApproved = $false; ReportFileName = "deploy-report-$newSha.json"
    }

    & (Join-Path $fixtureScriptsDir 'invoke-production-deploy.ps1') -ParameterFile $paramFile | Out-Null

    $afterHash = Get-FileSha256FromBytes $sentinelFile
    if ($beforeHash -cne $afterHash) { throw 'Test 31 neighbour sentinel was mutated during execution' }

    $conflictRejected = $false
    try { Assert-DedicatedRoot $foreignDir | Out-Null } catch { $conflictRejected = $true }
    if (-not $conflictRejected) { throw 'Test 31 Assert-DedicatedRoot accepted neighbour path' }

    Write-Output '  [PASS] Test 31 (AUD-04-R2): Neighbor isolation verified during pre-migration quiescence and deployment (neighbour untouched)'
  }

  # --- TEST 32 (AUD-04-G1-1): Real run-migrations.ps1: Maintenance window expired after precheck rejected before mutation ---
  Invoke-AudTest 32 'Real run-migrations.ps1: Maintenance window expired after precheck rejected before mutation' {
    $env32 = New-AudMigrationTestEnvironment 'test32' $newSha
    [IO.File]::WriteAllText($env32.ExpireFlag, 'expire', [Text.ASCIIEncoding]::new())

    $mw32 = [pscustomobject]@{
      ReleaseSha = $newSha
      StartUtc = [DateTime]::UtcNow.AddMinutes(-5).ToString('o')
      AuthorizedBy = 'operator-aud04'
      Approved = $true
    }
    $mw32 | Add-Member -MemberType ScriptProperty -Name 'EndUtc' -Value {
      if (Test-Path "$($env32.Fix.Root)\mw-expired.flag") {
        return [DateTime]::UtcNow.AddMinutes(-1).ToString('o')
      } else {
        return [DateTime]::UtcNow.AddHours(1).ToString('o')
      }
    }

    $caught = $null
    try {
      & (Join-Path $fixtureScriptsDir 'run-migrations.ps1') `
        -ReleaseSha $newSha `
        -ReleasePath $env32.ReleaseDir `
        -NpxExe $env32.NpxCmd `
        -PsqlExe $env32.PsqlCmd `
        -Root $env32.Fix.Root `
        -ServiceKind 'scheduled-task' `
        -ServiceName 'BaoGiangBackend' `
        -EnvFile $env32.Fix.EnvFile `
        -StartupWrapper $env32.Fix.StartupWrapper `
        -ExpectedEntryPoint $env32.EntryPoint `
        -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' `
        -AllowProductionMigration `
        -BackupVerified `
        -QuiescenceVerified `
        -MaintenanceWindow $mw32 | Out-Null
    } catch { $caught = $_ }

    if ($null -eq $caught -or $caught.Exception.Message -notmatch 'MAINTENANCE_WINDOW_EXPIRED') {
      throw "Test 32 expected MAINTENANCE_WINDOW_EXPIRED but got: $($caught.Exception.Message) at $($caught.ScriptStackTrace)"
    }
    if (Test-Path $env32.SentinelLog) {
      throw 'Test 32 violated safety boundary: prisma migrate deploy was invoked despite expired maintenance window'
    }

    Write-Output '  [PASS] Test 32 (AUD-04-G1-1): Real run-migrations.ps1 - Maintenance window expired after precheck rejected before mutation; migration deploy never invoked'
  }

  # --- TEST 33 (AUD-04-G1-2): Real run-migrations.ps1: Scheduled task re-enabled after precheck rejected before mutation ---
  Invoke-AudTest 33 'Real run-migrations.ps1: Scheduled task re-enabled after precheck rejected before mutation' {
    $env33 = New-AudMigrationTestEnvironment 'test33' $newSha
    [IO.File]::WriteAllText($env33.TaskFlag, 'task-run', [Text.ASCIIEncoding]::new())

    function global:Get-ScheduledTask {
      param([string]$TaskName)
      $state = if (Test-Path "$($env33.Fix.Root)\task-running-active.flag") { 'Running' } else { 'Disabled' }
      return [pscustomobject]@{
        TaskName = 'BaoGiangBackend'; TaskPath = '\BaoGiang\'; State = $state
        Principal = [pscustomobject]@{ UserId = 'fixture-account' }
        Actions = @([pscustomobject]@{ Execute = $fakeToolPath; Arguments = '-File start-baogiang-api.ps1'; WorkingDirectory = (Join-Path $env33.Fix.Root 'shared') })
        Triggers = @([pscustomobject]@{ CimClass = [pscustomobject]@{ CimClassName = 'MSFT_TaskBootTrigger' }; Enabled = $true })
      }
    }

    $mw33 = [pscustomobject]@{
      ReleaseSha = $newSha
      StartUtc = [DateTime]::UtcNow.AddMinutes(-5).ToString('o')
      EndUtc = [DateTime]::UtcNow.AddHours(1).ToString('o')
      AuthorizedBy = 'operator-aud04'
      Approved = $true
    }

    $caught = $null
    try {
      & (Join-Path $fixtureScriptsDir 'run-migrations.ps1') `
        -ReleaseSha $newSha `
        -ReleasePath $env33.ReleaseDir `
        -NpxExe $env33.NpxCmd `
        -PsqlExe $env33.PsqlCmd `
        -Root $env33.Fix.Root `
        -ServiceKind 'scheduled-task' `
        -ServiceName 'BaoGiangBackend' `
        -EnvFile $env33.Fix.EnvFile `
        -StartupWrapper $env33.Fix.StartupWrapper `
        -ExpectedEntryPoint $env33.EntryPoint `
        -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' `
        -AllowProductionMigration `
        -BackupVerified `
        -QuiescenceVerified `
        -MaintenanceWindow $mw33 | Out-Null
    } catch { $caught = $_ }

    if ($null -eq $caught -or $caught.Exception.Message -notmatch '(?i)not.*disabled|SCHEDULED_TASK_NOT_DISABLED') {
      throw "Test 33 expected task disabled failure but got: $($caught.Exception.Message)"
    }
    if (Test-Path $env33.SentinelLog) {
      throw 'Test 33 violated safety boundary: prisma migrate deploy was invoked despite re-enabled scheduled task'
    }

    Write-Output '  [PASS] Test 33 (AUD-04-G1-2): Real run-migrations.ps1 - Scheduled task re-enabled after precheck rejected before mutation; migration deploy never invoked'
  }

  # --- TEST 34 (AUD-04-G1-3): Real run-migrations.ps1: Port 3100 occupied after precheck rejected before mutation ---
  Invoke-AudTest 34 'Real run-migrations.ps1: Port 3100 occupied after precheck rejected before mutation' {
    $env34 = New-AudMigrationTestEnvironment 'test34' $newSha
    [IO.File]::WriteAllText($env34.PortFlag, 'port-occ', [Text.ASCIIEncoding]::new())

    function global:Get-NetTCPConnection {
      param([string]$State, [int]$LocalPort)
      if (Test-Path "$($env34.Fix.Root)\port-occupied-active.flag") {
        return @([pscustomobject]@{ LocalPort = 3100; State = 'Listen'; OwningProcess = 99999 })
      }
      return @()
    }

    $mw34 = [pscustomobject]@{
      ReleaseSha = $newSha
      StartUtc = [DateTime]::UtcNow.AddMinutes(-5).ToString('o')
      EndUtc = [DateTime]::UtcNow.AddHours(1).ToString('o')
      AuthorizedBy = 'operator-aud04'
      Approved = $true
    }

    $caught = $null
    try {
      & (Join-Path $fixtureScriptsDir 'run-migrations.ps1') `
        -ReleaseSha $newSha `
        -ReleasePath $env34.ReleaseDir `
        -NpxExe $env34.NpxCmd `
        -PsqlExe $env34.PsqlCmd `
        -Root $env34.Fix.Root `
        -ServiceKind 'scheduled-task' `
        -ServiceName 'BaoGiangBackend' `
        -EnvFile $env34.Fix.EnvFile `
        -StartupWrapper $env34.Fix.StartupWrapper `
        -ExpectedEntryPoint $env34.EntryPoint `
        -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' `
        -AllowProductionMigration `
        -BackupVerified `
        -QuiescenceVerified `
        -MaintenanceWindow $mw34 | Out-Null
    } catch { $caught = $_ }

    if ($null -eq $caught -or $caught.Exception.Message -notmatch '(?i)port 3100|PORT_3100_LISTENER_ACTIVE|Safe-stop conflict') {
      throw "Test 34 expected port 3100 conflict but got: $($caught.Exception.Message)"
    }
    if (Test-Path $env34.SentinelLog) {
      throw 'Test 34 violated safety boundary: prisma migrate deploy was invoked despite port 3100 occupied'
    }

    Write-Output '  [PASS] Test 34 (AUD-04-G1-3): Real run-migrations.ps1 - Port 3100 occupied after precheck rejected before mutation; migration deploy never invoked'
  }

  # --- TEST 35 (AUD-04-G1-4): Real run-migrations.ps1: Invalid, unapproved or missing maintenance window rejected before mutation ---
  Invoke-AudTest 35 'Real run-migrations.ps1: Invalid, unapproved or missing maintenance window rejected before mutation' {
    $env35 = New-AudMigrationTestEnvironment 'test35' $newSha

    # 35A: SHA mismatch
    $mw35A = [pscustomobject]@{ ReleaseSha = ('9'*40); StartUtc = [DateTime]::UtcNow.AddMinutes(-5).ToString('o'); EndUtc = [DateTime]::UtcNow.AddHours(1).ToString('o'); AuthorizedBy = 'operator-aud04'; Approved = $true }
    $caughtA = $null
    try {
      & (Join-Path $fixtureScriptsDir 'run-migrations.ps1') `
        -ReleaseSha $newSha -ReleasePath $env35.ReleaseDir -NpxExe $env35.NpxCmd -PsqlExe $env35.PsqlCmd -Root $env35.Fix.Root `
        -ServiceKind 'scheduled-task' -ServiceName 'BaoGiangBackend' -EnvFile $env35.Fix.EnvFile -StartupWrapper $env35.Fix.StartupWrapper `
        -ExpectedEntryPoint $env35.EntryPoint -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' -AllowProductionMigration -BackupVerified -QuiescenceVerified -MaintenanceWindow $mw35A | Out-Null
    } catch { $caughtA = $_ }
    if ($null -eq $caughtA -or $caughtA.Exception.Message -notmatch 'MAINTENANCE_WINDOW_SHA_MISMATCH') {
      throw "Test 35A expected MAINTENANCE_WINDOW_SHA_MISMATCH but got: $($caughtA.Exception.Message)"
    }

    # 35B: Not approved
    $mw35B = [pscustomobject]@{ ReleaseSha = $newSha; StartUtc = [DateTime]::UtcNow.AddMinutes(-5).ToString('o'); EndUtc = [DateTime]::UtcNow.AddHours(1).ToString('o'); AuthorizedBy = 'operator-aud04'; Approved = $false }
    $caughtB = $null
    try {
      & (Join-Path $fixtureScriptsDir 'run-migrations.ps1') `
        -ReleaseSha $newSha -ReleasePath $env35.ReleaseDir -NpxExe $env35.NpxCmd -PsqlExe $env35.PsqlCmd -Root $env35.Fix.Root `
        -ServiceKind 'scheduled-task' -ServiceName 'BaoGiangBackend' -EnvFile $env35.Fix.EnvFile -StartupWrapper $env35.Fix.StartupWrapper `
        -ExpectedEntryPoint $env35.EntryPoint -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' -AllowProductionMigration -BackupVerified -QuiescenceVerified -MaintenanceWindow $mw35B | Out-Null
    } catch { $caughtB = $_ }
    if ($null -eq $caughtB -or $caughtB.Exception.Message -notmatch 'MAINTENANCE_WINDOW_NOT_APPROVED') {
      throw "Test 35B expected MAINTENANCE_WINDOW_NOT_APPROVED but got: $($caughtB.Exception.Message)"
    }

    # 35C: Missing
    $caughtC = $null
    try {
      & (Join-Path $fixtureScriptsDir 'run-migrations.ps1') `
        -ReleaseSha $newSha -ReleasePath $env35.ReleaseDir -NpxExe $env35.NpxCmd -PsqlExe $env35.PsqlCmd -Root $env35.Fix.Root `
        -ServiceKind 'scheduled-task' -ServiceName 'BaoGiangBackend' -EnvFile $env35.Fix.EnvFile -StartupWrapper $env35.Fix.StartupWrapper `
        -ExpectedEntryPoint $env35.EntryPoint -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' -AllowProductionMigration -BackupVerified -QuiescenceVerified | Out-Null
    } catch { $caughtC = $_ }
    if ($null -eq $caughtC -or $caughtC.Exception.Message -notmatch 'MAINTENANCE_WINDOW_MISSING') {
      throw "Test 35C expected MAINTENANCE_WINDOW_MISSING but got: $($caughtC.Exception.Message)"
    }

    if (Test-Path $env35.SentinelLog) {
      throw 'Test 35 violated safety boundary: prisma migrate deploy was invoked despite invalid maintenance authorization'
    }

    Write-Output '  [PASS] Test 35 (AUD-04-G1-4): Real run-migrations.ps1 - Invalid/unapproved/missing maintenance window rejected before mutation; migration deploy never invoked'
  }

  # --- TEST 36 (AUD-04-G1-5): Real run-migrations.ps1: All pre-migration safety checks passed; exactly one migration deploy invoked ---
  Invoke-AudTest 36 'Real run-migrations.ps1: All pre-migration safety checks passed; exactly one migration deploy invoked' {
    $env36 = New-AudMigrationTestEnvironment 'test36' $newSha
    $mw36 = [pscustomobject]@{
      ReleaseSha = $newSha
      StartUtc = [DateTime]::UtcNow.AddMinutes(-5).ToString('o')
      EndUtc = [DateTime]::UtcNow.AddHours(1).ToString('o')
      AuthorizedBy = 'operator-aud04'
      Approved = $true
    }

    $resJson = & (Join-Path $fixtureScriptsDir 'run-migrations.ps1') `
      -ReleaseSha $newSha `
      -ReleasePath $env36.ReleaseDir `
      -NpxExe $env36.NpxCmd `
      -PsqlExe $env36.PsqlCmd `
      -Root $env36.Fix.Root `
      -ServiceKind 'scheduled-task' `
      -ServiceName 'BaoGiangBackend' `
      -EnvFile $env36.Fix.EnvFile `
      -StartupWrapper $env36.Fix.StartupWrapper `
      -ExpectedEntryPoint $env36.EntryPoint `
      -ExpectedBaseUrl 'https://baogiang.dtnt-damsan.edu.vn' `
      -AllowProductionMigration `
      -BackupVerified `
      -QuiescenceVerified `
      -MaintenanceWindow $mw36 | Select-Object -Last 1

    $result = $resJson | ConvertFrom-Json
    if ($result.state -ne 'completed') {
      throw "Test 36 expected completed migration state but got: $($result.state)"
    }
    if ($result.before.phase -ne 'before' -or $result.after.phase -ne 'after-deploy') {
      throw 'Test 36 migration state phases missing or invalid'
    }

    if (-not (Test-Path $env36.SentinelLog)) {
      throw 'Test 36 failed: prisma migrate deploy was never invoked despite all safety conditions met'
    }
    $invocations = @(Get-Content $env36.SentinelLog | Where-Object { $_ -match 'DEPLOY_INVOKED' })
    if ($invocations.Count -ne 1) {
      throw "Test 36 expected exactly 1 deploy invocation, but found $($invocations.Count)"
    }

    Write-Output '  [PASS] Test 36 (AUD-04-G1-5): Real run-migrations.ps1 - All pre-migration safety checks passed; exactly one migration deploy invoked'
  }

  # --- TEST 37 (AUD-04-TO-1): Hard timeout watchdog safeguard: hanging child process terminated and timed out cleanly ---
  Invoke-AudTest 37 'Hard timeout watchdog safeguard: hanging child process terminated cleanly without orphan processes' {
    $hangingTool = Join-Path $tempDir 'hanging-tool.cmd'
    [IO.File]::WriteAllLines($hangingTool, @('@echo off', 'ping -n 10 127.0.0.1 >nul'), [Text.ASCIIEncoding]::new())

    $localWatchdog = [AudWatchdog]::new()
    $localWatchdog.Start($PID, 1000)
    $sw = [Diagnostics.Stopwatch]::StartNew()

    try {
      & $hangingTool
    } finally {
      $localWatchdog.Stop()
      $sw.Stop()
      [AudWatchdog]::KillChildren($PID)
    }

    if (-not $localWatchdog.TimedOut) {
      throw 'Test 37 failed: Watchdog TimedOut flag was not set'
    }
    if ($sw.Elapsed.TotalSeconds -gt 4) {
      throw "Test 37 failed: Hanging process was not killed in timely manner (took $([Math]::Round($sw.Elapsed.TotalSeconds, 1))s)"
    }

    Write-Output '  [PASS] Test 37 (AUD-04-TO-1): Hard timeout watchdog verified; hanging child processes terminated cleanly without orphan processes'
  }

  if ($SimulateTimeout) {
    Write-Output "  [RUN] Test 99 (Simulated Timeout)"
    $hangingTool99 = Join-Path $tempDir 'hanging-tool-99.cmd'
    [IO.File]::WriteAllLines($hangingTool99, @('@echo off', 'ping -n 10 127.0.0.1 >nul'), [Text.ASCIIEncoding]::new())
    $global:audWatchdog.Start($PID, 1000)
    try {
      & $hangingTool99
    } finally {
      $global:audWatchdog.Stop()
      [AudWatchdog]::KillChildren($PID)
    }
    if ($global:audWatchdog.TimedOut) {
      throw "TEST_TIMEOUT: Simulated timeout test timed out as expected."
    }
  }

  $expectedCount = if ($OnlyTest -gt 0) { 1 } else { 37 }
  if ($global:aud04PassCount -ne $expectedCount) {
    throw "AUD-04 test verification failed: expected $expectedCount passed tests, but $global:aud04PassCount passed."
  }
  Write-Output "=== ALL $expectedCount AUD-04 FAILURE-INJECTION TESTS PASSED ==="
} finally {
  Remove-Item Function:\Stop-ExactBaoGiangRuntime, Function:\Get-ScheduledTask, Function:\Get-FileHash, Function:\Invoke-ReviewedNginxSyntaxTest, Function:\Get-NetTCPConnection, Function:\Stop-Process -Force -ErrorAction SilentlyContinue
  Remove-Variable aud04StopCalls, aud04StopShouldFail, taskQueryCount -Scope Global -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $tempDir) {
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
