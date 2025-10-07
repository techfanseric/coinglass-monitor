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
import zlib from 'zlib';

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量 - 简化配置加载
const projectRoot = path.join(__dirname, '..');
const envPath = path.join(projectRoot, '.env');

// 日志文件现在由LoggerService统一管理

// 读取版本信息
async function getVersionInfo() {
  try {
    const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
    const content = await fs.readFile(changelogPath, 'utf8');
    const changelogData = JSON.parse(content);

    if (changelogData && changelogData.length > 0) {
      const latest = changelogData[0];
      return {
        version: latest.version,
        date: latest.date
      };
    }
    return null;
  } catch (error) {
    return null;
  }
}

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

// Cookie解析中间件 - 必须在会话验证之前
app.use((req, res, next) => {
  const cookies = req.headers.cookie?.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    if (key && value) {
      acc[key] = value;
    }
    return acc;
  }, {}) || {};

  req.cookies = cookies;

  // 设置Cookie的辅助方法
  res.setCookie = (name, value, options = {}) => {
    let cookie = `${name}=${value}`;
    if (options.maxAge) cookie += `; Max-Age=${options.maxAge}`;
    if (options.httpOnly) cookie += '; HttpOnly';
    if (options.path) cookie += `; Path=${options.path}`;
    if (options.sameSite) cookie += `; SameSite=${options.sameSite}`;
    console.log('🍪 设置Cookie:', cookie);
    res.setHeader('Set-Cookie', cookie);
  };

  // 清除Cookie的辅助方法
  res.clearCookie = (name) => {
    console.log('🗑️ 清除Cookie:', name);
    res.setHeader('Set-Cookie', `${name}=; Max-Age=0; Path=/`);
  };

  next();
});

// 简单的会话管理中间件 - 必须在Cookie解析之后
const sessions = new Map();

app.use((req, res, next) => {
  const accessPassword = process.env.ACCESS_PASSWORD;

  // 如果未设置密码或使用默认密码，跳过认证
  if (!accessPassword || accessPassword === 'your-secure-password') {
    return next();
  }

  // 检查登录页面、API登录接口和静态资源（CSS、JS、图片）
  const publicPaths = ['/login', '/api/login', '/style.css', '/script.js', '/favicon.ico'];
  if (publicPaths.includes(req.path) || req.path.startsWith('/.') || req.path.endsWith('.css') || req.path.endsWith('.js')) {
    return next();
  }

  // 检查会话
  const sessionId = req.cookies?.sessionId;

  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    const now = Date.now();

    // 向后兼容：处理旧会话数据
    if (!session.lastAccessed) {
      session.lastAccessed = session.created;
      session.lastCookieUpdate = session.created;
    }

    // 检查最后访问时间（24小时内有活动即有效）
    if (now - session.lastAccessed < 24 * 60 * 60 * 1000) {
      // 滑动续期：更新最后访问时间
      session.lastAccessed = now;

      // 定期延长Cookie有效期（每30分钟）
      if (now - session.lastCookieUpdate > 30 * 60 * 1000) {
        session.lastCookieUpdate = now;
        res.setCookie('sessionId', sessionId, {
          maxAge: 24 * 60 * 60,
          httpOnly: true,
          path: '/',
          sameSite: 'Lax'
        });
      }

      return next();
    } else {
      // 会话过期，删除
      console.log('⏰ 会话过期，删除会话');
      sessions.delete(sessionId);
      res.clearCookie('sessionId');
    }
  }

  // 重定向到登录页面 - 静默处理，减少日志噪音
  res.redirect('/login');
});

// 重写console.log以捕获所有日志输出
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = function(...args) {
  // 调用原始console.log
  originalConsoleLog.apply(console, args);

  // 写入到LoggerService（仅当消息不为空时）
  try {
    const logMessage = args.join(' ');
    if (logMessage.trim()) {
      loggerService.info(logMessage);
    }
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

  const logMessage = `${req.method} ${req.url}`;

  // 输出到控制台
  console.log(`📡 ${logMessage}`);

  // 写入到LoggerService
  try {
    loggerService.info(logMessage);
  } catch (error) {
    console.error('写入日志失败:', error.message);
  }

  next();
});

