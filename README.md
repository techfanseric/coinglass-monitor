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

## 🚀 一键部署（推荐）

### Windows 用户

**🚀 方法一：真正的一键安装（推荐）**
```powershell
# 直接在 PowerShell 中运行一条命令
irm https://raw.githubusercontent.com/techfanseric/coinglass-monitor/main/scripts/install-online.ps1 | iex
```

**🖥️ 方法二：使用批处理文件（无需PowerShell知识）**
```cmd
# 下载并运行批处理文件
curl -o quick-install.bat https://raw.githubusercontent.com/techfanseric/coinglass-monitor/main/scripts/quick-install.bat
quick-install.bat
```

**📦 方法三：传统PowerShell脚本**
```powershell
# 下载并运行部署脚本
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/techfanseric/coinglass-monitor/main/scripts/deploy-windows.ps1" -OutFile "deploy.ps1"
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
.\deploy.ps1
```

**🔧 方法四：克隆项目后部署**
```powershell
# 克隆项目
git clone https://github.com/techfanseric/coinglass-monitor.git
cd coinglass-monitor

# 运行一键部署脚本
.\scripts\deploy-windows.ps1

# 或使用开发模式
.\scripts\deploy-windows.ps1 -DevMode

# 或指定端口
.\scripts\deploy-windows.ps1 -Port 8080
```

**Windows 一键部署功能：**
- 🚀 **零干预安装**：自动处理执行策略、网络下载、目录冲突等问题
- ✅ **智能环境检测**：自动检测并安装 Node.js、Git、Chrome
- ✅ **自动项目获取**：支持Git克隆和ZIP下载两种方式
- ✅ **无用户交互**：自动处理目录冲突，使用时间戳避免覆盖
- ✅ **多重下载保障**：三种下载方法确保网络兼容性
- ✅ **安全执行**：自动解除文件阻止标记，处理执行策略
- ✅ **错误恢复**：Git失败时自动切换到ZIP下载
- ✅ **进度显示**：彩色输出和详细的安装进度
- ✅ **自动清理**：安装完成后清理临时文件

**高级选项（仅适用于方法三和方法四）：**
```powershell
# 跳过 Node.js 安装检查
.\scripts\deploy-windows.ps1 -SkipNodeInstall

# 跳过 Chrome 安装检查
.\scripts\deploy-windows.ps1 -SkipChromeCheck

# 使用开发模式启动
.\scripts\deploy-windows.ps1 -DevMode

# 自定义端口
.\scripts\deploy-windows.ps1 -Port 8080
```

---

### macOS 用户

**方法一：在线一键部署（无需预先克隆项目）**
```bash
# 直接运行部署脚本
curl -fsSL https://raw.githubusercontent.com/techfanseric/coinglass-monitor/main/scripts/deploy-mac.sh | bash
```

**方法二：克隆项目后部署**
```bash
# 克隆项目
git clone https://github.com/techfanseric/coinglass-monitor.git
cd coinglass-monitor

# 运行一键部署脚本
./scripts/deploy-mac.sh

# 或使用开发模式
./scripts/deploy-mac.sh --dev

# 或指定端口
./scripts/deploy-mac.sh --port 8080
```

**macOS 一键部署功能：**
- ✅ 自动安装 Homebrew（如果未安装）
- ✅ 自动检测并安装 Node.js
- ✅ 自动检测并安装 Git
- ✅ 自动检测并安装 Google Chrome
- ✅ 自动克隆项目（如果不存在）
- ✅ 自动配置项目环境
- ✅ 支持 Apple Silicon (M1/M2) 芯片
- ✅ 智能端口冲突处理
- ✅ 彩色输出和进度显示

**脚本参数选项：**
```bash
# 跳过 Node.js 安装检查
./scripts/deploy-mac.sh --skip-node-install

# 跳过 Chrome 安装检查
./scripts/deploy-mac.sh --skip-chrome-check

# 使用开发模式启动
./scripts/deploy-mac.sh --dev

# 自定义端口
./scripts/deploy-mac.sh --port 8080

# 查看帮助信息
./scripts/deploy-mac.sh --help
```

---

### 部署完成后

1. **访问应用**：打开浏览器访问 http://localhost:3000
2. **配置 EmailJS**：编辑 `.env` 文件，配置 `EMAILJS_PRIVATE_KEY`
3. **设置监控规则**：通过 Web 界面添加币种和设置阈值
4. **启动监控**：在 Web 界面中启用监控功能

### 快速命令参考

```bash
# 停止应用
Ctrl+C

# 重新启动应用
npm start

# 开发模式
npm run dev

# 手动监控测试
npm run monitor

# 查看实时日志
tail -f ./server.log
```

## 🔧 传统安装方式

> 如果一键部署脚本无法正常工作，可以使用传统方式手动安装。

### 1. 环境准备

