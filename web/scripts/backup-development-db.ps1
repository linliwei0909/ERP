param(
  [string]$Database = "erp",
  [string]$HostName = "localhost",
  [int]$Port = 5432,
  [string]$UserName = "erp",
  [string]$BackupDirectory = (Join-Path $PSScriptRoot "..\backups")
)

$ErrorActionPreference = "Stop"

if ($Database -ne "erp") {
  throw "此指令只允許備份明確命名的 erp 開發 database。"
}

$actualDatabase = & psql "--host=$HostName" "--port=$Port" "--username=$UserName" `
  "--dbname=$Database" "--no-password" "--tuples-only" "--no-align" `
  "--command=SELECT current_database();" 2>&1
if ($LASTEXITCODE -ne 0 -or $actualDatabase.Trim() -ne "erp") {
  throw "目標 database 身分確認失敗，未建立備份。"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$baseName = "${Database}-${timestamp}-p1-operational"
$target = [System.IO.Path]::GetFullPath($BackupDirectory)
New-Item -ItemType Directory -Force -Path $target | Out-Null

$customPath = Join-Path $target "$baseName.dump"
$schemaPath = Join-Path $target "$baseName-schema.sql"
$dataPath = Join-Path $target "$baseName-data.sql"
$fingerprintPath = Join-Path $target "$baseName-fingerprint.txt"

$common = @(
  "--host=$HostName",
  "--port=$Port",
  "--username=$UserName",
  "--dbname=$Database",
  "--no-password"
)

& pg_dump @common "--format=custom" "--file=$customPath"
if ($LASTEXITCODE -ne 0) { throw "custom-format 備份失敗。" }
& pg_dump @common "--schema-only" "--file=$schemaPath"
if ($LASTEXITCODE -ne 0) { throw "schema-only 備份失敗。" }
& pg_dump @common "--data-only" "--file=$dataPath"
if ($LASTEXITCODE -ne 0) { throw "data-only 備份失敗。" }

& (Join-Path $PSScriptRoot "db-fingerprint.ps1") `
  -Database $Database -HostName $HostName -Port $Port -UserName $UserName `
  -OutputPath $fingerprintPath | Out-Null

$listOutput = & pg_restore "--list" $customPath 2>&1
if ($LASTEXITCODE -ne 0) { throw "pg_restore --list 驗證失敗。" }

$files = @($customPath, $schemaPath, $dataPath, $fingerprintPath)
$manifest = $files | ForEach-Object {
  $hash = Get-FileHash -LiteralPath $_ -Algorithm SHA256
  [pscustomobject]@{
    file = $_
    sha256 = $hash.Hash.ToLowerInvariant()
    bytes = (Get-Item -LiteralPath $_).Length
  }
}
$manifestPath = Join-Path $target "$baseName-sha256.json"
$manifest | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding utf8

[pscustomobject]@{
  database = $Database
  customBackup = $customPath
  schemaBackup = $schemaPath
  dataBackup = $dataPath
  fingerprint = $fingerprintPath
  manifest = $manifestPath
}
