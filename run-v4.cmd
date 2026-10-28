@echo off
REM ============================================================
REM  Changzheng Deploy v4
REM  Server: 192.168.199.251 (Windows Server 2012 R2)
REM
REM  Why v4:
REM   - Server 2012 R2 has PowerShell 4.0 -> no Expand-Archive
REM   - No tar.exe
REM   - UnRAR.exe CANNOT extract .zip (RAR only) - that is why v3
REM     printed "FAILED: Node not extracted"
REM   - .NET 4.5 IS present -> use System.IO.Compression.ZipFile
REM     via powershell. This is the only reliable extractor here.
REM
REM  Pure ASCII on purpose (cmd reads UTF-8-no-BOM as GBK).
REM ============================================================
setlocal enabledelayedexpansion

set ROOT=C:\changzheng
set NODE_DIR=C:\changzheng-runtime
set NODE_ZIP=C:\changzheng-runtime.zip
set SITE_ZIP=C:\changzheng-migrate.zip

echo ==========================================
echo   Changzheng Deploy v4
echo   Using .NET ZipFile (works on 2012 R2)
echo ==========================================
echo.

REM ---------- STEP 1: extract Node ----------
echo [1/4] Extracting Node 22 ...
if exist "%NODE_DIR%\node.exe" (
    echo       already extracted, skip
    goto :node_ready
)
if exist "%NODE_DIR%" rd /s /q "%NODE_DIR%"
mkdir "%NODE_DIR%" 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; try { [System.IO.Compression.ZipFile]::ExtractToDirectory('%NODE_ZIP%','%NODE_DIR%') } catch { Write-Host ('      extract error: ' + $_.Exception.Message) }"
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
    echo         Manually: right-click %NODE_ZIP% -^> extract to %NODE_DIR%
    echo         then ensure %NODE_DIR%\node.exe exists, and rerun this file.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('"%NODE_DIR%\node.exe" -v') do set NODEVER=%%v
echo       Node: !NODEVER!
echo.

REM ---------- STEP 2: extract site ----------
echo [2/4] Extracting website ...
if exist "%ROOT%\index.html" (
    echo       already extracted, skip
    goto :site_ready
)
if exist "%ROOT%" rd /s /q "%ROOT%"
mkdir "%ROOT%" 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; try { [System.IO.Compression.ZipFile]::ExtractToDirectory('%SITE_ZIP%','%ROOT%') } catch { Write-Host ('      extract error: ' + $_.Exception.Message) }"
:site_ready
if not exist "%ROOT%\index.html" (
    echo [ERROR] Website extraction failed.
    pause
    exit /b 1
)
echo       Site: %ROOT%
echo.

REM ---------- STEP 3: start ----------
echo [3/4] Starting services ...
for %%p in (8088 8899) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p " ^| findstr LISTENING') do (
        taskkill /F /PID %%a >nul 2>&1
    )
)
timeout /t 2 /nobreak >nul
cd /d "%ROOT%"
start "CZ-Main" /min "%NODE_DIR%\node.exe" "server\server.js"
timeout /t 3 /nobreak >nul
set HOST=127.0.0.1
start "CZ-Comments" /min "%NODE_DIR%\node.exe" "competition-timeline\server\server.js"
timeout /t 4 /nobreak >nul

REM ---------- STEP 4: firewall + verify ----------
echo [4/4] Firewall and verify ...
netsh advfirewall firewall delete rule name="CZ-8088" >nul 2>&1
netsh advfirewall firewall add rule name="CZ-8088" dir=in action=allow protocol=TCP localport=8088 >nul
echo       firewall: 8088 opened

powershell -NoProfile -Command "try { $r=(New-Object System.Net.WebClient).DownloadData('http://127.0.0.1:8088/'); Write-Host '      main 8088 : OK  bytes=' $r.Length } catch { Write-Host '      main 8088 : FAILED' }"
powershell -NoProfile -Command "try { $r=(New-Object System.Net.WebClient).DownloadString('http://127.0.0.1:8899/api/health'); Write-Host '      comments 8899 : OK' } catch { Write-Host '      comments 8899 : FAILED (main site still OK)' }"

echo.
echo ==========================================
echo   DONE
echo ==========================================
echo.
echo   Browser:
echo     http://192.168.199.251:8088/?demo=1
echo     http://192.168.199.251:8088/?demo=1#/map
echo     http://192.168.199.251:8088/competition-timeline/
echo.
echo   Admin (local only):
echo     http://127.0.0.1:8899/admin
echo.
pause
