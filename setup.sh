#!/bin/bash

# CoinGlass Monitor - 环境设置脚本
# 自动创建KV命名空间并更新配置

set -e

echo "🚀 开始设置 CoinGlass Monitor 环境..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否安装了 wrangler
if ! command -v wrangler &> /dev/null && ! command -v npx wrangler &> /dev/null; then
    echo -e "${RED}❌ Wrangler CLI 未安装，请先安装: npm install -g wrangler${NC}"
    exit 1
fi

# 设置 wrangler 命令
if command -v wrangler &> /dev/null; then
    WRANGLER_CMD="wrangler"
else
    WRANGLER_CMD="npx wrangler"
fi

echo -e "${GREEN}✅ Wrangler CLI 已安装${NC}"

# 创建生产环境KV命名空间
echo "📦 创建生产环境KV命名空间..."
echo "1. 创建配置存储KV..."
CONFIG_KV_OUTPUT=$($WRANGLER_CMD kv:namespace create "CONFIG_KV" --preview 2>&1)
CONFIG_KV_ID=$(echo "$CONFIG_KV_OUTPUT" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)

if [ -z "$CONFIG_KV_ID" ]; then
    echo -e "${RED}❌ 创建CONFIG_KV失败${NC}"
    echo "$CONFIG_KV_OUTPUT"
    exit 1
fi

echo -e "${GREEN}✅ CONFIG_KV ID: $CONFIG_KV_ID${NC}"

echo "2. 创建状态存储KV..."
STATE_KV_OUTPUT=$($WRANGLER_CMD kv:namespace create "STATE_KV" --preview 2>&1)
STATE_KV_ID=$(echo "$STATE_KV_OUTPUT" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)

if [ -z "$STATE_KV_ID" ]; then
    echo -e "${RED}❌ 创建STATE_KV失败${NC}"
    echo "$STATE_KV_OUTPUT"
    exit 1
fi

echo -e "${GREEN}✅ STATE_KV ID: $STATE_KV_ID${NC}"

# 创建开发环境KV命名空间
echo "📦 创建开发环境KV命名空间..."
echo "3. 创建开发环境配置KV..."
DEV_CONFIG_KV_OUTPUT=$($WRANGLER_CMD kv:namespace create "CONFIG_KV" --preview 2>&1)
DEV_CONFIG_KV_ID=$(echo "$DEV_CONFIG_KV_OUTPUT" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)

echo "4. 创建开发环境状态KV..."
DEV_STATE_KV_OUTPUT=$($WRANGLER_CMD kv:namespace create "STATE_KV" --preview 2>&1)
DEV_STATE_KV_ID=$(echo "$DEV_STATE_KV_OUTPUT" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)

# 更新wrangler.toml配置
echo "⚙️ 更新wrangler.toml配置..."
sed -i.bak "s/your-config-namespace-id/$CONFIG_KV_ID/g" wrangler.toml
sed -i.bak "s/your-state-namespace-id/$STATE_KV_ID/g" wrangler.toml
sed -i.bak "s/dev-config-namespace-id/$DEV_CONFIG_KV_ID/g" wrangler.toml
sed -i.bak "s/dev-state-namespace-id/$DEV_STATE_KV_ID/g" wrangler.toml

echo -e "${GREEN}✅ wrangler.toml 配置已更新${NC}"

# 初始化默认配置
echo "📋 初始化默认配置..."
$WRANGLER_CMD kv:key put "user_settings" "$(cat default-config.json)" --namespace-id="$CONFIG_KV_ID"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 默认配置已初始化${NC}"
else
    echo -e "${YELLOW}⚠️ 配置初始化失败，请手动运行: $WRANGLER_CMD kv:key put \"user_settings\" \"\$(cat default-config.json)\" --namespace-id=\"$CONFIG_KV_ID\"${NC}"
fi

# 创建预览环境配置
echo "📋 创建预览环境配置..."
PREVIEW_CONFIG_KV_OUTPUT=$($WRANGLER_CMD kv:namespace create "CONFIG_KV" --preview 2>&1)
PREVIEW_CONFIG_KV_ID=$(echo "$PREVIEW_CONFIG_KV_OUTPUT" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)

PREVIEW_STATE_KV_OUTPUT=$($WRANGLER_CMD kv:namespace create "STATE_KV" --preview 2>&1)
PREVIEW_STATE_KV_ID=$(echo "$PREVIEW_STATE_KV_OUTPUT" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)

# 更新预览环境配置
sed -i.bak "s/preview-config-namespace-id/$PREVIEW_CONFIG_KV_ID/g" wrangler.toml
sed -i.bak "s/preview-state-namespace-id/$PREVIEW_STATE_KV_ID/g" wrangler.toml

echo -e "${GREEN}✅ 预览环境配置已更新${NC}"

# 清理备份文件
rm -f wrangler.toml.bak

echo ""
echo -e "${GREEN}🎉 环境设置完成！${NC}"
echo ""
echo "📝 接下来的步骤:"
echo "1. 测试本地开发: npm run dev"
echo "2. 部署到Cloudflare: npm run deploy"
echo "3. 查看日志: npm run tail"
echo ""
echo "💡 提示: 请确保已登录Cloudflare账户: wrangler auth login"