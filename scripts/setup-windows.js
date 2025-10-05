/**
 * Windows 环境设置脚本
 * 自动配置 Windows 环境下的 Chrome 路径和其他设置
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

async function setupWindows() {
  console.log('🔧 Windows 环境配置');
  console.log('==================');

  try {
    // 检查常见的 Chrome 安装路径
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
    ];

    let chromePath = null;
    for (const path of chromePaths) {
      try {
        await fs.access(path);
        chromePath = path;
        console.log(`✅ 找到 Chrome: ${path}`);
        break;
      } catch {
        continue;
      }
    }

    if (!chromePath) {
      console.log('⚠️  未找到 Chrome，请手动设置 PUPPETEER_EXECUTABLE_PATH');
    }

    // 创建或更新 .env.windows 文件
    const envPath = path.join(projectRoot, '.env.windows');
    let envContent = '';

    try {
      const existingEnv = await fs.readFile(envPath, 'utf8');
      envContent = existingEnv;
    } catch {
      // 文件不存在，使用默认内容
      envContent = `# Windows 环境配置文件

# 服务配置
PORT=3001
NODE_ENV=production
DATA_DIR=./data
LOGS_DIR=./logs

# Puppeteer 配置
PUPPETEER_HEADLESS=true
PUPPETEER_TIMEOUT=60000
PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage

# EmailJS 配置
EMAILJS_SERVICE_ID=service_njwa17p
EMAILJS_TEMPLATE_ID=template_2a6ntkh
EMAILJS_PUBLIC_KEY=R2I8depNfmvcV7eTz
EMAILJS_PRIVATE_KEY=R2I8depNfmvcV7eTz

# 监控配置
MONITORING_ENABLED=true
MONITORING_INTERVAL=3600000
MONITORING_SCHEDULE=0 * * * *

# 数据库配置
CONFIG_FILE=./data/config.json
STATE_FILE=./data/state.json

# 日志配置
LOG_LEVEL=info
LOG_FILE=./logs/server.log

# 抓取配置
SCRAPER_RETRY_COUNT=3
SCRAPER_DELAY=2000
SCRAPER_TIMEOUT=30000

# 邮件配置
EMAIL_RETRY_COUNT=3
EMAIL_RATE_LIMIT=1000
`;
    }

    // 更新 Chrome 路径
    if (chromePath) {
      const chromeLine = `PUPPETEER_EXECUTABLE_PATH=${chromePath}`;
      if (envContent.includes('PUPPETEER_EXECUTABLE_PATH=')) {
        envContent = envContent.replace(/PUPPETEER_EXECUTABLE_PATH=.*/, chromeLine);
      } else {
        envContent = envContent.replace('# Puppeteer 配置', `# Puppeteer 配置\n${chromeLine}`);
      }
    }

    await fs.writeFile(envPath, envContent);
    console.log('✅ Windows 环境配置文件已更新');

    // 创建必要的目录
    const directories = ['data', 'logs', 'data/email-history', 'data/scrape-history', 'data/backups'];
    for (const dir of directories) {
      const dirPath = path.join(projectRoot, dir);
      try {
        await fs.mkdir(dirPath, { recursive: true });
        console.log(`✅ 目录已创建: ${dir}`);
      } catch {
        // 目录可能已存在
      }
    }

    console.log('\n🎉 Windows 环境配置完成！');
    console.log('==================');
    console.log('下一步:');
    console.log('1. 配置 EmailJS 参数（如果需要邮件功能）');
    console.log('2. 运行 scripts/start-windows.bat 启动服务');
    console.log('3. 访问 http://localhost:3001 使用系统');

  } catch (error) {
    console.error('❌ Windows 环境配置失败:', error);
    process.exit(1);
  }
}

// 运行配置
setupWindows().catch(console.error);