# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- **src/routes/** - API 路由：
  - `config.js` - 配置管理API
  - `status.js` - 状态查询API
  - `scrape.js` - 数据抓取API
- **index.html** - 前端界面（通过Express静态文件服务）

### Key Components
- **本地文件存储**：使用本地文件系统存储配置、状态和邮件历史数据
- **Hysteresis 通知系统**：通过智能冷却期防止垃圾邮件，保持原有状态机逻辑
- **跨平台支持**：支持Windows、macOS和Linux部署，统一配置系统
- **一键部署脚本**：提供Windows PowerShell和macOS Bash脚本，自动安装依赖和启动服务
- **Puppeteer数据抓取**：使用Stealth插件避免反爬虫检测，支持调试截图
- **EmailJS 集成**：EmailJS邮件通知系统，支持多币种通知模板
- **定时监控服务**：集成在Express服务器中的定时任务系统，支持灵活触发时间
- **日志管理**：完整的结构化日志记录和自动清理系统，支持实时查看
- **ES模块架构**：使用"type": "module"支持现代ES6模块语法
- **Web管理界面**：提供直观的配置管理和状态监控界面
- **智能配置系统**：自动检测Chrome路径和创建必要目录

## Development Commands

### Local Development
```bash
npm start               # Start production server
npm run dev             # Start development server with file watching
npm run dev:debug       # Start server with Node.js debugger
npm run monitor         # Run monitoring service standalone
```

### Platform-specific Deployment
```bash
npm run deploy:windows  # Windows 一键部署 (自动安装依赖和启动服务)
npm run deploy:mac      # macOS 一键部署 (自动安装依赖和启动服务)
npm run setup           # Run general setup script
npm run setup:windows   # Run Windows-specific setup script (Chrome detection, directory creation)
npm run setup:mac       # Run macOS-specific setup script
npm run cleanup         # Run cleanup script (Note: cleanup.js script referenced but may not exist)
```

### Online Installation
```bash
# Windows - One-command installation
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/techfanseric/coinglass-monitor/main/scripts/deploy-windows.ps1" -OutFile "deploy.ps1"
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
.\deploy.ps1

# macOS - One-command installation
curl -fsSL https://raw.githubusercontent.com/techfanseric/coinglass-monitor/main/scripts/deploy-mac.sh | bash
```

### Testing and Debugging
```bash
npm run monitor         # Run monitoring task manually to test scraping
curl http://localhost:{端口}/health    # Check server health
curl http://localhost:{端口}/api/status  # Get monitoring status
```

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
- EmailJS 邮件配置（Service ID、Template ID、密钥等）
- Puppeteer 抓取配置（超时、窗口大小、等待时间等）
- CoinGlass 网站配置（URL、等待时间、截图目录等）
- 数据格式化配置（小数位数、货币格式等）
- 服务器配置（请求限制、日志设置等）
- 日志管理配置（保留天数、自动清理等）
- 前端配置（更新间隔、API超时等）
- 监控服务配置（重试次数、冷却时间等）

**配置设置命令**：
```bash
npm run setup           # 自动检测 Chrome 路径并创建必要目录（推荐）
```

**首次使用**：
1. 复制 `.env.example` 为 `.env`
2. 运行 `npm run setup` 自动配置 Chrome 路径和创建目录
3. 编辑 `.env` 配置 EMAILJS_PRIVATE_KEY 和其他必要参数

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
- `GET /api/config` - 获取用户配置
- `POST /api/config` - 保存用户配置
- `GET /api/status` - 获取当前监控状态
- `GET /api/scrape` - 手动触发数据抓取
- `GET /health` - 服务器健康检查

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

## 重要说明

### 监控脚本澄清
- `npm run monitor` 运行的是 `src/services/monitor.js`（独立测试版本）
- 完整的监控逻辑在 `src/services/monitor-service.js` 中（集成到主服务器）
- 要运行完整监控，需要启动主服务器 (`npm start` 或 `npm run dev`)

### 脚本说明
- `scripts/deploy-windows.ps1` ✅ Windows 一键部署脚本（自动克隆和安装依赖）
- `scripts/deploy-mac.sh` ✅ macOS 一键部署脚本（自动克隆和安装依赖）
- `scripts/setup-simple.js` 基础配置脚本（自动检测 Chrome 路径）
- `scripts/setup-windows.js` Windows 特定配置脚本
- `scripts/setup-mac.js` macOS 特定配置脚本
- `scripts/start-windows.bat` Windows 启动脚本
- `scripts/start-mac.sh` macOS 启动脚本
- `scripts/cleanup.js` 清理脚本（在package.json中引用）

### 配置文件使用说明

#### 🚀 一键部署（推荐）
**适用场景**：全新系统，任何目录下都可以直接安装

**Windows 用户**：
```powershell
# 方法1：在线直接运行
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/techfanseric/coinglass-monitor/main/scripts/deploy-windows.ps1" -OutFile "deploy.ps1"
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
.\deploy.ps1

# 方法2：克隆项目后运行
git clone https://github.com/techfanseric/coinglass-monitor.git
cd coinglass-monitor
npm run deploy:windows
```

**macOS 用户**：
```bash
# 方法1：在线直接运行
curl -fsSL https://raw.githubusercontent.com/techfanseric/coinglass-monitor/main/scripts/deploy-mac.sh | bash

# 方法2：克隆项目后运行
git clone https://github.com/techfanseric/coinglass-monitor.git
cd coinglass-monitor
npm run deploy:mac
```

**特点**：
- ✅ 从零开始，自动安装所有依赖
- ✅ 自动克隆项目到本地
- ✅ 智能检测系统环境
- ✅ 自动安装 Node.js、Git、Chrome
- ✅ 适合全新系统部署

---

#### 💻 高级选项

**Windows PowerShell 参数**：
```powershell
# 开发模式
.\scripts\deploy-windows.ps1 -DevMode

# 指定端口
.\scripts\deploy-windows.ps1 -Port 8080

# 跳过某些检查
.\scripts\deploy-windows.ps1 -SkipNodeInstall -SkipChromeCheck
```

**macOS Bash 参数**：
```bash
# 开发模式
./scripts/deploy-mac.sh --dev

# 指定端口
./scripts/deploy-mac.sh --port 8080

# 跳过某些检查
./scripts/deploy-mac.sh --skip-node-install --skip-chrome-check
```

**特点**：
- ✅ 自动检测和安装 Node.js、Git、Chrome
- ✅ 智能处理环境配置
- ✅ 支持开发模式和自定义端口
- ✅ 完善的错误处理和用户提示

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

### API 端点
- `GET /` - 主页面（前端界面）
- `GET /api/config` - 获取配置
- `POST /api/config` - 保存配置
- `GET /api/status` - 获取监控状态
- `GET /api/scrape` - 手动触发数据抓取
- `GET /health` - 健康检查

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

### 架构特点
- **ES6 模块**: 使用 import/export 语法
- **异步编程**: 全面使用 async/await
- **错误处理**: 完善的 try-catch 和错误传播
- **模块化设计**: 清晰的服务层和路由层分离