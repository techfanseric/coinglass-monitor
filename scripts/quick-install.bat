@echo off
setlocal enabledelayedexpansion

REM CoinGlass 监控系统 - Windows 快速安装程序
REM 这个批处理文件会自动处理PowerShell执行策略问题

title CoinGlass 监控系统 - 快速安装

echo.
echo ========================================
echo   CoinGlass 监控系统 - Windows 快速安装
echo ========================================
echo.

REM 检查管理员权限
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [√] 检测到管理员权限
) else (
    echo [!] 警告: 未检测到管理员权限，某些功能可能受限
    echo.
)

REM 检查网络连接
echo [1/6] 检查网络连接...
ping -n 1 google.com >nul 2>&1
if %errorLevel% == 0 (
    echo [√] 网络连接正常
) else (
    echo [×] 网络连接失败，请检查网络设置
    pause
    exit /b 1
)

REM 检查PowerShell
echo [2/6] 检查PowerShell...
powershell -Command "Get-Host" >nul 2>&1
if %errorLevel% == 0 (
    echo [√] PowerShell 可用
) else (
    echo [×] PowerShell 不可用
    pause
    exit /b 1
)

REM 创建临时目录
set TEMP_DIR=%TEMP%\coinglass-install
if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"

REM 下载部署脚本
echo [3/6] 下载部署脚本...
powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/techfanseric/coinglass-monitor/main/scripts/deploy-windows.ps1' -OutFile '%TEMP_DIR%\deploy.ps1' -UseBasicParsing"

if %errorLevel% neq 0 (
    echo [×] 下载部署脚本失败
    echo.
    echo 可能的原因:
    echo   • 网络连接问题
    echo   • GitHub 访问受限
    echo   • 防火墙阻止
    echo.
    echo 请手动访问以下链接下载脚本:
    echo https://raw.githubusercontent.com/techfanseric/coinglass-monitor/main/scripts/deploy-windows.ps1
    pause
    exit /b 1
)

echo [√] 部署脚本下载完成

REM 解除文件阻止标记
echo [4/6] 解除安全标记...
powershell -Command "Unblock-File -Path '%TEMP_DIR%\deploy.ps1'" 2>nul

REM 使用PowerShell执行部署脚本（自动处理执行策略）
echo [5/6] 启动部署程序...
echo.

REM 构建PowerShell命令，自动处理执行策略
set PS_COMMAND=powershell -ExecutionPolicy Bypass -File "%TEMP_DIR%\deploy.ps1"

REM 如果有额外参数，传递给PowerShell脚本
if not "%~1"=="" (
    set PS_COMMAND=%PS_COMMAND% %*
)

echo 正在执行: %PS_COMMAND%
echo.

REM 执行PowerShell脚本
%PS_COMMAND%

REM 检查执行结果
if %errorLevel% == 0 (
    echo.
    echo [√] 部署完成！
    echo.
    echo 应用信息:
    echo   • 访问地址: http://localhost:3000
    echo   • 配置文件: .env
    echo   • 数据目录: ./data/
    echo.
) else (
    echo.
    echo [×] 部署过程中出现错误
    echo 错误代码: %errorLevel%
    echo.
    echo 故障排除建议:
    echo   1. 确保网络连接正常
    echo   2. 检查防火墙设置
    echo   3. 临时关闭杀毒软件重试
    echo   4. 以管理员身份运行此脚本
    echo.
)

REM 清理临时文件
echo [6/6] 清理临时文件...
if exist "%TEMP_DIR%\deploy.ps1" del "%TEMP_DIR%\deploy.ps1"
if exist "%TEMP_DIR%" rmdir "%TEMP_DIR%" 2>nul

echo.
echo 按任意键退出...
pause >nul