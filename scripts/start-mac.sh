#!/bin/bash

echo "===================================="
echo "CoinGlass 监控系统 - Mac 启动脚本"
echo "===================================="

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 切换到项目目录
cd "$PROJECT_DIR" || {
    echo "❌ 错误: 无法切换到项目目录 $PROJECT_DIR"
    exit 1
}

echo "📁 项目目录: $PROJECT_DIR"

# 检查 package.json 是否存在
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 未找到 package.json 文件"
    echo "请确保在正确的项目目录中运行此脚本"
    exit 1
fi

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js"
    echo "请先安装 Node.js: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js 已安装: $(node --version)"

# 设置环境变量
export NODE_ENV=production
export DATA_DIR=./data
export LOGS_DIR=./logs

# 复制 Mac 环境配置
if [ -f ".env.mac" ]; then
    cp .env.mac .env
    echo "✅ Mac 环境配置已加载"
else
    echo "⚠️  警告: .env.mac 文件不存在，使用默认配置"
    echo "💡 提示: 运行 'node scripts/setup-mac.js' 来创建配置文件"
fi

# 创建必要的目录
mkdir -p data logs data/email-history data/scrape-history data/backups

# 检查依赖是否安装
if [ ! -d "node_modules" ]; then
    echo "📦 正在安装依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败"
        echo "💡 提示: 请检查网络连接或尝试清除 npm 缓存"
        exit 1
    fi
    echo "✅ 依赖安装完成"
fi

# 启动服务
echo "🚀 启动 CoinGlass 监控系统..."
echo ""
echo "服务将在以下地址启动:"
echo "- 前端界面: http://localhost:3001"
echo "- API接口: http://localhost:3001/api"
echo "- 健康检查: http://localhost:3001/health"
echo ""
echo ""

npm start