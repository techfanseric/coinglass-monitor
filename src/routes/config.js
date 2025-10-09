/**
 * 配置管理 API 路由
 * 提供与 Cloudflare Workers 兼容的配置管理接口
 */

import express from 'express';
import { storageService } from '../services/storage.js';
import { formatDateTime } from '../utils/time-utils.js';

const router = express.Router();

/**
 * 检测配置变化
 */
function detectConfigChanges(oldConfig, newConfig) {
  const changes = [];

  if (!oldConfig || !newConfig) {
    return changes;
  }

  // 检测触发时间变化
  const oldTrigger = oldConfig.trigger_settings || {};
  const newTrigger = newConfig.trigger_settings || {};

  if (oldTrigger.hourly_minute !== newTrigger.hourly_minute) {
    changes.push(`每小时触发时间: ${oldTrigger.hourly_minute}分 → ${newTrigger.hourly_minute}分`);
  }

  if (oldTrigger.daily_time !== newTrigger.daily_time) {
    changes.push(`每天触发时间: ${oldTrigger.daily_time || '未设置'} → ${newTrigger.daily_time || '未设置'}`);
  }

  // 检测通知时间窗口变化
  const oldNotification = oldConfig.notification_hours || {};
  const newNotification = newConfig.notification_hours || {};

  if (oldNotification.enabled !== newNotification.enabled) {
    changes.push(`通知时间限制: ${oldNotification.enabled ? '启用' : '禁用'} → ${newNotification.enabled ? '启用' : '禁用'}`);
  }

  if (oldNotification.start !== newNotification.start || oldNotification.end !== newNotification.end) {
    const oldRange = oldNotification.enabled ? `${oldNotification.start}-${oldNotification.end}` : '全天';
    const newRange = newNotification.enabled ? `${newNotification.start}-${newNotification.end}` : '全天';
    changes.push(`通知时间窗口: ${oldRange} → ${newRange}`);
  }

  // 检测重复间隔变化
  if (oldConfig.repeat_interval !== newConfig.repeat_interval) {
    changes.push(`重复间隔: ${oldConfig.repeat_interval || 180}分钟 → ${newConfig.repeat_interval || 180}分钟`);
  }

  // 检测邮件分组变化
  const oldGroups = oldConfig.email_groups || [];
  const newGroups = newConfig.email_groups || [];

  // 检查新增的分组
  for (const newGroup of newGroups) {
    const oldGroup = oldGroups.find(g => g.id === newGroup.id);
    if (!oldGroup) {
      changes.push(`新增邮件分组: ${newGroup.name}`);
    }
  }

  // 检查删除的分组
  for (const oldGroup of oldGroups) {
    const newGroup = newGroups.find(g => g.id === oldGroup.id);
    if (!newGroup) {
      changes.push(`删除邮件分组: ${oldGroup.name}`);
    }
  }

  // 检查修改的分组
  for (const newGroup of newGroups) {
    const oldGroup = oldGroups.find(g => g.id === newGroup.id);
    if (oldGroup) {
      // 检查邮箱变化
      if (oldGroup.email !== newGroup.email) {
        changes.push(`${newGroup.name}邮箱: ${oldGroup.email || '空'} → ${newGroup.email || '空'}`);
      }

      // 检查启用状态变化
      if (oldGroup.enabled !== newGroup.enabled) {
        changes.push(`${newGroup.name}状态: ${oldGroup.enabled ? '启用' : '禁用'} → ${newGroup.enabled ? '启用' : '禁用'}`);
      }

      // 检查币种变化
      const oldCoins = oldGroup.coins || [];
      const newCoins = newGroup.coins || [];

      // 新增币种
      for (const newCoin of newCoins) {
        const oldCoin = oldCoins.find(c =>
          c.symbol === newCoin.symbol &&
          c.exchange === newCoin.exchange &&
          c.timeframe === newCoin.timeframe
        );
        if (!oldCoin) {
          changes.push(`${newGroup.name}新增币种: ${newCoin.exchange}-${newCoin.symbol}(${newCoin.timeframe}) 阈值:${newCoin.threshold}%`);
        }
      }

      // 删除币种
      for (const oldCoin of oldCoins) {
        const newCoin = newCoins.find(c =>
          c.symbol === oldCoin.symbol &&
          c.exchange === oldCoin.exchange &&
          c.timeframe === oldCoin.timeframe
        );
        if (!newCoin) {
          changes.push(`${newGroup.name}删除币种: ${oldCoin.exchange}-${oldCoin.symbol}(${oldCoin.timeframe})`);
        }
      }

      // 修改币种
      for (const newCoin of newCoins) {
        const oldCoin = oldCoins.find(c =>
          c.symbol === newCoin.symbol &&
          c.exchange === newCoin.exchange &&
          c.timeframe === newCoin.timeframe
        );
        if (oldCoin) {
          if (oldCoin.threshold !== newCoin.threshold) {
            changes.push(`${newGroup.name}修改${newCoin.exchange}-${newCoin.symbol}阈值: ${oldCoin.threshold}% → ${newCoin.threshold}%`);
          }
          if (oldCoin.enabled !== newCoin.enabled) {
            changes.push(`${newGroup.name}修改${newCoin.exchange}-${newCoin.symbol}状态: ${oldCoin.enabled ? '启用' : '禁用'} → ${newCoin.enabled ? '启用' : '禁用'}`);
          }
        }
      }
    }
  }

  return changes;
}

