#Requires -Version 5.1
<#
.SYNOPSIS
  长征 web 数据库备份：拷贝 SQLite 三件套 + SHA256 清单 + 轮转清理。
.DESCRIPTION
  默认备份 <repo>\server\data.db 及其 -wal / -shm 到 <repo>\backup\<时间戳>\。
  -All 时连专题站留言库一起备份（主站 server\data.db + competition-timeline\server\data.db）；
  两个库同名都叫 data.db，所以多库模式各占时间戳目录下的 db1\ / db2\ 子目录，不会互相覆盖。
  -DbPath 也可直接给多个路径，语义与 -All 相同（-All 只是两个默认路径的简写）。
  指定 -ServiceName 时先用 nssm 停服务，拷完再启动，保证拿到一致快照；可给多个服务名（主站 + 留言）。
  未指定时用共享读方式做一致性拷贝，但仍建议在低峰期执行。
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup-db.ps1
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup-db.ps1 -All -ServiceName ChangzhengWeb,ChangzhengComments
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup-db.ps1 -Keep 30 -ServiceName ChangzhengWeb
#>
[CmdletBinding()]
param(
    [string[]]$DbPath = @(),
    [string]$BackupDir = '',
    [int]$Keep = 14,
    [string[]]$ServiceName = @(),
    [switch]$All
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
    Write-Host ('[backup] ' + $Message)
}

$scriptDir = $PSScriptRoot
if (-not $scriptDir) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$repoRoot = Split-Path -Parent $scriptDir

function Resolve-FullPath([string]$Path, [string]$BaseDir) {
    if ([System.IO.Path]::IsPathRooted($Path)) {
        return [System.IO.Path]::GetFullPath($Path)
    }
    return [System.IO.Path]::GetFullPath((Join-Path $BaseDir $Path))
}

if ($All) {
    if ($DbPath.Count -gt 0) {
        throw ('-All 与 -DbPath 互斥：-All 固定备份主站库与专题站留言库这两个默认路径')
    }
    $DbPath = @('..\server\data.db', '..\competition-timeline\server\data.db')
} elseif ($DbPath.Count -eq 0) {
    $DbPath = @('..\server\data.db')
}

# 多库时平铺会撞名（都是 data.db），改成每库一个子目录，清单里写清 dbN 对应哪个源路径
$multi = $DbPath.Count -gt 1
$targets = @()
$index = 0
foreach ($one in $DbPath) {
    $index = $index + 1
    $label = ''
    if ($multi) { $label = 'db' + $index }
    $targets += [pscustomobject]@{
        Label = $label
        Path  = (Resolve-FullPath -Path $one -BaseDir $scriptDir)
    }
}

if (-not $BackupDir) {
    $BackupDir = Join-Path $repoRoot 'backup'
}
$backupRoot = Resolve-FullPath -Path $BackupDir -BaseDir $scriptDir

