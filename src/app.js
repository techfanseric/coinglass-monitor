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
import { createConnection } from 'net';
import { spawn, execSync } from 'child_process';
import cron from 'node-cron';
import { formatDateTime, formatDateTimeCN } from './utils/time-utils.js';
import { loggerService } from './services/logger.js';
import readline from 'readline';

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量 - 简化配置加载
const projectRoot = path.join(__dirname, '..');
const envPath = path.join(projectRoot, '.env');

// 日志文件现在由LoggerService统一管理

try {
  dotenv.config({ path: envPath });
  console.log('✅ 已加载环境配置 (.env)');
} catch (error) {
  console.error('❌ 加载环境配置失败:', error.message);
  console.log('💡 请复制 .env.example 为 .env 并配置相关参数');
}

const app = express();
const PORT = process.env.PORT;
const NODE_ENV = process.env.NODE_ENV || 'development';
const platform = os.platform();

// 端口占用检查
async function checkPort(port) {
  try {
    // 使用 lsof 命令直接检查端口占用（macOS/Linux）
    if (platform !== 'win32') {
      const pid = execSync(`lsof -ti:${port}`, { encoding: 'utf8', stdio: 'pipe' }).trim();
      return pid.length > 0;
    } else {
      // Windows 使用网络连接检查
      return new Promise((resolve) => {
        const server = createConnection({ host: 'localhost', port });
        let resolved = false;

        server.on('connect', () => {
          if (!resolved) {
            resolved = true;
            server.destroy();
            resolve(true); // 端口被占用
          }
        });

        server.on('error', (err) => {
          if (!resolved) {
            resolved = true;
            resolve(err.code === 'ECONNREFUSED' ? false : true);
          }
        });

        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            server.destroy();
            resolve(false);
          }
        }, 2000);
      });
    }
  } catch (error) {
    // lsof 命令失败，说明端口未被占用
    return false;
  }
}

// 获取占用端口的进程信息
function getPortProcess(port) {
  try {
    if (platform === 'win32') {
      // Windows
      const result = spawn('cmd', ['/c', `netstat -ano | findstr :${port}`], {
        stdio: 'pipe',
        shell: true
      });

      // 简化处理：返回基本信息
      return { pid: 'unknown', name: 'Windows进程' };
    } else {
      // macOS/Linux - 使用同步方式获取进程信息
      try {
        const pid = execSync(`lsof -ti:${port}`, { encoding: 'utf8', stdio: 'pipe' }).trim();
        if (pid) {
          try {
            const processName = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8', stdio: 'pipe' }).trim();
            return { pid: parseInt(pid), name: processName || '未知进程' };
          } catch {
            return { pid: parseInt(pid), name: '未知进程' };
          }
        }
      } catch (error) {
        // 无法获取进程信息
      }
    }
  } catch (error) {
    // 无法获取进程信息
  }
  return null;
}

// 交互式询问用户
async function askToKillProcess(port, processInfo) {
  if (process.env.SKIP_PORT_CHECK === 'true') {
    return true;
  }

  console.log(`⚠️  端口 ${port} 已被占用`);
  if (processInfo) {
    console.log(`进程信息: PID ${processInfo.pid}, 名称: ${processInfo.name}`);
  }
  console.log('');

  // 在非交互环境下（如CI/CD），自动终止进程
  // 但在开发模式下仍然保持交互
  if (!process.stdin.isTTY && process.env.NODE_ENV === 'production') {
    console.log('🔄 非交互环境，自动终止占用进程...');
    return true;
  }

  console.log('💡 请选择处理方式：');
  console.log('📝 直接回车 = 自动关闭占用进程并继续启动');
  console.log('📝 Ctrl+C = 退出程序');
  console.log('⏱️  10秒后未选择将自动处理...');
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  let countdown = 10;
  let countdownInterval;

  return new Promise((resolve) => {
    // 开始倒计时
    countdownInterval = setInterval(() => {
      if (countdown > 0 && !rl.closed) {
        process.stdout.write(`\r⏱️  倒计时: ${countdown}秒`);
        countdown--;
      } else if (countdown === 0 && !rl.closed) {
        clearInterval(countdownInterval);
        process.stdout.write('\r⏱️  倒计时结束，自动处理中...          \n');
        rl.close();
        console.log('✅ 已自动选择：关闭占用进程并继续启动');
        resolve(true);
      }
    }, 1000);

    rl.question('', (answer) => {
      if (!rl.closed) {
        clearInterval(countdownInterval);
        rl.close();
        console.log('✅ 已选择：关闭占用进程并继续启动');
        resolve(true);
      }
    });

    // 监听 Ctrl+C
    rl.on('SIGINT', () => {
      if (!rl.closed) {
        clearInterval(countdownInterval);
        rl.close();
        console.log('\n❌ 用户取消操作');
        resolve(false);
      }
    });
  });
}

