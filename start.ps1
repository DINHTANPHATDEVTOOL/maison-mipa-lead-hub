# ========================================================
#  MAISON MIPA LEAD HUB - KHỞI ĐỘNG HỆ THỐNG (WINDOWS POWERSHELL)
# ========================================================

param(
    [string]$Mode = "native"
)

if ($Mode -eq "docker") {
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "  KHỞI ĐỘNG MAISON MIPA LEAD HUB QUA DOCKER COMPOSE" -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Cyan
    docker compose up -d --build
    Write-Host "[+] Hệ thống đang chạy trên nền Docker:" -ForegroundColor Green
    Write-Host "    - Web Dashboard: http://localhost:3000"
    Write-Host "    - Xem log worker: docker compose logs -f worker"
    Exit 0
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  KHỞI ĐỘNG MAISON MIPA LEAD HUB (NATIVE WINDOWS)" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

if (-not (Test-Path ".env")) {
    Write-Host "[-] Lỗi: Thiếu tệp .env. Vui lòng chạy .\setup.ps1 trước." -ForegroundColor Red
    Exit 1
}

# Tạo thư mục logs
if (-not (Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs" | Out-Null
}

# 1. Khởi động Web App trong background process
Write-Host "[*] Đang khởi động Web App trên cổng 3000..." -ForegroundColor Yellow
$webProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "run dev" -RedirectStandardOutput "logs\web.log" -RedirectStandardError "logs\web-error.log" -PassThru -NoNewWindow
$webProcess.Id | Out-File ".web.pid" -Encoding ascii
Write-Host "[+] Web App đã khởi động (PID: $($webProcess.Id)). Log: logs\web.log" -ForegroundColor Green

# 2. Khởi động Background Worker
Write-Host "[*] Đang khởi động Background Worker..." -ForegroundColor Yellow
$workerProcess = Start-Process -FilePath "npx.cmd" -ArgumentList "tsx src\worker\index.ts" -RedirectStandardOutput "logs\worker.log" -RedirectStandardError "logs\worker-error.log" -PassThru -NoNewWindow
$workerProcess.Id | Out-File ".worker.pid" -Encoding ascii
Write-Host "[+] Worker đã khởi động (PID: $($workerProcess.Id)). Log: logs\worker.log" -ForegroundColor Green

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  HỆ THỐNG ĐÃ SẴN SÀNG:" -ForegroundColor Green
Write-Host "  - Truy cập Web: http://localhost:3000" -ForegroundColor White
Write-Host "  - Xem log Web: Get-Content logs\web.log -Wait" -ForegroundColor White
Write-Host "  - Xem log Worker: Get-Content logs\worker.log -Wait" -ForegroundColor White
Write-Host "  - Dừng hệ thống: .\stop.ps1" -ForegroundColor White
Write-Host "========================================================" -ForegroundColor Cyan
