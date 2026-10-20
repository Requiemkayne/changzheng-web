# 一键开外网演示：启动本地服务 + Cloudflare 临时隧道，打印公网链接
# 用法：双击仓库根目录的「启动外网演示.bat」
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$port = 8088

# 优先用随项目安装的 Node，没有就用 PATH 里的 node
$node = "C:\Users\韩贝台木公\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path $node)) { $node = "node" }

function Test-Port([int]$p) {
  $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  return [bool]$c
}

Write-Host ""
Write-Host "=== Changzheng public demo ===" -ForegroundColor DarkYellow
Write-Host ""

# 1) 本地服务
if (Test-Port $port) {
  Write-Host "[1/3] Local server already running on port $port"
} else {
  Write-Host "[1/3] Starting local server on port $port ..."
  Start-Process -FilePath $node -ArgumentList "server\server.js" -WorkingDirectory $root -WindowStyle Minimized
  Start-Sleep -Seconds 3
  if (Test-Port $port) { Write-Host "      server is up" }
  else { Write-Host "      server failed to start, check server\server.js" -ForegroundColor Red; Read-Host "Press Enter to exit"; exit 1 }
}

# 2) cloudflared
$cfDir = Join-Path $env:LOCALAPPDATA 'cz-demo'
$cf = Join-Path $cfDir 'cloudflared.exe'
if (-not (Test-Path $cf)) {
  New-Item -ItemType Directory -Force -Path $cfDir | Out-Null
  Write-Host "[2/3] Downloading cloudflared (first run only, ~53MB) ..."
  Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cf
} 
Write-Host "[2/3] cloudflared ready"

# 3) 隧道
$log = Join-Path $cfDir 'tunnel.log'
if (Test-Path $log) { Remove-Item $log -Force -ErrorAction SilentlyContinue }
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

Write-Host "[3/3] Opening tunnel (http2) ..."
$args = "tunnel --url http://127.0.0.1:$port --no-autoupdate --protocol http2 --edge-ip-version 4 --logfile `"$log`" --loglevel info"
Start-Process -FilePath $cf -ArgumentList $args -WindowStyle Hidden

$url = $null
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 700
  if (Test-Path $log) {
    $hit = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches -ErrorAction SilentlyContinue |
           ForEach-Object { $_.Matches } | Select-Object -First 1
    if ($hit) { $url = $hit.Value; break }
  }
}

Write-Host ""
if ($url) {
  Set-Clipboard -Value $url
  Write-Host "  Public URL  (copied to clipboard):" -ForegroundColor Green
  Write-Host "  $url" -ForegroundColor Cyan
  Write-Host ""
  $lan = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
          Where-Object { $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)' } |
          Select-Object -First 1).IPAddress
  if ($lan) { Write-Host "  Same Wi-Fi  http://${lan}:$port/" -ForegroundColor DarkGray }
  Write-Host ""
  Write-Host "  Share the URL, or let others scan a QR code generated from it." -ForegroundColor Gray
  Write-Host "  Keep this window open; press Enter here to stop the tunnel." -ForegroundColor Yellow
  Read-Host ""
  Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Write-Host "Tunnel stopped." -ForegroundColor DarkGray
} else {
  Write-Host "  Tunnel URL not detected. Log: $log" -ForegroundColor Red
  Read-Host "Press Enter to exit"
}
