# CoinGlass 监控系统 - 快速开始指南

## 🚀 快速启动

### Mac 用户

```bash
# 方法1: 进入项目目录后运行启动脚本
cd /Users/ericyim/coinglass-monitor
./scripts/start-mac.sh

# 方法2: 直接使用 npm 命令
cd /Users/ericyim/coinglass-monitor
npm run deploy:mac

# 方法3: 先配置环境再启动
cd /Users/ericyim/coinglass-monitor
node scripts/setup-mac.js
npm start
```

### Windows 用户

```cmd
REM 方法1: 进入项目目录后运行启动脚本
cd C:\path\to\coinglass-monitor
scripts\start-windows.bat

REM 方法2: 直接使用 npm 命令
cd C:\path\to\coinglass-monitor
npm run deploy:windows

REM 方法3: 先配置环境再启动
cd C:\path\to\coinglass-monitor
node scripts\setup-windows.js
npm start
```

## 📋 系统要求

- **Node.js** 18.0 或更高版本
- **Chrome** 或 **Chromium** 浏览器
- **npm** 包管理器

## ⚠️ 重要提醒

1. **必须在项目目录中运行脚本**
   - 不要从主目录（`~`）运行启动脚本
   - 确保当前目录包含 `package.json` 文件

2. **首次运行**
   - 系统会自动安装依赖
   - 会自动创建必要的目录
   - 会生成配置文件（如果不存在）

3. **端口占用**
   - 默认使用端口 3001
   - 如果端口被占用，请修改 `.env` 文件中的 `PORT` 值

## 🔧 配置说明

### EmailJS 配置（可选）
如果需要邮件通知功能：

1. 访问 [EmailJS](https://www.emailjs.com/)
2. 创建服务和邮件模板
3. 更新 `.env.mac` 或 `.env.windows` 文件中的配置：
   ```env
   EMAILJS_SERVICE_ID=your_service_id
   EMAILJS_TEMPLATE_ID=your_template_id
   EMAILJS_PUBLIC_KEY=your_public_key
   EMAILJS_PRIVATE_KEY=your_private_key
   ```

### 监控配置
系统启动后访问 http://localhost:3001 进行配置：
- 设置接收邮件的邮箱地址
- 配置要监控的币种和阈值
- 设置触发时间和通知规则

## 📊 系统访问

启动成功后，可以通过以下地址访问：

- **前端界面**: http://localhost:3001
- **API 文档**: http://localhost:3001/api
- **健康检查**: http://localhost:3001/health

## 🛠️ 故障排除

### 常见问题

1. **脚本运行失败**
   ```bash
   # 确保在正确目录
   pwd  # 应该显示 .../coinglass-monitor
   ls  # 应该看到 package.json 文件
   ```

2. **依赖安装失败**
   ```bash
   # 清除 npm 缓存
   npm cache clean --force

   # 重新安装
   npm install
   ```

3. **Chrome 未找到**
   ```bash
   # Mac: 运行配置脚本自动检测
   node scripts/setup-mac.js

   # Windows: 运行配置脚本自动检测
   node scripts\setup-windows.js
   ```

4. **端口被占用**
   ```bash
   # 查看占用进程
   lsof -i :3001  # Mac

   # 修改端口
   export PORT=3002
   npm start
   ```

### 查看日志

```bash
# 实时查看日志
tail -f logs/server.log

# 查看完整日志
cat logs/server.log
```

## 📞 技术支持

如果遇到问题：

1. 检查 **系统日志**: `logs/server.log`
2. 运行 **健康检查**: http://localhost:3001/health
3. 查看 **部署文档**: [DEPLOYMENT.md](DEPLOYMENT.md)
4. 运行 **验证测试**: `node verification-test.js`

---

## 🎉 开始使用

1. 确保在项目目录中：`cd /Users/ericyim/coinglass-monitor`
2. 运行启动脚本：`./scripts/start-mac.sh`
3. 访问：http://localhost:3001
4. 配置您的监控规则

**祝您使用愉快！** 🚀