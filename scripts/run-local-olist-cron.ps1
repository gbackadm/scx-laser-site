$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot ".env.local"
$secretLine = Get-Content -LiteralPath $envFile |
  Where-Object { $_ -match '^OLIST_CRON_SECRET=.+' } |
  Select-Object -First 1

if (-not $secretLine) {
  throw "OLIST_CRON_SECRET nao configurado em .env.local."
}

$secret = ($secretLine -split '=', 2)[1].Trim()

try {
  Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3005/admin/login" -TimeoutSec 5 | Out-Null
} catch {
  Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList "run", "dev", "--", "-p", "3005" `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput (Join-Path $projectRoot ".codex-dev-3005.log") `
    -RedirectStandardError (Join-Path $projectRoot ".codex-dev-3005.err.log") `
    -WindowStyle Hidden
  Start-Sleep -Seconds 8
}

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:3005/admin/api/olist/rotina" `
  -Headers @{ "x-olist-cron-secret" = $secret } |
  Out-Null
