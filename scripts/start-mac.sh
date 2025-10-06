#!/bin/bash

echo "===================================="
echo "CoinGlass 监控系统启动"
echo "===================================="

# 参数处理
DISABLE_AUTO_UPDATE=false
PORT=""
DEV_MODE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --disable-auto-update)
            DISABLE_AUTO_UPDATE=true
            shift
            ;;
        --dev)
            DEV_MODE=true
            shift
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        *)
            echo "❌ 未知参数: $1"
            echo "支持的参数: --dev, --disable-auto-update, --port <端口号>"
            exit 1
            ;;
    esac
done

echo "🌐 端口: $PORT"
if [ "$DEV_MODE" = true ]; then
    echo "🔧 开发模式: 启用"
    echo "⚠️  自动更新: 禁用（开发模式，代码安全）"
elif [ "$DISABLE_AUTO_UPDATE" = false ]; then
    echo "🚀 生产模式: 启用"
    echo "🔄 自动更新: 启用（自动保持最新）"
else
    echo "🚀 生产模式: 启用"
    echo "⚠️  自动更新: 禁用（用户指定）"
fi
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 切换到项目目录
cd "$PROJECT_DIR" || {
    echo "❌ 错误: 无法切换到项目目录"
    exit 1
}

# 基础检查
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 未找到 package.json"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "❌ 错误: 请先安装 Node.js"
    exit 1
fi

echo "✅ Node.js: $(node --version)"

# 读取 .env 文件中的端口配置
get_env_port() {
    local env_file=".env"
    local env_example=".env.example"

    # 优先使用 .env 文件，其次使用 .env.example
    local file_to_read=""
    if [ -f "$env_file" ]; then
        file_to_read="$env_file"
    elif [ -f "$env_example" ]; then
        file_to_read="$env_example"
    fi

    if [ -n "$file_to_read" ]; then
        local port=$(grep "^PORT=" "$file_to_read" | cut -d'=' -f2 | tr -d ' ')
        if [ -n "$port" ]; then
            echo "$port"
            return
        fi
    fi

    # 如果都没有找到，报错并退出
    echo "❌ 错误: 未找到 PORT 配置" >&2
    echo "请确保 .env 文件中包含 PORT 配置" >&2
    exit 1
}

# 环境准备
export NODE_ENV=production

# 确定端口号：命令行参数 > .env > .env.example > 默认值
if [ -z "$PORT" ]; then
    PORT=$(get_env_port)
    echo "🔧 从 .env 文件读取端口配置: $PORT"
fi

export PORT=$PORT

# 复制环境文件
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ .env 文件已创建"
    fi
else
    echo "✅ .env 文件已存在"
fi

# 创建必要目录
mkdir -p data logs data/email-history data/scrape-history data/backups
echo "✅ 目录结构准备完成"

# 安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install || {
        echo "❌ 依赖安装失败"
        exit 1
    }
    echo "✅ 依赖安装完成"
else
    echo "✅ 依赖已安装"
fi

# 设置环境变量
if [ "$DEV_MODE" = true ]; then
    export NODE_ENV=development
    echo "🔧 开发模式（无自动更新）"
else
    export NODE_ENV=production
    if [ "$DISABLE_AUTO_UPDATE" = false ]; then
        export ENABLE_AUTO_UPDATE=true
        echo "🚀 生产模式（自动更新已启用）"
    else
        echo "🚀 生产模式（自动更新已禁用）"
    fi
fi

export PORT=$PORT

# 启动服务
echo "🚀 启动应用服务..."
echo ""

if [ "$DEV_MODE" = true ]; then
    npm run dev
else
    npm start
fi