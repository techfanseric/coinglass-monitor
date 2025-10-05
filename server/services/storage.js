/**
 * 本地存储服务
 * 替代 Cloudflare KV，使用本地文件系统存储配置和状态
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { loggerService } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class StorageService {
  constructor() {
    this.dataDir = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
    this.logsDir = process.env.LOGS_DIR || path.join(__dirname, '..', '..', 'logs');
    this.configPath = path.join(this.dataDir, 'config.json');
    this.statePath = path.join(this.dataDir, 'state.json');
    this.emailHistoryDir = path.join(this.dataDir, 'email-history');
  }

  /**
   * 确保必要的目录存在
   */
  async ensureDirectories() {
    const directories = [this.dataDir, this.logsDir, this.emailHistoryDir];

    for (const dir of directories) {
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
        console.log(`📁 创建目录: ${dir}`);
      }
    }
  }

  /**
   * 获取用户配置
   */
  async getConfig() {
    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      const config = JSON.parse(data);
      // 静默处理配置读取，避免干扰系统日志
      return config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // 静默处理配置不存在的情况
        return this.getDefaultConfig();
      }
      console.error('❌ 读取配置失败:', error);
      return null;
    }
  }

  /**
   * 保存用户配置
   */
  async saveConfig(config) {
    try {
      await this.ensureDirectories();
      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
      // 静默处理配置保存，避免干扰系统日志
      return true;
    } catch (error) {
      console.error('❌ 配置保存失败:', error);
      return false;
    }
  }

  /**
   * 获取监控状态
   */
  async getState() {
    try {
      const data = await fs.readFile(this.statePath, 'utf8');
      const state = JSON.parse(data);
      return state;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {};
      }
      console.error('❌ 读取状态失败:', error);
      return {};
    }
  }

  /**
   * 保存监控状态
   */
  async saveState(state) {
    try {
      await this.ensureDirectories();
      await fs.writeFile(this.statePath, JSON.stringify(state, null, 2));
      return true;
    } catch (error) {
      console.error('❌ 状态保存失败:', error);
      return false;
    }
  }

  /**
   * 获取特定币种的状态
   */
  async getCoinState(coinSymbol) {
    try {
      const state = await this.getState();
      const coinState = state[`coin_${coinSymbol}`] || { status: 'normal' };
      return coinState;
    } catch (error) {
      console.error(`❌ 获取币种 ${coinSymbol} 状态失败:`, error);
      return { status: 'normal' };
    }
  }

  /**
   * 更新特定币种的状态
   */
  async updateCoinState(coinSymbol, status, data = {}) {
    try {
      const state = await this.getState();
      state[`coin_${coinSymbol}`] = {
        status,
        ...data,
        updated_at: new Date().toISOString()
      };
      await this.saveState(state);
      loggerService.info(`[存储服务] 币种 ${coinSymbol} 状态更新: ${status}，数据: ${JSON.stringify({
        last_rate: data.last_rate,
        last_notification: data.last_notification,
        next_notification: data.next_notification
      })}`);
      console.log(`💾 币种 ${coinSymbol} 状态更新: ${status}`);
      return true;
    } catch (error) {
      console.error(`❌ 更新币种 ${coinSymbol} 状态失败:`, error);
      return false;
    }
  }

  /**
   * 记录邮件发送历史
   */
  async recordEmailHistory(emailData) {
    try {
      await this.ensureDirectories();

      const historyKey = `email_history_${Date.now()}`;
      const history = {
        ...emailData,
        sent_at: new Date().toISOString()
      };

      const historyPath = path.join(this.emailHistoryDir, `${historyKey}.json`);
      await fs.writeFile(historyPath, JSON.stringify(history, null, 2));

      // 保持历史记录不超过100条
      await this.cleanupEmailHistory();

      console.log('📧 邮件历史记录成功');
      return true;
    } catch (error) {
      console.error('❌ 记录邮件历史失败:', error);
      return false;
    }
  }

  /**
   * 清理邮件历史记录
   */
  async cleanupEmailHistory() {
    try {
      const files = await fs.readdir(this.emailHistoryDir);
      const historyFiles = files.filter(file => file.endsWith('.json'));

      if (historyFiles.length > 100) {
        // 按文件名排序，删除最旧的文件
        const sortedFiles = historyFiles.sort();
        const filesToDelete = sortedFiles.slice(0, historyFiles.length - 100);

        for (const file of filesToDelete) {
          const filePath = path.join(this.emailHistoryDir, file);
          await fs.unlink(filePath);
        }

        console.log(`🧹 清理了 ${filesToDelete.length} 条历史记录`);
      }
    } catch (error) {
      console.error('❌ 清理邮件历史失败:', error);
    }
  }

  /**
   * 获取邮件历史记录
   */
  async getEmailHistory(limit = 50) {
    try {
      const files = await fs.readdir(this.emailHistoryDir);
      const historyFiles = files
        .filter(file => file.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit);

      const history = [];
      for (const file of historyFiles) {
        const filePath = path.join(this.emailHistoryDir, file);
        const data = await fs.readFile(filePath, 'utf8');
        history.push(JSON.parse(data));
      }

      return history;
    } catch (error) {
      console.error('❌ 获取邮件历史失败:', error);
      return [];
    }
  }

  /**
   * 保存待处理的通知
   */
  async saveScheduledNotification(coinSymbol, type, data) {
    try {
      const state = await this.getState();
      const scheduledKey = `scheduled_${coinSymbol}_${Date.now()}`;

      if (!state.scheduled_notifications) {
        state.scheduled_notifications = {};
      }

      state.scheduled_notifications[scheduledKey] = {
        type,
        data,
        coin: coinSymbol,
        scheduled_time: data.scheduled_time,
        created_at: new Date().toISOString()
      };

      await this.saveState(state);
      console.log(`📅 保存待处理通知: ${coinSymbol} ${type}`);
      return true;
    } catch (error) {
      console.error('❌ 保存待处理通知失败:', error);
      return false;
    }
  }

  /**
   * 获取待处理的通知
   */
  async getScheduledNotifications() {
    try {
      const state = await this.getState();
      const scheduled = state.scheduled_notifications || {};

      // 转换为数组格式
      const notifications = Object.entries(scheduled).map(([key, notification]) => ({
        key,
        ...notification
      }));

      return notifications;
    } catch (error) {
      console.error('❌ 获取待处理通知失败:', error);
      return [];
    }
  }

  /**
   * 删除已处理的通知
   */
  async deleteScheduledNotification(key) {
    try {
      const state = await this.getState();
      if (state.scheduled_notifications && state.scheduled_notifications[key]) {
        delete state.scheduled_notifications[key];
        await this.saveState(state);
        console.log(`🗑️  删除已处理通知: ${key}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ 删除待处理通知失败:', error);
      return false;
    }
  }

  /**
   * 保存抓取结果
   */
  async saveScrapeResult(result) {
    try {
      await this.ensureDirectories();

      const scrapeHistoryDir = path.join(this.dataDir, 'scrape-history');
      await fs.mkdir(scrapeHistoryDir, { recursive: true });

      const filename = `scrape-${Date.now()}.json`;
      const filepath = path.join(scrapeHistoryDir, filename);

      const scrapeData = {
        ...result,
        saved_at: new Date().toISOString()
      };

      await fs.writeFile(filepath, JSON.stringify(scrapeData, null, 2));
      console.log(`💾 抓取结果保存成功: ${filename}`);
      return true;
    } catch (error) {
      console.error('❌ 保存抓取结果失败:', error);
      return false;
    }
  }

  /**
   * 获取最新抓取结果
   */
  async getLatestScrapeResult(exchange, coin) {
    try {
      const scrapeHistoryDir = path.join(this.dataDir, 'scrape-history');
      const files = await fs.readdir(scrapeHistoryDir);

      const jsonFiles = files.filter(file => file.endsWith('.json'))
        .sort()
        .reverse();

      for (const file of jsonFiles) {
        const filepath = path.join(scrapeHistoryDir, file);
        const data = JSON.parse(await fs.readFile(filepath, 'utf8'));

        if (data.exchange === exchange && data.coin === coin) {
          return data;
        }
      }

      return null;
    } catch (error) {
      console.error('❌ 获取最新抓取结果失败:', error);
      return null;
    }
  }

  /**
   * 获取抓取历史
   */
  async getScrapeHistory(exchange, coin, limit = 20) {
    try {
      const scrapeHistoryDir = path.join(this.dataDir, 'scrape-history');
      const files = await fs.readdir(scrapeHistoryDir);

      let jsonFiles = files.filter(file => file.endsWith('.json'));

      // 按参数过滤
      if (exchange) {
        jsonFiles = jsonFiles.filter(file => file.includes(exchange));
      }
      if (coin) {
        jsonFiles = jsonFiles.filter(file => file.includes(coin));
      }

      jsonFiles = jsonFiles.sort().reverse().slice(0, limit);

      const history = [];
      for (const file of jsonFiles) {
        const filepath = path.join(scrapeHistoryDir, file);
        const data = JSON.parse(await fs.readFile(filepath, 'utf8'));
        history.push(data);
      }

      return history;
    } catch (error) {
      console.error('❌ 获取抓取历史失败:', error);
      return [];
    }
  }

  /**
   * 获取默认配置
   */
  getDefaultConfig() {
    return {
      email: '',
      monitoring_enabled: false,
      filters: {
        exchange: 'binance',
        coin: 'USDT',
        timeframe: '1h'
      },
      coins: [
        {
          symbol: 'USDT',
          exchange: 'binance',
          timeframe: '1h',
          threshold: 5.0,
          enabled: true
        }
      ],
      trigger_settings: {
        hourly_minute: 0,
        daily_hour: 9,
        daily_minute: 0
      },
      notification_hours: {
        enabled: false,
        start: '09:00',
        end: '24:00'
      },
      repeat_interval: 180
    };
  }

  /**
   * 备份数据
   */
  async backup() {
    try {
      const backupDir = path.join(this.dataDir, 'backups');
      await fs.mkdir(backupDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `backup-${timestamp}`);

      await fs.mkdir(backupPath, { recursive: true });

      // 备份配置文件
      await fs.copyFile(this.configPath, path.join(backupPath, 'config.json'));

      // 备份状态文件
      await fs.copyFile(this.statePath, path.join(backupPath, 'state.json'));

      console.log(`💾 数据备份成功: ${backupPath}`);
      return backupPath;
    } catch (error) {
      console.error('❌ 数据备份失败:', error);
      return null;
    }
  }

  /**
   * 清理旧数据
   */
  async cleanup() {
    try {
      // 清理超过7天的备份
      const backupDir = path.join(this.dataDir, 'backups');
      const backups = await fs.readdir(backupDir);
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

      for (const backup of backups) {
        const backupPath = path.join(backupDir, backup);
        const stats = await fs.stat(backupPath);

        if (stats.mtime.getTime() < sevenDaysAgo) {
          await fs.rmdir(backupPath, { recursive: true });
          console.log(`🗑️  清理旧备份: ${backup}`);
        }
      }

      console.log('🧹 数据清理完成');
    } catch (error) {
      console.error('❌ 数据清理失败:', error);
    }
  }
}

// 导出单例实例
export const storageService = new StorageService();