@echo off
REM ============================================================
REM  Changzheng Website - Server Deploy Script (v2)
REM  Target server: 192.168.199.251
REM  Run as Administrator on the server.
REM
REM  v2: use tar.exe (built into Win10 1803+) instead of PowerShell
REM  Expand-Archive, which is 5-10x slower on zips with thousands of
REM  small files and prints no progress (looks frozen).
REM  This file is pure ASCII on purpose - cmd reads UTF-8-no-BOM as
REM  GBK and mangles Chinese characters.
REM ============================================================
setlocal enabledelayedexpansion

set ROOT=C:\changzheng
set NODE_DIR=C:\changzheng-runtime
set NODE_ZIP=C:\changzheng-runtime.zip
set SITE_ZIP=C:\changzheng-migrate.zip

echo ==========================================
echo   Changzheng Website Deploy (v2)
echo   Target: %ROOT%
echo   Ports : 8088 (main) / 8899 (comments)
echo ==========================================
echo.

REM ---------- pick a fast extractor ----------
set EXTRACTOR=
if exist "%SystemRoot%\System32\tar.exe" set EXTRACTOR=tar
if not defined EXTRACTOR if exist "C:\Program Files\WinRAR\WinRAR.exe" set EXTRACTOR=winrar
if not defined EXTRACTOR if exist "C:\Program Files\7-Zip\7z.exe" set EXTRACTOR=7z
echo [0/6] Extractor: %EXTRACTOR%
if not defined EXTRACTOR (
    echo [ERROR] No tar / WinRAR / 7-Zip found.
    pause
    exit /b 1
)
echo.

REM ---------- STEP 1: extract Node ----------
echo [1/6] Extracting Node.js 22 ...
if exist "%NODE_DIR%\node.exe" (
    echo       already extracted, skip
    goto :node_ready
)
if not exist "%NODE_DIR%" mkdir "%NODE_DIR%"
if "%EXTRACTOR%"=="tar" (
    tar -xf "%NODE_ZIP%" -C "%NODE_DIR%"
) else if "%EXTRACTOR%"=="winrar" (
    "C:\Program Files\WinRAR\WinRAR.exe" x -ibck -y "%NODE_ZIP%" "%NODE_DIR%\"
) else (
    "C:\Program Files\7-Zip\7z.exe" x -y -o"%NODE_DIR%" "%NODE_ZIP%" >nul
)
if not exist "%NODE_DIR%\node.exe" (
    echo       flattening inner folder ...
    for /d %%d in ("%NODE_DIR%\node-v*") do (
        xcopy "%%d\*" "%NODE_DIR%\" /E /Y /Q >nul
        rd /s /q "%%d"
    )
)
:node_ready
if not exist "%NODE_DIR%\node.exe" (
    echo [ERROR] Node extraction failed.
    echo         Right-click %NODE_ZIP% and extract to %NODE_DIR% manually, then rerun.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('"%NODE_DIR%\node.exe" -v') do set NODEVER=%%v
echo       Node: !NODEVER!
echo.

REM ---------- STEP 2: extract site ----------
echo [2/6] Extracting website ...
if exist "%ROOT%\index.html" (
    echo       already extracted, skip
    goto :site_ready
)
if not exist "%ROOT%" mkdir "%ROOT%"
if "%EXTRACTOR%"=="tar" (
    tar -xf "%SITE_ZIP%" -C "%ROOT%"
) else if "%EXTRACTOR%"=="winrar" (
    "C:\Program Files\WinRAR\WinRAR.exe" x -ibck -y "%SITE_ZIP%" "%ROOT%\"
) else (
    "C:\Program Files\7-Zip\7z.exe" x -y -o"%ROOT%" "%SITE_ZIP%" >nul
)
:site_ready
if not exist "%ROOT%\index.html" (
    echo [ERROR] Website extraction failed.
    pause
    exit /b 1
)
echo       Site: %ROOT%
echo.

REM ---------- STEP 3: free ports ----------
echo [3/6] Freeing ports 8088 / 8899 ...
for %%p in (8088 8899) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p " ^| findstr LISTENING') do (
        echo       killing PID %%a on port %%p
        taskkill /F /PID %%a >nul 2>&1
    )
)
timeout /t 2 /nobreak >nul
echo.

REM ---------- STEP 4: start services ----------
echo [4/6] Starting services ...
cd /d "%ROOT%"
start "CZ-Main-8088" /min "%NODE_DIR%\node.exe" "server\server.js"
timeout /t 3 /nobreak >nul
set HOST=127.0.0.1
start "CZ-Comments-8899" /min "%NODE_DIR%\node.exe" "competition-timeline\server\server.js"
timeout /t 4 /nobreak >nul
echo.

REM ---------- STEP 5: verify ----------
echo [5/6] Verifying ...
powershell -NoProfile -Command "try{$r=Invoke-WebRequest 'http://127.0.0.1:8088/' -UseBasicParsing -TimeoutSec 8; Write-Host '      main 8088 : HTTP' $r.StatusCode}catch{Write-Host '      main 8088 : FAILED'}"
powershell -NoProfile -Command "try{$r=Invoke-WebRequest 'http://127.0.0.1:8899/api/health' -UseBasicParsing -TimeoutSec 8; Write-Host '      comments 8899 : HTTP' $r.StatusCode}catch{Write-Host '      comments 8899 : FAILED (main site still OK)'}"
echo.

REM ---------- STEP 6: firewall + autostart ----------
echo [6/6] Firewall and autostart ...
netsh advfirewall firewall delete rule name="CZ-8088" >nul 2>&1
netsh advfirewall firewall add rule name="CZ-8088" dir=in action=allow protocol=TCP localport=8088 >nul
echo       firewall: 8088 opened

schtasks /create /tn "ChangzhengMain" /tr "\"%NODE_DIR%\node.exe\" \"%ROOT%\server\server.js\"" /sc onstart /ru SYSTEM /f >nul 2>&1
if %errorlevel%==0 (
    echo       autostart: task "ChangzhengMain" created
) else (
    echo       autostart: failed, configure manually if needed
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
