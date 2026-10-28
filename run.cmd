@echo off
chcp 65001 >nul
title Changzheng Deploy
setlocal

set ROOT=C:\changzheng
set NODE_DIR=C:\changzheng-runtime
set UNRAR=C:\Program Files (x86)\WinRAR\UnRAR.exe

echo ==========================================
echo   Changzheng Deploy
echo ==========================================
echo.

echo [1/4] Extracting Node 22 ...
if not exist "%NODE_DIR%" mkdir "%NODE_DIR%"
"%UNRAR%" x -y "%NODE_DIR%.zip" "%NODE_DIR%\" >nul
if not exist "%NODE_DIR%\node.exe" (
  for /d %%d in ("%NODE_DIR%\node-v*") do (
    xcopy "%%d\*" "%NODE_DIR%\" /E /Y /Q >nul
    rd /s /q "%%d"
  )
)
if not exist "%NODE_DIR%\node.exe" (
  echo   FAILED: Node not extracted
  pause
  exit /b 1
)
"%NODE_DIR%\node.exe" -v

echo [2/4] Extracting website ...
if not exist "%ROOT%" mkdir "%ROOT%"
"%UNRAR%" x -y "%ROOT%-migrate.zip" "%ROOT%\" >nul
if not exist "%ROOT%\index.html" (
  echo   FAILED: site not extracted
  pause
  exit /b 1
)

echo [3/4] Starting services ...
cd /d "%ROOT%"
start "CZ-Main" /min "%NODE_DIR%\node.exe" "server\server.js"
timeout /t 3 /nobreak >nul
set HOST=127.0.0.1
start "CZ-Comments" /min "%NODE_DIR%\node.exe" "competition-timeline\server\server.js"
timeout /t 4 /nobreak >nul

echo [4/4] Firewall ...
netsh advfirewall firewall add rule name="CZ-8088" dir=in action=allow protocol=TCP localport=8088 >nul

echo.
echo ==========================================
echo   DONE - open this in your browser:
echo   http://192.168.199.251:8088/?demo=1
echo ==========================================
echo.
pause