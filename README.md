# CoinGlass 利率监控提醒系统

基于本地 Express 服务器和 EmailJS 的币种借贷利率自动化监控系统。

## 功能特性

- 🚀 **自动监控**: 定时抓取 CoinGlass 利率数据，支持反爬虫策略
- 📧 **智能通知**: Hysteresis 通知机制，避免垃圾邮件，支持延迟通知
- ⚙️ **灵活配置**: 支持多币种、独立阈值设置、自定义触发时间
- 📊 **历史数据**: 完整的历史数据记录和趋势分析
- 💻 **本地部署**: 支持 Windows、macOS 和 Linux 本地运行
- 🔄 **实时监控**: 本地服务器提供实时状态监控界面和 Web 管理后台
- 📁 **本地存储**: 基于文件系统的数据存储，支持历史数据记录
- 🔍 **调试支持**: 完整的日志系统和调试截图功能
- ⏰ **时间控制**: 支持通知时间段设置和智能延迟发送

## 快速开始

### 🚀 一键启动（推荐）

```bash
# 进入项目目录
cd /path/to/coinglass-monitor

# 安装依赖并启动服务
npm install && npm run setup && npm start
```

### 平台特定快速启动

**Mac 用户：**
```bash
cd /Users/ericyim/coinglass-monitor
npm run setup && npm start
```

**Windows 用户：**
```cmd
cd C:\path\to\coinglass-monitor
npm run setup && npm start
```

### 1. 环境准备

```bash
# 检查 Node.js 版本 (需要 >= 18.0.0)
node --version

# 安装项目依赖
npm install
```

### 2. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 运行自动配置脚本（检测 Chrome 路径等）
npm run setup

# 编辑 .env 文件，配置 EMAILJS_PRIVATE_KEY
# 项目已包含 EmailJS 的基础配置，用户只需配置私钥
```

### 3. 启动服务器

```bash
# 启动开发服务器
npm run dev

# 或启动生产服务器
npm start

# Windows用户也可以使用平台特定命令
npm run deploy:windows

# macOS用户也可以使用平台特定命令
npm run deploy:mac
```

### 4. 访问界面

打开浏览器访问服务地址（默认为 http://localhost:3001）

- 主界面：配置监控规则和查看状态
- 健康检查：{服务地址}/health
- API文档：{服务地址}/api/status

### 停止服务

使用 `Ctrl+C` 停止正在运行的服务器。

### ⚠️ 重要提醒

1. **必须在项目目录中运行脚本**
   - 确保当前目录包含 `package.json` 文件

2. **首次运行**
   - 系统会自动安装依赖
   - 会自动创建必要的目录
   - 会生成配置文件（如果不存在）

3. **端口占用**
   - 默认使用端口 3001
   - 如果端口被占用，请修改 `.env` 文件中的 `PORT` 值

## 配置说明

### 用户配置结构

用户配置保存在本地文件 `data/config.json`：

```json
{
  "email": "your-email@example.com",
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
    },
    {
      "symbol": "CFX",
      "exchange": "binance",
      "timeframe": "1h",
      "threshold": 6.0,
      "enabled": true
    }
  ],
  "trigger_settings": {
    "hourly_minute": 0,
    "daily_hour": 9,
    "daily_minute": 0
  },
  "notification_hours": {
    "enabled": true,
    "start": "09:00",
    "end": "24:00"
  },
  "repeat_interval": 180
}
```

### API 接口

- `GET /api/config` - 获取用户配置
- `POST /api/config` - 保存用户配置
- `GET /api/status` - 获取当前监控状态
- `GET /api/scrape` - 手动触发数据抓取
- `GET /health` - 服务器健康检查

## 监控逻辑

### Hysteresis 通知机制

1. **首次触发**: 利率 > 阈值 → 立即通知（如果在通知时间段内）
2. **持续超阈值**: 按 `repeat_interval` 设置重复通知（默认180分钟）
3. **回落通知**: 利率 ≤ 阈值 → 立即恢复通知
4. **时间控制**: 支持通过 `notification_hours` 设置通知时间段
5. **延迟通知**: 非时间段内自动安排到下一个允许时间发送

### 状态流转

```
NORMAL → ALERT → COOLDOWN → ALERT → ...
    ↓                              ↓
    └───────────── NORMAL ←────────┘
