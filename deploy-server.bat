@echo off
REM ============================================================
REM  Changzheng Website - Server Deploy Script
REM  Target server: 192.168.199.251
REM  Run as Administrator on the server.
REM
REM  NOTE: This file is pure ASCII on purpose - cmd.exe parses
REM  UTF-8 without BOM as GBK and mangles Chinese characters.
REM ============================================================
setlocal enabledelayedexpansion

set ROOT=C:\changzheng
set NODE_DIR=C:\changzheng-runtime
set NODE_ZIP=C:\changzheng-runtime.zip
set SITE_ZIP=C:\changzheng-migrate.zip

echo ==========================================
echo   Changzheng Website Deploy
echo   Target: %ROOT%
echo   Ports : 8088 (main) / 8899 (comments)
echo ==========================================
echo.

REM ---------- STEP 1: extract Node ----------
echo [1/6] Extracting Node.js 22 ...
if exist "%NODE_DIR%\node.exe" (
    echo       already extracted, skip
) else (
    if not exist "%NODE_DIR%" mkdir "%NODE_DIR%"
    powershell -NoProfile -Command "Expand-Archive -LiteralPath '%NODE_ZIP%' -DestinationPath '%NODE_DIR%' -Force"
    if not exist "%NODE_DIR%\node.exe" (
        echo       zip has an inner folder, flattening ...
        for /d %%d in ("%NODE_DIR%\node-v*") do (
            xcopy "%%d\*" "%NODE_DIR%\" /E /Y /Q >nul
            rd /s /q "%%d"
        )
    )
)
if not exist "%NODE_DIR%\node.exe" (
    echo [ERROR] Node extraction failed.
    echo         Unzip %NODE_ZIP% into %NODE_DIR% manually, then rerun.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('"%NODE_DIR%\node.exe" -v') do set NODEVER=%%v
echo       Node: !NODEVER!

REM ---------- STEP 2: extract site ----------
echo [2/6] Extracting website ...
if exist "%ROOT%\index.html" (
    echo       already extracted, skip
) else (
    if not exist "%ROOT%" mkdir "%ROOT%"
    powershell -NoProfile -Command "Expand-Archive -LiteralPath '%SITE_ZIP%' -DestinationPath '%ROOT%' -Force"
)
if not exist "%ROOT%\index.html" (
    echo [ERROR] Website extraction failed.
    pause
    exit /b 1
)
echo       Site: %ROOT%

REM ---------- STEP 3: free ports ----------
echo [3/6] Freeing ports 8088 / 8899 ...
for %%p in (8088 8899) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p " ^| findstr LISTENING') do (
        echo       killing PID %%a on port %%p
        taskkill /F /PID %%a >nul 2>&1
    )
)
timeout /t 2 /nobreak >nul

REM ---------- STEP 4: start services ----------
echo [4/6] Starting services ...
cd /d "%ROOT%"
start "CZ-Main-8088" /min "%NODE_DIR%\node.exe" "server\server.js"
timeout /t 3 /nobreak >nul
set HOST=127.0.0.1
start "CZ-Comments-8899" /min "%NODE_DIR%\node.exe" "competition-timeline\server\server.js"
timeout /t 4 /nobreak >nul

REM ---------- STEP 5: verify ----------
echo [5/6] Verifying ...
powershell -NoProfile -Command "try{$r=Invoke-WebRequest 'http://127.0.0.1:8088/' -UseBasicParsing -TimeoutSec 8; Write-Host '      main 8088 : HTTP' $r.StatusCode}catch{Write-Host '      main 8088 : FAILED'}"
powershell -NoProfile -Command "try{$r=Invoke-WebRequest 'http://127.0.0.1:8899/api/health' -UseBasicParsing -TimeoutSec 8; Write-Host '      comments 8899 : HTTP' $r.StatusCode}catch{Write-Host '      comments 8899 : FAILED (main site still OK)'}"

REM ---------- STEP 6: firewall + autostart ----------
echo [6/6] Firewall and autostart ...
netsh advfirewall firewall delete rule name="CZ-8088" >nul 2>&1
netsh advfirewall firewall add rule name="CZ-8088" dir=in action=allow protocol=TCP localport=8088 >nul
echo       firewall: 8088 opened

schtasks /create /tn "ChangzhengMain" /tr "\"%NODE_DIR%\node.exe\" \"%ROOT%\server\server.js\"" /sc onstart /ru SYSTEM /f >nul 2>&1
if %errorlevel%==0 (
    echo       autostart: task "ChangzhengMain" created
) else (
    echo       autostart: task creation failed - configure manually if needed
)

echo.
echo ==========================================
echo   DONE
echo ==========================================
echo.
echo   LAN access:
echo     http://192.168.199.251:8088/?demo=1
echo     http://192.168.199.251:8088/?demo=1#/map
echo     http://192.168.199.251:8088/competition-timeline/
echo.
echo   Admin (local only):
echo     http://127.0.0.1:8899/admin
echo.
pause