// 终止进程
function killProcess(pid) {
  try {
    if (platform === 'win32') {
      spawn('taskkill', ['/F', '/PID', pid], { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
      // 2秒后检查是否还在运行
      setTimeout(() => {
        try {
          process.kill(pid, 0);
          process.kill(pid, 'SIGKILL');
        } catch {
          // 进程已终止
        }
      }, 2000);
    }
    return true;
  } catch (error) {
    return false;
  }
}

// 端口占用处理
async function handlePortOccupancy() {
  if (!PORT) {
    console.error('❌ 错误: 未配置 PORT 环境变量');
    process.exit(1);
  }

  const port = parseInt(PORT);
  const isOccupied = await checkPort(port);

  if (isOccupied) {
    const processInfo = getPortProcess(port);
    const shouldKill = await askToKillProcess(port, processInfo);

    if (shouldKill === false) {
      console.log('❌ 用户取消操作，程序退出');
      process.exit(0);
    }

    if (shouldKill && processInfo?.pid && processInfo.pid !== 'unknown') {
      console.log('🔄 正在关闭占用进程...');

      if (killProcess(processInfo.pid)) {
        console.log('✅ 占用进程已关闭');

        // 等待端口释放，增加重试检查
        console.log('⏳ 等待端口释放...');
        let retries = 0;
        const maxRetries = 10;

        while (retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const stillOccupied = await checkPort(port);

          if (!stillOccupied) {
            console.log('✅ 端口已释放');
            break;
          }

          retries++;
          if (retries < maxRetries) {
            console.log(`⏳ 等待端口释放中... (${retries}/${maxRetries})`);
          }
        }

        // 最后检查
        const stillOccupied = await checkPort(port);
        if (stillOccupied) {
          console.log('⚠️  端口仍被占用，请手动处理');
          process.exit(1);
        } else {
          console.log('✅ 端口已释放并检查通过');
        }
      } else {
        console.log('❌ 无法关闭进程，请手动处理');
        process.exit(1);
      }
    }
  } else {
    // 端口未被占用，直接显示检查通过
    console.log(`✅ 端口 ${port} 检查通过`);
  }
}

// 确保必要目录存在
async function ensureDirectories() {
  const directories = [
    process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
    process.env.LOGS_DIR || path.join(__dirname, '..', 'logs'),
    path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'email-history'),
    path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'scrape-history'),
    path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'backups')
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

// 环境准备
async function prepareEnvironment() {
  console.log('🔧 环境准备中...');

  // 确保目录存在
  await ensureDirectories();

  // 检查并复制 .env 文件
  const envPath = path.join(projectRoot, '.env');
  const envExamplePath = path.join(projectRoot, '.env.example');

  try {
    await fs.access(envPath);
    // .env 文件已存在，静默处理（因为前面已显示加载成功）
  } catch {
    try {
      await fs.copyFile(envExamplePath, envPath);
      console.log('✅ .env 文件已创建（从 .env.example 复制）');
    } catch {
      console.log('⚠️  警告: 无法创建 .env 文件，请手动创建');
    }
  }

  console.log('✅ 环境准备完成');
}

// 从环境变量加载服务器配置
const serverConfig = {
  corsOrigins: process.env.CORS_ORIGINS ?
    process.env.CORS_ORIGINS.split(',').map(origin => origin.trim()) :
    ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'],
  requestBodySizeLimit: process.env.REQUEST_BODY_SIZE_LIMIT || '10mb',
  silentPaths: process.env.SILENT_PATHS ?
    process.env.SILENT_PATHS.split(',').map(path => path.trim()) :
    ['/api/status/logs', '/api/status', '/api/config', '/', '/script.js', '/style.css', '/.well-known/appspecific/com.chrome.devtools.json'],
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

  // 写入到LoggerService
  try {
    const logMessage = args.join(' ');
    loggerService.info(logMessage);
  } catch (error) {
    originalConsoleError('写入日志失败:', error.message);
  }
};

console.error = function(...args) {
  // 调用原始console.error
  originalConsoleError.apply(console, args);

  // 写入到LoggerService
  try {
    const logMessage = args.join(' ');
    loggerService.error(logMessage);
  } catch (error) {
    originalConsoleError('写入日志失败:', error.message);
  }
};

console.warn = function(...args) {
  // 调用原始console.warn
  originalConsoleWarn.apply(console, args);

  // 写入到LoggerService
  try {
    const logMessage = args.join(' ');
    loggerService.warn(logMessage);
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

  // 不记录静态文件请求（CSS, JS, 图片等）
  const staticFileExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
  const urlPath = req.url.toLowerCase();
  if (staticFileExtensions.some(ext => urlPath.endsWith(ext)) || urlPath.includes('/.well-known/')) {
    return next();
  }

  // 不记录浏览器开发者工具的请求
  if (urlPath.includes('chrome-devtools') || urlPath.includes('devtools')) {
    return next();
  }

  const timestamp = formatDateTime(new Date());
  const logMessage = `${timestamp} - ${req.method} ${req.url}\n`;

  // 输出到控制台
  console.log(`📡 ${logMessage.trim()}`);

  // 写入到LoggerService
  try {
    loggerService.info(logMessage.trim());
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
app.use(express.static(path.join(__dirname, '..', 'public')));

// 提供CHANGELOG.md文件访问
app.get('/CHANGELOG.md', async (req, res) => {
  try {
    const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
    const changelogContent = await fs.readFile(changelogPath, 'utf8');
    res.type('text/plain').send(changelogContent);
  } catch (error) {
    console.error('读取CHANGELOG.md失败:', error);
    res.status(404).send('更新日志文件未找到');
  }
});


// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: formatDateTime(new Date()),
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
  const indexPath = path.join(__dirname, '..', 'public', 'index.html');

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
    timestamp: formatDateTime(new Date())
  });
});

