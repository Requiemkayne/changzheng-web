@echo off
title 留言服务 - 备赛时间线
setlocal

set "ROOT=%~dp0"
set "PORT=8899"

echo ============================================
echo   日夜磨一剑 - 留言存储服务
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 node，请先安装 Node.js ^(^>= 22.5^)
  echo.
  pause
  exit /b 1
)

echo 浏览器访问:  http://127.0.0.1:%PORT%/
echo 管理后台:    http://127.0.0.1:%PORT%/admin
echo 数据文件:    %ROOT%server\data.db
echo.
echo 保持本窗口开启，关闭则服务停止
echo --------------------------------------------
echo.

start "" http://127.0.0.1:%PORT%/
node "%ROOT%server\server.js"

echo.
echo 服务已停止。
pause
