# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**最新更新说明**：
- 文件已根据当前代码库状态进行验证和更新
- 测试配置已根据实际 Jest 配置文件进行修正
- 脚本功能已根据 package.json 中的实际脚本进行更新
- 添加了 ES 模块和测试架构的具体说明
- 新增 CHANGELOG.md 编写规范，确保更新日志面向用户

## Project Overview

这是一个基于本地 Express 服务器的 CoinGlass 利率监控系统。它监控加密货币借贷利率并在超过阈值时发送警报。

This is a CoinGlass interest rate monitoring system based on a local Express server. It monitors cryptocurrency lending rates and sends alerts when thresholds are exceeded.

## Architecture

### Core Structure
- **src/app.js** - Express 服务器主入口，包含中间件配置、路由和启动逻辑
- **src/services/** - 核心业务逻辑服务：
  - `monitor-service.js` - 主要监控逻辑和阈值检查（从Cloudflare Workers迁移）
  - `scraper.js` - CoinGlass 数据抓取和解析（使用Puppeteer）
  - `email.js` - EmailJS 集成用于通知
  - `storage.js` - 本地文件系统存储服务（替代Cloudflare KV）
  - `logger.js` - 日志管理服务
  - `data-cleanup.js` - 数据清理服务，统一管理所有数据目录的清理
  - `scrape-tracker.js` - 抓取状态追踪服务，实时监控手动触发的抓取进度
- **src/utils/** - 工具模块：
  - `time-utils.js` - 时间格式化工具，提供统一的时间处理函数
- **src/routes/** - API 路由：
  - `config.js` - 配置管理API
  - `status.js` - 状态查询API
  - `scrape.js` - 数据抓取API
- **public/** - 前端静态文件（通过Express静态文件服务）：
  - `index.html` - 前端管理界面HTML结构
  - `style.css` - 前端样式文件
  - `script.js` - 前端JavaScript逻辑

### Key Components
- **本地文件存储**：使用本地文件系统存储配置、状态和邮件历史数据
- **智能监控逻辑**：增强的冷却期预检查机制，跳过不需要抓取的币种，提升效率
- **Hysteresis 通知系统**：通过智能冷却期防止垃圾邮件，保持原有状态机逻辑
- **自动重启系统**：Windows和macOS启动脚本支持自动重启，应用崩溃后自动恢复
- **跨平台支持**：支持Windows、macOS和Linux部署，统一配置系统
- **启动脚本**：提供Windows PowerShell和macOS Bash脚本，智能环境检测和启动服务
- **ZIP自动更新**：支持从GitHub ZIP包自动更新，包括解压和文件替换
- **Puppeteer数据抓取**：使用Stealth插件避免反爬虫检测，支持调试截图
- **EmailJS 集成**：EmailJS邮件通知系统，支持多币种通知模板
- **定时监控服务**：集成在Express服务器中的定时任务系统，支持灵活触发时间
- **日志管理**：完整的结构化日志记录和自动清理系统，支持实时查看，优化的日志显示顺序
- **数据清理服务**：统一管理所有数据目录的自动清理，包括邮件历史、抓取数据、日志文件等
- **时间工具模块**：提供统一的时间格式化函数，支持中英文时间显示
- **ES模块架构**：使用"type": "module"支持现代ES6模块语法
- **Web管理界面**：提供直观的配置管理和状态监控界面
- **智能配置系统**：自动检测Chrome路径和创建必要目录

### Frontend Architecture
前端采用模块化架构，代码分离提升可维护性：
- **index.html** (147行) - 纯HTML结构，不含内联样式和脚本
- **style.css** (475行) - 所有UI样式，响应式设计和主题
- **script.js** (913行) - 完整的前端逻辑，包括配置管理、状态更新、通知系统等
- **Express静态服务** - 通过 `/public` 目录提供静态文件服务
- **配置注入** - 服务端在HTML中动态注入前端环境变量

## Development Commands

### Local Development
```bash
npm start               # Start production server
npm run dev             # Start development server with file watching
npm run dev:debug       # Start server with Node.js debugger
npm run monitor         # Run monitoring service standalone
```

### Platform-specific Scripts
```bash
npm run setup           # Run general setup script (auto-detects Chrome and creates directories)
```

### Application Startup
```bash
# Windows Batch startup script (with auto-restart)
.\scripts\start-windows.bat

# macOS Bash startup script (with auto-restart)
./scripts/start-mac.sh

# Standard npm commands
npm start               # Start production server
npm run dev             # Start development server
npm run dev:debug       # Start server with Node.js debugger
npm run monitor         # Run monitoring service standalone
```

**自动重启功能**：
- Windows和macOS启动脚本现在都支持自动重启
- 应用崩溃或停止后，会等待3秒自动重启
- 使用Ctrl+C可以停止自动重启循环
- 启动时会清屏并显示退出代码，便于调试

### Testing and Debugging
```bash
# Jest测试框架 (正式测试)
npm test                # Run Jest test suite
npm run test:watch      # Run tests in watch mode
npm run test:coverage  # Run tests with coverage report

# 监控功能调试
npm run monitor         # Run monitoring task manually to test scraping
curl http://localhost:{端口}/health    # Check server health
curl http://localhost:{端口}/api/status  # Get monitoring status

# 独立测试脚本（位于tests/目录）
node tests/test-email-function.js    # Test email functionality
node tests/test-summary-report.js    # Test summary report functionality
```

**测试架构说明**：
- **Jest测试框架**：正式的单元测试和集成测试，位于tests/目录
- **测试文件类型**：支持`*.test.js`和`test-*.js`两种命名模式
- **测试覆盖**：包含邮件服务、通知设置、集成测试等
- **独立测试脚本**：可用于调试和验证特定功能的独立脚本
- **ES模块支持**：Jest配置支持ES6模块语法，使用`--experimental-vm-modules`参数

### Log Management
```bash
# Logs are automatically written to ./server.log
tail -f ./server.log    # View real-time logs
# Log files are automatically cleaned up (7-day retention)
```

### Access Points
```bash
http://localhost:{端口}               # Main monitoring interface
http://localhost:{端口}/health       # Health check endpoint
http://localhost:{端口}/api/config   # Configuration API
http://localhost:{端口}/api/status   # Status API
http://localhost:{端口}/api/scrape   # Scraping API
```

## Important Implementation Details

### Environment Variables (简化配置系统)
项目使用极简的环境配置系统：
- `.env.example` - 标准配置模板（复制为.env使用）
- `.env` - 唯一的配置文件，包含所有必要配置

**配置包含**：
- 服务基础配置（端口、数据目录、CORS等）
  - **注意**: PORT 必须配置，系统无默认端口值
- EmailJS 邮件配置（Service ID、Template ID、密钥等）
- Puppeteer 抓取配置（超时、窗口大小、等待时间等）
- CoinGlass 网站配置（URL、等待时间、截图目录等）
- 数据格式化配置（小数位数、货币格式等）
- 服务器配置（请求限制、日志设置等）
- 日志管理配置（保留天数、自动清理等）
- 前端配置（更新间隔、API超时等）
- 监控服务配置（重试次数、冷却时间等）
- **自动更新配置**：支持Git仓库和ZIP包两种自动更新方式

### Port Configuration
- Port must be explicitly configured in .env file (no default values)
- Required configuration: `PORT=<端口号>` in .env file
- Can be overridden via `-Port` parameter in startup scripts
- Startup scripts will fail if PORT is not configured
- Port conflicts are automatically handled by startup scripts

**配置设置命令**：
```bash
npm run setup           # 自动检测 Chrome 路径并创建必要目录（推荐）
```

**首次使用**：
1. 复制 `.env.example` 为 `.env`
2. 运行 `npm run setup` 自动配置 Chrome 路径和创建目录
3. 编辑 `.env` 配置 EMAILJS_PRIVATE_KEY 和其他必要参数
4. 确保在 `.env` 中配置了 `PORT` 参数（系统无默认端口）

### 本地存储架构
本地文件系统存储结构：
- **数据目录结构**：
  - `data/config.json` - 用户配置文件
  - `data/state.json` - 监控状态文件（支持多币种状态）
  - `data/email-history/` - 邮件发送历史（JSON格式，包含时间戳）
  - `data/scrape-history/` - 抓取数据历史（用于趋势分析）
  - `data/debug-screenshots/` - 调试截图（可选功能）
  - `data/backups/` - 自动备份目录
  - `data/logs/` - 系统日志目录
- **自动备份**：定期备份配置和状态数据到backup目录
- **数据清理**：自动清理超过7天的历史数据和日志
- **文件格式**：使用JSON格式存储，便于调试和迁移
- **并发安全**：使用文件锁机制防止并发写入冲突

### 监控系统数据流
1. **定时检查**：服务器启动时集成监控服务，按用户配置的时间条件触发
2. **触发条件检查**：检查当前时间是否满足hourly_minute或daily_hour设置
3. **数据抓取**：使用Puppeteer抓取CoinGlass数据，支持反爬虫策略
4. **阈值检查**：对比当前利率与用户设定阈值
5. **状态管理**：使用本地文件系统跟踪币种状态，实现Hysteresis逻辑
6. **邮件通知**：通过EmailJS发送警报或恢复通知
7. **延迟通知**：支持非通知时间段内的延迟发送机制

### 监控服务实现说明
- **主要监控逻辑**：位于 `src/services/monitor-service.js`，包含完整的监控功能
- **独立监控服务**：`src/services/monitor.js` 提供独立的监控功能，用于测试
- **独立运行**：可通过 `npm run monitor` 独立执行监控任务进行测试

### Hysteresis通知逻辑
- **首次触发**：利率 > 阈值 → 立即通知（如果在通知时间段内）
- **持续警报**：按repeat_interval设置重复通知（默认180分钟）
- **恢复通知**：利率 ≤ 阈值 → 立即恢复通知
- **时间控制**：支持notification_hours时间窗口设置
- **延迟通知**：非时间段内自动安排到下一个允许时间发送

### Puppeteer数据抓取
- **反检测配置**：使用puppeteer-extra-plugin-stealth避免反爬虫检测
- **浏览器配置**：支持无头模式和完整浏览器模式，可自定义窗口大小
- **智能等待策略**：针对CoinGlass网站的不同元素设置专门等待时间
- **数据解析**：提取币种利率、历史趋势、交易所数据等关键信息
- **错误处理**：完善的网络错误和数据解析错误处理，支持重试机制
- **调试支持**：可选的截图功能，便于调试数据抓取问题
- **Chrome检测**：自动检测系统Chrome路径，未找到时使用内置Chromium

### 日志系统
- **自动日志捕获**：重写console方法，捕获所有系统日志
- **双重日志输出**：同时输出到控制台和文件（./server.log）
- **日志清理**：自动清理7天前的日志文件，可配置保留天数
- **结构化日志**：包含时间戳、级别、模块信息
- **日志API**：通过Web界面查看和管理日志
- **性能监控**：记录API请求时间和系统性能指标
- **错误追踪**：详细的错误堆栈和上下文信息

## 配置结构

用户配置存储在 `data/config.json`：
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

### 触发时间设置
- **每小时触发**：0-59分钟，表示每小时的第几分钟执行监控
- **每24小时触发**：H:MM格式，表示每天特定时间执行监控
- **同时检查**：系统同时检查两个触发条件，任一满足即执行
- **灵活配置**：支持仅每小时、仅每24小时或同时启用

## API接口
- `GET /` - 主页面（前端界面）
- `GET /api/config` - 获取用户配置
- `POST /api/config` - 保存用户配置
- `GET /api/status` - 获取当前监控状态
- `GET /api/scrape` - 手动触发数据抓取
- `POST /api/scrape/coinglass` - 手动触发完整监控流程
- `GET /api/scrape/status` - 获取当前抓取状态（实时进度）
- `GET /api/scrape/service-status` - 获取抓取服务状态（浏览器服务状态）
- `GET /api/scrape/history` - 获取抓取历史记录
- `GET /api/version` - 获取版本信息（从CHANGELOG.md读取）
- `GET /health` - 服务器健康检查（包含版本信息）
- `GET /CHANGELOG.md` - 获取更新日志（JSON格式）

## EmailJS配置
系统支持通过 EmailJS 发送邮件通知，需要配置以下参数：
- **EMAILJS_SERVICE_ID**: EmailJS 服务ID
- **EMAILJS_TEMPLATE_ID**: 邮件模板ID
- **EMAILJS_PUBLIC_KEY**: EmailJS 公钥
- **EMAILJS_PRIVATE_KEY**: EmailJS 私钥
- **EMAILJS_API_URL**: EmailJS API地址

**模板功能**：
- 多币种支持与数组循环
- 状态条件渲染
- 历史数据表格
- 实时状态监控

## CHANGELOG 编写规范

### 📝 更新日志原则
CHANGELOG.md 必须面向用户，关注功能改进和体验提升，避免技术细节：

**✅ 应该包含**：
- 功能改进（如"现在ZIP下载部署也能自动检查更新了"）
- 体验优化（如"页面加载更快"、"操作更流畅"）
- 问题修复（如"修复Windows启动后立即闪退的问题"）
- 用户价值（如"节省存储空间"、"避免深夜打扰"）

**❌ 避免包含**：
- API端点变更（如"/api/scrape/status端点"）
- 技术架构（如"前端模块化重构"）
- 内部服务（如"ScrapeTracker服务"）
- 代码细节（如"分离HTML、CSS文件"）

**🔄 语言风格**：
- 用用户能理解的通俗语言，说人话
- 突出实际价值和体验改进
- 保持简洁明了，每条不超过15字

**⚖️ 内容原则**：
- 实事求是，根据实际修改内容编写
- 不要夸大功能，避免过度营销
- 有几条写几条，不强求凑数
- 核心功能1-2条即可，不需要面面俱到

**📋 版本格式**：
```json
{
  "version": "v25.10.7.3",
  "date": "2025-10-07",
  "description": "简要描述本次更新主题（面向用户）",
  "changes": [
    "📦 功能改进1（用通俗语言描述）",
    "🔧 问题修复1（说清楚解决了什么问题）"
  ]
}
```

**✨ 好的例子**：
```json
{
  "version": "v25.10.7.3",
  "date": "2025-10-07",
  "description": "支持ZIP部署自动更新",
  "changes": [
    "📦 ZIP下载部署现在也能自动检查更新了",
    "🔧 修复Windows设置自动更新后启动闪退问题"
  ]
}
```

## 重要说明

### ⚠️ Git 操作限制
**重要**：未经用户明确许可，禁止执行任何 Git 操作，包括但不限于：
- `git add .`
- `git commit`
- `git push`
- 任何其他 Git 命令

### 监控脚本澄清
- `npm run monitor` 运行的是 `src/services/monitor.js`（独立测试版本）
- 完整的监控逻辑在 `src/services/monitor-service.js` 中（集成到主服务器）
- 要运行完整监控，需要启动主服务器 (`npm start` 或 `npm run dev`)

### 脚本说明
- `scripts/start-windows.bat` ✅ Windows 批处理启动脚本
- `scripts/start-mac.sh` ✅ macOS Bash 启动脚本

**注意**:
- 启动脚本已简化为直接启动生产模式
- 基础配置功能通过 `npm run setup` 命令提供

### 配置文件使用说明

#### 🔧 启动脚本使用

**Windows 批处理启动脚本**：
```batch
# 生产模式启动
.\scripts\start-windows.bat
```

**macOS Bash 启动脚本**：
```bash
# 生产模式启动
./scripts/start-mac.sh
```

**启动脚本功能**：
- ✅ 直接启动生产模式
- ✅ 简化的启动流程
- ✅ 自动切换到项目目录

---

#### 🔧 手动配置方式

**传统安装**：
1. 复制 `.env.example` 为 `.env`
2. 运行 `npm run setup` 自动配置 Chrome 路径和创建必要目录
3. 编辑 `.env` 文件，主要配置 `EMAILJS_PRIVATE_KEY` 和其他必要参数

**现有用户**：
- 如果已有 `.env` 文件，直接运行 `npm run setup` 更新 Chrome 路径
- 所有配置现在集中在一个文件中，无需管理多个配置文件

**目录结构**：
- `data/` 目录会在首次运行时自动创建
- 包含 `config.json`、`state.json`、`email-history/`、`scrape-history/` 等子目录
- 调试截图目录 `debug-screenshots/` 可选创建

## Web 界面功能

### 主要功能
- **配置管理**：通过Web界面编辑和保存配置
- **状态监控**：实时显示监控状态和币种信息
- **历史数据**：查看抓取历史和邮件发送记录
- **日志查看**：通过界面查看系统日志
- **手动操作**：手动触发数据抓取和监控任务
- **版本管理**：查看当前版本和更新日志
- **邮件分组**：支持多个邮件接收者分组管理
- **实时进度**：手动抓取时显示详细进度信息

### 前端模块化架构
- **index.html** - 纯HTML结构（147行）
- **style.css** - 完整UI样式（475行），含响应式设计
- **script.js** - 前端逻辑（913行），含配置管理和状态更新
- **模块化设计** - 代码分离，提升可维护性
- **配置注入** - 服务端动态注入环境变量

## 技术栈详情

### 核心依赖
- **express**: Web 服务器框架
- **puppeteer**: 网页自动化和数据抓取
- **puppeteer-extra**: Puppeteer 增强插件
- **puppeteer-extra-plugin-stealth**: 反检测插件
- **dotenv**: 环境变量管理
- **cors**: 跨域资源共享
- **node-cron**: 定时任务调度
- **winston**: 日志管理（可选）

### 开发依赖
- **nodemon**: 开发时自动重启
- **jest**: 测试框架，支持ES模块
- **wrangler**: Cloudflare Workers 工具（保留用于兼容性）

### 架构特点
- **ES6 模块**: 使用 import/export 语法，`"type": "module"` 配置
- **异步编程**: 全面使用 async/await
- **错误处理**: 完善的 try-catch 和错误传播
- **模块化设计**: 清晰的服务层和路由层分离
- **测试架构**: Jest配置支持ES6模块，包含单元测试和集成测试