// 错误处理中间件
app.use((error, req, res, next) => {
  console.error('❌ 服务器错误:', error);

  res.status(error.status || 500).json({
    error: '服务器内部错误',
    message: NODE_ENV === 'development' ? error.message : '请联系管理员',
    timestamp: formatDateTime(new Date()),
    path: req.url
  });
});

// 启动监控服务
async function startMonitoringService() {
  try {
    const { monitorService } = await import('./services/monitor-service.js');

    // 静默启动监控服务
    const config = await import('./services/storage.js').then(m => m.storageService.getConfig());

    // 可选：立即运行一次监控测试
    if (process.env.RUN_MONITORING_ON_START === 'true') {
      await monitorService.runMonitoring();
    }
  } catch (error) {
    console.error('❌ 监控服务启动失败:', error);
  }
}

// 启动监控定时调度
function startMonitoringScheduler() {
  if (process.env.MONITORING_AUTO_START === 'true') {
    const schedulePattern = process.env.MONITORING_CRON_SCHEDULE || '*/5 * * * *';
    const timezone = process.env.MONITORING_TIMEZONE || 'Asia/Shanghai';

    const monitoringTask = cron.schedule(schedulePattern, async () => {
      try {
        // 直接运行监控（内部会检查触发条件和邮件组配置）
        const { monitorService } = await import('./services/monitor-service.js');
        await monitorService.runMonitoring();
      } catch (error) {
        console.error('❌ 定时监控任务执行失败:', error);
      }
    }, {
      scheduled: true,
      timezone: timezone
    });

    // 静默启动，不输出详细日志
  }
}

// 将cron表达式转换为友好的描述
function getCronDescription(cronExpr) {
  // 优先使用环境配置的描述
  if (cronExpr === process.env.DATA_CLEANUP_SCHEDULE && process.env.DATA_CLEANUP_TIME_DESCRIPTION) {
    return process.env.DATA_CLEANUP_TIME_DESCRIPTION;
  }

  const parts = cronExpr.split(' ');
  if (parts.length !== 5) return cronExpr;

  const [minute, hour, day, month, dayOfWeek] = parts;

  if (minute === '0' && hour === '2' && day === '*' && month === '*' && dayOfWeek === '*') {
    return '每天02:00';
  } else if (minute === '0' && hour === '*' && day === '*' && month === '*' && dayOfWeek === '*') {
    return '每小时';
  } else if (cronExpr === '*/5 * * * *') {
    return '每5分钟';
  } else {
    return cronExpr;
  }
}

