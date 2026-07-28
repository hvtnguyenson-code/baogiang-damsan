# ============================================================
# Initialize-LocalDatabase.ps1
# Initialize local PostgreSQL databases and roles for baogiang-damsan.
#
# Idempotent — safe to run multiple times.
# Does NOT modify existing databases/roles for other projects.
# ============================================================

$ErrorActionPreference = 'Stop'
$PsqlExe = 'D:\PostgreSQL\bin\psql.exe'
$PgHost  = '127.0.0.1'
$PgPort  = '5432'

function Write-Ok   { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Info { param($msg) Write-Host "[..] $msg" -ForegroundColor Cyan }
function Write-Warn { param($msg) Write-Host "[!!] $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "[ER] $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "===================================" -ForegroundColor Blue
Write-Host " Khoi tao database cuc bo          " -ForegroundColor Blue
Write-Host " Du an: baogiang-damsan             " -ForegroundColor Blue
Write-Host "===================================" -ForegroundColor Blue

# Step 1: Check psql.exe
Write-Info "Buoc 1: Kiem tra psql.exe tai $PsqlExe"
if (-not (Test-Path $PsqlExe)) {
    Write-Fail "Khong tim thay psql.exe tai: $PsqlExe"
    exit 1
}
Write-Ok "Tim thay psql.exe"

# Step 2: Check PostgreSQL service
Write-Info "Buoc 2: Kiem tra PostgreSQL dang chay tai $PgHost`:$PgPort"
try {
    $testResult = & $PsqlExe -h $PgHost -p $PgPort -U postgres -c "SELECT 1" -t -q 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "psql exited with code $LASTEXITCODE"
    }
    Write-Ok "PostgreSQL dang chay va phan hoi"
} catch {
    Write-Fail "Khong ket noi duoc PostgreSQL tai $PgHost`:$PgPort"
    Write-Fail "Chi tiet: $_"
    exit 1
}

# Helper functions
function Invoke-SqlExec {
    param([string]$Sql, [string]$Description)
    Write-Info $Description
    $result = & $PsqlExe -h $PgHost -p $PgPort -U postgres -c $Sql 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Loi khi thuc hien: $Description"
        Write-Fail $result
        exit 1
    }
    return $result
}

function Invoke-SqlQueryScalar {
    param([string]$Sql)
    $result = & $PsqlExe -h $PgHost -p $PgPort -U postgres -t -q -c $Sql 2>&1
    if ($result -is [array]) {
        return $result[0].Trim()
    }
    if ($null -ne $result) {
        return $result.ToString().Trim()
    }
    return ""
}

# Step 3: Roles
Write-Host ""
Write-Host "--- Kiem tra va tao roles ---" -ForegroundColor Magenta

# baogiang_dev_user
Write-Info "Kiem tra role: baogiang_dev_user"
$devRoleExists = Invoke-SqlQueryScalar "SELECT 1 FROM pg_roles WHERE rolname = 'baogiang_dev_user'"
if ($devRoleExists -eq '1') {
    Write-Ok "Role 'baogiang_dev_user' da ton tai -- bo qua"
} else {
    Invoke-SqlExec "CREATE ROLE baogiang_dev_user WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;" "Dang tao role: baogiang_dev_user"
    Write-Ok "Da tao role: baogiang_dev_user"
}

# baogiang_test_user
Write-Info "Kiem tra role: baogiang_test_user"
$testRoleExists = Invoke-SqlQueryScalar "SELECT 1 FROM pg_roles WHERE rolname = 'baogiang_test_user'"
if ($testRoleExists -eq '1') {
    Write-Ok "Role 'baogiang_test_user' da ton tai -- bo qua"
} else {
    Invoke-SqlExec "CREATE ROLE baogiang_test_user WITH LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB;" "Dang tao role: baogiang_test_user"
    Write-Ok "Da tao role: baogiang_test_user"
}

# Step 4: Databases
Write-Host ""
Write-Host "--- Kiem tra va tao databases ---" -ForegroundColor Magenta

# baogiang_dev
Write-Info "Kiem tra database: baogiang_dev"
$devDbExists = Invoke-SqlQueryScalar "SELECT 1 FROM pg_database WHERE datname = 'baogiang_dev'"
if ($devDbExists -eq '1') {
    Write-Ok "Database 'baogiang_dev' da ton tai -- bo qua"
} else {
    Invoke-SqlExec "CREATE DATABASE baogiang_dev OWNER baogiang_dev_user ENCODING 'UTF8';" "Dang tao database: baogiang_dev"
    Write-Ok "Da tao database: baogiang_dev"
}

# baogiang_test
Write-Info "Kiem tra database: baogiang_test"
$testDbExists = Invoke-SqlQueryScalar "SELECT 1 FROM pg_database WHERE datname = 'baogiang_test'"
if ($testDbExists -eq '1') {
    Write-Ok "Database 'baogiang_test' da ton tai -- bo qua"
} else {
    Invoke-SqlExec "CREATE DATABASE baogiang_test OWNER baogiang_test_user ENCODING 'UTF8';" "Dang tao database: baogiang_test"
    Write-Ok "Da tao database: baogiang_test"
}

# Step 5: Privileges
Write-Host ""
Write-Host "--- Cap quyen ---" -ForegroundColor Magenta

Invoke-SqlExec "GRANT ALL PRIVILEGES ON DATABASE baogiang_dev TO baogiang_dev_user;" "Cap quyen baogiang_dev_user tren baogiang_dev"
Write-Ok "Quyen baogiang_dev_user -> baogiang_dev da cap"

Invoke-SqlExec "GRANT ALL PRIVILEGES ON DATABASE baogiang_test TO baogiang_test_user;" "Cap quyen baogiang_test_user tren baogiang_test"
Write-Ok "Quyen baogiang_test_user -> baogiang_test da cap"

Write-Host ""
Write-Host "===================================" -ForegroundColor Blue
Write-Ok "Khoi tao database hoan tat thanh cong!"
Write-Host "===================================" -ForegroundColor Blue
Write-Host ""
