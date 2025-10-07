/**
 * 日志服务 - 提供日志存储和查询功能
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class LoggerService {
  constructor() {
    // 支持环境变量配置日志目录，默认使用项目根目录下的logs文件夹
    const projectRoot = path.join(__dirname, '../..');
    this.logDir = process.env.LOGS_DIR || path.join(projectRoot, 'logs');
    // 统一使用server.log作为唯一日志文件
    this.logFile = process.env.LOGS_DIR ?
      path.join(process.env.LOGS_DIR, 'server.log') :
      path.join(projectRoot, 'logs', 'server.log');

    // 从环境变量加载配置
    this.config = {
      retentionDays: parseInt(process.env.LOG_RETENTION_DAYS) || 7,
      maxLines: parseInt(process.env.LOG_MAX_LINES) || 1000,
      defaultDisplayCount: parseInt(process.env.LOG_DEFAULT_DISPLAY_COUNT) || 50,
      autoCleanupEnabled: process.env.LOG_AUTO_CLEANUP_ENABLED !== 'false'
    };

    this.ensureLogDirectory();
  }

  /**
   * 确保日志目录存在
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * 自动清理过期日志
   */
  async cleanupOldLogs() {
    try {
      const retentionDays = this.config.retentionDays;
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      // 清理日志文件
      if (fs.existsSync(this.logFile)) {
        const content = fs.readFileSync(this.logFile, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        const filteredLines = lines.filter(line => {
          try {
            // 解析时间戳 [2025-10-05 05:46:26] 或 [2025-10-05T05:46:26.000Z]
            const timestampMatch = line.match(/^\[([^\]]+)\]/);
            if (timestampMatch) {
              const timestampStr = timestampMatch[1];
              let logTimestamp;

              // 尝试解析新格式 YYYY-MM-DD HH:mm:ss
              if (timestampStr.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
                const [datePart, timePart] = timestampStr.split(' ');
                const [year, month, day] = datePart.split('-');
                const [hour, minute, second] = timePart.split(':');
                logTimestamp = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
              } else {
                // 尝试解析ISO格式
                logTimestamp = new Date(timestampStr);
              }

              return logTimestamp > cutoffDate;
            }
            return false;
          } catch (error) {
            return false; // 如果时间戳解析失败，丢弃该行
          }
        });

        if (filteredLines.length < lines.length) {
          fs.writeFileSync(this.logFile, filteredLines.join('\n'));
          console.log(`🗑️ 清理了 ${lines.length - filteredLines.length} 行${retentionDays}天前的日志`);
        }
      }

      // 清理抓取历史文件
      const scrapeHistoryDir = path.join(__dirname, '../../data/scrape-history');
      if (fs.existsSync(scrapeHistoryDir)) {
        const files = fs.readdirSync(scrapeHistoryDir);
        let cleanedCount = 0;

        files.forEach(file => {
          const filePath = path.join(scrapeHistoryDir, file);
          const stats = fs.statSync(filePath);

          if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath);
            cleanedCount++;
          }
        });

        if (cleanedCount > 0) {
          console.log(`🗑️ 清理了 ${cleanedCount} 个${retentionDays}天前的抓取历史文件`);
        }
      }

      // 清理邮件历史文件
      const emailHistoryDir = path.join(__dirname, '../../data/email-history');
      if (fs.existsSync(emailHistoryDir)) {
        const files = fs.readdirSync(emailHistoryDir);
        let cleanedCount = 0;

        files.forEach(file => {
          const filePath = path.join(emailHistoryDir, file);
          const stats = fs.statSync(filePath);

          if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath);
            cleanedCount++;
          }
        });

        if (cleanedCount > 0) {
          console.log(`🗑️ 清理了 ${cleanedCount} 个${retentionDays}天前的邮件历史文件`);
        }
      }

    } catch (error) {
      console.error('❌ 清理过期日志失败:', error);
    }
  }

  /**
   * 写入系统日志
   */
  writeLog(level, message, meta = {}) {
    // 使用易读的时间戳格式 YYYY-MM-DD HH:mm:ss
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    const logEntry = {
      timestamp,
      level,
      message,
      meta
    };

    const logLine = `[${timestamp}]\n${level.toUpperCase()}: ${message}`;

    try {
      // 写入到统一的日志文件
      fs.appendFileSync(this.logFile, logLine + '\n');

      // 限制日志文件大小，保留最新的配置行数
      this.trimLogFile();
    } catch (error) {
      console.error('写入日志失败:', error);
    }
  }

  /**
   * 限制日志文件大小
   */
  trimLogFile() {
    try {
      if (fs.existsSync(this.logFile)) {
        const content = fs.readFileSync(this.logFile, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        if (lines.length > this.config.maxLines) {
          const recentLines = lines.slice(-this.config.maxLines);
          fs.writeFileSync(this.logFile, recentLines.join('\n'));
        }
      }
    } catch (error) {
      console.error('修剪日志文件失败:', error);
    }
  }

  /**
   * 获取最新的日志
   */
  getLogs(limit = null) {
    if (limit === null) {
      limit = this.config.defaultDisplayCount;
    }
    try {
      if (fs.existsSync(this.logFile)) {
        const content = fs.readFileSync(this.logFile, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        // 返回最新的几行（反转数组）
        return lines.slice(-limit).reverse();
      } else {
        return [];
      }
    } catch (error) {
      console.error('读取日志失败:', error);
      return [];
    }
  }

  /**
   * 获取服务器日志（兼容现有系统）
   */
  getServerLogs(limit = null) {
    // 直接调用统一的日志读取方法
    return this.getLogs(limit);
  }

  /**
   * 清空系统日志
   */
  clearLogs() {
    try {
      // 清空日志文件
      if (fs.existsSync(this.logFile)) {
        fs.writeFileSync(this.logFile, '');
      }
    } catch (error) {
      console.error('清空日志失败:', error);
    }
  }

  /**
   * 记录不同级别的日志
   */
  info(message, meta = {}) {
    this.writeLog('info', message, meta);
  }

  warn(message, meta = {}) {
    this.writeLog('warn', message, meta);
  }

  error(message, meta = {}) {
    this.writeLog('error', message, meta);
  }

  debug(message, meta = {}) {
    this.writeLog('debug', message, meta);
  }
}

// 导出单例实例
export const loggerService = new LoggerService();