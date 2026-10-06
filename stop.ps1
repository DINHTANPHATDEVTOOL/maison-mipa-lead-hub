# ========================================================
#  MAISON MIPA LEAD HUB - DỪNG HỆ THỐNG (WINDOWS POWERSHELL)
# ========================================================

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  DỪNG HỆ THỐNG MAISON MIPA LEAD HUB" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$stoppedAny = $false

# 1. Dừng Web App
if (Test-Path ".web.pid") {
    $webPid = (Get-Content ".web.pid").Trim()
    try {
        Stop-Process -Id $webPid -Force -ErrorAction SilentlyContinue
        Write-Host "[*] Đã dừng Web App (PID: $webPid)." -ForegroundColor Yellow
        $stoppedAny = $true
    } catch {}
    Remove-Item ".web.pid" -Force -ErrorAction SilentlyContinue
}

# 2. Dừng Worker
if (Test-Path ".worker.pid") {
    $workerPid = (Get-Content ".worker.pid").Trim()
    try {
        Stop-Process -Id $workerPid -Force -ErrorAction SilentlyContinue
        Write-Host "[*] Đã dừng Worker (PID: $workerPid)." -ForegroundColor Yellow
        $stoppedAny = $true
    } catch {}
    Remove-Item ".worker.pid" -Force -ErrorAction SilentlyContinue
}

# 3. Dừng Docker nếu có
try {
    $dockerContainers = docker compose ps -q 2>$null
    if ($dockerContainers) {
        Write-Host "[*] Đang dừng Docker containers..." -ForegroundColor Yellow
        docker compose down
        $stoppedAny = $true
    }
} catch {}

if ($stoppedAny) {
    Write-Host "[+] Toàn bộ tiến trình Web và Worker đã được dừng an toàn." -ForegroundColor Green
} else {
    Write-Host "[+] Không phát hiện tiến trình nào đang chạy." -ForegroundColor Yellow
}

Write-Host "========================================================" -ForegroundColor Cyan
