[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Root,
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [Parameter(Mandatory = $true)][ValidatePattern('^https://baogiang\.dtnt-damsan\.edu\.vn$')][string]$ExpectedBaseUrl,
  [Parameter(Mandatory = $true)][ValidatePattern('^control-[0-9]+-[0-9]+-[0-9a-f]{40}$')][string]$EventId,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ReleaseSha
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deployment-common.ps1')

function Assert-VerifiedDeploySuccess([Parameter(Mandatory = $true)]$Report,[Parameter(Mandatory = $true)][string]$Sha) {
  if ($Report.overallState -cne 'succeeded' -or $Report.releaseSha -cne $Sha) { throw 'OPERATOR_ALERT_SUCCESS_NOT_PROVEN' }
  if ($null -eq $Report.restart -or $Report.restart.runtimeKind -cne 'scheduled-task' -or
    $Report.restart.activationState -cne 'enabled-running' -or $Report.restart.runtimeRunning -cne $true -or
    $Report.restart.process.port -ne 3100) { throw 'OPERATOR_ALERT_RESTART_NOT_PROVEN' }
  $checks = @($Report.health.health)
  if ($checks.Count -ne 6 -or @($checks | Where-Object { $_.passed -cne $true }).Count -gt 0) { throw 'OPERATOR_ALERT_HEALTH_NOT_PROVEN' }
  $expected = @(
    'http://127.0.0.1:3100/api/health/live',
    'http://127.0.0.1:3100/api/health/ready',
    'https://baogiang.dtnt-damsan.edu.vn/api/health/live',
    'https://baogiang.dtnt-damsan.edu.vn/api/health/ready',
    'https://baogiang.dtnt-damsan.edu.vn/',
    'https://baogiang.dtnt-damsan.edu.vn/trang-thai-he-thong'
  )
  foreach ($uri in $expected) {
    if (@($checks | Where-Object { $_.uri -ceq $uri }).Count -ne 1) { throw 'OPERATOR_ALERT_HEALTH_TARGET_MISMATCH' }
  }
}
function Read-OperatorRecipient([Parameter(Mandatory = $true)][string]$Path) {
  $c = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
  $names = @($c.PSObject.Properties.Name)
  if ($names.Count -ne 3 -or @($names | Where-Object { $_ -cnotin @('schemaVersion','enabled','chatId') }).Count -ne 0) { throw 'OPERATOR_ALERT_CONFIG_INVALID' }
  if ($c.schemaVersion -ne 1 -or ($c.schemaVersion -isnot [long] -and $c.schemaVersion -isnot [int]) -or
    $c.enabled -isnot [bool] -or $c.chatId -isnot [string] -or $c.chatId -cnotmatch '^[1-9][0-9]{0,18}$') {
    throw 'OPERATOR_ALERT_CONFIG_INVALID'
  }
  return $c
}
function Send-OperatorTelegramOnce([Parameter(Mandatory = $true)][string]$Token,[Parameter(Mandatory = $true)][string]$ChatId,[Parameter(Mandatory = $true)][string]$Text) {
  if ($Token -cnotmatch '^[0-9]{5,20}:[A-Za-z0-9_-]{25,100}$') { return @{ state='REJECTED'; code='BOT_TOKEN_INVALID' } }
  $http = [Net.Http.HttpClient]::new()
  $http.Timeout = [TimeSpan]::FromSeconds(10)
  try {
    $json = @{ chat_id=$ChatId; text=$Text } | ConvertTo-Json -Compress
    $body = [Net.Http.StringContent]::new($json,[Text.Encoding]::UTF8,'application/json')
    try {
      $response = $http.PostAsync("https://api.telegram.org/bot$Token/sendMessage",$body).GetAwaiter().GetResult()
      try {
        $status = [int]$response.StatusCode
        if ($status -ge 400 -and $status -lt 500) { return @{ state='REJECTED'; code="HTTP_$status" } }
        if (-not $response.IsSuccessStatusCode) { return @{ state='UNKNOWN'; code='PROVIDER_UNCERTAIN' } }
        $ack = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
        if ($ack.ok -cne $true -or $null -eq $ack.result -or
          $ack.result.message_id -le 0 -or
          ($ack.result.message_id -isnot [int] -and $ack.result.message_id -isnot [long])) {
          return @{ state='UNKNOWN'; code='MALFORMED_ACK' }
        }
        return @{ state='SENT'; code='ACK_VERIFIED' }
      } finally { $response.Dispose() }
    } finally { $body.Dispose() }
  } catch {
    # Provider may have sent before timeout; do not log exception (may contain token).
    return @{ state='UNKNOWN'; code='DELIVERY_UNCERTAIN' }
  } finally { $http.Dispose() }
}

$rootPath = Assert-DedicatedRoot $Root
if ($EventId -cnotmatch ("^control-[0-9]+-[0-9]+-" + [regex]::Escape($ReleaseSha) + "$")) { throw 'OPERATOR_ALERT_EVENT_ID_MISMATCH' }
foreach ($sub in @('shared','logs')) {
  $dir = Join-Path $rootPath $sub
  Assert-ExistingNonReparseDirectory -Path $dir -Role PRODUCTION_SUBDIRECTORY | Out-Null
  Assert-PathAncestorChainNonReparse -Directory $dir -CategoryPrefix 'OPERATOR_ALERT_PATH' | Out-Null
}
$reportPath = Join-Path $rootPath "logs\deploy-report-$ReleaseSha.json"
if ((Get-PathSecurityClassification -Path $reportPath -Kind file).state -ne 'PASS') { throw 'OPERATOR_ALERT_REPORT_MISSING' }
$report = Get-Content -LiteralPath $reportPath -Raw -Encoding UTF8 | ConvertFrom-Json
Assert-VerifiedDeploySuccess -Report $report -Sha $ReleaseSha
$recipientPath = Join-Path $rootPath 'shared\operator-telegram-recipient.json'
if ((Get-PathSecurityClassification -Path $recipientPath -Kind file).state -eq 'MISSING') {
  Write-Output '{"state":"NOT_CONFIGURED","attempted":false}'
  return
}
if ((Get-PathSecurityClassification -Path $recipientPath -Kind file).state -ne 'PASS') { throw 'OPERATOR_ALERT_CONFIG_UNSAFE' }
$recipient = Read-OperatorRecipient -Path $recipientPath
if (-not $recipient.enabled) { Write-Output '{"state":"DISABLED","attempted":false}'; return }

$journalPath = Join-Path $rootPath "logs\operator-telegram-$EventId.json"
$journal = [ordered]@{ schemaVersion=1; eventId=$EventId; releaseSha=$ReleaseSha; createdAtUtc=[DateTime]::UtcNow.ToString('o'); state='PENDING'; code='RESERVED_BEFORE_SEND' }
$stream = $null
try {
  $stream = [IO.FileStream]::new($journalPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  $bytes = [Text.Encoding]::UTF8.GetBytes(($journal | ConvertTo-Json -Compress))
  $stream.Write($bytes,0,$bytes.Length)
  $stream.Flush($true)
} catch [IO.IOException] {
  if ((Get-PathSecurityClassification -Path $journalPath -Kind file).state -ne 'PASS') { throw 'OPERATOR_ALERT_JOURNAL_CONFLICT' }
  Write-Output '{"state":"ALREADY_RESERVED","attempted":false}'
  return
} finally { if ($null -ne $stream) { $stream.Dispose() } }

$hcm = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow,'SE Asia Standard Time')
$message = @('BÁO GIẢNG ĐAM SAN','Khởi động sau triển khai: THÀNH CÔNG',
  ('Thời gian: ' + $hcm.ToString('dd/MM/yyyy HH:mm:ss') + ' (Việt Nam)'),
  ('Phiên bản: ' + $ReleaseSha.Substring(0,12)),
  'Task: BaoGiangBackend','API live/ready, HTTPS: PASS',('Mã sự kiện: ' + $EventId)) -join [Environment]::NewLine
$outcome = @{ state='UNKNOWN'; code='NOT_ATTEMPTED' }
try {
  $outcome = Invoke-WithServerEnvironment -EnvFile $EnvFile -ExpectedBaseUrl $ExpectedBaseUrl -ScriptBlock {
    if ([Environment]::GetEnvironmentVariable('TELEGRAM_ENABLED','Process') -cne 'true') {
      return @{ state='REJECTED'; code='BOT_DISABLED' }
    }
    $token = [Environment]::GetEnvironmentVariable('TELEGRAM_BOT_TOKEN','Process')
    Send-OperatorTelegramOnce -Token $token -ChatId $recipient.chatId -Text $message
  }
} catch { $outcome = @{ state='UNKNOWN'; code='ENV_OR_TRANSPORT_FAILURE' } }
finally { Clear-PostgresProcessEnvironment }

$journal.state = [string]$outcome.state
$journal.code = [string]$outcome.code
$tmp = "$journalPath.tmp.$([guid]::NewGuid().ToString('N'))"
try {
  [IO.File]::WriteAllText($tmp,($journal | ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
  [IO.File]::Replace($tmp,$journalPath,$null)
} catch { } finally { if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force } }
Write-Output (@{ state=$outcome.state; attempted=$true; code=$outcome.code } | ConvertTo-Json -Compress)
