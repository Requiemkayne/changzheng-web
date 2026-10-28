# ============================================================
#  长征网站 · Windows 一键部署脚本
#  用法：右键「用 PowerShell 运行」，或在项目根目录执行
#    powershell -ExecutionPolicy Bypass -File deploy-windows.ps1
#
#  做的事：检查 Node -> 起两个服务 -> 配开机自启 -> 打印访问地址
# ============================================================
param(
  [string]$AppDir = $PSScriptRoot,
  [int]$PortMain = 8088,
  [int]$PortComments = 8899
)

$ErrorActionPreference = 'Stop'

function Say($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok($m)  { Write-Host "  ✓ $m" -ForegroundColor Green }
function Warn($m){ Write-Host "  ! $m" -ForegroundColor Yellow }
function Die($m) { Write-Host "  ✗ $m" -ForegroundColor Red; exit 1 }

# ---------- 1. 检查目录 ----------
Say "检查项目目录"
if (-not (Test-Path (Join-Path $AppDir 'index.html'))) { Die "目录里没有 index.html：$AppDir" }
if (-not (Test-Path (Join-Path $AppDir 'server\server.js'))) { Die "缺少 server/server.js" }
Ok "项目目录: $AppDir"

# ---------- 2. 找 Node ----------
Say "检查 Node.js（需要 22+）"
$node = $null
$candidates = @(
  'C:\changzheng-runtime\node.exe',
  (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
)
foreach ($c in $candidates) { if (Test-Path $c) { $node = $c; break } }
if (-not $node) {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { $node = $cmd.Source }
}
if (-not $node) {
  Warn "找不到 Node.js"
  Write-Host @"

  请先安装 Node 22（二选一）：

  A) 解压版（不需要管理员）：下载
     https://npmmirror.com/mirrors/node/v22.20.0/node-v22.20.0-win-x64.zip
     解压到 C:\changzheng-runtime\（确保里面直接有 node.exe），然后重跑本脚本。

  B) 安装版：https://nodejs.org 下载 LTS 的 .msi 一路下一步。

"@ -ForegroundColor Yellow
  Die "缺少 Node.js"
}
$ver = & $node -v
$major = [int]($ver -replace '^v','' -split '\.')[0]
if ($major -lt 22) { Die "Node 版本过低（$ver），需要 22+" }
Ok "$ver （$node）"

# ---------- 3. 端口占用检查 ----------
Say "检查端口"
foreach ($p in @($PortMain, $PortComments)) {
  $conn = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) {
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    Warn "端口 $p 已被占用（PID $($proc.Id) $($proc.ProcessName)），先停掉它"
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    Ok "端口 $p 已释放"
  } else { Ok "端口 $p 空闲" }
}

# ---------- 4. 启动 ----------
Say "启动服务"
Start-Process -FilePath $node -ArgumentList 'server\server.js' -WorkingDirectory $AppDir -WindowStyle Hidden
Start-Sleep -Seconds 4
Start-Process -FilePath $node -ArgumentList 'competition-timeline\server\server.js' -WorkingDirectory $AppDir -WindowStyle Hidden
Start-Sleep -Seconds 4

$mainOk = $false
$commentsOk = $false
try { $r = Invoke-WebRequest "http://127.0.0.1:$PortMain/" -UseBasicParsing -TimeoutSec 8; $mainOk = ($r.StatusCode -eq 200) } catch {}
try { $r = Invoke-WebRequest "http://127.0.0.1:$PortComments/api/health" -UseBasicParsing -TimeoutSec 8; $commentsOk = ($r.StatusCode -eq 200) } catch {}

if ($mainOk) { Ok "主站 :$PortMain 正常" } else { Warn "主站 :$PortMain 没起来" }
if ($commentsOk) { Ok "留言 :$PortComments 正常" } else { Warn "留言 :$PortComments 没起来（主站仍可用，/api/comments 返回 503）" }

# ---------- 5. 开机自启 ----------
Say "配置开机自启"
$startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
$bat = Join-Path $AppDir '启动服务器.bat'
if (Test-Path $bat) {
  $lnk = Join-Path $startup '长征网站.lnk'
  try {
    $ws = New-Object -ComObject WScript.Shell
    $s = $ws.CreateShortcut($lnk)
    $s.TargetPath = $bat
    $s.WorkingDirectory = $AppDir
    $s.WindowStyle = 7
    $s.Description = '长征网站服务器'
    $s.Save()
    Ok "已加入启动文件夹: $lnk"
  } catch { Warn "创建快捷方式失败：$($_.Exception.Message)" }
} else {
  Warn "没找到 启动服务器.bat，跳过自启配置"
}

# ---------- 6. 打印地址 ----------
Say "部署完成"
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notmatch 'VMware|Loopback|vEthernet' } |
  Select-Object -ExpandProperty IPAddress

Write-Host ""
Write-Host "  局域网访问地址：" -ForegroundColor White
foreach ($ip in $ips) {
  Write-Host "    http://${ip}:$PortMain/?demo=1" -ForegroundColor Cyan
  Write-Host "    http://${ip}:$PortMain/?demo=1#/map" -ForegroundColor Cyan
  Write-Host "    http://${ip}:$PortMain/competition-timeline/" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "  管理后台（只在本机用）：" -ForegroundColor White
Write-Host "    http://127.0.0.1:$PortComments/admin" -ForegroundColor Cyan
Write-Host ""
Write-Host "  如果别的电脑打不开，用管理员 PowerShell 跑：" -ForegroundColor White
Write-Host "    New-NetFirewallRule -DisplayName '长征网站-$PortMain' -Direction Inbound -Protocol TCP -LocalPort $PortMain -Action Allow" -ForegroundColor Gray
Write-Host ""
