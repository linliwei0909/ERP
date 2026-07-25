param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,
  [string]$RestoreDatabase,
  [string]$HostName = "localhost",
  [int]$Port = 5432,
  [string]$UserName = "erp",
  [switch]$KeepDatabase
)

$ErrorActionPreference = "Stop"
$backup = [System.IO.Path]::GetFullPath($BackupPath)
if (-not (Test-Path -LiteralPath $backup -PathType Leaf)) {
  throw "找不到指定的備份檔。"
}

if (-not $RestoreDatabase) {
  $RestoreDatabase = "erp_restore_verify_" + (Get-Date -Format "yyyyMMddHHmmss")
}
if ($RestoreDatabase -notmatch '^erp_restore_verify_[0-9A-Za-z_]+$') {
  throw "還原驗證 database 必須使用 erp_restore_verify_ 前綴。"
}
if ($RestoreDatabase -eq "erp") {
  throw "禁止以還原驗證指令覆寫 erp。"
}

& pg_restore "--list" $backup | Out-Null
if ($LASTEXITCODE -ne 0) { throw "備份清單無法讀取。" }

$created = $false
try {
  & createdb "--host=$HostName" "--port=$Port" "--username=$UserName" `
    "--no-password" $RestoreDatabase
  if ($LASTEXITCODE -ne 0) { throw "無法建立暫存還原 database。" }
  $created = $true

  & pg_restore "--host=$HostName" "--port=$Port" "--username=$UserName" `
    "--dbname=$RestoreDatabase" "--no-password" "--exit-on-error" $backup
  if ($LASTEXITCODE -ne 0) { throw "備份還原失敗。" }

  $fingerprint = & (Join-Path $PSScriptRoot "db-fingerprint.ps1") `
    -Database $RestoreDatabase -HostName $HostName -Port $Port -UserName $UserName

  [pscustomobject]@{
    backup = $backup
    restoreDatabase = $RestoreDatabase
    verified = $true
    fingerprint = $fingerprint
  }
}
finally {
  if ($created -and -not $KeepDatabase) {
    & dropdb "--host=$HostName" "--port=$Port" "--username=$UserName" `
      "--no-password" "--if-exists" $RestoreDatabase
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "暫存還原 database 清理失敗：$RestoreDatabase"
    }
  }
}
