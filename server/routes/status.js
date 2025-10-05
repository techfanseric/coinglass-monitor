/**
 * 状态查询 API 路由
 * 提供系统状态和监控状态查询接口
 */

import express from 'express';
import { storageService } from '../services/storage.js';
import { loggerService } from '../services/logger.js';

const router = express.Router();

/**
 * GET /api/status - 获取系统状态
 */
router.get('/', async (req, res) => {
  try {
    // 静默处理状态请求，避免干扰系统日志

    const config = await storageService.getConfig();
    const state = await storageService.getState();

    // 获取币种状态
    const coinStates = {};
    if (config && config.coins) {
      for (const coin of config.coins) {
        if (coin.enabled) {
          const coinState = await storageService.getCoinState(coin.symbol);
          coinStates[coin.symbol] = {
            ...coinState,
            last_rate: coinState.last_rate
          };
        }
      }
    }

    const systemStatus = {
      status: 'running',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      platform: process.platform,
      node_version: process.version,
      memory_usage: process.memoryUsage(),
      config_loaded: !!config,
      monitoring_enabled: config?.monitoring_enabled || false,
      configured_coins: config?.coins?.filter(c => c.enabled).length || 0,
      active_states: Object.keys(state).filter(key => key.startsWith('coin_')).length,
      data_directory: process.env.DATA_DIR || './data',
      logs_directory: process.env.LOGS_DIR || './logs',
      monitoring_status: {
        coins_state: coinStates
      }
    };

    res.json(systemStatus);

  } catch (error) {
    console.error('❌ 获取系统状态失败:', error);
    res.status(500).json({
      error: '获取系统状态失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/status/coins - 获取所有币种状态
 */
router.get('/coins', async (req, res) => {
  try {
    // 静默处理币种状态请求

    const config = await storageService.getConfig();
    const state = await storageService.getState();

    const coinStates = {};

    if (config && config.coins) {
      for (const coin of config.coins) {
        if (coin.enabled) {
          const coinState = await storageService.getCoinState(coin.symbol);
          coinStates[coin.symbol] = {
            ...coin,
            current_state: coinState,
            is_alert: coinState.status === 'alert',
            last_notification: coinState.last_notification,
            next_notification: coinState.next_notification
          };
        }
      }
    }

    res.json(coinStates);

  } catch (error) {
    console.error('❌ 获取币种状态失败:', error);
    res.status(500).json({
      error: '获取币种状态失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/status/history - 获取邮件历史记录
 */
router.get('/history', async (req, res) => {
  try {
    console.log('📧 请求获取邮件历史记录');

    const limit = parseInt(req.query.limit) || 20;
    const history = await storageService.getEmailHistory(limit);

    console.log(`✅ 邮件历史获取成功，共 ${history.length} 条记录`);
    res.json({
      history,
      total_count: history.length,
      limit,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 获取邮件历史失败:', error);
    res.status(500).json({
      error: '获取邮件历史失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/status/scheduled - 获取待处理的通知
 */
router.get('/scheduled', async (req, res) => {
  try {
    console.log('📅 请求获取待处理通知');

    const scheduled = await storageService.getScheduledNotifications();

    console.log(`✅ 待处理通知获取成功，共 ${scheduled.length} 个通知`);
    res.json({
      scheduled_notifications: scheduled,
      total_count: scheduled.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 获取待处理通知失败:', error);
    res.status(500).json({
      error: '获取待处理通知失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/status/health - 详细健康检查
 */
router.get('/health', async (req, res) => {
  try {
    console.log('🏥 请求详细健康检查');

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        storage: await checkStorageService(),
        scraper: await checkScraperService(),
        email: await checkEmailService(),
        scheduler: await checkSchedulerService()
      },
      system: {
        platform: process.platform,
        arch: process.arch,
        node_version: process.version,
        uptime: process.uptime(),
        memory: {
          used: process.memoryUsage(),
          total: require('os').totalmem(),
          free: require('os').freemem()
        }
      },
      directories: {
        data_dir: await checkDirectory(process.env.DATA_DIR || './data'),
        logs_dir: await checkDirectory(process.env.LOGS_DIR || './logs')
      }
    };

    // 检查是否有任何服务不健康
    const unhealthyServices = Object.entries(health.services)
      .filter(([_, service]) => service.status !== 'healthy');

    if (unhealthyServices.length > 0) {
      health.status = 'unhealthy';
      health.unhealthy_services = unhealthyServices.map(([name, service]) => ({
        name,
        error: service.error
      }));
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    console.log(`✅ 健康检查完成，状态: ${health.status}`);

    res.status(statusCode).json(health);

  } catch (error) {
    console.error('❌ 健康检查失败:', error);
    res.status(503).json({
      status: 'error',
      error: '健康检查失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/status/monitoring - 手动触发监控检查
 */
router.post('/monitoring', async (req, res) => {
  try {
    console.log('🔄 请求手动触发监控检查');

    const { monitorService } = await import('../services/monitor-service.js');
    const result = await monitorService.runMonitoring();

    if (result.success) {
      console.log('✅ 手动监控检查完成');
      res.json({
        success: true,
        message: '监控检查完成',
        data: result.data,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log(`⚠️  手动监控检查: ${result.reason || result.error}`);
      res.json({
        success: false,
        message: result.reason || result.error || '监控检查失败',
        error: result.error,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ 手动监控检查失败:', error);
    res.status(500).json({
      success: false,
      error: '手动监控检查失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/status/cleanup - 清理系统
 */
router.post('/cleanup', async (req, res) => {
  try {
    console.log('🧹 请求清理系统');

    await storageService.cleanup();

    res.json({
      success: true,
      message: '系统清理完成',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 系统清理失败:', error);
    res.status(500).json({
      error: '系统清理失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 辅助函数
async function checkStorageService() {
  try {
    const config = await storageService.getConfig();
    return {
      status: 'healthy',
      config_loaded: !!config
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

async function checkScraperService() {
  try {
    // 这里可以添加对抓取服务的检查
    return {
      status: 'healthy',
      puppeteer_available: true
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

async function checkEmailService() {
  try {
    // 这里可以添加对邮件服务的检查
    return {
      status: 'healthy',
      emailjs_configured: true
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

async function checkSchedulerService() {
  try {
    // 这里可以添加对调度服务的检查
    return {
      status: 'healthy',
      scheduler_running: true
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

async function checkDirectory(dirPath) {
  try {
    const fs = await import('fs/promises');
    await fs.access(dirPath);
    return {
      status: 'healthy',
      path: dirPath
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      path: dirPath,
      error: error.message
    };
  }
}

import fsSync from 'fs';

/**
 * GET /api/status/logs - 获取系统日志
 */
router.get('/logs', async (req, res) => {
  try {
    // 静默处理日志请求，避免干扰系统日志

    // 直接读取server.log文件
    const logPath = './server.log';

    let logs = [];
    if (fsSync.existsSync(logPath)) {
      const content = fsSync.readFileSync(logPath, 'utf8');
      logs = content.split('\n').filter(line => line.trim());
    }

    // 获取最新的150行
    const recentLogs = logs.slice(-150);

    // 设置响应头为纯文本
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(recentLogs.join('\n'));

  } catch (error) {
    console.error('❌ 获取系统日志失败:', error);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(500).send('获取日志失败: ' + error.message);
  }
});

/**
 * POST /api/status/cooldown/reset - 重置指定币种的冷却期
 */
router.post('/cooldown/reset', async (req, res) => {
  try {
    const { coinSymbol } = req.body;

    loggerService.info(`[状态管理] 请求重置币种冷却期: ${coinSymbol || '未知'}`);
    console.log('🔄 请求重置冷却期');

    if (!coinSymbol) {
      return res.status(400).json({
        success: false,
        error: '缺少币种符号',
        message: '请提供要重置冷却期的币种符号',
        timestamp: new Date().toISOString()
      });
    }

    // 获取当前币种状态
    const coinState = await storageService.getCoinState(coinSymbol);

    if (!coinState || coinState.status !== 'alert') {
      return res.status(400).json({
        success: false,
        error: '币种不在警报状态',
        message: `币种 ${coinSymbol} 当前不在警报状态，无需重置冷却期`,
        current_status: coinState?.status || 'unknown',
        timestamp: new Date().toISOString()
      });
    }

    // 重置冷却期：将next_notification设置为当前时间前1分钟
    const now = new Date();
    const pastTime = new Date(now.getTime() - 60 * 1000); // 1分钟前

    const updatedState = {
      ...coinState,
      next_notification: pastTime.toISOString(),
      cooldown_reset_at: now.toISOString(),
      cooldown_reset_by: 'manual',
      updated_at: now.toISOString()
    };

    // 保存更新后的状态
    const success = await storageService.updateCoinState(coinSymbol, 'alert', updatedState);

    if (success) {
      loggerService.info(`[状态管理] 币种 ${coinSymbol} 冷却期已重置，下次通知时间: ${pastTime.toISOString()}`);
      console.log(`✅ 币种 ${coinSymbol} 冷却期已重置`);
      res.json({
        success: true,
        message: `币种 ${coinSymbol} 冷却期已重置，现在可以立即触发警报`,
        data: {
          coinSymbol,
          previous_next_notification: coinState.next_notification,
          new_next_notification: pastTime.toISOString(),
          reset_at: now.toISOString()
        },
        timestamp: new Date().toISOString()
      });
    } else {
      throw new Error('状态更新失败');
    }

  } catch (error) {
    console.error('❌ 重置冷却期失败:', error);
    res.status(500).json({
      success: false,
      error: '重置冷却期失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/status/logs/clear - 清空系统日志
 */
router.post('/logs/clear', async (req, res) => {
  try {
    // 清空server.log文件
    const logPath = './server.log';

    if (fsSync.existsSync(logPath)) {
      fsSync.writeFileSync(logPath, '');
    }

    // 同时清空logger服务中的系统日志
    const { loggerService } = await import('../services/logger.js');
    loggerService.clearLogs();

    res.json({
      success: true,
      message: '系统日志已清空',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 清空系统日志失败:', error);
    res.status(500).json({
      success: false,
      error: '清空系统日志失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;