// 启动数据清理定时任务
function startDataCleanup() {
  // 检查是否启用数据清理
  if (process.env.DATA_CLEANUP_ENABLED !== 'true') {
    return null;
  }

  // 使用配置的清理时间，默认每天凌晨2点
  const cleanupSchedule = process.env.DATA_CLEANUP_SCHEDULE || '0 2 * * *';

  const cleanupTask = cron.schedule(cleanupSchedule, async () => {
    try {
      const { dataCleanupService } = await import('./services/data-cleanup.js');
      // 静默执行清理，只在需要时输出日志
      await dataCleanupService.cleanupAll();
    } catch (error) {
      console.error('❌ 定时数据清理失败:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Shanghai' // 使用中国时区
  });

  return cleanupTask;
}

// Git自动更新（仅在脚本启动模式下明确启用）
function startGitAutoUpdate() {
  // 只有明确启用自动更新时才启动（防止误操作）
  if (process.env.ENABLE_AUTO_UPDATE !== 'true') {
    return; // 静默跳过，这是默认安全设置
  }

  console.log('🔄 启动Git自动更新...');

  // 检查是否为Git仓库
  try {
    const isGitRepo = spawn('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' });
    if (isGitRepo.status !== 0) {
      console.log('⚠️  非Git仓库，跳过自动更新');
      return;
    }
  } catch {
    console.log('⚠️  Git检查失败，跳过自动更新');
    return;
  }

  // 每5分钟检查一次更新
  setInterval(async () => {
    try {
      const gitStatus = spawn('git', ['status', '--porcelain'], { stdio: 'pipe' });
      if (gitStatus.status !== 0) return;

      // 检查远程更新
      const fetchResult = spawn('git', ['fetch'], { stdio: 'ignore' });
      if (fetchResult.status !== 0) return;

      const localCommit = spawn('git', ['rev-parse', 'HEAD'], { stdio: 'pipe' });
      const remoteCommit = spawn('git', ['rev-parse', 'origin/main'], { stdio: 'pipe' });

      if (localCommit.status === 0 && remoteCommit.status === 0) {
        const local = localCommit.stdout.toString().trim();
        const remote = remoteCommit.stdout.toString().trim();

        if (local !== remote) {
          console.log('🔄 发现新版本，开始更新...');

          // 创建完整备份（配置和状态）
          try {
            const { storageService } = await import('./services/storage.js');
            const backupPath = await storageService.backup();
            if (backupPath) {
              console.log(`✅ 更新前备份已创建: ${backupPath}`);
            }
          } catch (error) {
            console.warn('⚠️  更新前备份失败:', error.message);
          }

          // 拉取更新
          const pullResult = spawn('git', ['pull'], { stdio: 'inherit' });
          if (pullResult.status === 0) {
            console.log('✅ 更新完成，服务将在5秒后重启...');
            setTimeout(() => {
              process.exit(0); // 进程管理器会自动重启
            }, 5000);
          }
        }
      }
    } catch (error) {
      console.log('⚠️  自动更新检查失败:', error.message);
    }
  }, 5 * 60 * 1000); // 5分钟
}

// 启动服务器
async function startServer() {
  try {
    console.log('🚀 CoinGlass 监控系统启动中...');
    console.log('');

    // 环境准备
    await prepareEnvironment();

    // 端口占用检查
    await handlePortOccupancy();

    // 启动数据清理任务
    startDataCleanup();

    // 启动监控服务
    await startMonitoringService();

    // 启动监控定时任务
    startMonitoringScheduler();

    // 启动Git自动更新
    startGitAutoUpdate();

    // 启动HTTP服务器
    app.listen(PORT, () => {
      console.log('\n🚀 CoinGlass 监控系统启动成功！');
      console.log('=====================================');
      console.log(`🌐 服务地址: http://localhost:${PORT}`);
      console.log(`🔍 健康检查: http://localhost:${PORT}/health`);
      console.log(`💻 平台: ${platform} | 🔧 环境: ${NODE_ENV}`);
      console.log(`📁 数据目录: ${process.env.DATA_DIR || './data'} | 📋 日志目录: ${process.env.LOGS_DIR || './logs'}`);
      console.log('=====================================');
      console.log(`⏰ 启动时间: ${formatDateTimeCN(new Date())}`);
      console.log(`🗑️ 数据清理: 每天${process.env.DATA_CLEANUP_TIME_DESCRIPTION || '02:00'}自动清理7天前的所有历史数据（日志、邮件、截图、备份等）`);
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