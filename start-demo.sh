#!/usr/bin/env sh
# Linux / macOS 一鍵啟動示範環境
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "[錯誤] 找不到 Node.js，請先安裝 Node.js 22 以上版本：https://nodejs.org/zh-tw"
  exit 1
fi

PORT="${PORT:-3001}"

echo "使用 Node $(node -v)"
echo "啟動後請開啟： http://localhost:${PORT} （打卡機： http://localhost:${PORT}/kiosk）"
echo "停止請按 Ctrl+C"
echo

PORT="${PORT}" DEMO=1 exec npm start
