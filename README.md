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
- 📋 **版本管理**: 专业的版本展示和更新日志系统，支持展开/收起交互
- 🎨 **响应式界面**: 优化的Web界面设计，支持移动端完美显示

## 🚀 快速开始

### 系统要求

- **Node.js**: >= 18.0.0
- **操作系统**: Windows 10+ 或 macOS 11.0+ (Big Sur)
- **内存**: 最少 2GB 可用内存
- **存储**: 最少 500MB 可用磁盘空间
- **网络**: 能够访问 CoinGlass 网站和 EmailJS 服务

### 安装步骤

#### 1. 克隆项目

```bash
git clone https://github.com/techfanseric/coinglass-monitor.git
cd coinglass-monitor
```

#### 2. 安装依赖

```bash
npm install
```

#### 3. 配置环境

```bash
# 复制环境变量模板
cp .env.example .env

# 运行自动配置脚本
npm run setup
```

#### 4. 启动应用

**Windows 用户**：
```powershell
# 使用 PowerShell 启动脚本（推荐）
.\scripts\start-windows.ps1

# 开发模式
.\scripts\start-windows.ps1 -Dev

# 自定义端口
.\scripts\start-windows.ps1 -Port 8080

# 或者直接使用 npm
npm start
```

**macOS 用户**：
```bash
# 使用启动脚本
./scripts/start-mac.sh

# 开发模式
./scripts/start-mac.sh --dev

# 自定义端口
./scripts/start-mac.sh --port 8080

# 或者直接使用 npm
npm start
```

#### 5. 访问界面

打开浏览器访问 http://localhost:3001

### 快速命令参考

```bash
# 停止应用
Ctrl+C

# 开发模式启动
npm run dev

# 调试模式启动
npm run dev:debug

# 手动监控测试
npm run monitor

# 查看实时日志
tail -f ./server.log
```

## 🔧 高级配置

### Windows PowerShell 启动脚本

```powershell
# 基础启动
.\scripts\start-windows.ps1

# 开发模式
.\scripts\start-windows.ps1 -Dev

# 自定义端口
.\scripts\start-windows.ps1 -Port 8080

# 禁用自动更新检查
.\scripts\start-windows.ps1 -DisableAutoUpdate

# 组合参数
.\scripts\start-windows.ps1 -Dev -Port 8080
```

**PowerShell 启动脚本功能**：
- ✅ 自动检测 Node.js 和 npm 版本
- ✅ 智能端口冲突处理
- ✅ 自动创建必要目录
- ✅ 依赖检查和更新提醒
- ✅ 完善的错误处理和用户提示

### macOS Bash 启动脚本

```bash
# 基础启动
./scripts/start-mac.sh

# 开发模式
./scripts/start-mac.sh --dev

# 自定义端口
./scripts/start-mac.sh --port 8080

# 禁用自动更新检查
./scripts/start-mac.sh --disable-auto-update
```

### 停止服务

使用 `Ctrl+C` 停止正在运行的服务器。

### ⚠️ 重要提醒

1. **端口配置**
   - 端口必须通过 `.env` 文件中的 `PORT` 配置
   - 系统无默认端口，未配置时会报错并提示
   - 启动脚本支持端口占用检测和处理

2. **配置文件**
   - 首次运行会自动从 `.env.example` 创建 `.env` 文件
   - 请根据需要修改 `.env` 文件中的配置，特别是 EmailJS 相关设置

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
│   │   ├── logger.js        # 日志管理服务
│   │   └── data-cleanup.js  # 数据清理服务，统一管理数据目录清理
│   ├── utils/               # 工具模块
│   │   └── time-utils.js    # 时间格式化工具
│   └── routes/              # API 路由
│       ├── config.js        # 配置管理API
│       ├── status.js        # 状态查询API
│       └── scrape.js        # 数据抓取API
├── scripts/                 # 启动脚本
│   ├── start-windows.ps1    # Windows PowerShell 启动脚本
│   └── start-mac.sh         # macOS Bash 启动脚本
├── data/                    # 本地数据存储 (运行时创建)
│   ├── config.json          # 用户配置文件
│   ├── state.json           # 监控状态文件
│   ├── email-history/       # 邮件发送历史
│   ├── scrape-history/      # 抓取数据历史
│   ├── debug-screenshots/   # 调试截图（可选）
│   ├── backups/             # 自动备份目录
│   └── logs/                # 系统日志目录
├── public/                  # 前端静态文件
│   ├── index.html          # Web 管理界面（含版本展示和更新日志）
│   ├── style.css           # 样式文件（含响应式设计和动画效果）
│   └── script.js           # JavaScript 逻辑（含版本日志交互功能）
├── tests/                   # 测试文件
│   ├── jest.config.js      # Jest 测试配置
│   ├── setup.js            # 测试设置文件
│   ├── *.test.js           # 正式测试文件
│   ├── test-*.js           # 独立测试脚本
│   └── mocks/              # 测试模拟文件
├── package.json             # 项目依赖和脚本配置
├── .env.example             # 环境变量模板
├── .env                     # 实际环境变量配置（需自行创建）
├── CHANGELOG.md             # 版本更新日志（JSON格式，含详细功能变更）
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

# 运行测试
npm test

# 测试覆盖率
npm run test:coverage
```

### 平台特定部署

```bash
# 统一配置
npm run setup            # 创建必要目录和配置文件

# 清理脚本
npm run cleanup          # 清理旧数据和日志（如果脚本存在）
```

**注意：**
- 原有的复杂部署脚本已被简化为启动脚本
- 现在推荐使用 `npm run setup` 进行基础配置
- 使用启动脚本 `start-windows.ps1` 或 `start-mac.sh` 启动应用

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

# 运行完整测试套件
npm test

# 运行测试并生成覆盖率报告
npm run test:coverage

# 监视模式运行测试
npm run test:watch
```

### 访问Web界面

打开浏览器访问服务地址（默认为 http://localhost:3001）

- **版本管理**: 查看当前版本号和详细的更新日志，支持展开/收起操作
- **监控管理**: 添加/删除币种，设置阈值
- **通知设置**: 配置邮件和通知时间
- **状态查看**: 实时查看监控状态和历史数据
- **系统日志**: 实时查看系统运行日志和调试信息

#### 界面特性
- ✅ **版本展示**: 页面顶部显示当前版本号（格式：v25.10.6.8）
- ✅ **更新日志**: 点击版本信息可展开/收起详细的版本更新历史
- ✅ **响应式设计**: 完美适配桌面端和移动端设备
- ✅ **流畅动画**: 平滑的展开/收起动画效果
- ✅ **专业分类**: 使用标准emoji分类展示不同类型的功能变更

## 系统要求

- **Node.js**: >= 18.0.0
- **Git**: 用于代码克隆
- **Google Chrome**: 用于数据抓取 (Puppeteer 也会使用内置 Chromium)
- **操作系统**: Windows 10+ 或 macOS 11.0+ (Big Sur)
- **内存**: 最少 2GB 可用内存
- **存储**: 最少 500MB 可用磁盘空间
- **网络**: 能够访问 CoinGlass 网站和 EmailJS 服务

> **注意**: 如果没有 Chrome，Puppeteer 会自动下载并使用内置的 Chromium 浏览器。

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
   - 确认 `.env` 文件中配置了 `PORT` 端口号
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

# 检查端口占用（将3001替换为.env中配置的端口）
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