```bash
# 检查 Node.js 版本 (需要 >= 18.0.0)
node --version

# 检查 Git 是否已安装
git --version

# 克隆项目
git clone https://github.com/techfanseric/coinglass-monitor.git
cd coinglass-monitor

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

打开浏览器访问服务地址（默认为 http://localhost:3000）

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
   - 默认使用端口 3000
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
│   ├── install-online.ps1   # Windows 在线安装脚本（零干预一键安装）
│   ├── quick-install.bat    # Windows 批处理安装脚本（无需PowerShell知识）
│   ├── deploy-windows.ps1   # Windows 一键部署脚本（自动克隆+安装依赖）
│   ├── deploy-mac.sh        # macOS 一键部署脚本（自动克隆+安装依赖）
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

# Windows 一键部署（推荐）
.\scripts\deploy-windows.ps1      # PowerShell 脚本，自动处理所有环境配置

# 平台特定启动方式（仍可用）
npm run deploy:windows   # Windows 用户启动
npm run deploy:mac       # macOS 用户启动

# 清理脚本
npm run cleanup          # 清理旧数据和日志（如果脚本存在）
```

### Windows 一键部署脚本详细说明

**脚本功能：**
- 🔍 **环境检测**: 自动检查 PowerShell 版本、网络连接、管理员权限
- 📦 **依赖安装**: 自动下载并安装 Node.js、Git、Chrome
- ⚙️ **项目配置**: 自动创建配置文件、安装依赖、设置 Chrome 路径
- 🚀 **服务启动**: 自动启动应用并验证服务状态
- 🎨 **用户体验**: 彩色输出、进度显示、详细错误信息

**使用方式：**
```powershell
# 基础部署
.\scripts\deploy-windows.ps1

# 开发模式
.\scripts\deploy-windows.ps1 -DevMode

# 自定义端口
.\scripts\deploy-windows.ps1 -Port 3001

# 跳过特定检查
.\scripts\deploy-windows.ps1 -SkipNodeInstall
.\scripts\deploy-windows.ps1 -SkipChromeCheck
```

**脚本执行流程：**
1. 检查系统环境（PowerShell版本、网络、权限）
2. 安装必需软件（Node.js、Git、Chrome）
3. 配置项目环境（安装依赖、创建配置文件）
4. 启动应用服务（开发或生产模式）
5. 验证服务状态并提供访问信息

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

- **Node.js**: >= 18.0.0 (一键部署脚本会自动安装)
- **Git**: 用于代码克隆 (一键部署脚本会自动安装)
- **Google Chrome**: 用于数据抓取 (一键部署脚本会自动安装)
- **操作系统**: Windows 10+ 或 macOS 11.0+ (Big Sur)
- **内存**: 最少 2GB 可用内存
- **存储**: 最少 500MB 可用磁盘空间
- **网络**: 能够访问 CoinGlass 网站和 EmailJS 服务

> **注意**: 使用一键部署脚本时，Node.js、Git 和 Chrome 会自动安装，无需预先准备。

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

**通用调试：**
1. **查看日志**: `tail -f ./server.log`
2. **检查配置**: `curl http://localhost:3001/api/config`
3. **测试监控**: `npm run monitor`
4. **验证服务器**: `curl http://localhost:3001/health`
5. **检查数据目录**: 确认 `data/` 目录权限正常

**Windows 专用调试：**
```powershell
# 检查 PowerShell 执行策略
Get-ExecutionPolicy

# 如果限制执行，设置允许脚本运行
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 查看网络连接状态
Test-NetConnection -ComputerName "google.com" -Port 443

# 检查 Node.js 和 Git 安装
node --version
git --version

# 查看进程状态
Get-Process | Where-Object {$_.ProcessName -like "*node*"}

# 检查端口占用
netstat -ano | findstr :3001
```

### Windows PowerShell 脚本问题解决

**执行策略限制：**
```powershell
# 查看当前执行策略
Get-ExecutionPolicy

# 允许脚本执行（推荐）
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 临时允许单次执行
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-windows.ps1
```

**网络连接问题：**
```powershell
# 测试网络连接
Test-NetConnection -ComputerName "google.com" -Port 443

# 检查代理设置
netsh winhttp show proxy

# 如果需要配置代理
netsh winhttp set proxy <proxy-server>:<port>
```

**权限问题：**
- 右键 PowerShell 选择"以管理员身份运行"
- 或者临时提升权限：`Start-Process powershell -Verb runAs`

### Puppeteer 问题解决

**Windows 用户**:
- 一键部署脚本已包含 Chrome 安装
- 可能需要安装 Windows Build Tools（某些情况下）
- 确保系统有足够的内存启动浏览器（建议至少 2GB 可用内存）

**macOS 用户**:
- 确保有足够的磁盘空间（建议至少 500MB）
- 某些情况下可能需要更新 Xcode Command Line Tools
- 运行 `xcode-select --install` 安装开发工具

**通用解决方案：**
- 脚本失败时检查网络连接和防火墙设置
- 如果自动安装失败，请手动下载并安装相应软件
- 确保杀毒软件没有阻止脚本执行

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