/**
 * 监控逻辑服务 - 从Cloudflare Workers迁移
 * 保持所有原有监控逻辑和Hysteresis状态机不变
 */

import { storageService } from './storage.js';
import { emailService } from './email.js';
import { scraperService } from './scraper.js';
import { loggerService } from './logger.js';

/**
 * 运行监控逻辑
 */
export async function runMonitoring() {
  const logPrefix = '[监控任务]';
  loggerService.info(`${logPrefix} 开始执行监控任务`);
  console.log('1. 开始执行监控任务...');

  try {
    // 2. 获取用户配置
    const config = await storageService.getConfig();
    if (!config || !config.monitoring_enabled) {
      loggerService.warn(`${logPrefix} 监控未启用`);
      console.log('监控未启用');
      return { success: false, reason: 'monitoring_disabled' };
    }

    // 1. 检查当前时间是否满足触发条件
    if (!shouldTriggerNow(config)) {
      loggerService.info(`${logPrefix} 当前时间不满足触发条件，跳过本次监控`);
      console.log('当前时间不满足触发条件，跳过本次监控');
      return { success: false, reason: 'trigger_time_not_met' };
    }

    loggerService.info(`${logPrefix} 触发条件满足，开始抓取 CoinGlass 数据`);
    console.log('2. 触发条件满足，开始抓取 CoinGlass 数据...');

    // 3. 抓取数据（获取所有启用的币种）
    const enabledCoins = config.coins.filter(c => c.enabled).map(c => c.symbol);
    const filters = config.filters || { exchange: 'binance', coin: 'USDT', timeframe: '1h' };

    loggerService.info(`${logPrefix} 准备抓取币种: ${enabledCoins.join(', ')}`);
    console.log(`🎯 准备抓取币种: ${enabledCoins.join(', ')}`);
    const rateData = await scraperService.scrapeCoinGlassData(
      filters.exchange,
      filters.coin,
      filters.timeframe,
      enabledCoins
    );

    if (!rateData) {
      loggerService.error(`${logPrefix} 数据抓取失败`);
      console.error('数据抓取失败');
      return { success: false, reason: 'scraping_failed' };
    }

    loggerService.info(`${logPrefix} 数据抓取成功，开始检查阈值，使用筛选器: ${JSON.stringify(filters)}`);
    console.log('3. 数据抓取成功，开始检查阈值...');
    console.log('使用筛选器:', filters);

    // 4. 检查每个币种的阈值
    const results = [];
    for (const coin of config.coins.filter(c => c.enabled)) {
      const result = await checkCoinThreshold(coin, rateData, config);
      results.push(result);
    }

    console.log('4. 阈值检查完成');

    // 5. 检查是否有待发送的通知
    await checkPendingNotifications(config);

    return {
      success: true,
      data: {
        filters,
        rateData,
        results,
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('监控执行异常:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 检查单个币种的阈值
 */
export async function checkCoinThreshold(coin, rateData, config) {
  const currentRate = rateData.coins[coin.symbol]?.annual_rate;
  if (!currentRate) {
    loggerService.warn(`[阈值检查] 币种 ${coin.symbol} 数据不存在`);
    console.log(`币种 ${coin.symbol} 数据不存在`);
    return { coin: coin.symbol, success: false, reason: 'data_not_found' };
  }

  // 获取币种状态
  const state = await storageService.getCoinState(coin.symbol);
  const now = new Date();
  const result = {
    coin: coin.symbol,
    currentRate,
    threshold: coin.threshold,
    previousState: state.status,
    actions: []
  };

  try {
    // 状态机逻辑
    if (currentRate > coin.threshold) {
      // 利率超过阈值
      if (state.status === 'normal' || !state.status) {
        // 首次触发
        if (isWithinNotificationHours(config)) {
          // 在允许时间段内，立即通知
          const success = await emailService.sendAlert(coin, currentRate, rateData, config);
          if (success) {
            await storageService.updateCoinState(coin.symbol, 'alert', {
              last_notification: now.toISOString(),
              next_notification: new Date(now.getTime() + config.repeat_interval * 60 * 1000).toISOString(), // 改为分钟
              last_rate: currentRate
            });
            result.actions.push('alert_sent');
            loggerService.info(`[阈值检查] 币种 ${coin.symbol} 触发警报，邮件已发送，利率 ${currentRate}% > ${coin.threshold}%`);
            console.log(`币种 ${coin.symbol} 触发警报，邮件已发送`);
          } else {
            result.actions.push('alert_failed');
            loggerService.error(`[阈值检查] 币种 ${coin.symbol} 警报邮件发送失败`);
          }
        } else {
          // 非时间段内，延迟到下一个允许时间段
          const nextNotificationTime = getNextNotificationTime(config);
          await storageService.saveScheduledNotification(coin.symbol, 'alert', {
            coin,
            currentRate,
            rateData,
            config,
            scheduled_time: nextNotificationTime.toISOString()
          });
          await storageService.updateCoinState(coin.symbol, 'alert', {
            last_rate: currentRate,
            pending_notification: true
          });
          result.actions.push('alert_scheduled');
          console.log(`币种 ${coin.symbol} 触发警报，但不在通知时间段内，已安排在 ${nextNotificationTime.toLocaleString()} 发送`);
        }
      } else if (state.status === 'alert' && now >= new Date(state.next_notification)) {
        // 冷却期结束，再次通知
        if (isWithinNotificationHours(config)) {
          const success = await emailService.sendAlert(coin, currentRate, rateData, config);
          if (success) {
            await storageService.updateCoinState(coin.symbol, 'alert', {
              last_notification: now.toISOString(),
              next_notification: new Date(now.getTime() + config.repeat_interval * 60 * 1000).toISOString(), // 改为分钟
              last_rate: currentRate
            });
            result.actions.push('repeat_alert_sent');
            console.log(`币种 ${coin.symbol} 重复警报，邮件已发送`);
          } else {
            result.actions.push('repeat_alert_failed');
          }
        } else {
          // 非时间段内，延迟到下一个允许时间段
          const nextNotificationTime = getNextNotificationTime(config);
          await storageService.saveScheduledNotification(coin.symbol, 'alert', {
            coin,
            currentRate,
            rateData,
            config,
            scheduled_time: nextNotificationTime.toISOString()
          });
          await storageService.updateCoinState(coin.symbol, 'alert', {
            next_notification: nextNotificationTime.toISOString(),
            last_rate: currentRate
          });
          result.actions.push('repeat_alert_scheduled');
          console.log(`币种 ${coin.symbol} 重复警报，但不在通知时间段内，已安排在 ${nextNotificationTime.toLocaleString()} 发送`);
        }
      } else {
        result.actions.push('in_cooling_period');
      }
    } else {
      // 利率回落到阈值以下
      if (state.status === 'alert') {
        if (isWithinNotificationHours(config)) {
          const success = await emailService.sendRecovery(coin, currentRate, config);
          if (success) {
            await storageService.updateCoinState(coin.symbol, 'normal', {
              last_rate: currentRate
            });
            result.actions.push('recovery_sent');
            console.log(`币种 ${coin.symbol} 回落通知，邮件已发送`);
          } else {
            result.actions.push('recovery_failed');
          }
        } else {
          // 非时间段内，延迟到下一个允许时间段
          const nextNotificationTime = getNextNotificationTime(config);
          await storageService.saveScheduledNotification(coin.symbol, 'recovery', {
            coin,
            currentRate,
            config,
            scheduled_time: nextNotificationTime.toISOString()
          });
          await storageService.updateCoinState(coin.symbol, 'normal', {
            last_rate: currentRate,
            pending_notification: true
          });
          result.actions.push('recovery_scheduled');
          console.log(`币种 ${coin.symbol} 回落通知，但不在通知时间段内，已安排在 ${nextNotificationTime.toLocaleString()} 发送`);
        }
      } else {
        result.actions.push('already_normal');
      }
    }

    result.success = true;
    result.newState = (await storageService.getCoinState(coin.symbol)).status;

  } catch (error) {
    console.error(`检查币种 ${coin.symbol} 阈值时发生异常:`, error);
    result.success = false;
    result.error = error.message;
  }

  return result;
}

/**
 * 检查当前时间是否满足触发条件
 */
function shouldTriggerNow(config) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // 如果没有配置触发设置，使用默认行为（每小时0分触发）
  if (!config.trigger_settings) {
    return currentMinute === 0;
  }

  const triggerSettings = config.trigger_settings;

  // 检查每时触发 - 总是启用
  if (currentMinute === triggerSettings.hourly_minute) {
    return true;
  }

  // 检查每24时触发 - 总是启用
  if (currentHour === triggerSettings.daily_hour &&
      currentMinute === triggerSettings.daily_minute) {
    return true;
  }

  return false;
}

/**
 * 检查当前时间是否在允许的通知时间段内
 */
function isWithinNotificationHours(config) {
  // 如果没有启用时间限制，始终允许通知
  if (!config.notification_hours || !config.notification_hours.enabled) {
    return true;
  }

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  const startTime = parseTime(config.notification_hours.start);
  const endTime = parseTime(config.notification_hours.end);

  return currentTime >= startTime && currentTime < endTime;
}

/**
 * 获取下一个通知时间
 */
function getNextNotificationTime(config) {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const startTime = parseTime(config.notification_hours.start);
  tomorrow.setHours(Math.floor(startTime / 60));
  tomorrow.setMinutes(startTime % 60);
  tomorrow.setSeconds(0);
  tomorrow.setMilliseconds(0);

  return tomorrow;
}

/**
 * 解析时间字符串为分钟数
 */
function parseTime(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * 检查并发送待处理的通知
 */
async function checkPendingNotifications(config) {
  try {
    const notifications = await storageService.getScheduledNotifications();
    const now = new Date();

    for (const notification of notifications) {
      try {
        const scheduledTime = new Date(notification.scheduled_time);

        // 如果已到发送时间，发送通知
        if (now >= scheduledTime) {
          console.log(`发送延迟通知: ${notification.coin} ${notification.type}`);

          let success = false;
          if (notification.type === 'alert') {
            success = await emailService.sendAlert(
              notification.data.coin,
              notification.data.currentRate,
              notification.data.rateData,
              notification.data.config
            );
          } else if (notification.type === 'recovery') {
            success = await emailService.sendRecovery(
              notification.data.coin,
              notification.data.currentRate,
              notification.data.config
            );
          }

          if (success) {
            // 删除已处理的通知
            await storageService.deleteScheduledNotification(notification.key);
            console.log(`延迟通知发送成功: ${notification.coin} ${notification.type}`);
          }
        }
      } catch (error) {
        console.error(`处理延迟通知失败:`, error);
      }
    }
  } catch (error) {
    console.error('检查待处理通知失败:', error);
  }
}

/**
 * 获取所有币种的当前状态
 */
export async function getAllCoinsStatus() {
  try {
    const config = await storageService.getConfig();
    if (!config || !config.coins) {
      return [];
    }

    const statusList = [];
    for (const coin of config.coins) {
      const state = await storageService.getCoinState(coin.symbol);
      statusList.push({
        symbol: coin.symbol,
        threshold: coin.threshold,
        enabled: coin.enabled,
        state: state.status || 'normal',
        last_notification: state.last_notification,
        next_notification: state.next_notification,
        last_rate: state.last_rate
      });
    }

    return statusList;
  } catch (error) {
    console.error('获取币种状态失败:', error);
    return [];
  }
}

// 导出监控服务
export const monitorService = {
  runMonitoring,
  checkCoinThreshold,
  getAllCoinsStatus,
  shouldTriggerNow,
  isWithinNotificationHours
};