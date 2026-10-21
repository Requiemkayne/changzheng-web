#Requires -Version 5.1
<#
.SYNOPSIS
  长征 web 数据库备份：拷贝 SQLite 三件套 + SHA256 清单 + 轮转清理。
.DESCRIPTION
  默认备份 <repo>\server\data.db 及其 -wal / -shm 到 <repo>\backup\<时间戳>\。
  指定 -ServiceName 时先用 nssm 停服务，拷完再启动，保证拿到一致快照。
  未指定时用共享读方式做一致性拷贝，但仍建议在低峰期执行。
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup-db.ps1
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup-db.ps1 -Keep 30 -ServiceName ChangzhengWeb
#>
[CmdletBinding()]
param(
    [string]$DbPath = '..\server\data.db',
    [string]$BackupDir = '',
    [int]$Keep = 14,
    [string]$ServiceName = ''
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

$dbFile = Resolve-FullPath -Path $DbPath -BaseDir $scriptDir
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
$serviceStopped = $false
$nssmExe = $null
$target = $null
$records = @()
$totalBytes = 0
$removed = @()

try {
    if (-not (Test-Path -LiteralPath $dbFile -PathType Leaf)) {
        throw ('数据库文件不存在: ' + $dbFile)
    }
    if ($Keep -lt 1) {
        throw ('-Keep 必须是大于等于 1 的整数，当前值: ' + $Keep)
    }

    if ($ServiceName) {
        $cmd = Get-Command 'nssm.exe' -ErrorAction SilentlyContinue
        if (-not $cmd) {
            throw ('指定了 -ServiceName，但 PATH 中找不到 nssm.exe；请把 nssm 加入 PATH，或去掉该参数并手动停服务')
        }
        $nssmExe = $cmd.Source
        Write-Step ('停止服务 ' + $ServiceName)
        & $nssmExe stop $ServiceName | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw ('nssm stop ' + $ServiceName + ' 失败，退出码 ' + $LASTEXITCODE)
        }
        $serviceStopped = $true
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

    $sources = @($dbFile, ($dbFile + '-wal'), ($dbFile + '-shm'))
    foreach ($source in $sources) {
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
            continue
        }
        $name = [System.IO.Path]::GetFileName($source)
        $dest = Join-Path $target $name
        Copy-FileShared -Source $source -Destination $dest
        $hash = (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant()
        $size = (Get-Item -LiteralPath $dest).Length
        $records += [pscustomobject]@{ Name = $name; Sha256 = $hash; Bytes = $size }
        $totalBytes = $totalBytes + $size
        Write-Step ('已拷贝 ' + $name + ' (' + $size + ' 字节)')
    }

    if ($records.Count -eq 0) {
        throw ('没有拷贝到任何数据库文件: ' + $dbFile)
    }

    $manifest = New-Object System.Text.StringBuilder
    [void]$manifest.AppendLine('# 长征 web 数据库备份清单')
    [void]$manifest.AppendLine('备份时间: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'))
    [void]$manifest.AppendLine('源数据库: ' + $dbFile)
    if ($ServiceName) {
        [void]$manifest.AppendLine('服务处理: nssm stop/start ' + $ServiceName)
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
    if ($serviceStopped -and $nssmExe) {
        Write-Step ('启动服务 ' + $ServiceName)
        & $nssmExe start $ServiceName | Out-Null
        if ($LASTEXITCODE -ne 0 -and -not $failure) {
            $failure = ('nssm start ' + $ServiceName + ' 失败，退出码 ' + $LASTEXITCODE)
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
Write-Host ('总大小: ' + ('{0:N2} MB' -f ($totalBytes / 1MB)))
if ($removed.Count -gt 0) {
    Write-Host ('已清理旧备份: ' + ($removed -join ', '))
} else {
    Write-Host '旧备份: 无超出保留份数的目录'
}
Write-Host ('保留策略: 最近 ' + $Keep + ' 份')
