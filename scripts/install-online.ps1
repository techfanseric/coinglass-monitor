# CoinGlass 监控系统 - 在线安装 PowerShell 脚本
# 这个脚本专门用于从零开始的一键安装

param(
    [switch]$SkipNodeInstall,
    [switch]$SkipChromeCheck,
    [switch]$DevMode,
    [string]$Port = "3000",
    [string]$RepoUrl = "https://github.com/techfanseric/coinglass-monitor.git",
    [string]$ProjectName = "coinglass-monitor"
)

# 设置错误处理
$ErrorActionPreference = "Stop"

# 颜色输出函数
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

# 自动设置执行策略
function Set-ExecutionPolicySafely {
    try {
        $currentPolicy = Get-ExecutionPolicy -Scope CurrentUser
        if ($currentPolicy -eq "Restricted") {
            Write-ColorOutput "正在设置PowerShell执行策略..." "Cyan"
            Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
            Write-ColorOutput "✓ 执行策略设置完成" "Green"
        } else {
            Write-ColorOutput "✓ 执行策略检查通过 ($currentPolicy)" "Green"
        }
        return $true
    }
    catch {
        Write-ColorOutput "警告: 无法设置执行策略，尝试使用 Bypass 模式" "Yellow"
        return $false
    }
}

# 检查管理员权限
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# 检查网络连接
function Test-NetworkConnection {
    try {
        $testConnection = Test-NetConnection -ComputerName "google.com" -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue
        return $testConnection
    }
    catch {
        return $false
    }
}

# 安全下载文件
function Download-FileSafely {
    param(
        [string]$Url,
        [string]$OutFile
    )

    try {
        Write-ColorOutput "正在下载: $(Split-Path $Url -Leaf)" "Cyan"

        # 使用多种方法尝试下载
        # 方法1: Invoke-WebRequest
        try {
            Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing -TimeoutSec 30
            Unblock-File -Path $OutFile -ErrorAction SilentlyContinue
            return $true
        }
        catch { }

        # 方法2: WebClient
        try {
            $webClient = New-Object System.Net.WebClient
            $webClient.DownloadFile($Url, $OutFile)
            Unblock-File -Path $OutFile -ErrorAction SilentlyContinue
            return $true
        }
        catch { }

        # 方法3: bitsadmin
        try {
            $tempOutFile = "$OutFile.tmp"
            Start-Process -FilePath "bitsadmin" -ArgumentList "/transfer", "download", "/download", "/priority", "normal", $Url, $tempOutFile -Wait -NoNewWindow
            if (Test-Path $tempOutFile) {
                Move-Item $tempOutFile $OutFile -Force
                Unblock-File -Path $OutFile -ErrorAction SilentlyContinue
                return $true
            }
        }
        catch { }

        return $false
    }
    catch {
        return $false
    }
}

# 智能克隆项目（无需用户交互）
function Clone-ProjectIntelligently {
    Write-ColorOutput "正在准备项目文件..." "Cyan"

    # 获取当前目录
    $currentDir = Get-Location

    # 智能选择项目名称
    $finalProjectName = $ProjectName
    $projectPath = Join-Path $currentDir $finalProjectName

    # 如果目录已存在，使用时间戳创建新目录
    if (Test-Path $projectPath) {
        Write-ColorOutput "项目目录已存在，正在创建新实例..." "Yellow"
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $finalProjectName = "$ProjectName-$timestamp"
        $projectPath = Join-Path $currentDir $finalProjectName
        Write-ColorOutput "新目录名称: $finalProjectName" "Cyan"
    }

    # 尝试Git克隆
    Write-ColorOutput "正在从 GitHub 克隆仓库..." "Cyan"
    try {
        git clone $RepoUrl $finalProjectName

        if (Test-Path $projectPath) {
            Set-Location $projectPath
            Write-ColorOutput "✓ 项目克隆成功" "Green"
            Write-ColorOutput "项目目录: $projectPath" "Cyan"
            return $true
        }
    }
    catch {
        Write-ColorOutput "Git 克隆失败，尝试备用方案..." "Yellow"
    }

    # 备用方案：下载ZIP文件
    Write-ColorOutput "正在下载项目压缩包..." "Cyan"
    $zipUrl = $RepoUrl.Replace('.git', '/archive/main.zip')
    $zipPath = Join-Path $currentDir "project.zip"

    if (Download-FileSafely -Url $zipUrl -OutFile $zipPath) {
        try {
            Write-ColorOutput "正在解压项目文件..." "Cyan"

            # 创建项目目录
            New-Item -ItemType Directory -Path $projectPath -Force | Out-Null

            # 使用系统解压（如果有）或 PowerShell 解压
            if (Get-Command tar -ErrorAction SilentlyContinue) {
                tar -xf $zipPath -C $projectPath --strip-components=1
            } else {
                # 使用 PowerShell 解压
                Add-Type -AssemblyName System.IO.Compression.FileSystem
                $zipFilePath = Join-Path $currentDir "project.zip"
                [System.IO.Compression.ZipFile]::ExtractToDirectory($zipFilePath, $currentDir)

                # 移动文件到目标目录
                $extractedPath = Join-Path $currentDir "coinglass-monitor-main"
                if (Test-Path $extractedPath) {
                    Get-ChildItem -Path $extractedPath | Move-Item -Destination $projectPath
                    Remove-Item $extractedPath -Recurse -Force
                }
            }

            # 清理ZIP文件
            Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

            if (Test-Path (Join-Path $projectPath "package.json")) {
                Set-Location $projectPath
                Write-ColorOutput "✓ 项目下载成功" "Green"
                Write-ColorOutput "项目目录: $projectPath" "Cyan"
                return $true
            }
        }
        catch {
            Write-ColorOutput "解压失败: $_" "Red"
        }
    }

    Write-ColorOutput "✗ 项目获取失败" "Red"
    Write-ColorOutput "请手动下载项目:" "Yellow"
    Write-ColorOutput "1. 访问: $RepoUrl" "Cyan"
    Write-ColorOutput "2. 点击 'Code' -> 'Download ZIP'" "Cyan"
    Write-ColorOutput "3. 解压到当前目录并重命名为 '$finalProjectName'" "Cyan"
    Write-ColorOutput "4. 重新运行此脚本" "Cyan"

    return $false
}

