@echo off
echo ====================================
echo CoinGlass 监控系统 - Windows 启动脚本
echo ====================================

REM 获取脚本所在目录并切换到项目目录
set SCRIPT_DIR=%~dp0
set PROJECT_DIR=%SCRIPT_DIR%..

REM 切换到项目目录
cd /d "%PROJECT_DIR%" || (
    echo ❌ 错误: 无法切换到项目目录 %PROJECT_DIR%
    pause
    exit /b 1
)

echo 📁 项目目录: %PROJECT_DIR%

REM 检查 package.json 是否存在
if not exist "package.json" (
    echo ❌ 错误: 未找到 package.json 文件
    echo 请确保在正确的项目目录中运行此脚本
    pause
    exit /b 1
)

REM 检查 Node.js 是否安装
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 错误: 未找到 Node.js
    echo 请先安装 Node.js: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js 已安装

REM 设置环境变量
set NODE_ENV=production
set DATA_DIR=./data
set LOGS_DIR=./logs

REM 复制 Windows 环境配置
if exist .env.windows (
    copy .env.windows .env >nul
    echo ✅ Windows 环境配置已加载
) else (
    echo ⚠️  警告: .env.windows 文件不存在，使用默认配置
    echo 💡 提示: 运行 'node scripts\setup-windows.js' 来创建配置文件
)

REM 创建必要的目录
if not exist "data" mkdir data
if not exist "logs" mkdir logs
if not exist "data\email-history" mkdir data\email-history
if not exist "data\scrape-history" mkdir data\scrape-history
if not exist "data\backups" mkdir data\backups

REM 检查依赖是否安装
if not exist "node_modules" (
    echo 📦 正在安装依赖...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ 依赖安装失败
        echo 💡 提示: 请检查网络连接或尝试清除 npm 缓存
        pause
        exit /b 1
    )
    echo ✅ 依赖安装完成
)

REM 启动服务
echo 🚀 启动 CoinGlass 监控系统...
echo.
echo 服务将在以下地址启动:
echo - 前端界面: http://localhost:3001
echo - API接口: http://localhost:3001/api
echo - 健康检查: http://localhost:3001/health
echo.
echo 按 Ctrl+C 停止服务
echo.

npm start

pause