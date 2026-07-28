# ============================================================
# Test-DatabaseConnection.ps1
# Verifies connectivity to dev and test databases using SELECT 1.
# ============================================================

$ErrorActionPreference = 'Stop'
$PsqlExe = 'D:\PostgreSQL\bin\psql.exe'
$PgHost  = '127.0.0.1'
$PgPort  = '5432'

function Write-Ok   { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Info { param($msg) Write-Host "[..] $msg" -ForegroundColor Cyan }
function Write-Fail { param($msg) Write-Host "[ER] $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "===================================" -ForegroundColor Blue
Write-Host " Kiem tra ket noi database          " -ForegroundColor Blue
Write-Host " Du an: baogiang-damsan             " -ForegroundColor Blue
Write-Host "===================================" -ForegroundColor Blue

if (-not (Test-Path $PsqlExe)) {
    Write-Fail "Khong tim thay psql.exe tai: $PsqlExe"
    exit 1
}

$allOk = $true

function Test-SingleConnection {
    param(
        [string]$Label,
        [string]$User,
        [string]$Database
    )
    Write-Info "Kiem tra: $Label ($User -> $Database)"
    try {
        $result = & $PsqlExe -h $PgHost -p $PgPort -U $User -d $Database -c "SELECT 1 AS connection_test" -t -q 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "$Label -> Ket noi thanh cong"
            return $true
        } else {
            Write-Fail "$Label -> Ket noi that bai (exit code: $LASTEXITCODE)"
            Write-Host "   Chi tiet: $result" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Fail "$Label -> Loi: $_"
        return $false
    }
}

$devOk = Test-SingleConnection -Label "DEV database" -User "baogiang_dev_user" -Database "baogiang_dev"
if (-not $devOk) { $allOk = $false }

$testOk = Test-SingleConnection -Label "TEST database" -User "baogiang_test_user" -Database "baogiang_test"
if (-not $testOk) { $allOk = $false }

Write-Host ""
if ($allOk) {
    Write-Host "===================================" -ForegroundColor Blue
    Write-Ok "Tat ca ket noi database deu thanh cong!"
    Write-Host "===================================" -ForegroundColor Blue
    Write-Host ""
    exit 0
} else {
    Write-Host "===================================" -ForegroundColor Blue
    Write-Fail "Mot hoac nhieu ket noi database that bai."
    Write-Host "===================================" -ForegroundColor Blue
    Write-Host ""
    exit 1
}
