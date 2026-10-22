# 通过 GitHub Git Data API 推送本地 HEAD 相对远端的变化
# 适用：github.com:443 的 git 通道被阻断，但 api.github.com 可用
$ErrorActionPreference = 'Stop'
$repo = 'Requiemkayne/changzheng-web'
$root = 'C:\Users\韩贝台木公\Desktop\changzheng'
Set-Location $root

$cred = "protocol=https`nhost=github.com`n`n" | git credential fill 2>$null | Out-String
$tok = [regex]::Match($cred, 'password=(\S+)').Groups[1].Value
if (-not $tok) { throw 'no token' }
$H = @{ Authorization = "token $tok"; 'User-Agent' = 'dsh-push'; Accept = 'application/vnd.github+json' }

function Api($method, $path, $body) {
  $uri = "https://api.github.com$path"
  if ($null -ne $body) {
    $json = $body | ConvertTo-Json -Depth 12 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    return Invoke-RestMethod -Method $method -Uri $uri -Headers $H -Body $bytes -ContentType 'application/json'
  }
  return Invoke-RestMethod -Method $method -Uri $uri -Headers $H
}

Write-Host '[1/5] 读取远端与本地'
$ref = Api GET "/repos/$repo/git/ref/heads/main"
$baseSha = $ref.object.sha
$baseCommit = Api GET "/repos/$repo/git/commits/$baseSha"
$baseTree = $baseCommit.tree.sha
$localSha = (git rev-parse HEAD).Trim()
$localMsg = ((git log -1 --format=%B HEAD) -join "`n").TrimEnd()
Write-Host "      远端=$baseSha  本地=$localSha"

$changed = (git diff --name-only $baseSha $localSha) -split "`n" | Where-Object { $_.Trim() }
Write-Host "      变化文件 $($changed.Count) 个"

Write-Host '[2/5] 上传 blob'
$tmp = Join-Path $env:TEMP 'cz-blob2.bin'
$entries = @()
foreach ($p in $changed) {
  $blobSha = (git rev-parse ("HEAD:" + $p)).Trim()
  if (Test-Path $tmp) { Remove-Item $tmp -Force }
  cmd /c "git cat-file blob $blobSha > `"$tmp`"" 2>$null | Out-Null
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($tmp))
  $r = Api POST "/repos/$repo/git/blobs" @{ content = $b64; encoding = 'base64' }
  $mode = if ((git ls-tree HEAD -- $p) -match '^(\d+)') { $matches[1] } else { '100644' }
  $entries += [pscustomobject]@{ path = $p; mode = $mode; type = 'blob'; sha = $r.sha }
  Write-Host ("      " + $p + "  " + $mode)
}

Write-Host '[3/5] 创建 tree'
$tree = Api POST "/repos/$repo/git/trees" @{ base_tree = $baseTree; tree = $entries }
Write-Host "      tree=$($tree.sha)"

Write-Host '[4/5] 创建 commit'
$commit = Api POST "/repos/$repo/git/commits" @{ message = $localMsg; tree = $tree.sha; parents = @($baseSha) }
Write-Host "      commit=$($commit.sha)"

Write-Host '[5/5] 更新 main'
$null = Api PATCH "/repos/$repo/git/refs/heads/main" @{ sha = $commit.sha; force = $false }
Write-Host '      ok'
Write-Host ''
Write-Host "DONE https://github.com/$repo/commit/$($commit.sha)"
