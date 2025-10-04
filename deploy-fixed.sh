#!/bin/bash

# CoinGlass 监控系统自动化部署脚本 (修复版)
# 使用方法: ./deploy-fixed.sh

set -e  # 遇到错误立即退出

echo "🚀 CoinGlass 利率监控系统自动化部署"
echo "===================================="

# 使用 npx 来运行 wrangler，避免 PATH 问题
WRANGLER_CMD="npx wrangler"

# 检查是否已登录
echo "🔐 检查 Cloudflare 登录状态..."
if ! $WRANGLER_CMD whoami &> /dev/null; then
    echo "📱 需要登录 Cloudflare:"
    echo "1. 正在打开登录页面..."
    $WRANGLER_CMD login
    echo "✅ 登录完成"
else
    echo "✅ 已登录 Cloudflare"
fi

# 获取账号信息
echo "📋 获取账号信息..."
ACCOUNT_INFO=$($WRANGLER_CMD whoami)
echo "账号信息: $ACCOUNT_INFO"

# 创建 KV 命名空间
echo "🗄️  创建 KV 命名空间..."

# 创建生产环境 KV
echo "创建 CONFIG_KV (生产环境)..."
CONFIG_KV_RESULT=$($WRANGLER_CMD kv:namespace create "CONFIG_KV")
CONFIG_KV_ID=$(echo "$CONFIG_KV_RESULT" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "CONFIG_KV ID: $CONFIG_KV_ID"

echo "创建 STATE_KV (生产环境)..."
STATE_KV_RESULT=$($WRANGLER_CMD kv:namespace create "STATE_KV")
STATE_KV_ID=$(echo "$STATE_KV_RESULT" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "STATE_KV ID: $STATE_KV_ID"

# 创建预览环境 KV
echo "创建 CONFIG_KV (预览环境)..."
CONFIG_KV_PREVIEW_RESULT=$($WRANGLER_CMD kv:namespace create "CONFIG_KV" --preview)
CONFIG_KV_PREVIEW_ID=$(echo "$CONFIG_KV_PREVIEW_RESULT" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "CONFIG_KV Preview ID: $CONFIG_KV_PREVIEW_ID"

echo "创建 STATE_KV (预览环境)..."
STATE_KV_PREVIEW_RESULT=$($WRANGLER_CMD kv:namespace create "STATE_KV" --preview)
STATE_KV_PREVIEW_ID=$(echo "$STATE_KV_PREVIEW_RESULT" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "STATE_KV Preview ID: $STATE_KV_PREVIEW_ID"

# 更新 wrangler.toml
echo "📝 更新配置文件..."
sed -i.bak "s/your-config-namespace-id/$CONFIG_KV_ID/g" wrangler.toml
sed -i.bak "s/your-state-namespace-id/$STATE_KV_ID/g" wrangler.toml
sed -i.bak "s/dev-config-namespace-id/$CONFIG_KV_PREVIEW_ID/g" wrangler.toml
sed -i.bak "s/dev-state-namespace-id/$STATE_KV_PREVIEW_ID/g" wrangler.toml
sed -i.bak "s/preview-config-namespace-id/$CONFIG_KV_PREVIEW_ID/g" wrangler.toml
sed -i.bak "s/preview-state-namespace-id/$STATE_KV_PREVIEW_ID/g" wrangler.toml

# 安装依赖
echo "📦 安装项目依赖..."
npm install

# 部署 Worker
echo "🚀 部署 Worker..."
$WRANGLER_CMD deploy

# 等待部署完成
echo "⏳ 等待部署完成..."
sleep 5

# 添加默认配置
echo "⚙️  添加默认配置..."
DEFAULT_CONFIG='{
  "email": "your-email@example.com",
  "exchange": "binance",
  "coins": [
    {
      "symbol": "USDT",
      "threshold": 8.0,
      "enabled": true
    },
    {
      "symbol": "CFX",
      "threshold": 5.0,
      "enabled": true
    },
    {
      "symbol": "IOST",
      "threshold": 6.0,
      "enabled": true
    }
  ],
  "repeat_interval": 3,
  "notification_hours": {
    "start": "09:00",
    "end": "24:00",
    "enabled": true
  },
  "monitoring_enabled": true
}'

$WRANGLER_CMD kv:key put "user_settings" "$DEFAULT_CONFIG" --namespace-id="$CONFIG_KV_ID"

# 创建前端配置文件
echo "🌐 创建前端配置..."
cat > frontend-config.json << EOF
{
  "api_url": "https://coinglass-monitor.your-subdomain.workers.dev",
  "kv_config_id": "$CONFIG_KV_ID",
  "kv_state_id": "$STATE_KV_ID",
  "account_id": "acaba0e593f76d3a1962b9169dfc51fc"
}
EOF

echo ""
echo "🎉 部署完成！"
echo "===================================="
echo "📋 部署信息:"
echo "✅ Worker 已部署"
echo "✅ KV 命名空间已创建"
echo "✅ 默认配置已添加"
echo "✅ 定时任务已设置 (每小时执行)"
echo ""
echo "🔑 重要信息:"
echo "CONFIG_KV_ID: $CONFIG_KV_ID"
echo "STATE_KV_ID: $STATE_KV_ID"
echo ""
echo "🌐 API 端点:"
echo "状态查询: https://coinglass-monitor.你的子域名.workers.dev/api/status"
echo "配置管理: https://coinglass-monitor.你的子域名.workers.dev/api/config"
echo ""
echo "📚 使用命令:"
echo "查看日志: npx wrangler tail"
echo "测试API: curl https://coinglass-monitor.你的子域名.workers.dev/api/status"
echo ""
echo "⚙️  下一步:"
echo "1. 修改默认配置中的邮箱地址"
echo "2. 根据需要调整币种和阈值"
echo "3. 配置 EmailJS (如果需要邮件通知)"
echo ""
echo "🎯 监控系统已启动，每小时自动检查一次！"