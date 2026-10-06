#!/usr/bin/env bash

echo "========================================================"
echo "  DỪNG HỆ THỐNG MAISON MIPA LEAD HUB"
echo "========================================================"

STOPPED_ANY=false

# 1. Dừng Native Web App
if [ -f .web.pid ]; then
  WEB_PID=$(cat .web.pid)
  if kill -0 "$WEB_PID" 2>/dev/null; then
    echo "[*] Đang dừng Web App (PID: $WEB_PID)..."
    kill "$WEB_PID" 2>/dev/null || true
    STOPPED_ANY=true
  fi
  rm -f .web.pid
fi

# 2. Dừng Native Worker
if [ -f .worker.pid ]; then
  WORKER_PID=$(cat .worker.pid)
  if kill -0 "$WORKER_PID" 2>/dev/null; then
    echo "[*] Đang dừng Worker (PID: $WORKER_PID)..."
    kill "$WORKER_PID" 2>/dev/null || true
    STOPPED_ANY=true
  fi
  rm -f .worker.pid
fi

# 3. Dừng Docker Containers nếu đang chạy
if command -v docker &> /dev/null && [ -f docker-compose.yml ]; then
  RUNNING_CONTAINERS=$(docker compose ps -q 2>/dev/null || true)
  if [ -n "$RUNNING_CONTAINERS" ]; then
    echo "[*] Đang dừng Docker containers..."
    docker compose down
    STOPPED_ANY=true
  fi
fi

if [ "$STOPPED_ANY" = true ]; then
  echo "[+] Toàn bộ tiến trình Web và Worker đã được dừng an toàn."
else
  echo "[+] Không phát hiện tiến trình nào đang chạy."
fi
echo "========================================================"
