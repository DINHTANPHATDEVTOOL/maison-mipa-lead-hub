#!/usr/bin/env bash

MODE=${1:-"--native"}

if [ "$MODE" == "--docker" ]; then
  echo "========================================================"
  echo "  KHỞI ĐỘNG MAISON MIPA LEAD HUB QUA DOCKER COMPOSE"
  echo "========================================================"
  if ! command -v docker &> /dev/null; then
    echo "[-] Lỗi: Docker chưa được cài đặt."
    exit 1
  fi
  docker compose up -d --build
  echo "[+] Hệ thống đang chạy trên nền Docker:"
  echo "    - Web Dashboard: http://localhost:3000"
  echo "    - Xem log worker: docker compose logs -f worker"
  exit 0
fi

echo "========================================================"
echo "  KHỞI ĐỘNG MAISON MIPA LEAD HUB (NATIVE NODE.JS)"
echo "========================================================"

# Kiểm tra và nạp biến môi trường
if [ ! -f .env ] && [ ! -f .env.local ]; then
  echo "[-] Lỗi: Thiếu tệp .env hoặc .env.local. Vui lòng chạy './setup.sh' trước."
  exit 1
fi

if [ -f .env ]; then
  set -a
  source .env 2>/dev/null || true
  set +a
fi
if [ -f .env.local ]; then
  set -a
  source .env.local 2>/dev/null || true
  set +a
fi

# Dừng tiến trình cũ nếu còn chạy
if [ -f .web.pid ]; then
  OLD_WEB_PID=$(cat .web.pid)
  kill -0 "$OLD_WEB_PID" 2>/dev/null && kill "$OLD_WEB_PID" 2>/dev/null || true
  rm -f .web.pid
fi

if [ -f .worker.pid ]; then
  OLD_WORKER_PID=$(cat .worker.pid)
  kill -0 "$OLD_WORKER_PID" 2>/dev/null && kill "$OLD_WORKER_PID" 2>/dev/null || true
  rm -f .worker.pid
fi

mkdir -p logs

# 1. Khởi động Web App
echo "[*] Đang khởi động Web App trên cổng 3000..."
npm run dev > logs/web.log 2>&1 &
WEB_PID=$!
echo $WEB_PID > .web.pid
echo "[+] Web App đã khởi động (PID: $WEB_PID). Log: logs/web.log"

# 2. Khởi động Background Worker
echo "[*] Đang khởi động Background Worker..."
npx tsx src/worker/index.ts > logs/worker.log 2>&1 &
WORKER_PID=$!
echo $WORKER_PID > .worker.pid
echo "[+] Worker đã khởi động (PID: $WORKER_PID). Log: logs/worker.log"

echo "========================================================"
echo "  HỆ THỐNG ĐÃ SẴN SÀNG:"
echo "  - Truy cập Web: http://localhost:3000"
echo "  - Log Web: tail -f logs/web.log"
echo "  - Log Worker: tail -f logs/worker.log"
echo "  - Dừng hệ thống: './stop.sh'"
echo "========================================================"
