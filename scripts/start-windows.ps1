# CoinGlass 监控系统 - Windows 启动脚本

param(
    [switch]$DisableAutoUpdate,
    [switch]$Dev,
    [string]$Port = $null
)

$ErrorActionPreference = "Stop"

# 读取 .env 文件中的端口配置
function Get-EnvPort {
    param([string]$ProjectDir)

    $envFile = Join-Path $ProjectDir ".env"
    $envExampleFile = Join-Path $ProjectDir ".env.example"

    # 优先使用 .env 文件，其次使用 .env.example
    $fileToRead = if (Test-Path $envFile) { $envFile } elseif (Test-Path $envExampleFile) { $envExampleFile } else { $null }

    if ($fileToRead) {
        try {
            $envContent = Get-Content $fileToRead
            foreach ($line in $envContent) {
                if ($line -match '^PORT\s*=\s*(\d+)$') {
                    return $matches[1]
                }
            }
        } catch {
            Write-ColorOutput "警告: 无法读取环境配置文件" "Yellow"
        }
    }

    # 如果都没有找到，报错并退出
    Write-ColorOutput "错误: 未找到 PORT 配置" "Red"
    Write-ColorOutput "请确保 .env 文件中包含 PORT 配置" "Yellow"
    exit 1
}

# 简化的颜色输出函数
function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

# 显示基本信息
function Show-Header {
    param([string]$ActualPort)

    Write-ColorOutput "========================================" "Cyan"
    Write-ColorOutput "  CoinGlass 监控系统启动" "Cyan"
    Write-ColorOutput "========================================" "Cyan"
    Write-Host ""
    Write-ColorOutput "端口: $ActualPort" "Yellow"
    if ($Dev) {
        Write-ColorOutput "开发模式: 启用" "Cyan"
        Write-ColorOutput "自动更新: 禁用（开发模式）" "Yellow"
    } elseif (-not $DisableAutoUpdate) {
        Write-ColorOutput "自动更新: 启用" "Green"
    } else {
        Write-ColorOutput "自动更新: 禁用" "Yellow"
    }
    Write-Host ""
}

# 检查项目目录
function Test-ProjectDirectory {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $projectDir = Split-Path -Parent $scriptDir

    try {
        Set-Location $projectDir
        if (!(Test-Path "package.json")) {
            Write-ColorOutput "错误: 未找到 package.json" "Red"
            exit 1
        }
        Write-ColorOutput "✓ 项目目录: $projectDir" "Green"
        return $projectDir
    } catch {
        Write-ColorOutput "错误: 无法切换到项目目录" "Red"
        exit 1
    }
}

# 基础环境检查
function Test-BasicEnvironment {
    try {
        $nodeVersion = node --version
        Write-ColorOutput "✓ Node.js: $nodeVersion" "Green"
    } catch {
        Write-ColorOutput "错误: 请先安装 Node.js" "Red"
        exit 1
    }
}

# 准备环境
function Initialize-Environment {
    # 复制环境文件
    if (!(Test-Path ".env")) {
        if (Test-Path ".env.example") {
            Copy-Item ".env.example" ".env"
            Write-ColorOutput "✓ .env 文件已创建" "Green"
        }
    } else {
        Write-ColorOutput "✓ .env 文件已存在" "Green"
    }

    # 创建必要目录
    $directories = @("data", "data/email-history", "data/scrape-history", "data/backups", "logs")
    foreach ($dir in $directories) {
        if (!(Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
    }
    Write-ColorOutput "✓ 目录结构准备完成" "Green"
}

# 安装依赖
function Install-Dependencies {
    if (!(Test-Path "node_modules")) {
        Write-ColorOutput "安装依赖中..." "Cyan"
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-ColorOutput "依赖安装失败" "Red"
            exit 1
        }
        Write-ColorOutput "✓ 依赖安装完成" "Green"
    } else {
        Write-ColorOutput "✓ 依赖已安装" "Green"
    }
}

# 启动应用
function Start-Application {
    Write-ColorOutput "启动应用服务..." "Cyan"
    Write-Host ""

    # 设置环境变量
    $env:PORT = $Port
    if ($Dev) {
        $env:NODE_ENV = "development"
        Write-ColorOutput "🔧 开发模式（无自动更新）" "Cyan"
        npm run dev
    } else {
        $env:NODE_ENV = "production"
        if (-not $DisableAutoUpdate) {
            $env:ENABLE_AUTO_UPDATE = "true"
            Write-ColorOutput "🚀 生产模式（自动更新已启用）" "Green"
        } else {
            Write-ColorOutput "🚀 生产模式（自动更新已禁用）" "Yellow"
        }
        npm start
    }
}

# 主函数
function Main {
    try {
        $projectDir = Test-ProjectDirectory

        # 确定端口号：命令行参数 > .env > .env.example > 默认值
        if (-not $Port) {
            $Port = Get-EnvPort -ProjectDir $projectDir
            Write-ColorOutput "从 .env 文件读取端口配置: $Port" "Cyan"
        }

        Show-Header -ActualPort $Port
        Test-BasicEnvironment
        Initialize-Environment
        Install-Dependencies
        Start-Application
    } catch {
        Write-ColorOutput "启动失败: $_" "Red"
        exit 1
    }
}

Main