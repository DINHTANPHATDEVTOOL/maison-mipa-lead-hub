#!/usr/bin/env bash
set -e

echo "========================================================"
echo "  MAISON MIPA LEAD HUB - CÀI ĐẶT MÔI TRƯỜNG (UBUNTU/LINUX)"
echo "========================================================"

# 1. Kiểm tra Node.js >= 18
if ! command -v node &> /dev/null; then
  echo "[-] Lỗi: Node.js chưa được cài đặt. Vui lòng cài đặt Node.js v18 trở lên."
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "[-] Lỗi: Yêu cầu Node.js v18 trở lên. Phiên bản hiện tại: $(node -v)"
  exit 1
fi
echo "[+] Node.js hợp lệ: $(node -v)"

# 2. Cài đặt Dependencies
echo "[*] Đang cài đặt thư viện npm..."
npm install

# 3. Cài đặt Playwright Browser
echo "[*] Đang cài đặt Playwright Chromium..."
npx playwright install chromium

# 4. Thiết lập tệp cấu hình .env
if [ ! -f .env ]; then
  echo "[*] Chưa có .env, đang sao chép từ .env.example..."
  cp .env.example .env

  # Tự động khởi tạo secret ngẫu nhiên nếu có openssl
  if command -v openssl &> /dev/null; then
    RANDOM_SECRET=$(openssl rand -hex 32)
    RANDOM_KEY=$(openssl rand -hex 16)
    RANDOM_ENC=$(openssl rand -hex 16)
    sed -i "s/APP_SECRET=\"generate-a-strong-32char-secret\"/APP_SECRET=\"$RANDOM_SECRET\"/" .env
    sed -i "s/INTERNAL_WORKER_KEY=\"set-your-internal-worker-key-min-16chars\"/INTERNAL_WORKER_KEY=\"$RANDOM_KEY\"/" .env
    sed -i "s/FACEBOOK_SESSION_ENCRYPTION_KEY=\"mipa-secret-encryption-key-32chars!\"/FACEBOOK_SESSION_ENCRYPTION_KEY=\"$RANDOM_ENC\"/" .env
    echo "[+] Đã tự động tạo APP_SECRET, INTERNAL_WORKER_KEY và FACEBOOK_SESSION_ENCRYPTION_KEY trong .env"
  fi
  echo "[!] Vui lòng mở tệp .env để cấu hình mật khẩu quản trị và Page ID."
else
  echo "[+] Tệp .env đã tồn tại."
fi

# 5. Chạy Migration CSDL nếu có DATABASE_URL
if grep -q "DATABASE_URL=" .env && [ -n "$(grep 'DATABASE_URL=' .env | cut -d'=' -f2- | tr -d '\"' | tr -d '\'')" ]; then
  echo "[*] Đang thực thi migration CSDL PostgreSQL..."
  npx tsx src/lib/db/migrate.ts || echo "[!] Cảnh báo: Chưa kết nối được PostgreSQL, hệ thống sẽ sử dụng bộ nhớ giả lập cho kiểm thử."
fi

echo "========================================================"
echo "  CÀI ĐẶT HOÀN TẤT!"
echo "  Chạy './start.sh' để khởi động hệ thống."
echo "========================================================"
