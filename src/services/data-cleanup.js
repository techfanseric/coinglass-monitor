/**
 * 数据清理服务 - 统一管理所有数据目录的清理
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatDateTime } from '../utils/time-utils.js';
import { loggerService } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DataCleanupService {
  constructor() {
    const projectRoot = path.join(__dirname, '../..');

    // 从环境变量获取配置，提供合理默认值
    this.config = {
      dataDir: process.env.DATA_DIR || path.join(projectRoot, 'data'),
      screenshotDir: process.env.COINGLASS_SCREENSHOT_DIR || path.join(projectRoot, 'data/debug-screenshots'),
      retentionDays: parseInt(process.env.DATA_RETENTION_DAYS) || parseInt(process.env.LOG_RETENTION_DAYS) || 7,
      autoCleanupEnabled: process.env.DATA_AUTO_CLEANUP_ENABLED !== 'false',
      maxFilesPerCleanup: parseInt(process.env.DATA_MAX_FILES_PER_CLEANUP) || 1000,
      enableDetailedLogging: process.env.DETAILED_CLEANUP_LOGGING === 'true'
    };

    // 定义清理目录配置
    this.cleanupDirectories = [
      {
        name: '邮件历史',
        path: path.join(this.config.dataDir, 'email-history'),
        filePattern: /^email_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/,
        enabled: true,
        description: '清理邮件发送历史记录'
      },
      {
        name: '抓取历史',
        path: path.join(this.config.dataDir, 'scrape-history'),
        filePattern: /^scrape_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/,
        enabled: true,
        description: '清理数据抓取历史记录'
      },
      {
        name: '调试截图',
        path: this.config.screenshotDir,
        filePattern: /^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})_[^_]+_[^.]+\.(png|jpg|jpeg|gif)$/,
        enabled: true,
        description: '清理调试截图文件'
      },
      {
        name: '备份文件',
        path: path.join(this.config.dataDir, 'backups'),
        filePattern: /^backup[_-](.+)\.json$/,
        enabled: true,
        description: '清理系统备份文件',
        specialTimestamp: true // 备份文件需要特殊时间戳解析
      }
    ];
  }

  /**
   * 主清理方法 - 清理所有配置的目录
   */
  async cleanupAll() {
    if (!this.config.autoCleanupEnabled) {
      console.log('📄 数据清理功能已禁用');
      return { success: false, message: '数据清理功能已禁用' };
    }

    const startTime = Date.now();
    const results = {
      success: true,
      totalCleaned: 0,
      totalSize: 0,
      directories: [],
      errors: [],
      duration: 0
    };

    console.log('🧹 开始执行全面数据清理...');
    loggerService.info('[数据清理服务] 开始执行全面数据清理');

    try {
      // 并行清理所有目录
      const cleanupPromises = this.cleanupDirectories
        .filter(dir => dir.enabled)
        .map(dir => this.cleanupDirectory(dir));

      const directoryResults = await Promise.allSettled(cleanupPromises);

      // 汇总结果
      directoryResults.forEach((result, index) => {
        const dirConfig = this.cleanupDirectories.filter(dir => dir.enabled)[index];

        if (result.status === 'fulfilled') {
          const dirResult = result.value;
          results.directories.push(dirResult);
          results.totalCleaned += dirResult.cleanedCount;
          results.totalSize += dirResult.totalSize;
        } else {
          const error = result.reason;
          results.errors.push({
            directory: dirConfig.name,
            error: error.message
          });
          console.error(`❌ 清理${dirConfig.name}失败:`, error.message);
          loggerService.error(`[数据清理服务] 清理${dirConfig.name}失败: ${error.message}`);
        }
      });

      // 清理日志文件（使用现有的 loggerService 方法）
      const logCleanupResult = await this.cleanupLogs();
      results.directories.push(logCleanupResult);
      results.totalCleaned += logCleanupResult.cleanedCount;

      results.duration = Date.now() - startTime;

      // 输出汇总信息
      console.log(`✅ 数据清理完成: 删除 ${results.totalCleaned} 个文件，释放 ${(results.totalSize / 1024 / 1024).toFixed(2)}MB，耗时 ${results.duration}ms`);
      loggerService.info(`[数据清理服务] 清理完成: 删除${results.totalCleaned}个文件，释放${(results.totalSize / 1024 / 1024).toFixed(2)}MB`);

      if (results.errors.length > 0) {
        console.warn(`⚠️ 清理过程中发生 ${results.errors.length} 个错误`);
        results.success = false;
      }

      return results;

    } catch (error) {
      console.error('❌ 数据清理过程失败:', error);
      loggerService.error(`[数据清理服务] 清理过程失败: ${error.message}`);
      results.success = false;
      results.errors.push({ error: error.message });
      return results;
    }
  }

  /**
   * 清理指定目录
   */
  async cleanupDirectory(dirConfig) {
    const { name, path: dirPath, filePattern, description, specialTimestamp } = dirConfig;
    const result = {
      directory: name,
      path: dirPath,
      description,
      cleanedCount: 0,
      totalSize: 0,
      errors: [],
      details: []
    };

    try {
      // 检查目录是否存在
      try {
        await fs.access(dirPath);
      } catch {
        // 目录不存在，跳过清理
        console.log(`📁 ${name}目录不存在，跳过清理: ${dirPath}`);
        result.details.push(`目录不存在，跳过清理`);
        return result;
      }

      const files = await fs.readdir(dirPath);
      const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
      let processedCount = 0;

      console.log(`🔍 开始清理${name}: ${files.length} 个文件`);

      for (const file of files) {
        // 限制单次清理的文件数量，防止性能问题
        if (processedCount >= this.config.maxFilesPerCleanup) {
          console.warn(`⚠️ ${name}清理达到单次最大文件数限制 (${this.config.maxFilesPerCleanup})，停止处理`);
          result.details.push(`达到单次最大文件数限制`);
          break;
        }

        const filePath = path.join(dirPath, file);

        try {
          const stats = await fs.stat(filePath);
          const fileInfo = await this.analyzeFile(file, stats, filePattern, specialTimestamp);

          if (!fileInfo.matches) {
            continue; // 跳过不匹配的文件
          }

          // 使用文件时间戳或修改时间进行判断
          const fileTime = fileInfo.timestamp || stats.mtime;

          if (fileTime < cutoffDate) {
            const fileSize = stats.size;
            await fs.unlink(filePath);

            result.cleanedCount++;
            result.totalSize += fileSize;

            if (this.config.enableDetailedLogging) {
              const fileName = path.basename(filePath);
              const fileAge = Math.floor((Date.now() - fileTime.getTime()) / (24 * 60 * 60 * 1000));
              console.log(`🗑️  删除${name}文件: ${fileName} (${fileAge}天前, ${(fileSize / 1024).toFixed(1)}KB)`);
              result.details.push(`删除: ${fileName} (${fileAge}天)`);
            }
          }
        } catch (fileError) {
          const errorMsg = `处理文件 ${file} 失败: ${fileError.message}`;
          result.errors.push(errorMsg);
          if (this.config.enableDetailedLogging) {
            console.warn(`⚠️ ${errorMsg}`);
          }
        }

        processedCount++;
      }

      console.log(`✅ ${name}清理完成: 删除 ${result.cleanedCount} 个文件，释放 ${(result.totalSize / 1024 / 1024).toFixed(2)}MB`);

      return result;

    } catch (error) {
      const errorMsg = `清理${name}目录失败: ${error.message}`;
      result.errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
      throw error;
    }
  }

  /**
   * 分析文件信息，判断是否匹配清理模式
   */
  async analyzeFile(fileName, stats, filePattern, specialTimestamp = false) {
    const result = {
      matches: false,
      timestamp: null,
      fileInfo: fileName
    };

    try {
      // 检查文件名是否匹配模式
      const match = fileName.match(filePattern);
      if (!match) {
        return result;
      }

      result.matches = true;

      // 特殊时间戳解析（用于备份文件）
      if (specialTimestamp) {
        result.timestamp = this.parseBackupTimestamp(fileName, match);
        return result;
      }

      // 标准时间戳解析 - 从文件名提取时间戳
      const timestampStr = match[1] || match[0];
      result.timestamp = this.parseStandardTimestamp(timestampStr);

    } catch (error) {
      if (this.config.enableDetailedLogging) {
        console.warn(`⚠️ 分析文件时间戳失败 ${fileName}: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * 解析标准时间戳格式 (YYYY-MM-DD_HH-mm-ss)
   */
  parseStandardTimestamp(timestampStr) {
    try {
      // 匹配格式: 2025-10-06_20-10-46
      const regex = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/;
      const match = timestampStr.match(regex);

      if (match) {
        const [, year, month, day, hour, minute, second] = match;
        return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
      }
    } catch (error) {
      console.warn(`⚠️ 解析标准时间戳失败: ${timestampStr}`);
    }
    return null;
  }

  /**
   * 解析备份文件时间戳（兼容新旧格式）
   */
  parseBackupTimestamp(fileName, match) {
    try {
      const timestampStr = match[1];

      // 新格式: YYYY-MM-DD_HH-mm-ss
      if (timestampStr.match(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/)) {
        return this.parseStandardTimestamp(timestampStr);
      }

      // 旧格式: ISO格式（需要精确替换）
      let isoStr = timestampStr;

      // 精确替换时间格式：2025-09-28T11-52-11-124Z → 2025-09-28T11:52:11.124Z
      isoStr = isoStr.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1T$2:$3:$4.$5Z');

      // 处理没有毫秒的格式：2025-09-28T11-52-00Z → 2025-09-28T11:52:00Z
      if (!isoStr.includes('.')) {
        isoStr = isoStr.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/, '$1T$2:$3:$4Z');
      }

      return new Date(isoStr);
    } catch (error) {
      console.warn(`⚠️ 解析备份时间戳失败: ${fileName}`);
      return null;
    }
  }

  /**
   * 清理日志文件（调用现有 loggerService 方法）
   */
  async cleanupLogs() {
    try {
      const beforeStats = await this.getLogStats();
      await loggerService.cleanupOldLogs();
      const afterStats = await this.getLogStats();

      const cleanedLines = beforeStats.totalLines - afterStats.totalLines;
      const cleanedSize = beforeStats.totalSize - afterStats.totalSize;

      console.log(`🗑️ 日志清理: 删除 ${cleanedLines} 行日志，释放 ${(cleanedSize / 1024).toFixed(1)}KB`);

      return {
        directory: '系统日志',
        path: './server.log',
        description: '清理系统日志文件',
        cleanedCount: cleanedLines,
        totalSize: cleanedSize,
        errors: [],
        details: [`删除 ${cleanedLines} 行日志`]
      };

    } catch (error) {
      console.error('❌ 日志清理失败:', error);
      throw error;
    }
  }

  /**
   * 获取日志文件统计信息
   */
  async getLogStats() {
    try {
      const logFile = process.env.LOGS_DIR ?
        path.join(process.env.LOGS_DIR, 'server.log') :
        path.join(process.cwd(), 'logs', 'server.log');

      const content = await fs.readFile(logFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());

      return {
        totalLines: lines.length,
        totalSize: content.length
      };
    } catch (error) {
      return { totalLines: 0, totalSize: 0 };
    }
  }

  /**
   * 获取清理统计信息
   */
  async getCleanupStats() {
    const stats = {
      directories: [],
      totalFiles: 0,
      totalSize: 0,
      retentionDays: this.config.retentionDays,
      lastCleanup: null,
      config: this.config
    };

    for (const dirConfig of this.cleanupDirectories) {
      if (!dirConfig.enabled) continue;

      try {
        await fs.access(dirConfig.path);
        const files = await fs.readdir(dirConfig.path);
        let dirFileCount = 0;
        let dirSize = 0;

        for (const file of files) {
          const filePath = path.join(dirConfig.path, file);
          const fileStats = await fs.stat(filePath);
          const fileInfo = await this.analyzeFile(file, fileStats, dirConfig.filePattern, dirConfig.specialTimestamp);

          if (fileInfo.matches) {
            dirFileCount++;
            dirSize += fileStats.size;
          }
        }

        stats.directories.push({
          name: dirConfig.name,
          path: dirConfig.path,
          fileCount: dirFileCount,
          size: dirSize,
          description: dirConfig.description
        });

        stats.totalFiles += dirFileCount;
        stats.totalSize += dirSize;

      } catch (error) {
        // 目录不存在或无法访问
        stats.directories.push({
          name: dirConfig.name,
          path: dirConfig.path,
          fileCount: 0,
          size: 0,
          error: error.message,
          description: dirConfig.description
        });
      }
    }

    return stats;
  }
}

// 导出单例实例
export const dataCleanupService = new DataCleanupService();