/**
 * 验证时间字符串格式
 */
function validateTimeFormat(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') {
    return false;
  }

  const parts = timeStr.split(':');
  if (parts.length !== 2) {
    return false;
  }

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);

  return !isNaN(hours) && !isNaN(minutes) &&
         hours >= 0 && hours <= 23 &&
         minutes >= 0 && minutes <= 59;
}

/**
 * 标准化交易所名称
 */
function normalizeExchangeName(exchange) {
  if (!exchange || typeof exchange !== 'string') {
    return exchange;
  }

  const normalized = exchange.toLowerCase();
  switch (normalized) {
    case 'binance': return 'Binance';
    case 'okx': return 'OKX';
    case 'bybit': return 'Bybit';
    case 'huobi': return 'Huobi';
    case 'kucoin': return 'KuCoin';
    case 'mexc': return 'MEXC';
    case 'gate.io':
    case 'gate':
      return 'Gate.io';
    case 'bitget': return 'Bitget';
    case 'crypto.com':
    case 'crypto':
      return 'Crypto.com';
    case 'coinbase': return 'Coinbase';
    case 'kraken': return 'Kraken';
    case 'ftx': return 'FTX';
    case 'bitfinex': return 'Bitfinex';
    case 'bittrex': return 'Bittrex';
    case 'poloniex': return 'Poloniex';
    default:
      // 对于未知交易所，首字母大写其余小写
      return exchange.charAt(0).toUpperCase() + exchange.slice(1).toLowerCase();
  }
}

/**
 * 验证并修复 notification_hours 配置
 */
function validateNotificationHours(notificationHours) {
  if (!notificationHours || typeof notificationHours !== 'object') {
    return {
      enabled: false,
      start: '09:00',
      end: '23:59'
    };
  }

  const enabled = Boolean(notificationHours.enabled);

  // 如果未启用，返回默认值
  if (!enabled) {
    return {
      enabled: false,
      start: '09:00',
      end: '23:59'
    };
  }

  // 验证时间格式
  const startValid = validateTimeFormat(notificationHours.start);
  const endValid = validateTimeFormat(notificationHours.end);

  // 如果时间格式无效，自动禁用并返回默认值
  if (!startValid || !endValid) {
    console.warn('⚠️ notification_hours 时间格式无效，自动禁用时间限制');
    return {
      enabled: false,
      start: '09:00',
      end: '23:59'
    };
  }

  // 验证配置完整性
  if (!notificationHours.start || !notificationHours.end) {
    console.warn('⚠️ notification_hours 配置不完整，自动禁用时间限制');
    return {
      enabled: false,
      start: '09:00',
      end: '23:59'
    };
  }

  return {
    enabled: true,
    start: notificationHours.start,
    end: notificationHours.end
  };
}

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
      timestamp: formatDateTime(new Date())
    });
  }
});

/**
 * POST /api/config - 保存用户配置
 */
