/**
 * 配置管理 API 路由
 * 提供与 Cloudflare Workers 兼容的配置管理接口
 */

import express from 'express';
import { storageService } from '../services/storage.js';

const router = express.Router();

/**
 * GET /api/config - 获取用户配置
 */
router.get('/', async (req, res) => {
  try {
    // 静默处理配置请求，避免干扰系统日志

    const config = await storageService.getConfig();

    if (!config) {
      console.log('⚠️  配置不存在，返回默认配置');
      return res.json(storageService.getDefaultConfig());
    }

    res.json(config);

  } catch (error) {
    console.error('❌ 获取配置失败:', error);
    res.status(500).json({
      error: '获取配置失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/config - 保存用户配置
 */
router.post('/', async (req, res) => {
  try {
    console.log('💾 请求保存用户配置');
    console.log('📊 配置数据:', JSON.stringify(req.body, null, 2));

    const config = req.body;

    // 验证配置格式
    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        error: '配置格式无效',
        timestamp: new Date().toISOString()
      });
    }

    // 验证和标准化币种配置
    const validatedCoins = Array.isArray(config.coins) ? config.coins.map(coin => ({
      symbol: coin.symbol || 'USDT',
      exchange: coin.exchange || 'binance',
      timeframe: coin.timeframe || '1h',
      threshold: Number(coin.threshold) || 5.0,
      enabled: Boolean(coin.enabled !== false), // 默认启用
      ...coin
    })) : [];

    // 确保必要字段存在 - 优化配置结构
    const validatedConfig = {
      email: config.email || '',
      monitoring_enabled: Boolean(config.monitoring_enabled),
      // 保留filters以维持向后兼容，但不再强制使用
      filters: {
        exchange: config.filters?.exchange || 'binance',
        coin: config.filters?.coin || 'USDT',
        timeframe: config.filters?.timeframe || '1h',
        ...config.filters
      },
      // 使用验证后的币种配置
      coins: validatedCoins,
      trigger_settings: {
        hourly_minute: Number(config.trigger_settings?.hourly_minute) || 0,
        daily_hour: Number(config.trigger_settings?.daily_hour) || 9,
        daily_minute: Number(config.trigger_settings?.daily_minute) || 0,
        ...config.trigger_settings
      },
      notification_hours: {
        enabled: Boolean(config.notification_hours?.enabled),
        start: config.notification_hours?.start || '09:00',
        end: config.notification_hours?.end || '24:00',
        ...config.notification_hours
      },
      repeat_interval: Number(config.repeat_interval) || 180, // 修复默认值
      // 不再使用 ...config 避免覆盖验证逻辑
    };

    const success = await storageService.saveConfig(validatedConfig);

    if (success) {
      console.log('✅ 配置保存成功');
      res.json({
        success: true,
        message: '配置保存成功',
        timestamp: new Date().toISOString()
      });
    } else {
      throw new Error('配置保存失败');
    }

  } catch (error) {
    console.error('❌ 保存配置失败:', error);
    res.status(500).json({
      error: '保存配置失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/config/default - 获取默认配置
 */
router.get('/default', (req, res) => {
  try {
    console.log('📋 请求获取默认配置');
    const defaultConfig = storageService.getDefaultConfig();
    console.log('✅ 默认配置获取成功');
    res.json(defaultConfig);
  } catch (error) {
    console.error('❌ 获取默认配置失败:', error);
    res.status(500).json({
      error: '获取默认配置失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/config/backup - 备份配置
 */
router.post('/backup', async (req, res) => {
  try {
    console.log('💾 请求备份配置');

    const backupPath = await storageService.backup();

    if (backupPath) {
      console.log('✅ 配置备份成功');
      res.json({
        success: true,
        message: '配置备份成功',
        backup_path: backupPath,
        timestamp: new Date().toISOString()
      });
    } else {
      throw new Error('备份失败');
    }

  } catch (error) {
    console.error('❌ 配置备份失败:', error);
    res.status(500).json({
      error: '配置备份失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/config/reset - 重置配置
 */
router.post('/reset', async (req, res) => {
  try {
    console.log('🔄 请求重置配置');

    const defaultConfig = storageService.getDefaultConfig();
    const success = await storageService.saveConfig(defaultConfig);

    if (success) {
      console.log('✅ 配置重置成功');
      res.json({
        success: true,
        message: '配置重置成功',
        config: defaultConfig,
        timestamp: new Date().toISOString()
      });
    } else {
      throw new Error('重置失败');
    }

  } catch (error) {
    console.error('❌ 配置重置失败:', error);
    res.status(500).json({
      error: '配置重置失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;