// 登录页面路由
app.get('/login', (req, res) => {
  const accessPassword = process.env.ACCESS_PASSWORD;

  // 如果未设置密码或使用默认密码，直接重定向到主页
  if (!accessPassword || accessPassword === 'your-secure-password') {
    return res.redirect('/');
  }

  // 如果已登录，重定向到主页
  const sessionId = req.cookies?.sessionId;
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    const now = Date.now();

    // 向后兼容：处理旧会话数据
    if (!session.lastAccessed) {
      session.lastAccessed = session.created;
      session.lastCookieUpdate = session.created;
    }

    // 检查最后访问时间（24小时内有活动即有效）
    if (now - session.lastAccessed < 24 * 60 * 60 * 1000) {
      // 滑动续期：更新最后访问时间
      session.lastAccessed = now;

      // 定期延长Cookie有效期（每30分钟）
      if (now - session.lastCookieUpdate > 30 * 60 * 1000) {
        session.lastCookieUpdate = now;
        res.setCookie('sessionId', sessionId, {
          maxAge: 24 * 60 * 60,
          httpOnly: true,
          path: '/',
          sameSite: 'Lax'
        });
      }

      return res.redirect('/');
    } else {
      // 会话过期，删除
      sessions.delete(sessionId);
      res.clearCookie('sessionId');
    }
  }

  // 显示登录页面
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

// 登录验证API
app.post('/api/login', (req, res) => {
  const accessPassword = process.env.ACCESS_PASSWORD;

  // 如果未设置密码或使用默认密码，直接成功
  if (!accessPassword || accessPassword === 'your-secure-password') {
    return res.json({ success: true });
  }

  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ success: false, message: '请输入密码' });
  }

  if (password === accessPassword) {
    // 生成会话ID
    const sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    sessions.set(sessionId, {
      created: Date.now(),
      lastAccessed: Date.now(),
      lastCookieUpdate: Date.now()
    });

    console.log('🔐 登录成功，设置会话:', { sessionId, totalSessions: sessions.size });

    // 设置Cookie（24小时过期）
    res.setCookie('sessionId', sessionId, {
      maxAge: 24 * 60 * 60, // 24小时
      httpOnly: true,
      path: '/',
      sameSite: 'Lax'
    });

    res.json({ success: true });
  } else {
    console.log('❌ 密码错误');
    res.status(401).json({ success: false, message: '密码错误' });
  }
});