router.post('/', async (req, res) => {
  try {
    const config = req.body;

    // 获取当前配置进行比较，检测变化
    const currentConfig = await storageService.getConfig();
    const changes = detectConfigChanges(currentConfig, config);

    // 验证配置格式
    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        error: '配置格式无效',
        timestamp: formatDateTime(new Date())
      });
    }

    // 验证和标准化币种配置
    const validatedCoins = Array.isArray(config.coins) ? config.coins.map(coin => ({
      symbol: coin.symbol || 'USDT',
      exchange: normalizeExchangeName(coin.exchange) || 'OKX',
      timeframe: coin.timeframe || '1h',
      threshold: Number(coin.threshold) || 5.0,
      enabled: Boolean(coin.enabled !== false), // 默认启用
      ...coin
    })) : [];

    // 确保必要字段存在 - 优化配置结构
    const validatedConfig = {
      email: config.email || '', // 保留以向后兼容
      // 移除全局 monitoring_enabled，改为基于邮件组的控制
      // 保留filters以维持向后兼容，但不再强制使用
      filters: {
        exchange: normalizeExchangeName(config.filters?.exchange) || 'OKX',
        coin: config.filters?.coin || 'USDT',
        timeframe: config.filters?.timeframe || '1h',
        ...config.filters
      },
      // 使用验证后的币种配置
      coins: validatedCoins,
      // 验证并规范化邮件分组配置
      email_groups: Array.isArray(config.email_groups) ? config.email_groups.map(group => ({
        id: group.id || `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: group.name || '未命名邮件组',
        email: group.email || '',
        enabled: Boolean(group.enabled !== false), // 默认启用，除非明确禁用
        coins: Array.isArray(group.coins) ? group.coins.map(coin => ({
          symbol: coin.symbol || '',
          exchange: normalizeExchangeName(coin.exchange) || 'OKX',
          timeframe: coin.timeframe || '1h',
          threshold: Number(coin.threshold) || 1,
          enabled: Boolean(coin.enabled !== false), // 默认启用，除非明确禁用
          ...coin
        })) : [],
        ...group
      })) : [],
      trigger_settings: {
        hourly_minute: Number(config.trigger_settings?.hourly_minute) || 0,
        daily_hour: Number(config.trigger_settings?.daily_hour) || 9,
        daily_minute: Number(config.trigger_settings?.daily_minute) || 0,
        ...config.trigger_settings
      },
      notification_hours: validateNotificationHours(config.notification_hours),
      repeat_interval: Number(config.repeat_interval) || 180, // 修复默认值
      // 不再使用 ...config 避免覆盖验证逻辑
    };

    // 检查是否有配置被修改
    const warnings = [];
    let modifiedConfig = { ...validatedConfig };

    // 检查通知时间设置是否被修改
    if (JSON.stringify(config.notification_hours) !== JSON.stringify(validatedConfig.notification_hours)) {
      warnings.push('通知时间设置已自动修正为有效格式');
    }

    const success = await storageService.saveConfig(modifiedConfig);

    if (success) {
      // 显示具体变化，而不是整个配置
      if (changes.length > 0) {
        console.log(`✅ 配置更新: ${changes.join(' | ')}`);
      } else {
        console.log(`✅ 配置保存: 无实际变化`);
      }

      res.json({
        success: true,
        message: '配置保存成功',
        config: modifiedConfig, // 返回实际保存的配置
        warnings: warnings,      // 返回警告信息
        timestamp: formatDateTime(new Date())
      });
    } else {
      throw new Error('配置保存失败');
    }

  } catch (error) {
    console.error('❌ 保存配置失败:', error);
    res.status(500).json({
      error: '保存配置失败',
      message: error.message,
      timestamp: formatDateTime(new Date())
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
      timestamp: formatDateTime(new Date())
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
        timestamp: formatDateTime(new Date())
      });
    } else {
      throw new Error('备份失败');
    }

  } catch (error) {
    console.error('❌ 配置备份失败:', error);
    res.status(500).json({
      error: '配置备份失败',
      message: error.message,
      timestamp: formatDateTime(new Date())
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
        timestamp: formatDateTime(new Date())
      });
    } else {
      throw new Error('重置失败');
    }

  } catch (error) {
    console.error('❌ 配置重置失败:', error);
    res.status(500).json({
      error: '配置重置失败',
      message: error.message,
      timestamp: formatDateTime(new Date())
    });
  }
});

export default router;