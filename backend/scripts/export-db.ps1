param(
  [string] $OutputDir = "backups"
)

$ErrorActionPreference = "Stop"

$backendRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = Join-Path $backendRoot ".env"
if (-not (Test-Path $envFile)) {
  throw "No se encontro backend/.env"
}

$vars = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match "^\s*#" -or $_ -notmatch "=") { return }
  $key, $value = $_ -split "=", 2
  $vars[$key.Trim()] = $value.Trim().Trim('"')
}

$hostName = $vars.DB_HOST
$port = if ($vars.DB_PORT) { $vars.DB_PORT } else { "3306" }
$user = $vars.DB_USER
$database = $vars.DB_NAME
$password = $vars.DB_PASSWORD

if (-not $hostName -or -not $user -or -not $database) {
  throw "Faltan DB_HOST, DB_USER o DB_NAME en backend/.env"
}

$resolvedOutputDir = Join-Path $backendRoot $OutputDir
New-Item -ItemType Directory -Force -Path $resolvedOutputDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputFile = Join-Path $resolvedOutputDir "$database-$stamp.sql"

$dump = Get-Command mysqldump -ErrorAction Stop
$oldMysqlPwd = $env:MYSQL_PWD
try {
  $env:MYSQL_PWD = $password
  & $dump.Source `
    "--host=$hostName" `
    "--port=$port" `
    "--user=$user" `
    "--single-transaction" `
    "--no-tablespaces" `
    "--routines" `
    "--triggers" `
    "--default-character-set=utf8mb4" `
    "--result-file=$outputFile" `
    $database
  if ($LASTEXITCODE -ne 0) {
    throw "mysqldump fallo con codigo $LASTEXITCODE"
  }
} finally {
  $env:MYSQL_PWD = $oldMysqlPwd
}

Write-Output $outputFile
