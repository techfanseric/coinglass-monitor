# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。

## 项目概述

这是一个基于 Cloudflare Workers 和 EmailJS 通知的 CoinGlass 利率监控系统。它监控加密货币借贷利率并在超过阈值时发送警报。

## 架构

### 核心结构
- **src/index.js** - 主要 Worker 入口点，包含路由和定时任务处理
- **src/modules/** - 核心业务逻辑模块：
  - `monitor.js` - 主要监控逻辑和阈值检查
  - `scraper.js` - CoinGlass 数据抓取和解析
  - `email.js` - EmailJS 集成用于通知
- **src/utils/** - 工具模块：
  - `config.js` - KV 存储操作和配置管理
  - `parser.js` - HTML 解析工具
- **src/web/** - Web 界面：
  - `index.html` - 主要 HTML 模板，包含嵌入式样式
  - `app.js` - 监控界面的前端 JavaScript

### 关键组件
- **Hysteresis 通知系统**：通过智能冷却期防止垃圾邮件
- **两栏界面**：左侧栏用于监控管理，右侧栏用于通知设置
- **动态 KV 存储**：使用两个 KV 命名空间（CONFIG_KV 用于用户设置，STATE_KV 用于监控状态）
- **多交易所支持**：可配置支持 Binance、OKX、Bybit 交易所

## 开发命令

### 本地开发
```bash
npm run dev          # 启动本地开发服务器
npm run tail         # 查看实时 Worker 日志
wrangler tail        # 查看日志的替代方法
```

### 部署
```bash
npm run deploy           # 部署到生产环境
npm run deploy:dev       # 部署到开发环境
npm run deploy:preview    # 部署到预览环境
./deploy-with-env.sh     # 使用环境变量部署
```

### KV 管理
```bash
wrangler kv:namespace create "CONFIG_KV"      # 创建配置命名空间
wrangler kv:namespace create "STATE_KV"       # 创建状态命名空间
wrangler kv:key list --namespace-id=<id>      # 列出 KV 键
wrangler kv:key get "user_settings" --namespace-id=<CONFIG_KV_ID>
wrangler kv:key put "user_settings" '{"test": "data"}' --namespace-id=<CONFIG_KV_ID>
```

## 重要实现细节

### 环境变量
项目使用环境变量处理敏感配置：
- 复制 `.env.example` 为 `.env` 并填入你的 EmailJS 凭证信息
- 使用 `wrangler secret put` 为生产环境设置密钥（EMAILJS_PRIVATE_KEY、EMAILJS_PUBLIC_KEY 等）
- 绝不将实际的 API 密钥提交到代码库

### 数据流程
1. **定时任务**：通过 cron 触发器每小时运行
2. **配置检索**：从 CONFIG_KV 获取用户设置
3. **数据抓取**：根据配置的筛选器（交易所、币种、时间范围）抓取 CoinGlass 数据
4. **阈值检查**：将当前利率与用户定义的阈值进行比较
5. **状态管理**：在 STATE_KV 中跟踪监控状态以实现 hysteresis
6. **通知**：当触发阈值时通过 EmailJS 发送邮件

### 通知逻辑
- **首次触发**：利率 > 阈值 → 立即通知
- **持续警报**：每 3-6 小时重复通知
- **恢复通知**：利率 ≤ 阈值 → 立即恢复通知
- **时间控制**：可选的通知时间窗口

### Web 界面功能
- **添加监控**：创建新监控规则的单行表单
- **监控列表**：显示活跃的监控项目，支持开关和删除功能
- **通知设置**：邮箱配置和时间控制
- **实时状态**：显示当前状态和最新利率数据

## 配置结构

存储在 KV 中的用户配置：
```json
{
  "email": "user@example.com",
  "monitoring_enabled": true,
  "filters": {
    "exchange": "binance",
    "coin": "USDT",
    "timeframe": "1h"
  },
  "coins": [
    {
      "symbol": "USDT",
      "exchange": "binance",
      "timeframe": "1h",
      "threshold": 5.0,
      "enabled": true
    }
  ],
  "notification_hours": {
    "enabled": true,
    "start": "09:00",
    "end": "24:00"
  },
  "repeat_interval": 3
}
```

## API 端点
- `GET /api/config` - 获取用户配置
- `POST /api/config` - 保存用户配置
- `GET /api/status` - 获取当前监控状态
- `GET /api/history` - 获取邮件历史

## 部署说明

### KV 命名空间设置
项目需要在 `wrangler.toml` 中创建和配置两个 KV 命名空间：
- **CONFIG_KV**：存储用户配置和设置
- **STATE_KV**：存储监控状态和通知历史

### EmailJS 集成
- 配置 EmailJS 服务和模板
- 设置公钥/私钥认证
- 模板变量包括当前利率、阈值、历史数据和所有币种状态

### 监控计划
- 默认：每小时在 0 分钟运行一次 (0 * * * *)
- 可在 `wrangler.toml` 的 `[triggers]` 部分修改