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
    this.logDir = path.join(__dirname, '../../data/logs');
    this.systemLogFile = path.join(this.logDir, 'system.log');
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
   * 自动清理过期日志（7天前）
   */
  async cleanupOldLogs() {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // 清理系统日志文件
      if (fs.existsSync(this.systemLogFile)) {
        const content = fs.readFileSync(this.systemLogFile, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        const filteredLines = lines.filter(line => {
          try {
            // 解析时间戳 [2025-10-05T05:46:26.000Z]
            const timestampMatch = line.match(/^\[([^\]]+)\]/);
            if (timestampMatch) {
              const logTimestamp = new Date(timestampMatch[1]);
              return logTimestamp > sevenDaysAgo;
            }
            return false;
          } catch (error) {
            return false; // 如果时间戳解析失败，丢弃该行
          }
        });

        if (filteredLines.length < lines.length) {
          fs.writeFileSync(this.systemLogFile, filteredLines.join('\n'));
          console.log(`🗑️ 清理了 ${lines.length - filteredLines.length} 行7天前的系统日志`);
        }
      }

      // 清理服务器日志文件
      const serverLogFile = path.join(__dirname, '../../server.log');
      if (fs.existsSync(serverLogFile)) {
        const content = fs.readFileSync(serverLogFile, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        const filteredLines = lines.filter(line => {
          try {
            // 解析时间戳格式类似: 2025-10-05T05:46:26.000Z
            const timestampMatch = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
            if (timestampMatch) {
              const logTimestamp = new Date(timestampMatch[1]);
              return logTimestamp > sevenDaysAgo;
            }
            return false;
          } catch (error) {
            return false; // 如果时间戳解析失败，丢弃该行
          }
        });

        if (filteredLines.length < lines.length) {
          fs.writeFileSync(serverLogFile, filteredLines.join('\n'));
          console.log(`🗑️ 清理了 ${lines.length - filteredLines.length} 行7天前的服务器日志`);
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

          if (stats.mtime < sevenDaysAgo) {
            fs.unlinkSync(filePath);
            cleanedCount++;
          }
        });

        if (cleanedCount > 0) {
          console.log(`🗑️ 清理了 ${cleanedCount} 个7天前的抓取历史文件`);
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

          if (stats.mtime < sevenDaysAgo) {
            fs.unlinkSync(filePath);
            cleanedCount++;
          }
        });

        if (cleanedCount > 0) {
          console.log(`🗑️ 清理了 ${cleanedCount} 个7天前的邮件历史文件`);
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
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      meta
    };

    const logLine = `[${timestamp}] ${level.toUpperCase()}: ${message}`;

    try {
      // 同时写入到两个日志文件
      // 1. 系统日志文件
      fs.appendFileSync(this.systemLogFile, logLine + '\n');

      // 2. server.log文件（Web界面读取的文件）
      const serverLogFile = path.join(__dirname, '../../server.log');
      fs.appendFileSync(serverLogFile, logLine + '\n');

      // 限制日志文件大小，保留最新的1000行
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
      if (fs.existsSync(this.systemLogFile)) {
        const content = fs.readFileSync(this.systemLogFile, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        if (lines.length > 1000) {
          const recentLines = lines.slice(-1000);
          fs.writeFileSync(this.systemLogFile, recentLines.join('\n'));
        }
      }
    } catch (error) {
      console.error('修剪日志文件失败:', error);
    }
  }

  /**
   * 获取最新的日志
   */
  getRecentLogs(limit = 50) {
    try {
      if (fs.existsSync(this.systemLogFile)) {
        const content = fs.readFileSync(this.systemLogFile, 'utf8');
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
  getServerLogs(limit = 50) {
    try {
      const serverLogFile = path.join(__dirname, '../../server.log');
      if (fs.existsSync(serverLogFile)) {
        const content = fs.readFileSync(serverLogFile, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        // 返回最新的几行（反转数组）
        return lines.slice(-limit).reverse();
      } else {
        return this.getRecentLogs(limit);
      }
    } catch (error) {
      console.error('读取服务器日志失败:', error);
      return this.getRecentLogs(limit);
    }
  }

  /**
   * 清空系统日志
   */
  clearLogs() {
    try {
      // 清空系统日志文件
      if (fs.existsSync(this.systemLogFile)) {
        fs.writeFileSync(this.systemLogFile, '');
      }

      // 清空server.log文件
      const serverLogFile = path.join(__dirname, '../../server.log');
      if (fs.existsSync(serverLogFile)) {
        fs.writeFileSync(serverLogFile, '');
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