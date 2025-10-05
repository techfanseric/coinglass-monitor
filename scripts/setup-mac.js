/**
 * Mac 环境设置脚本
 * 自动配置 Mac 环境下的 Chrome 路径和其他设置
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const execAsync = promisify(exec);

async function setupMac() {
  console.log('🔧 Mac 环境配置');
  console.log('================');

  try {
    // 检查 Chrome 安装路径
    const chromePaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/usr/bin/google-chrome-stable',
      '/usr/local/bin/chrome'
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

    // 如果没找到，尝试使用 which 命令
    if (!chromePath) {
      try {
        const { stdout } = await execAsync('which google-chrome-stable || which chrome || which chromium');
        chromePath = stdout.trim();
        console.log(`✅ 找到 Chrome: ${chromePath}`);
      } catch {
        console.log('⚠️  未找到 Chrome，请手动安装或设置 PUPPETEER_EXECUTABLE_PATH');
      }
    }

    // 创建或更新 .env.mac 文件
    const envPath = path.join(projectRoot, '.env.mac');
    let envContent = '';

    try {
      const existingEnv = await fs.readFile(envPath, 'utf8');
      envContent = existingEnv;
    } catch {
      // 文件不存在，使用默认内容
      envContent = `# Mac 环境配置文件

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
    console.log('✅ Mac 环境配置文件已更新');

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

    console.log('\n🎉 Mac 环境配置完成！');
    console.log('================');
    console.log('下一步:');
    console.log('1. 配置 EmailJS 参数（如果需要邮件功能）');
    console.log('2. 运行 scripts/start-mac.sh 启动服务');
    console.log('3. 访问 http://localhost:3001 使用系统');

  } catch (error) {
    console.error('❌ Mac 环境配置失败:', error);
    process.exit(1);
  }
}

// 运行配置
setupMac().catch(console.error);