# 主安装函数
function Start-Installation {
    Write-ColorOutput "========================================" "Cyan"
    Write-ColorOutput "  CoinGlass 监控系统 - 在线安装程序" "Cyan"
    Write-ColorOutput "========================================" "Cyan"
    echo ""

    # 检查管理员权限
    if (Test-Administrator) {
        Write-ColorOutput "✓ 以管理员权限运行" "Green"
    } else {
        Write-ColorOutput "⚠️  未以管理员权限运行，某些功能可能受限" "Yellow"
    }

    # 检查网络连接
    if (!(Test-NetworkConnection)) {
        Write-ColorOutput "✗ 网络连接检查失败" "Red"
        Write-ColorOutput "请确保网络连接正常，能够访问 GitHub" "Yellow"
        Read-Host "按 Enter 键退出"
        exit 1
    }
    Write-ColorOutput "✓ 网络连接正常" "Green"

    # 设置执行策略
    Set-ExecutionPolicySafely | Out-Null

    # 克隆项目
    echo ""
    if (!(Clone-ProjectIntelligently)) {
        Read-Host "按 Enter 键退出"
        exit 1
    }

    # 下载并执行主部署脚本
    echo ""
    Write-ColorOutput "正在下载主部署脚本..." "Cyan"

    $deployScriptPath = Join-Path (Get-Location) "deploy-windows.ps1"
    if (Download-FileSafely -Url "https://raw.githubusercontent.com/techfanseric/coinglass-monitor/main/scripts/deploy-windows.ps1" -OutFile $deployScriptPath) {
        Write-ColorOutput "✓ 主部署脚本下载完成" "Green"

        # 构建参数字符串
        $arguments = @()
        if ($SkipNodeInstall) { $arguments += "-SkipNodeInstall" }
        if ($SkipChromeCheck) { $arguments += "-SkipChromeCheck" }
        if ($DevMode) { $arguments += "-DevMode" }
        if ($Port -ne "3000") { $arguments += "-Port $Port" }

        Write-ColorOutput "正在启动主部署程序..." "Cyan"
        echo ""

        # 执行主部署脚本
        try {
            & $deployScriptPath $arguments
        }
        finally {
            # 清理临时脚本文件
            if (Test-Path $deployScriptPath) {
                Remove-Item $deployScriptPath -Force -ErrorAction SilentlyContinue
            }
        }
    } else {
        Write-ColorOutput "✗ 主部署脚本下载失败" "Red"
        Read-Host "按 Enter 键退出"
        exit 1
    }
}

# 执行主函数
try {
    Start-Installation
}
catch {
    Write-ColorOutput "安装过程中发生错误: $_" "Red"
    Write-ColorOutput "请检查:" "Yellow"
    Write-ColorOutput "  • 网络连接是否正常" "Yellow"
    Write-ColorOutput "  • 杀毒软件是否阻止了脚本执行" "Yellow"
    Write-ColorOutput "  • 防火墙设置是否正确" "Yellow"
    Read-Host "按 Enter 键退出"
    exit 1
}