param(
  [string]$Database = "erp",
  [string]$HostName = "localhost",
  [int]$Port = 5432,
  [string]$UserName = "erp",
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

if ($Database -ne "erp" -and $Database -notmatch '^erp_(p1|restore|test)_[a-zA-Z0-9_]+$') {
  throw "拒絕盤點未核准的 database 名稱：$Database"
}

$query = @'
BEGIN READ ONLY;
SELECT current_database() AS database_name,
       current_schema() AS schema_name,
       current_setting('server_version') AS postgres_version;
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
SELECT schemaname, sequencename
FROM pg_sequences
WHERE schemaname = 'public'
ORDER BY sequencename;
SELECT migration_name, finished_at, rolled_back_at
FROM public."_prisma_migrations"
ORDER BY started_at;
SELECT format(
  'SELECT %L AS table_name, count(*) AS row_count FROM %I.%I;',
  table_name, table_schema, table_name
)
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
\gexec
COMMIT;
'@

$arguments = @(
  "--host=$HostName",
  "--port=$Port",
  "--username=$UserName",
  "--dbname=$Database",
  "--no-password",
  "--set=ON_ERROR_STOP=1",
  "--file=-"
)

$result = $query | & psql @arguments 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
  throw "唯讀 fingerprint 失敗：$result"
}

if ($OutputPath) {
  $resolvedParent = Split-Path -Parent $OutputPath
  if ($resolvedParent) {
    New-Item -ItemType Directory -Force -Path $resolvedParent | Out-Null
  }
  Set-Content -LiteralPath $OutputPath -Value $result -Encoding utf8
}

$result
