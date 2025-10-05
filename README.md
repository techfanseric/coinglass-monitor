# CoinGlass 利率监控提醒系统

基于 Cloudflare Workers 和 EmailJS 的币种借贷利率自动化监控系统。

## 功能特性

- 🚀 **自动监控**: 定时抓取 CoinGlass 利率数据
- 📧 **智能通知**: Hysteresis 通知机制，避免垃圾邮件
- ⚙️ **灵活配置**: 支持多币种、独立阈值设置
- 📊 **历史数据**: 邮件包含最近5次利率趋势
- 💰 **低成本**: 基于 Cloudflare 免费额度

## 快速开始

### 1. 环境准备

```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 安装项目依赖
npm install
```

### 2. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入你的配置
nano .env
```

### 3. 创建 KV 命名空间

```bash
# 创建配置存储命名空间
wrangler kv:namespace create "CONFIG_KV"
wrangler kv:namespace create "CONFIG_KV" --preview

# 创建状态存储命名空间
wrangler kv:namespace create "STATE_KV"
wrangler kv:namespace create "STATE_KV" --preview

# 更新 wrangler.toml 中的 ID
```

### 4. 部署

```bash
# 开发环境测试
npm run dev

# 部署到生产环境
npm run deploy
```

## 配置说明

### 用户配置结构

```json
{
  "email": "your-email@example.com",
  "exchange": "binance",
  "coins": [
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
  "monitoring_enabled": true
}
```

### API 接口

- `GET /api/config` - 获取用户配置
- `POST /api/config` - 保存用户配置
- `GET /api/status` - 获取币种监控状态
- `GET /api/history` - 获取邮件发送历史

## 监控逻辑

### Hysteresis 通知机制

1. **首次触发**: 利率 > 阈值 → 立即通知
2. **持续超阈值**: 每3/6小时重复通知
3. **回落通知**: 利率 ≤ 阈值 → 立即通知

### 状态流转

```
NORMAL → ALERT → COOLDOWN → ALERT → ...
    ↓                              ↓
    └───────────── NORMAL ←────────┘
```

## 项目结构

```
coinglass-monitor/
├── src/
│   ├── index.js          # Worker 主程序和路由
│   ├── modules/          # 核心业务模块
│   │   ├── monitor.js    # 监控逻辑和阈值检查
│   │   ├── scraper.js    # CoinGlass 数据抓取
│   │   └── email.js      # EmailJS 邮件发送
│   └── utils/            # 工具模块
│       ├── config.js     # KV 存储操作
│       └── parser.js     # HTML 解析工具
├── tests/                # 测试文件
│   ├── unit/            # 单元测试
│   ├── integration/     # 集成测试
│   ├── fixtures/        # 测试数据
│   └── setup.js         # 测试环境配置
├── wrangler.toml         # Cloudflare 配置
├── vitest.config.js      # 测试配置
├── package.json          # 项目依赖
├── send-test-email.js    # 邮件发送测试脚本
├── email-template.html   # 邮件模板
└── README.md             # 项目说明
```

## 开发指南

### 本地开发

```bash
# 启动本地开发服务器
npm run dev

# 查看实时日志
npm run tail

# 运行测试
npm test
npm run test:coverage
npm run test:watch

# KV 操作
npm run kv:list
npm run kv:get user_settings
npm run kv:put user_settings '{"test": "data"}'

# 邮件发送测试
node send-test-email.js
```

### 部署命令

```bash
# 开发环境
npm run deploy:dev

# 预览环境
npm run deploy:preview

# 生产环境
npm run deploy
```

## 监控和调试

### 查看日志

```bash
# 实时查看 Worker 日志
wrangler tail

# 查看特定时间的日志
wrangler tail --since=1h
```

### 测试邮件发送

```bash
# 运行邮件发送测试脚本
node send-test-email.js

# 或访问本地开发服务器
http://localhost:58477
```

## 成本分析

- **Cloudflare Workers**: 免费 (100,000 请求/天)
- **Cloudflare KV**: 免费 (100,000 读取/天, 1,000 写入/天)
- **EmailJS**: 免费 200份/月 或 $9/月 无限制

**总计**: $0-9/月

## 故障排除

### 常见问题

1. **数据抓取失败**: 检查 CoinGlass 网站可访问性
2. **邮件发送失败**: 验证 EmailJS 配置和配额
3. **定时任务不执行**: 确认 Cron 表达式配置

### 调试步骤

1. 查看 Worker 日志: `wrangler tail`
2. 检查 KV 数据: `wrangler kv:key list`
3. 测试 API 接口: `curl https://your-worker.workers.dev/api/status`

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 发起 Pull Request

## 许可证

MIT License

## 支持

如有问题，请提交 Issue 或联系开发者。