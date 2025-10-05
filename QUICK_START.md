# 🚀 快速开始指南

## 一键自动化部署

### Mac/Linux 用户
```bash
# 进入项目目录
cd /Users/ericyim/coinglass-monitor

# 给脚本执行权限
chmod +x deploy-with-env.sh

# 运行自动化部署脚本
./deploy-with-env.sh
```


## 📋 脚本会自动完成

1. ✅ **检查环境** - Node.js 和 Wrangler CLI
2. ✅ **登录验证** - Cloudflare 账号登录
3. ✅ **创建 KV** - 自动创建4个 KV 命名空间
4. ✅ **更新配置** - 自动更新 wrangler.toml
5. ✅ **安装依赖** - npm install
6. ✅ **部署 Worker** - 自动部署到 Cloudflare
7. ✅ **添加配置** - 自动添加默认配置
8. ✅ **测试验证** - 验证部署是否成功

## 🔧 前置要求

1. **Node.js** (必需)
   - 下载地址: https://nodejs.org/
   - 版本要求: >= 16.0.0

2. **Cloudflare 账号** (必需)
   - 免费账号即可
   - 访问: https://dash.cloudflare.com

## 🎯 部署完成后

### 修改配置
```bash
# 方法1: 使用 API
curl -X POST -H "Content-Type: application/json" \
  -d '{"email":"your-email@example.com"}' \
  https://coinglass-monitor.你的子域名.workers.dev/api/config

# 方法2: 使用 Wrangler CLI
wrangler kv:key get "user_settings" --namespace-id="你的CONFIG_KV_ID"
# 编辑后重新上传
wrangler kv:key put "user_settings" "新配置" --namespace-id="你的CONFIG_KV_ID"
```

### 配置邮件通知（可选）
```bash
# 1. 访问 https://www.emailjs.com/ 注册账号
# 2. 创建邮件服务和模板
# 3. 复制 .env.example 为 .env 并填入你的配置
cp .env.example .env
# 编辑 .env 文件，填入你的 EmailJS 配置信息

# 4. 设置 Private Key (重要！)
wrangler secret put EMAILJS_PRIVATE_KEY
# 当提示时，输入你的 EmailJS Private Key

# 5. 重新部署
./deploy-with-env.sh
```

### 查看日志
```bash
# 实时查看 Worker 日志
wrangler tail
```

### 手动测试
```bash
# 运行邮件发送测试
node send-test-email.js

# 或启动开发服务器
npm run dev
```

## 📊 监控功能

- ✅ **自动监控**: 每小时检查一次
- ✅ **智能通知**: 支持时间段限制
- ✅ **多币种**: 支持多个币种独立监控
- ✅ **Hysteresis**: 避免垃圾邮件
- ✅ **API 接口**: 完整的配置和状态管理

## 🔍 故障排除

### 常见问题

1. **Node.js 未安装**
   ```bash
   # Mac/Linux
   # Mac: brew install node
   # Linux: sudo apt-get install nodejs npm  # Ubuntu/Debian
   # 或访问 https://nodejs.org/ 下载安装
   ```

2. **Wrangler 登录失败**
   ```bash
   wrangler auth login
   ```

3. **权限不足**
   - 确保你的 Cloudflare 账号有 Workers 权限
   - 免费账号包含 Workers 权限

4. **部署失败**
   ```bash
   # 检查语法
   wrangler dev

   # 重新部署
   wrangler deploy
   ```

## 📞 需要帮助？

如果遇到任何问题，请：

1. **查看日志**: `wrangler tail`
2. **检查配置**: 确保 wrangler.toml 正确
3. **重新部署**: `wrangler deploy`
4. **联系支持**: 提供错误信息

---

**🎉 恭喜！你的利率监控系统已经启动了！**