@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [錯誤] 找不到 Node.js。
  echo 請先安裝 Node.js 22 以上版本：https://nodejs.org/zh-tw
  echo 安裝後關閉這個視窗，再重新雙擊 start-demo.cmd。
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -v') do set "NODEVER=%%v"
for /f "tokens=1 delims=v." %%a in ("%NODEVER%") do set "MAJOR=%%a"
if %MAJOR% LSS 22 (
  echo.
  echo [錯誤] 目前的 Node.js 版本是 %NODEVER%，太舊了。
  echo 這個系統需要 Node.js 22.13 以上，請到 https://nodejs.org/zh-tw 安裝 LTS 版。
  echo.
  pause
  exit /b 1
)
echo 使用 Node %NODEVER%
echo.
echo 正在啟動示範環境（第一次會自動建立示範資料）...
echo 啟動後請用瀏覽器開啟： http://localhost:3001
echo 打卡機模式： http://localhost:3001/kiosk
echo 要停止請按 Ctrl+C，或直接關閉這個視窗。
echo.

set "DEMO=1"
set "PORT=3001"
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3001"
call npm start

echo.
echo 服務已停止。
pause
