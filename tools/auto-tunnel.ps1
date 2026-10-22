# 外网隧道守护：断了自动重开（免费 quick tunnel 被回收后无法恢复，只能重建）
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File tools\auto-tunnel.ps1
$ErrorActionPreference = 'SilentlyContinue'

$cf     = Join-Path $env:TEMP 'cloudflared.exe'
$log    = Join-Path $env:TEMP 'cz-tunnel.log'
$state  = Join-Path $PSScriptRoot '..\外网地址.txt'
$runLog = Join-Path $env:TEMP 'cz-tunnel-guardian.log'
$target = 'http://127.0.0.1:8088'

function Write-Guard($msg) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $msg
  Add-Content -Path $runLog -Value $line -Encoding UTF8
}

if (-not (Test-Path $cf)) { Write-Guard "找不到 cloudflared.exe：$cf"; exit 1 }

Write-Guard '守护启动'

while ($true) {
  # 清掉可能残留的 cloudflared
  Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force
  }
  Start-Sleep -Seconds 2

  if (Test-Path $log) { Remove-Item $log -Force }
  $proc = Start-Process -FilePath $cf -ArgumentList @(
    'tunnel', '--url', $target, '--no-autoupdate',
    '--protocol', 'http2', '--edge-ip-version', '4',
    '--logfile', $log, '--loglevel', 'info'
  ) -PassThru -WindowStyle Hidden

  # 等 URL
  $url = $null
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $log) {
      $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches | Select-Object -First 1
      if ($m) { $url = $m.Matches[0].Value; break }
    }
  }

  if ($url) {
    $url | Set-Content -Path $state -Encoding UTF8
    Write-Guard "新隧道：$url"
  } else {
    Write-Guard '没拿到地址，5 秒后重试'
    Stop-Process -Id $proc.Id -Force
    Start-Sleep -Seconds 5
    continue
  }

  # 监控循环
  $fail = 0
  while ($true) {
    Start-Sleep -Seconds 25
    if ($proc.HasExited) { Write-Guard 'cloudflared 已退出'; break }

    $dead = $false
    if (Test-Path $log) {
      $tail = Get-Content -Path $log -Tail 8 -ErrorAction SilentlyContinue
      if ($tail -match 'Tunnel not found') { $dead = $true; Write-Guard '隧道被回收（Tunnel not found）' }
    }
    if ($dead) { break }

    $code = & curl.exe -s -o NUL -w "%{http_code}" --max-time 12 ($url + '/')
    if ("$code" -eq '200') {
      $fail = 0
    } else {
      $fail++
      Write-Guard "公网探测失败（$fail/3）：$code"
      if ($fail -ge 3) { Write-Guard '连续 3 次不可达，重启'; break }
    }
  }

  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 5
}
