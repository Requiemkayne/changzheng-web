# 把你的修改同步到 GitHub 最新版：探测可用 IP → 拉取 → 变基 → 推送
# 用法：双击「同步GitHub.bat」，或 powershell -File tools\sync-github.ps1
$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
$node = 'C:\Users\韩贝台木公\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
if (-not (Test-Path $node)) { $node = 'node' }

function Say($msg, $color = 'Gray') { Write-Host $msg -ForegroundColor $color }

# GitHub 边缘 IP 候选（DNS 默认解析的那个经常被阻断）
$IPS = @('140.82.121.3', '20.27.177.113', '20.200.245.247', '140.82.112.3', '140.82.113.3', '20.205.243.166')
$PROXY_PORT = 1081

Say ''
Say '=== 同步到 GitHub ===' 'DarkYellow'
Say ''

Set-Location $root
Say ("仓库: " + $root)
Say ("分支: " + (git rev-parse --abbrev-ref HEAD))
Say ''

# ---------- 1. 找一个能用的通道 ----------
Say '[1/4] 探测可用连接 ...'
$proxyUrl = $null
$useDirect = $false

# 先试直连：必须用 git 自己测，curl 能通不代表 git 能通（解析到的 IP 不同）
$env:GIT_TERMINAL_PROMPT = '0'
$probe = & git ls-remote --heads origin 2>&1 | Out-String
if ($probe -match 'refs/heads/main') {
  $useDirect = $true
  Say '      git 直连可用，不需要转发'
}

if (-not $useDirect) {
  $picked = $null
  foreach ($ip in $IPS) {
    $code = & curl.exe -s -o NUL -w "%{http_code}" --max-time 6 --resolve "github.com:443:$ip" https://github.com/ 2>&1
    Say ("      $ip -> $code")
    if ("$code" -eq '200') { $picked = $ip; break }
  }
  if (-not $picked) {
    Say '      所有候选 IP 都不可用，请检查网络后重试' 'Red'
    exit 1
  }
  # 启动针对该 IP 的转发
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'edge-proxy' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 500
  $env:TARGET_IPS = $picked
  $env:PORT = $PROXY_PORT
  Start-Process -FilePath $node -ArgumentList ('"' + (Join-Path $PSScriptRoot 'edge-proxy.js') + '"') -WindowStyle Hidden
  Start-Sleep -Seconds 2
  $proxyUrl = "http://127.0.0.1:$PROXY_PORT"
  Say ("      使用转发 -> $picked ($proxyUrl)") 'DarkGreen'
}

$gitArgs = @()
if ($proxyUrl) { $gitArgs = @('-c', "http.proxy=$proxyUrl") }

# ---------- 2. 拉取远端 ----------
Say '[2/4] 拉取远端最新 ...'
$fetch = & git $gitArgs fetch origin 2>&1 | Out-String
if ($fetch -match 'fatal|error:') {
  Say ('      拉取失败: ' + (($fetch.Trim() -split "`n") | Where-Object { $_ -match 'fatal' } | Select-Object -First 1)) 'Red'
  Say '      可以稍后重试；网络恢复后重跑本脚本即可' 'Yellow'
  exit 1
}
$behind = [int]((git rev-list --count HEAD..origin/main) -join '')
$ahead = [int]((git rev-list --count origin/main..HEAD) -join '')
Say ("      远端领先 $behind 个，本地领先 $ahead 个")

# ---------- 3. 变基到远端最新 ----------
if ($behind -gt 0) {
  Say "[3/4] 把本地提交变基到远端最新之上 ..."
  $pull = & git $gitArgs pull --rebase --autostash origin main 2>&1 | Out-String
  Write-Host $pull.Trim()
  $conflict = (git status --porcelain | Where-Object { $_ -match '^(UU|AA|DD|AU|UA|DU|UD)' } | Measure-Object).Count -gt 0
  if ($conflict) {
    Say ''
    Say '  有冲突，需要手动处理：' 'Red'
    git status --short | Where-Object { $_ -match '^(UU|AA|DD|AU|UA|DU|UD)' } | Write-Host
    Say '  改完文件后: git add -A ; git rebase --continue' 'Yellow'
    Say '  想放弃重来: git rebase --abort' 'Yellow'
    exit 2
  }
} else {
  Say '[3/4] 本地已包含远端全部提交，无需变基'
}

# ---------- 4. 推送 ----------
$ahead = [int]((git rev-list --count origin/main..HEAD) -join '')
if ($ahead -eq 0) {
  Say '[4/4] 没有需要推送的提交'
} else {
  Say "[4/4] 推送 $ahead 个提交 ..."
  $push = & git $gitArgs push origin main 2>&1 | Out-String
  if ($push -match 'fatal|rejected') {
    Say ('      推送失败: ' + (($push.Trim() -split "`n") | Where-Object { $_ -match 'fatal|rejected' } | Select-Object -First 1)) 'Red'
    Say '      提示：如果报 non-fast-forward，说明别人刚推过，再跑一次本脚本即可' 'Yellow'
    exit 3
  }
  Write-Host $push.Trim()
}

Say ''
Say '=== 完成 ===' 'Green'
"本地 HEAD : " + (git log --oneline -1)
$ls = & git $gitArgs ls-remote --heads origin 2>&1 | Out-String
if ($ls -match 'refs/heads/main') { "远端 main : " + (($ls.Trim() -split "`s+")[0]) }