// 登出API
app.post('/api/logout', (req, res) => {
  const sessionId = req.cookies?.sessionId;
  if (sessionId && sessions.has(sessionId)) {
    sessions.delete(sessionId);
    res.clearCookie('sessionId');
  }

  res.json({ success: true });
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


// 版本信息API端点
app.get('/api/version', async (req, res) => {
  const versionInfo = await getVersionInfo();
  if (versionInfo) {
    res.json(versionInfo);
  } else {
    res.status(404).json({ error: '版本信息不可用' });
  }
});

// 健康检查端点
app.get('/health', async (req, res) => {
  const versionInfo = await getVersionInfo();
  const healthData = {
    status: 'ok',
    timestamp: formatDateTime(new Date()),
    platform: platform,
    environment: NODE_ENV,
    services: {
      storage: '本地文件系统',
      email: 'EmailJS',
      scraper: 'Puppeteer'
    }
  };

  if (versionInfo) {
    healthData.version = versionInfo.version;
    healthData.versionDate = versionInfo.date;
  }

  res.json(healthData);
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
  // 检查是否启用自动更新（支持true或Git仓库地址）
  const autoUpdateConfig = process.env.ENABLE_AUTO_UPDATE;
  if (!autoUpdateConfig || autoUpdateConfig === 'false') {
    return; // 静默跳过，这是默认安全设置
  }

  console.log('🔄 启动Git自动更新...');

  // 检查是否为Git仓库
  let isGitRepo = false;
  try {
    const isGitRepoCheck = spawn('git', ['rev-parse', '--git-dir'], { stdio: 'ignore', shell: true });
    if (isGitRepoCheck.status === 0) {
      isGitRepo = true;
    }
  } catch (error) {
    // Git检查失败，继续尝试备用方案
  }

  // 如果不是Git仓库但配置了Git地址，使用备用更新方案
  if (!isGitRepo && autoUpdateConfig !== 'true' && autoUpdateConfig.startsWith('http')) {
    console.log('📦 检测到非Git仓库，使用ZIP自动更新方案...');
    startZipAutoUpdate(autoUpdateConfig);
    return;
  }

  if (!isGitRepo) {
    console.log('⚠️  非Git仓库且未配置Git地址，跳过自动更新');
    console.log('💡 提示：设置 ENABLE_AUTO_UPDATE=https://github.com/user/repo.git 启用ZIP自动更新');
    return;
  }

  // 每5分钟检查一次更新
  setInterval(() => {
    (async () => {
      try {
        // 检查工作目录状态
        const gitStatus = spawn('git', ['status', '--porcelain'], { stdio: 'pipe', shell: true });
        if (gitStatus.status !== 0) return;

        // 检查远程更新
        const fetchResult = spawn('git', ['fetch', 'origin'], { stdio: 'pipe', shell: true });
        if (fetchResult.status !== 0) return;

        // 等待fetch完成
        await new Promise(resolve => {
          fetchResult.on('close', resolve);
        });

        const localCommit = spawn('git', ['rev-parse', 'HEAD'], { stdio: 'pipe', shell: true });
        const remoteCommit = spawn('git', ['rev-parse', 'origin/main'], { stdio: 'pipe', shell: true });

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

            // 拉取更新 - 使用pipe避免Windows控制台问题
            console.log('📥 正在拉取最新代码...');
            const pullResult = spawn('git', ['pull'], { stdio: 'pipe', shell: true });

            pullResult.stdout.on('data', (data) => {
              console.log(data.toString().trim());
            });

            pullResult.stderr.on('data', (data) => {
              console.error('Git错误:', data.toString().trim());
            });

            pullResult.on('close', (code) => {
              if (code === 0) {
                console.log('✅ 更新完成，服务将在5秒后重启...');
                setTimeout(() => {
                  process.exit(0); // 进程管理器会自动重启
                }, 5000);
              } else {
                console.error('❌ Git拉取失败，退出代码:', code);
              }
            });
          }
        }
      } catch (error) {
        console.log('⚠️  自动更新检查失败:', error.message);
      }
    })();
  }, 5 * 60 * 1000); // 5分钟
}

// ZIP自动更新功能（用于非Git仓库部署）
async function startZipAutoUpdate(gitRepoUrl) {
  console.log(`📦 ZIP自动更新已启用，仓库: ${gitRepoUrl}`);

  // 从Git URL获取GitHub API URL
  const githubApiUrl = gitRepoUrl
    .replace('https://github.com/', 'https://api.github.com/repos/')
    .replace(/\.git$/, '');

  // 立即检查一次更新
  await checkZipUpdate(githubApiUrl);

  // 每5分钟检查一次更新
  setInterval(async () => {
    await checkZipUpdate(githubApiUrl);
  }, 5 * 60 * 1000); // 5分钟
}

// 检查ZIP更新
async function checkZipUpdate(githubApiUrl) {
  try {

    // 获取最新commit信息
    const response = await fetch(`${githubApiUrl}/commits/main`);
    if (!response.ok) {
      console.log('⚠️  无法获取commit信息，跳过更新检查');
      return;
    }

    const commitData = await response.json();
    const latestCommit = commitData.sha;
    const commitDate = commitData.commit.committer.date;
    const zipUrl = `${githubApiUrl}/zipball/main`;

    // 读取当前commit信息
    let currentCommit = 'unknown';
    try {
      const commitInfoPath = path.join(__dirname, '..', 'data', 'current-commit.json');
      if (await fs.access(commitInfoPath).then(() => true).catch(() => false)) {
        const commitInfoContent = await fs.readFile(commitInfoPath, 'utf8');
        const commitInfo = JSON.parse(commitInfoContent);
        currentCommit = commitInfo.sha;
      }
    } catch (error) {
      console.warn('⚠️  无法读取当前commit信息');
    }

    // 比较commit
    if (latestCommit !== currentCommit && currentCommit !== 'unknown') {
      console.log(`🔄 发现新提交: ${latestCommit.substring(0, 7)} (当前: ${currentCommit.substring(0, 7)})`);
      console.log(`📅 提交时间: ${new Date(commitDate).toLocaleString('zh-CN')}`);
      await performZipUpdate(zipUrl, latestCommit, commitDate);
    } else if (currentCommit === 'unknown') {
      console.log('⚠️  无法确定当前版本，将直接更新到最新版本');
      console.log(`📅 最新提交: ${latestCommit.substring(0, 7)} (${new Date(commitDate).toLocaleString('zh-CN')})`);
      await performZipUpdate(zipUrl, latestCommit, commitDate);
    } else {
      // 代码已是最新，静默处理不输出日志
    }

  } catch (error) {
    console.log('⚠️  ZIP更新检查失败:', error.message);
  }
}

// 保存当前commit信息
async function saveCurrentCommit(sha, date) {
  try {
    const commitInfoPath = path.join(__dirname, '..', 'data', 'current-commit.json');
    await fs.mkdir(path.dirname(commitInfoPath), { recursive: true });
    const commitInfo = {
      sha: sha,
      date: date,
      savedAt: new Date().toISOString()
    };
    await fs.writeFile(commitInfoPath, JSON.stringify(commitInfo, null, 2));
    console.log(`✅ 已记录当前commit: ${sha.substring(0, 7)}`);
  } catch (error) {
    console.warn('⚠️  保存commit信息失败:', error.message);
  }
}

// 自动解压和替换文件
async function extractAndReplace(zipPath, newCommit, commitDate) {
  try {
    const projectRoot = path.join(__dirname, '..');
    const tempExtractDir = path.join(projectRoot, 'temp-update');

    // 清理之前的临时目录
    try {
      await fs.rm(tempExtractDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }

    // 创建临时解压目录
    await fs.mkdir(tempExtractDir, { recursive: true });

    console.log('📦 开始解压ZIP文件...');

    // 使用系统命令解压ZIP文件
    let extractCommand;
    const platform = os.platform();

    if (platform === 'win32') {
      // Windows 使用 PowerShell 解压
      extractCommand = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tempExtractDir}' -Force"`;
    } else {
      // macOS/Linux 使用 unzip 命令
      extractCommand = `unzip -o '${zipPath}' -d '${tempExtractDir}'`;
    }

    try {
      execSync(extractCommand, { stdio: 'pipe' });
      console.log('✅ ZIP文件解压成功');
    } catch (error) {
      throw new Error(`解压失败: ${error.message}`);
    }

    // 查找解压后的项目目录（GitHub的ZIP包含一个以用户名-仓库名-commit命名的根目录）
    const extractedDirs = await fs.readdir(tempExtractDir);
    const sourceDir = path.join(tempExtractDir, extractedDirs[0]);

    if (!extractedDirs.length || !(await fs.stat(sourceDir)).isDirectory()) {
      throw new Error('解压后未找到有效的项目目录');
    }

    console.log(`📂 找到源目录: ${extractedDirs[0]}`);

    // 备份当前版本
    const backupDir = path.join(projectRoot, 'backup', `backup-${Date.now()}`);
    await fs.mkdir(path.dirname(backupDir), { recursive: true });

    console.log('💾 创建当前版本备份...');

    // 复制当前项目到备份目录（排除node_modules和data目录）
    await copyDirectory(projectRoot, backupDir, ['node_modules', 'data', 'temp-update', 'backup']);

    // 开始替换文件
    console.log('🔄 开始替换文件...');

    // 复制新版本文件到项目根目录
    await copyDirectory(sourceDir, projectRoot, []);

    console.log('✅ 文件替换完成');
    console.log(`🔄 新commit: ${newCommit.substring(0, 7)} (${new Date(commitDate).toLocaleString('zh-CN')})`);
    console.log(`💾 备份位置: ${backupDir}`);
    console.log('🚀 更新完成，服务将在5秒后重启...');

    // 清理临时文件
    try {
      await fs.rm(tempExtractDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }

    // 延迟重启以完成当前操作
    setTimeout(() => {
      console.log('🔄 重启服务...');
      process.exit(0); // 进程管理器会自动重启
    }, 5000);

  } catch (error) {
    console.error('❌ 自动解压失败:', error.message);
    console.log('💡 请手动更新或检查网络连接');

    // 清理临时文件
    try {
      const tempExtractDir = path.join(__dirname, '..', 'temp-update');
      await fs.rm(tempExtractDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
  }
}

// 复制目录函数
async function copyDirectory(source, target, excludeDirs = []) {
  const entries = await fs.readdir(source, { withFileTypes: true });

  await fs.mkdir(target, { recursive: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    // 跳过排除的目录
    if (entry.isDirectory() && excludeDirs.includes(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      // 递归复制子目录
      await copyDirectory(sourcePath, targetPath, excludeDirs);
    } else {
      // 复制文件
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

// 执行ZIP更新
async function performZipUpdate(zipUrl, newCommit, commitDate) {
  try {
    console.log('🔄 开始ZIP更新...');

    // 创建备份
    try {
      const { storageService } = await import('./services/storage.js');
      const backupPath = await storageService.backup();
      if (backupPath) {
        console.log(`✅ 更新前备份已创建: ${backupPath}`);
      }
    } catch (error) {
      console.warn('⚠️  更新前备份失败:', error.message);
    }

    // 下载ZIP文件
    const tempZipPath = path.join(__dirname, '..', 'temp-update.zip');
    console.log('📥 下载最新代码...');

    const zipResponse = await fetch(zipUrl);
    if (!zipResponse.ok) {
      throw new Error(`下载失败: ${zipResponse.status}`);
    }

    const buffer = await zipResponse.arrayBuffer();
    await fs.writeFile(tempZipPath, Buffer.from(buffer));

    console.log('✅ ZIP下载完成，准备自动解压...');

    // 自动解压和替换文件
    await extractAndReplace(tempZipPath, newCommit, commitDate);

    // 更新当前commit信息
    await saveCurrentCommit(newCommit, commitDate);

    // 清理临时文件
    try {
      await fs.unlink(tempZipPath);
    } catch (error) {
      // 忽略清理错误
    }

  } catch (error) {
    console.error('❌ ZIP更新失败:', error.message);
  }
}

// 启动服务器
async function startServer() {
  try {
    console.log('🚀 CoinGlass 监控系统启动中...');

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