```

## 项目结构

```
coinglass-monitor/
├── src/                     # Express 服务器源码
│   ├── app.js               # 服务器主入口，包含中间件和路由配置
│   ├── services/            # 核心业务服务
│   │   ├── monitor-service.js  # 主要监控逻辑和阈值检查
│   │   ├── monitor.js       # 独立监控服务（用于测试）
│   │   ├── scraper.js       # CoinGlass 数据抓取 (Puppeteer + Stealth)
│   │   ├── email.js         # EmailJS 邮件发送服务
│   │   ├── storage.js       # 数据存储服务
│   │   └── logger.js        # 日志管理服务
│   └── routes/              # API 路由
│       ├── config.js        # 配置管理API
│       ├── status.js        # 状态查询API
│       └── scrape.js        # 数据抓取API
├── scripts/                 # 部署和配置脚本
│   ├── start-windows.bat    # Windows 启动脚本
│   └── start-mac.sh         # macOS 启动脚本
├── data/                    # 本地数据存储 (运行时创建)
│   ├── config.json          # 用户配置文件
│   ├── state.json           # 监控状态文件
│   ├── email-history/       # 邮件发送历史
│   ├── scrape-history/      # 抓取数据历史
│   ├── debug-screenshots/   # 调试截图（可选）
│   ├── backups/             # 自动备份目录
│   └── logs/                # 系统日志目录
├── index.html               # 前端管理界面
├── package.json             # 项目依赖和脚本配置
├── .env.example             # 环境变量模板
├── .env                     # 实际环境变量配置（需自行创建）
├── CLAUDE.md                # Claude Code 开发指南
└── README.md                # 项目说明文档
```

## 开发指南

### 本地开发

```bash
# 启动开发服务器 (带文件监听)
npm run dev

# 启动生产服务器
npm start

# 调试模式启动
npm run dev:debug

# 独立运行监控服务
npm run monitor

# 查看实时日志
tail -f ./server.log

# 健康检查（替换为实际端口）
curl http://localhost:{端口}/health

# 获取监控状态（替换为实际端口）
curl http://localhost:{端口}/api/status
```

### 平台特定部署

```bash
# 统一配置
npm run setup            # 创建必要目录和配置文件

# 平台特定启动方式（仍可用）
npm run deploy:windows   # Windows 用户启动
npm run deploy:mac       # macOS 用户启动

# 清理脚本
npm run cleanup          # 清理旧数据和日志（如果脚本存在）
```

## 监控和调试

### 日志管理

```bash
# 查看实时日志 (所有系统日志都会写入文件)
tail -f ./server.log

# 日志文件包含：
# - 系统启动信息
# - 监控任务执行状态
# - 数据抓取结果
# - 邮件发送记录
# - 错误信息和调试信息

# 日志会自动清理7天前的记录
```

### 测试和调试

```bash
# 手动触发一次监控任务
npm run monitor

# 测试数据抓取功能（替换为实际端口）
curl http://localhost:{端口}/api/scrape

# 检查服务器状态（替换为实际端口）
curl http://localhost:{端口}/health

# 查看当前配置（替换为实际端口）
curl http://localhost:{端口}/api/config

