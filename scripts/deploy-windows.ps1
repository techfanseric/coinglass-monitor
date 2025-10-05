# CoinGlass 监控系统 Windows 一键部署脚本
# PowerShell 5.1+ 兼容
# 作者: 自动生成

param(
    [switch]$SkipNodeInstall,
    [switch]$SkipChromeCheck,
    [switch]$DevMode,
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

# 检查 PowerShell 版本
function Test-PowerShellVersion {
    $version = $PSVersionTable.PSVersion.Major
    if ($version -lt 5) {
        Write-ColorOutput "错误: 需要 PowerShell 5.0 或更高版本，当前版本: $version" "Red"
        return $false
    }
    Write-ColorOutput "✓ PowerShell 版本检查通过 (版本: $version)" "Green"
    return $true
}

# 检查并安装 Node.js
function Install-NodeJS {
    if ($SkipNodeInstall) {
        Write-ColorOutput "跳过 Node.js 安装检查" "Yellow"
        return $true
    }

    try {
        $nodeVersion = node --version
        Write-ColorOutput "✓ Node.js 已安装: $nodeVersion" "Green"

        # 检查版本是否满足要求 (需要 Node.js 16+)
        $majorVersion = [int]($nodeVersion -replace '^v', '').Split('.')[0]
        if ($majorVersion -lt 16) {
            Write-ColorOutput "警告: Node.js 版本过低 ($nodeVersion)，建议升级到 16.x 或更高版本" "Yellow"
        }
        return $true
    }
    catch {
        Write-ColorOutput "Node.js 未安装，正在开始下载安装..." "Yellow"

        # 下载 Node.js 安装程序
        $nodeUrl = "https://nodejs.org/dist/v20.12.2/node-v20.12.2-x64.msi"
        $installerPath = "$env:TEMP\node-installer.msi"

        try {
            Write-ColorOutput "正在下载 Node.js 20.12.2..." "Cyan"
            Invoke-WebRequest -Uri $nodeUrl -OutFile $installerPath -UseBasicParsing

            Write-ColorOutput "正在安装 Node.js (这可能需要几分钟)..." "Cyan"
            Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$installerPath`" /quiet /norestart" -Wait

            # 刷新环境变量
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

            # 验证安装
            Start-Sleep -Seconds 5
            $nodeVersion = node --version
            Write-ColorOutput "✓ Node.js 安装成功: $nodeVersion" "Green"

            # 清理安装文件
            Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
            return $true
        }
        catch {
            Write-ColorOutput "✗ Node.js 自动安装失败" "Red"
            Write-ColorOutput "请手动下载并安装 Node.js: https://nodejs.org/" "Yellow"
            return $false
        }
    }
}

# 检查并安装 Git
function Install-Git {
    try {
        $gitVersion = git --version
        Write-ColorOutput "✓ Git 已安装: $gitVersion" "Green"
        return $true
    }
    catch {
        Write-ColorOutput "Git 未安装，正在开始下载安装..." "Yellow"

        $gitUrl = "https://github.com/git-for-windows/git/releases/download/v2.44.0.windows.1/Git-2.44.0-64-bit.exe"
        $installerPath = "$env:TEMP\git-installer.exe"

        try {
            Write-ColorOutput "正在下载 Git 2.44.0..." "Cyan"
            Invoke-WebRequest -Uri $gitUrl -OutFile $installerPath -UseBasicParsing

            Write-ColorOutput "正在安装 Git (这可能需要几分钟)..." "Cyan"
            Start-Process -FilePath $installerPath -ArgumentList "/VERYSILENT", "/NORESTART" -Wait

            # 刷新环境变量
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

            # 验证安装
            Start-Sleep -Seconds 5
            $gitVersion = git --version
            Write-ColorOutput "✓ Git 安装成功: $gitVersion" "Green"

            # 清理安装文件
            Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
            return $true
        }
        catch {
            Write-ColorOutput "✗ Git 自动安装失败" "Red"
            Write-ColorOutput "请手动下载并安装 Git: https://git-scm.com/download/win" "Yellow"
            return $false
        }
    }
}

# 检查 Chrome 安装
function Test-ChromeInstallation {
    if ($SkipChromeCheck) {
        Write-ColorOutput "跳过 Chrome 安装检查" "Yellow"
        return $true
    }

    $chromePaths = @(
        "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "${env:LocalAppData}\Google\Chrome\Application\chrome.exe"
    )

    foreach ($path in $chromePaths) {
        if (Test-Path $path) {
            Write-ColorOutput "✓ Google Chrome 已安装: $path" "Green"
            return $true
        }
    }

    Write-ColorOutput "✗ 未找到 Google Chrome 安装" "Red"
    Write-ColorOutput "正在尝试安装 Google Chrome..." "Yellow"

    try {
        $chromeUrl = "https://dl.google.com/chrome/install/latest/chrome_installer.exe"
        $installerPath = "$env:TEMP\chrome-installer.exe"

        Write-ColorOutput "正在下载 Google Chrome..." "Cyan"
        Invoke-WebRequest -Uri $chromeUrl -OutFile $installerPath -UseBasicParsing

        Write-ColorOutput "正在安装 Google Chrome..." "Cyan"
        Start-Process -FilePath $installerPath -ArgumentList "/silent", "/install" -Wait

        # 验证安装
        Start-Sleep -Seconds 10
        foreach ($path in $chromePaths) {
            if (Test-Path $path) {
                Write-ColorOutput "✓ Google Chrome 安装成功" "Green"
                Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
                return $true
            }
        }

        Write-ColorOutput "✗ Google Chrome 安装失败，请手动安装" "Red"
        Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
        return $false
    }
    catch {
        Write-ColorOutput "✗ Google Chrome 自动安装失败" "Red"
        Write-ColorOutput "请手动下载并安装 Chrome: https://www.google.com/chrome/" "Yellow"
        return $false
    }
}

# 设置项目环境
function Initialize-Project {
    Write-ColorOutput "正在初始化项目环境..." "Cyan"

    # 检查是否在项目目录中
    if (!(Test-Path "package.json")) {
        Write-ColorOutput "错误: 未找到 package.json，请确保在项目根目录中运行此脚本" "Red"
        return $false
    }

    # 安装依赖
    Write-ColorOutput "正在安装项目依赖..." "Cyan"
    try {
        npm install
        Write-ColorOutput "✓ 项目依赖安装完成" "Green"
    }
    catch {
        Write-ColorOutput "✗ 项目依赖安装失败" "Red"
        return $false
    }

    # 创建 .env 文件
    if (!(Test-Path ".env")) {
        Write-ColorOutput "正在创建 .env 配置文件..." "Cyan"
        try {
            Copy-Item ".env.example" ".env" -ErrorAction SilentlyContinue
            Write-ColorOutput "✓ .env 文件创建完成" "Green"
        }
        catch {
            Write-ColorOutput "警告: 无法自动创建 .env 文件，请手动复制 .env.example 为 .env" "Yellow"
        }
    } else {
        Write-ColorOutput "✓ .env 文件已存在" "Green"
    }

    # 运行设置脚本
    Write-ColorOutput "正在运行项目设置脚本..." "Cyan"
    try {
        npm run setup
        Write-ColorOutput "✓ 项目设置完成" "Green"
    }
    catch {
        Write-ColorOutput "警告: 项目设置脚本执行失败，但可能不影响主要功能" "Yellow"
    }

    return $true
}

# 启动应用
function Start-Application {
    Write-ColorOutput "正在启动 CoinGlass 监控系统..." "Cyan"

    try {
        if ($DevMode) {
            Write-ColorOutput "以开发模式启动应用..." "Cyan"
            Start-Process -FilePath "npm" -ArgumentList "run", "dev" -NoNewWindow
        } else {
            Write-ColorOutput "以生产模式启动应用..." "Cyan"
            Start-Process -FilePath "npm" -ArgumentList "start" -NoNewWindow
        }

        # 等待服务器启动
        Start-Sleep -Seconds 5

        # 检查服务器是否正在运行
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:$Port/health" -UseBasicParsing -TimeoutSec 10
            if ($response.StatusCode -eq 200) {
                Write-ColorOutput "✓ 应用启动成功!" "Green"
                Write-ColorOutput "访问地址: http://localhost:$Port" "Cyan"
                Write-ColorOutput "健康检查: http://localhost:$Port/health" "Cyan"
            } else {
                Write-ColorOutput "⚠ 应用可能正在启动中，请稍后访问 http://localhost:$Port" "Yellow"
            }
        }
        catch {
            Write-ColorOutput "⚠ 应用正在启动中，请稍后访问 http://localhost:$Port" "Yellow"
        }

        return $true
    }
    catch {
        Write-ColorOutput "✗ 应用启动失败" "Red"
        return $false
    }
}

# 主执行流程
function Main {
    Write-ColorOutput "========================================" "Cyan"
    Write-ColorOutput "  CoinGlass 监控系统 Windows 一键部署" "Cyan"
    Write-ColorOutput "========================================" "Cyan"
    Write-Host ""

    # 检查管理员权限
    if (Test-Administrator) {
        Write-ColorOutput "✓ 以管理员权限运行" "Green"
    } else {
        Write-ColorOutput "警告: 未以管理员权限运行，某些功能可能受限" "Yellow"
    }

    # 检查网络连接
    if (!(Test-NetworkConnection)) {
        Write-ColorOutput "✗ 网络连接检查失败，请确保网络连接正常" "Red"
        exit 1
    }
    Write-ColorOutput "✓ 网络连接正常" "Green"

    # 环境检查
    Write-Host ""
    Write-ColorOutput "正在检查系统环境..." "Cyan"
    Write-Host ""

    if (!(Test-PowerShellVersion)) {
        exit 1
    }

    if (!(Install-NodeJS)) {
        exit 1
    }

    if (!(Install-Git)) {
        exit 1
    }

    if (!(Test-ChromeInstallation)) {
        exit 1
    }

    # 项目初始化
    Write-Host ""
    Write-ColorOutput "正在初始化项目..." "Cyan"
    Write-Host ""

    if (!(Initialize-Project)) {
        exit 1
    }

    # 启动应用
    Write-Host ""
    Write-ColorOutput "正在启动应用..." "Cyan"
    Write-Host ""

    if (!(Start-Application)) {
        exit 1
    }

    # 完成
    Write-Host ""
    Write-ColorOutput "========================================" "Green"
    Write-ColorOutput "           部署完成!" "Green"
    Write-ColorOutput "========================================" "Green"
    Write-Host ""
    Write-ColorOutput "应用信息:" "Cyan"
    Write-Host "  • 访问地址: http://localhost:$Port"
    Write-Host "  • 配置文件: .env"
    Write-Host "  • 数据目录: ./data/"
    Write-Host "  • 日志文件: ./server.log"
    Write-Host ""
    Write-ColorOutput "常用命令:" "Cyan"
    Write-Host "  • 停止应用: Ctrl+C"
    Write-Host "  • 开发模式: npm run dev"
    Write-Host "  • 手动监控: npm run monitor"
    Write-Host "  • 查看日志: Get-Content ./server.log -Wait"
    Write-Host ""
    Write-ColorOutput "注意事项:" "Yellow"
    Write-Host "  • 首次使用请配置 .env 文件中的 EmailJS 参数"
    Write-Host "  • 请确保防火墙允许端口 $Port 的访问"
    Write-Host "  • 如需修改端口，请编辑 .env 文件中的 PORT 配置"
    Write-Host ""
}

# 执行主函数
try {
    Main
}
catch {
    Write-ColorOutput "部署过程中发生错误: $_" "Red"
    exit 1
}