function Copy-FileShared([string]$Source, [string]$Destination) {
    $share = [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
    $input = [System.IO.File]::Open($Source, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, $share)
    try {
        $output = [System.IO.File]::Create($Destination)
        try {
            $input.CopyTo($output)
        } finally {
            $output.Dispose()
        }
    } finally {
        $input.Dispose()
    }
}

$failure = $null
$nssmExe = $null
$target = $null
$records = @()
$totalBytes = 0
$removed = @()
$stoppedServices = @()

try {
    if ($Keep -lt 1) {
        throw ('-Keep 必须是大于等于 1 的整数，当前值: ' + $Keep)
    }

    # 单库模式保持原语义（库不存在即失败）；多库模式允许某个库还没被创建过
    # （专题站留言服务没启动过一次时就没有 data.db，这不该让主站备份也失败）
    $present = @()
    foreach ($t in $targets) {
        if (Test-Path -LiteralPath $t.Path -PathType Leaf) {
            $present += $t
        } elseif ($multi) {
            Write-Step ('跳过（文件不存在）: ' + $t.Path)
        } else {
            throw ('数据库文件不存在: ' + $t.Path)
        }
    }
    if ($present.Count -eq 0) {
        throw ('没有任何可备份的数据库文件，请检查路径')
    }

    if ($ServiceName.Count -gt 0) {
        $cmd = Get-Command 'nssm.exe' -ErrorAction SilentlyContinue
        if (-not $cmd) {
            throw ('指定了 -ServiceName，但 PATH 中找不到 nssm.exe；请把 nssm 加入 PATH，或去掉该参数并手动停服务')
        }
        $nssmExe = $cmd.Source
        foreach ($svc in $ServiceName) {
            Write-Step ('停止服务 ' + $svc)
            & $nssmExe stop $svc | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw ('nssm stop ' + $svc + ' 失败，退出码 ' + $LASTEXITCODE)
            }
            $stoppedServices += $svc
        }
        Start-Sleep -Seconds 2
    }

    if (-not (Test-Path -LiteralPath $backupRoot)) {
        New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
    }

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $target = Join-Path $backupRoot $stamp
    $suffix = 1
    while (Test-Path -LiteralPath $target) {
        $target = Join-Path $backupRoot ($stamp + '-' + $suffix)
        $suffix = $suffix + 1
    }
    New-Item -ItemType Directory -Path $target -Force | Out-Null

    foreach ($t in $present) {
        $destDir = $target
        if ($multi) {
            $destDir = Join-Path $target $t.Label
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }
        $copied = 0
        foreach ($source in @($t.Path, ($t.Path + '-wal'), ($t.Path + '-shm'))) {
            if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
                continue
            }
            $name = [System.IO.Path]::GetFileName($source)
            $dest = Join-Path $destDir $name
            Copy-FileShared -Source $source -Destination $dest
            $hash = (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant()
            $size = (Get-Item -LiteralPath $dest).Length
            $relName = $name
            if ($multi) { $relName = $t.Label + '\' + $name }
            $records += [pscustomobject]@{ Name = $relName; Sha256 = $hash; Bytes = $size; Source = $t.Path }
            $totalBytes = $totalBytes + $size
            $copied = $copied + 1
            Write-Step ('已拷贝 ' + $relName + ' (' + $size + ' 字节)')
        }
        if ($copied -eq 0) {
            throw ('没有拷贝到任何数据库文件: ' + $t.Path)
        }
    }

    $manifest = New-Object System.Text.StringBuilder
    [void]$manifest.AppendLine('# 长征 web 数据库备份清单')
    [void]$manifest.AppendLine('备份时间: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'))
    [void]$manifest.AppendLine('源数据库:')
    foreach ($t in $present) {
        if ($multi) {
            [void]$manifest.AppendLine(('  ' + $t.Label + '\ = ' + $t.Path))
        } else {
            [void]$manifest.AppendLine(('  ' + $t.Path))
        }
    }
    if ($ServiceName.Count -gt 0) {
        [void]$manifest.AppendLine('服务处理: nssm stop/start ' + ($ServiceName -join ','))
    } else {
        [void]$manifest.AppendLine('服务处理: 未停服务（共享读一致性拷贝）')
    }
    [void]$manifest.AppendLine('')
    [void]$manifest.AppendLine('文件:')
    foreach ($record in $records) {
        [void]$manifest.AppendLine(($record.Name + '  sha256=' + $record.Sha256 + '  bytes=' + $record.Bytes))
    }
    $manifestPath = Join-Path $target 'manifest.txt'
    [System.IO.File]::WriteAllText($manifestPath, $manifest.ToString(), (New-Object System.Text.UTF8Encoding($true)))

    $dirs = @(Get-ChildItem -LiteralPath $backupRoot -Directory | Where-Object { $_.Name -match '^\d{8}-\d{6}(-\d+)?$' } | Sort-Object -Property Name -Descending)
    if ($dirs.Count -gt $Keep) {
        foreach ($dir in ($dirs | Select-Object -Skip $Keep)) {
            Remove-Item -LiteralPath $dir.FullName -Recurse -Force
            $removed += $dir.Name
        }
    }
} catch {
    $failure = $_.Exception.Message
} finally {
    if ($stoppedServices.Count -gt 0 -and $nssmExe) {
        # 反序启动，与停止顺序相反（先起留言服务、后起主站）
        for ($n = $stoppedServices.Count - 1; $n -ge 0; $n--) {
            $svc = $stoppedServices[$n]
            Write-Step ('启动服务 ' + $svc)
            & $nssmExe start $svc | Out-Null
            if ($LASTEXITCODE -ne 0 -and -not $failure) {
                $failure = ('nssm start ' + $svc + ' 失败，退出码 ' + $LASTEXITCODE)
            }
        }
    }
}

if ($failure) {
    Write-Host ('备份失败: ' + $failure) -ForegroundColor Red
    exit 1
}

Write-Host ('备份完成: ' + $target)
foreach ($record in $records) {
    Write-Host ('  ' + $record.Name + '  ' + ('{0:N0}' -f $record.Bytes) + ' 字节  sha256=' + $record.Sha256)
}
Write-Host ('总大小: ' + ('{0:N2}' -f ($totalBytes / 1MB)) + ' MB')
if ($removed.Count -gt 0) {
    Write-Host ('已清理旧备份: ' + ($removed -join ', '))
} else {
    Write-Host '旧备份: 无超出保留份数的目录'
}
Write-Host ('保留策略: 最近 ' + $Keep + ' 份')
