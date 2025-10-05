# CoinGlass 监控系统 - Windows 启动脚本
# PowerShell 版本的启动脚本，提供更好的错误处理和环境检测

param(
    [switch]$Dev,
    [switch]$Debug,
    [string]$Port = "3000"
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

# 显示脚本信息
function Show-Header {
    Write-ColorOutput "========================================" "Cyan"
    Write-ColorOutput "  CoinGlass 监控系统 - Windows 启动脚本" "Cyan"
    Write-ColorOutput "========================================" "Cyan"
    Write-Host ""

    $mode = if ($Dev) { "开发模式" } elseif ($Debug) { "调试模式" } else { "生产模式" }
    Write-ColorOutput "启动模式: $mode" "Yellow"
    Write-ColorOutput "服务端口: $Port" "Yellow"
    Write-Host ""
}

# 检查项目目录
function Test-ProjectDirectory {
    # 获取脚本所在目录
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $projectDir = Split-Path -Parent $scriptDir

    Write-ColorOutput "📁 项目目录: $projectDir" "Cyan"

    # 切换到项目目录
    try {
        Set-Location $projectDir
        Write-ColorOutput "✓ 已切换到项目目录" "Green"
    }
    catch {
        Write-ColorOutput "✗ 错误: 无法切换到项目目录" "Red"
        Write-ColorOutput "项目目录: $projectDir" "Red"
        Write-ColorOutput "错误信息: $_" "Red"
        Read-Host "按 Enter 键退出"
        exit 1
    }

    # 检查 package.json 是否存在
    if (!(Test-Path "package.json")) {
        Write-ColorOutput "✗ 错误: 未找到 package.json 文件" "Red"
        Write-ColorOutput "请确保在正确的项目目录中运行此脚本" "Yellow"
        Read-Host "按 Enter 键退出"
        exit 1
    }

    Write-ColorOutput "✓ 项目文件检查通过" "Green"
    return $projectDir
}

# 检查环境依赖
function Test-Environment {
    Write-ColorOutput "🔍 检查环境依赖..." "Cyan"

    # 检查 Node.js
    try {
        $nodeVersion = node --version
        Write-ColorOutput "✓ Node.js 已安装: $nodeVersion" "Green"

        # 检查版本是否满足要求 (需要 Node.js 18+)
        $majorVersion = [int]($nodeVersion -replace '^v', '').Split('.')[0]
        if ($majorVersion -lt 18) {
            Write-ColorOutput "⚠️  警告: Node.js 版本过低 ($nodeVersion)，建议升级到 18.x 或更高版本" "Yellow"
        }
    }
    catch {
        Write-ColorOutput "✗ 错误: 未找到 Node.js" "Red"
        Write-ColorOutput "请先安装 Node.js: https://nodejs.org/" "Yellow"
        Read-Host "按 Enter 键退出"
        exit 1
    }

    # 检查 npm
    try {
        $npmVersion = npm --version
        Write-ColorOutput "✓ npm 已安装: $npmVersion" "Green"
    }
    catch {
        Write-ColorOutput "✗ 错误: 未找到 npm" "Red"
        Write-ColorOutput "npm 通常随 Node.js 一起安装" "Yellow"
        Read-Host "按 Enter 键退出"
        exit 1
    }

    # 检查 Git (可选)
    try {
        $gitVersion = git --version
        Write-ColorOutput "✓ Git 已安装: $gitVersion" "Green"
    }
    catch {
        Write-ColorOutput "⚠️  警告: 未找到 Git，某些功能可能受限" "Yellow"
    }

    Write-ColorOutput "✓ 环境检查完成" "Green"
}

# 准备环境配置
function Initialize-Environment {
    Write-ColorOutput "⚙️  准备环境配置..." "Cyan"

    # 设置环境变量
    $env:NODE_ENV = if ($Dev) { "development" } else { "production" }
    $env:PORT = $Port

    Write-ColorOutput "✓ 环境变量设置完成" "Green"
    Write-ColorOutput "  NODE_ENV: $env:NODE_ENV" "Cyan"
    Write-ColorOutput "  PORT: $env:PORT" "Cyan"

    # 检查配置文件
    if (!(Test-Path ".env")) {
        Write-ColorOutput "⚠️  警告: .env 文件不存在" "Yellow"
        if (Test-Path ".env.example") {
            Write-ColorOutput "正在从 .env.example 创建配置文件..." "Cyan"
            Copy-Item ".env.example" ".env"
            Write-ColorOutput "✓ .env 文件创建完成" "Green"
            Write-ColorOutput "💡 请根据需要修改 .env 文件中的配置" "Yellow"
        } else {
            Write-ColorOutput "⚠️  也未找到 .env.example 文件" "Yellow"
        }
    } else {
        Write-ColorOutput "✓ .env 配置文件已存在" "Green"
    }

    # 创建必要的目录
    $directories = @("data", "data/email-history", "data/scrape-history", "data/backups", "logs")
    foreach ($dir in $directories) {
        if (!(Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
    }
    Write-ColorOutput "✓ 目录结构检查完成" "Green"
}

# 安装依赖
function Install-Dependencies {
    Write-ColorOutput "📦 检查项目依赖..." "Cyan"

    if (!(Test-Path "node_modules")) {
        Write-ColorOutput "正在安装项目依赖..." "Cyan"
        Write-ColorOutput "这可能需要几分钟时间，请耐心等待..." "Yellow"

        try {
            npm install
            Write-ColorOutput "✓ 依赖安装完成" "Green"
        }
        catch {
            Write-ColorOutput "✗ 依赖安装失败" "Red"
            Write-ColorOutput "错误信息: $_" "Red"
            Write-ColorOutput "可能的解决方案:" "Yellow"
            Write-ColorOutput "  1. 检查网络连接" "Yellow"
            Write-ColorOutput "  2. 清除 npm 缓存: npm cache clean --force" "Yellow"
            Write-ColorOutput "  3. 检查 Node.js 版本是否兼容" "Yellow"
            Read-Host "按 Enter 键退出"
            exit 1
        }
    } else {
        Write-ColorOutput "✓ 依赖已安装" "Green"

        # 检查是否需要更新依赖
        Write-ColorOutput "检查依赖更新..." "Cyan"
        try {
            $outdated = npm outdated 2>$null
            if ($outdated) {
                Write-ColorOutput "⚠️  发现有可更新的依赖包" "Yellow"
                Write-ColorOutput "运行 'npm update' 来更新依赖" "Yellow"
            } else {
                Write-ColorOutput "✓ 依赖已是最新版本" "Green"
            }
        }
        catch {
            # npm outdated 在某些情况下会返回非零退出码，忽略错误
        }
    }
}

# 启动应用
function Start-Application {
    Write-ColorOutput "🚀 启动 CoinGlass 监控系统..." "Cyan"
    Write-Host ""

    # 检查端口是否被占用
    try {
        $connection = Test-NetConnection -ComputerName "localhost" -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue
        if ($connection) {
            Write-ColorOutput "⚠️  端口 $Port 已被占用" "Yellow"
            Write-ColorOutput "正在尝试终止占用该端口的进程..." "Cyan"

            # 尝试终止 Node.js 进程
            Get-Process | Where-Object { $_.ProcessName -eq "node" } | Stop-Process -Force -ErrorAction SilentlyContinue

            # 等待端口释放
            Start-Sleep -Seconds 3

            # 再次检查
            $connection = Test-NetConnection -ComputerName "localhost" -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue
            if ($connection) {
                Write-ColorOutput "⚠️  端口仍被占用，请手动处理" "Yellow"
                Write-ColorOutput "或者使用其他端口: .\scripts\start-windows.ps1 -Port 3001" "Yellow"
            }
        }
    }
    catch {
        # Test-NetConnection 在某些系统上可能不可用，忽略错误
    }

    Write-Host ""
    Write-ColorOutput "服务将在以下地址启动:" "Green"
    Write-Host "  • 前端界面: http://localhost:$Port"
    Write-Host "  • API接口: http://localhost:$Port/api"
    Write-Host "  • 健康检查: http://localhost:$Port/health"
    Write-Host ""
    Write-ColorOutput "按 Ctrl+C 停止服务" "Yellow"
    Write-Host ""

    # 启动应用
    try {
        if ($Debug) {
            Write-ColorOutput "以调试模式启动..." "Cyan"
            node --inspect src/app.js
        } elseif ($Dev) {
            Write-ColorOutput "以开发模式启动..." "Cyan"
            npm run dev
        } else {
            Write-ColorOutput "以生产模式启动..." "Cyan"
            npm start
        }
    }
    catch {
        Write-ColorOutput "✗ 应用启动失败" "Red"
        Write-ColorOutput "错误信息: $_" "Red"
        Write-Host ""
        Write-ColorOutput "故障排除建议:" "Yellow"
        Write-Host "  1. 检查端口 $Port 是否被其他程序占用"
        Write-Host "  2. 查看日志文件: ./server.log"
        Write-Host "  3. 确认配置文件 .env 是否正确"
        Write-Host "  4. 尝试重新安装依赖: Remove-Item node_modules -Recurse -Force; npm install"
        Write-Host ""
        Read-Host "按 Enter 键退出"
        exit 1
    }
}

# 主函数
function Main {
    try {
        Show-Header
        Test-ProjectDirectory | Out-Null
        Test-Environment
        Initialize-Environment
        Install-Dependencies
        Start-Application
    }
    catch {
        Write-ColorOutput "✗ 启动过程中发生未预期的错误" "Red"
        Write-ColorOutput "错误信息: $_" "Red"
        Write-Host ""
        Write-ColorOutput "请检查:" "Yellow"
        Write-Host "  • 是否在正确的项目目录中运行脚本"
        Write-Host "  • Node.js 和 npm 是否正确安装"
        Write-Host "  • 网络连接是否正常"
        Write-Host ""
        Read-Host "按 Enter 键退出"
        exit 1
    }
}

# 执行主函数
Main