# 查看监控状态（替换为实际端口）
curl http://localhost:{端口}/api/status
```

### 访问Web界面

打开浏览器访问服务地址（默认为 http://localhost:3001）

- **监控管理**: 添加/删除币种，设置阈值
- **通知设置**: 配置邮件和通知时间
- **状态查看**: 实时查看监控状态和历史数据

## 系统要求

- **Node.js**: >= 18.0.0
- **操作系统**: Windows 10+ 或 macOS 10.15+
- **内存**: 最少 512MB 可用内存
- **存储**: 最少 100MB 可用磁盘空间
- **网络**: 能够访问 CoinGlass 网站和 EmailJS 服务

## EmailJS 配置

系统支持 EmailJS 邮件通知服务，需要用户自行配置相关参数：

### 必需配置

在 `.env` 文件中配置以下参数：
- **EMAILJS_SERVICE_ID**: EmailJS 服务ID
- **EMAILJS_TEMPLATE_ID**: 邮件模板ID
- **EMAILJS_PUBLIC_KEY**: EmailJS 公钥
- **EMAILJS_PRIVATE_KEY**: EmailJS 私钥（必需）
- **邮件接收地址**: 通过 Web 界面配置

> 项目已包含基础的 EmailJS 配置，用户主要需要配置 `EMAILJS_PRIVATE_KEY`

### 邮件模板功能

- ✅ 多币种支持与数组循环渲染
- ✅ 状态条件渲染（警报/恢复状态）
- ✅ 历史数据表格展示
- ✅ 实时状态监控信息
- ✅ 完全符合 EmailJS 官方规范

## 故障排除

### 常见问题

1. **服务器启动失败**
   - 检查 Node.js 版本是否 >= 18.0.0
   - 确认端口 3001 未被占用
   - 检查环境变量文件配置

2. **数据抓取失败**
   - 检查网络连接和 CoinGlass 网站可访问性
   - 确认 Puppeteer 能够正常启动（某些系统需要额外依赖）
   - 查看日志中的详细错误信息

3. **邮件发送失败**
   - 验证 EmailJS 配置是否正确
   - 检查邮件地址格式
   - 确认 EmailJS 服务配额未超限

4. **监控任务不执行**
   - 确认监控已启用 (`monitoring_enabled: true`)
   - 检查触发时间设置 (`trigger_settings`)
   - 查看日志确认监控服务启动状态
   - 验证 `RUN_MONITORING_ON_START=false` 设置（默认不自动启动监控）

5. **Chrome/Chromium 相关问题**
   - 运行 `npm run setup` 创建必要目录
   - 系统会使用 Puppeteer 内置的 Chromium，无需手动配置 Chrome 路径
   - 确保有足够的内存启动浏览器实例

### 调试步骤

1. **查看日志**: `tail -f ./server.log`
2. **检查配置**: `curl http://localhost:3001/api/config`
3. **测试监控**: `npm run monitor`
4. **验证服务器**: `curl http://localhost:3001/health`
5. **检查数据目录**: 确认 `data/` 目录权限正常

### Puppeteer 问题解决

**Windows 用户**:
- 可能需要安装 Windows Build Tools
- 确保系统有足够的内存启动浏览器

**macOS 用户**:
- 确保有足够的磁盘空间
- 某些情况下可能需要更新 Xcode Command Line Tools

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 发起 Pull Request

## 许可证

MIT License

## 版本历史

### v2.0.0 (当前版本)
- ✅ Web 管理界面：提供直观的配置和状态管理界面
- ✅ 增强的日志系统：结构化日志和自动清理
- ✅ 跨平台支持：Windows、macOS 和 Linux 统一部署方案
- ✅ 智能配置系统：自动检测 Chrome 路径和环境配置
- ✅ 完整的数据存储：支持历史数据记录和趋势分析

## 文档链接

- 🔧 [开发指南](CLAUDE.md) - 面向开发者的技术文档
- 🌐 [系统界面] - 启动服务后访问服务地址查看

## 支持

如有问题，请提交 Issue 或联系开发者。

### 获取帮助

1. 检查系统日志：`./server.log`
2. 运行健康检查：{服务地址}/health
3. 查看项目文档：[CLAUDE.md](CLAUDE.md)