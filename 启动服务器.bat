@echo off
chcp 65001 >nul
REM ============================================================
REM  长征网站 · 一键启动（校园网服务器）
REM  IP: 192.168.235.38   主站 :8088   留言 :8899
REM  用固定目录里的 Node 运行，不依赖任何开发环境
REM ============================================================
setlocal

set NODE=C:\changzheng-runtime\node.exe
set ROOT=%~dp0
set ROOT=%ROOT:~0,-1%

if not exist "%NODE%" (
  echo [错误] 找不到 Node: %NODE%
  echo        请重新安装 Node 到 C:\changzheng-runtime
  pause
  exit /b 1
)

echo ========================================
echo   长征网站 启动中
echo   主站: http://192.168.235.38:8088
echo   留言: http://192.168.235.38:8899
echo ========================================
echo.

REM 主站
start "长征-主站8088" /min "%NODE%" "%ROOT%\server\server.js"

REM 留言服务（主站会反代 /api/comments 到它）
timeout /t 2 /nobreak >nul
start "长征-留言8899" /min "%NODE%" "%ROOT%\competition-timeline\server\server.js"

echo 两个服务已启动（最小化窗口）。
echo 关闭本窗口不会停止服务；要停止请关掉那两个最小化窗口。
echo.
pause
