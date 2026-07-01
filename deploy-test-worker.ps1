# ============================================================
# ScoutingHub — deploy worker.js naar scoutinghub-api-test
# via Cloudflare REST API (geen wrangler nodig)
#
# Vereisten:
#   - Cloudflare Account ID  (zie dashboard URL na /home/ of /workers/)
#   - Cloudflare API Token   (Workers Scripts: Edit permission)
#
# Gebruik:
#   .\deploy-test-worker.ps1 -AccountId "abc123" -ApiToken "xyz..."
# ============================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$AccountId,

    [Parameter(Mandatory=$true)]
    [string]$ApiToken
)

$WorkerName   = "scoutinghub-api-test"
$WorkerFile   = Join-Path $PSScriptRoot "worker.js"
$MetaFile     = Join-Path $env:TEMP "sh-worker-meta.json"
$Url          = "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/scripts/$WorkerName"

# Controleer of worker.js bestaat
if (!(Test-Path $WorkerFile)) {
    Write-Error "worker.js niet gevonden op: $WorkerFile"
    exit 1
}

$lines = (Get-Content $WorkerFile).Count
Write-Host "Worker: $WorkerFile ($lines regels)" -ForegroundColor Cyan

# Metadata voor ES-module worker (de worker gebruikt 'import' bovenaan)
# "ai"-binding = Cloudflare Workers AI (gratis 10.000 neurons/dag, geen API-key nodig)
# "kv_namespace" RATE_LIMIT = bestaande KV-namespace "scoutinghub-rate-limit" (voor rate-limiting)
# "service" SCREENSHOT_WORKER = directe worker-naar-worker koppeling met scoutinghub-screenshot-test.
#   Nodig omdat Cloudflare gewone fetch()-aanroepen tussen twee *.workers.dev workers blokkeert
#   (foutcode 1042) — een service binding omzeilt dat, want die gaat niet over het publieke internet.
# LET OP: deze bindings-lijst is bij elke deploy leidend/overschrijvend — als je hier een binding
# weglaat die eerder wel bestond, verdwijnt die stilletjes bij de volgende deploy.
@"
{"main_module":"worker.js","compatibility_date":"2024-09-01","bindings":[{"type":"ai","name":"AI"},{"type":"kv_namespace","name":"RATE_LIMIT","namespace_id":"e1ab2b9266224e5c86bc9d403122f1b5"},{"type":"service","name":"SCREENSHOT_WORKER","service":"scoutinghub-screenshot-test"}]}
"@ | Set-Content $MetaFile -Encoding UTF8 -NoNewline

Write-Host "Uploaden naar $Url ..." -ForegroundColor Cyan

# curl.exe is standaard aanwezig op Windows 10/11
# -F stuurt multipart/form-data, precies wat CF verwacht voor module-workers
$result = & curl.exe `
    --silent --show-error `
    -X PUT $Url `
    -H "Authorization: Bearer $ApiToken" `
    -F "metadata=@$MetaFile;type=application/json" `
    -F "worker.js=@$WorkerFile;type=application/javascript+module" `
    2>&1

# Opruimen
Remove-Item $MetaFile -ErrorAction SilentlyContinue

# Resultaat parsen
try {
    $json = $result | ConvertFrom-Json
    if ($json.success -eq $true) {
        Write-Host "Deploy geslaagd!" -ForegroundColor Green
        Write-Host "Worker: $WorkerName"
        Write-Host "Etag: $($json.result.etag)"
    } else {
        Write-Host "Deploy mislukt:" -ForegroundColor Red
        $json.errors | ForEach-Object { Write-Host "  - $($_.message)" -ForegroundColor Red }
        Write-Host "Volledige respons:" -ForegroundColor Yellow
        $result
    }
} catch {
    Write-Host "Kon respons niet parsen. Raw output:" -ForegroundColor Yellow
    Write-Host $result
}
