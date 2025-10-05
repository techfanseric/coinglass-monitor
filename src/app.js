/**
 * CoinGlass 监控系统 - Express 服务器
 * 从 Cloudflare Workers 迁移到本地部署架构
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import os from 'os';

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量 - 简化配置加载
const projectRoot = path.join(__dirname, '..');
const envPath = path.join(projectRoot, '.env');

// 设置日志文件路径
const logFilePath = process.env.LOGS_DIR ?
  path.join(process.env.LOGS_DIR, 'server.log') :
  path.join(projectRoot, 'logs', 'server.log');

try {
  dotenv.config({ path: envPath });
  console.log('✅ 已加载环境配置 (.env)');
} catch (error) {
  console.error('❌ 加载环境配置失败:', error.message);
  console.log('💡 请复制 .env.example 为 .env 并配置相关参数');
}

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const platform = os.platform();

// 确保必要目录存在
async function ensureDirectories() {
  const directories = [
    process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
    process.env.LOGS_DIR || path.join(__dirname, '..', 'logs')
  ];

  for (const dir of directories) {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
      console.log(`📁 创建目录: ${dir}`);
    }
  }
}

// 从环境变量加载服务器配置
const serverConfig = {
  corsOrigins: process.env.CORS_ORIGINS ?
    process.env.CORS_ORIGINS.split(',').map(origin => origin.trim()) :
    ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'],
  requestBodySizeLimit: process.env.REQUEST_BODY_SIZE_LIMIT || '10mb',
  silentPaths: process.env.SILENT_PATHS ?
    process.env.SILENT_PATHS.split(',').map(path => path.trim()) :
    ['/api/status/logs', '/api/status', '/api/config', '/'],
  logRequestEnabled: process.env.LOG_REQUEST_ENABLED !== 'false'
};

// 中间件配置
app.use(cors({
  origin: serverConfig.corsOrigins,
  credentials: true
}));

app.use(express.json({ limit: serverConfig.requestBodySizeLimit }));
app.use(express.urlencoded({ extended: true, limit: serverConfig.requestBodySizeLimit }));

// 重写console.log以捕获所有日志输出
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = function(...args) {
  // 调用原始console.log
  originalConsoleLog.apply(console, args);

  // 写入到日志文件
  try {
    const timestamp = new Date().toISOString();
    const logMessage = args.join(' ');
    const logLine = `[${timestamp}] ${logMessage}\n`;

    fsSync.appendFileSync(logFilePath, logLine);
  } catch (error) {
    originalConsoleError('写入日志失败:', error.message);
  }
};

console.error = function(...args) {
  // 调用原始console.error
  originalConsoleError.apply(console, args);

  // 写入到日志文件
  try {
    const timestamp = new Date().toISOString();
    const logMessage = args.join(' ');
    const logLine = `[${timestamp}] ERROR: ${logMessage}\n`;

    fsSync.appendFileSync(logFilePath, logLine);
  } catch (error) {
    originalConsoleError('写入日志失败:', error.message);
  }
};

console.warn = function(...args) {
  // 调用原始console.warn
  originalConsoleWarn.apply(console, args);

  // 写入到日志文件
  try {
    const timestamp = new Date().toISOString();
    const logMessage = args.join(' ');
    const logLine = `[${timestamp}] WARN: ${logMessage}\n`;

    fsSync.appendFileSync(logFilePath, logLine);
  } catch (error) {
    originalConsoleError('写入日志失败:', error.message);
  }
};

// 请求日志中间件
app.use((req, res, next) => {
  // 检查是否启用请求日志
  if (!serverConfig.logRequestEnabled) {
    return next();
  }

  // 不记录这些频繁的请求，避免日志污染
  if (serverConfig.silentPaths.some(path => req.url === path || req.url.startsWith(path + '?'))) {
    return next();
  }

  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${req.method} ${req.url}\n`;

  // 输出到控制台
  console.log(`📡 ${logMessage.trim()}`);

  // 写入到日志文件
  try {
    const logPath = logFilePath;
    fsSync.appendFileSync(logPath, logMessage);
  } catch (error) {
    console.error('写入日志失败:', error.message);
  }

  next();
});

// API 路由 - 必须在静态文件服务之前
import configRoutes from './routes/config.js';
import statusRoutes from './routes/status.js';
import scrapeRoutes from './routes/scrape.js';

app.use('/api/config', configRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/scrape', scrapeRoutes);
console.log('✅ API 路由加载完成');

// 静态文件服务 - 提供前端界面
app.use(express.static(path.join(__dirname, '..')));


// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    platform: platform,
    environment: NODE_ENV,
    version: '1.0.0',
    services: {
      storage: '本地文件系统',
      email: 'EmailJS',
      scraper: 'Puppeteer'
    }
  });
});

// 前端界面路由 - 必须在API路由之后
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'index.html');

  // 读取HTML文件并注入前端配置
  try {
    let htmlContent = fsSync.readFileSync(indexPath, 'utf8');

    // 注入前端配置
    const configScript = `
    <script>
      // 注入前端配置
      window.FRONTEND_UPDATE_INTERVAL = ${process.env.FRONTEND_UPDATE_INTERVAL || 30000};
      window.FRONTEND_API_REQUEST_TIMEOUT = ${process.env.FRONTEND_API_REQUEST_TIMEOUT || 10000};
      window.FRONTEND_LOG_REFRESH_INTERVAL = ${process.env.FRONTEND_LOG_REFRESH_INTERVAL || 1000};
    </script>`;

    // 在</head>前插入配置脚本
    htmlContent = htmlContent.replace('</head>', configScript + '</head>');

    res.send(htmlContent);
  } catch (error) {
    console.error('读取前端文件失败:', error);
    res.sendFile(indexPath);
  }
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    error: '接口未找到',
    path: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// 错误处理中间件
app.use((error, req, res, next) => {
  console.error('❌ 服务器错误:', error);

  res.status(error.status || 500).json({
    error: '服务器内部错误',
    message: NODE_ENV === 'development' ? error.message : '请联系管理员',
    timestamp: new Date().toISOString(),
    path: req.url
  });
});

// 启动监控服务
async function startMonitoringService() {
  try {
    const { monitorService } = await import('./services/monitor-service.js');

    // 检查监控状态
    const config = await import('./services/storage.js').then(m => m.storageService.getConfig());

    if (config && config.monitoring_enabled) {
      console.log('🕐 监控服务已启动，配置已启用');

      // 可选：立即运行一次监控测试
      if (process.env.RUN_MONITORING_ON_START === 'true') {
        console.log('🔄 执行启动时监控检查...');
        const result = await monitorService.runMonitoring();
        if (result.success) {
          console.log('✅ 启动时监控检查完成');
        } else {
          console.log(`⚠️  启动时监控检查: ${result.reason || result.error}`);
        }
      }
    } else {
      console.log('🕐 监控服务已就绪（当前未启用）');
    }
  } catch (error) {
    console.error('❌ 监控服务启动失败:', error);
  }
}

// 启动日志清理定时任务
function startLogCleanup() {
  // 每天凌晨2点执行清理
  setInterval(async () => {
    try {
      const { loggerService } = await import('./services/logger.js');
      await loggerService.cleanupOldLogs();
    } catch (error) {
      console.error('❌ 定时清理日志失败:', error);
    }
  }, 24 * 60 * 60 * 1000); // 24小时

  // 立即执行一次清理
  setTimeout(async () => {
    try {
      const { loggerService } = await import('./services/logger.js');
      await loggerService.cleanupOldLogs();
    } catch (error) {
      console.error('❌ 初始清理日志失败:', error);
    }
  }, 60 * 1000); // 1分钟后执行
}

// 启动服务器
async function startServer() {
  try {
    // 确保目录存在
    await ensureDirectories();

    // 启动日志清理任务
    startLogCleanup();

    // 启动监控服务
    await startMonitoringService();

    // 启动HTTP服务器
    app.listen(PORT, () => {
      console.log('\n🚀 CoinGlass 监控系统启动成功！');
      console.log('=====================================');
      console.log(`🌐 服务地址: http://localhost:${PORT}`);
      console.log(`🔍 健康检查: http://localhost:${PORT}/health`);
      console.log(`💻 平台: ${platform}`);
      console.log(`🔧 环境: ${NODE_ENV}`);
      console.log(`📁 数据目录: ${process.env.DATA_DIR || './data'}`);
      console.log(`📋 日志目录: ${process.env.LOGS_DIR || './logs'}`);
      console.log('=====================================');
      console.log('⏰ 启动时间:', new Date().toLocaleString());
      console.log('🗑️ 日志清理: 每天凌晨2点自动清理7天前的日志');
      });

  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n🛑 正在关闭服务器...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 收到终止信号，正在关闭服务器...');
  process.exit(0);
});

// 未捕获异常处理
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的 Promise 拒绝:', reason);
  console.error('Promise:', promise);
  process.exit(1);
});

// 启动服务器
startServer();

export default app;