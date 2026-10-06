# ========================================================
#  MAISON MIPA LEAD HUB - CÀI ĐẶT MÔI TRƯỜNG (WINDOWS POWERSHELL)
# ========================================================

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  MAISON MIPA LEAD HUB - CÀI ĐẶT TRÊN WINDOWS" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Kiểm tra Node.js
try {
    $nodeVer = node -v
    Write-Host "[+] Node.js hợp lệ: $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "[-] Lỗi: Node.js chưa được cài đặt. Vui lòng cài đặt Node.js LTS từ https://nodejs.org" -ForegroundColor Red
    Exit 1
}

# 2. Cài đặt npm dependencies
Write-Host "[*] Đang cài đặt thư viện npm..." -ForegroundColor Yellow
npm install

# 3. Cài đặt Playwright Chromium
Write-Host "[*] Đang cài đặt Playwright Chromium..." -ForegroundColor Yellow
npx playwright install chromium

# 4. Sao chép và khởi tạo .env nếu chưa có
if (-not (Test-Path ".env")) {
    Write-Host "[*] Chưa có .env, đang sao chép từ .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"

    # Tạo khóa bí mật ngẫu nhiên
    $bytes = New-Object Byte[] 32
    (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
    $randSecret = [BitConverter]::ToString($bytes) -replace "-"
    (Get-Content ".env") -replace 'APP_SECRET="generate-a-strong-32char-secret"', "APP_SECRET=`"$randSecret`"" | Set-Content ".env"

    Write-Host "[+] Đã tạo tệp .env với APP_SECRET ngẫu nhiên." -ForegroundColor Green
    Write-Host "[!] Vui lòng mở .env để cấu hình mật khẩu quản trị và Page ID." -ForegroundColor Yellow
} else {
    Write-Host "[+] Tệp .env đã tồn tại." -ForegroundColor Green
}

# 5. Chạy Migration Database nếu có DATABASE_URL
$envContent = Get-Content ".env" -Raw
if ($envContent -match "DATABASE_URL=([^\r\n]+)") {
    $dbUrl = $matches[1].Trim('"').Trim("'")
    if ($dbUrl -ne "") {
        Write-Host "[*] Đang thực thi database migration..." -ForegroundColor Yellow
        try {
            npx tsx src/lib/db/migrate.ts
            Write-Host "[+] Migration CSDL thành công!" -ForegroundColor Green
        } catch {
            Write-Host "[!] Cảnh báo: Chưa kết nối được PostgreSQL server, hệ thống sẽ sử dụng database giả lập in-memory." -ForegroundColor Yellow
        }
    }
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  CÀI ĐẶT HOÀN TẤT!" -ForegroundColor Green
Write-Host "  Chạy .\start.ps1 để khởi động hệ thống." -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
