#!/bin/bash

# 带环境变量的部署脚本

set -e

echo "🚀 开始部署 CoinGlass 监控..."

# 检查环境变量文件
if [ ! -f ".env" ]; then
    echo "❌ 错误: .env 文件不存在"
    echo "请先复制 .env.example 为 .env 并填入配置信息"
    exit 1
fi

# 加载环境变量
echo "📋 加载环境变量..."
export $(grep -v '^#' .env | xargs)

# 验证必要的环境变量
if [ -z "$EMAILJS_PUBLIC_KEY" ]; then
    echo "❌ 错误: EMAILJS_PUBLIC_KEY 未设置"
    exit 1
fi

if [ -z "$EMAILJS_SERVICE_ID" ]; then
    echo "❌ 错误: EMAILJS_SERVICE_ID 未设置"
    exit 1
fi

if [ -z "$EMAILJS_TEMPLATE_ID" ]; then
    echo "❌ 错误: EMAILJS_TEMPLATE_ID 未设置"
    exit 1
fi

# 设置 Cloudflare 环境变量
echo "🔧 设置 Cloudflare 环境变量..."
wrangler secret put EMAILJS_PUBLIC_KEY
wrangler secret put EMAILJS_SERVICE_ID
wrangler secret put EMAILJS_TEMPLATE_ID

# 安装依赖
echo "📦 安装依赖..."
npm install

# 部署
echo "🌐 部署到 Cloudflare..."
wrangler deploy

echo "✅ 部署完成！"
echo "📱 访问: https://$(wrangler whoami | grep 'Account Name' | awk '{print $3}').workers.dev"