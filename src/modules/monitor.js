/**
 * 监控逻辑模块
 */

import { getUserConfig, getCoinState, updateCoinState, isWithinNotificationHours, getNextNotificationTime, scheduleNotification } from '../utils/config.js';

/**
 * 运行监控逻辑
 */
export async function runMonitoring(env) {
  console.log('1. 开始抓取 CoinGlass 数据...');

  // 2. 获取用户配置（先获取配置以确定筛选器）
  const config = await getUserConfig(env);
  if (!config || !config.monitoring_enabled) {
    console.log('监控未启用');
    return;
  }

  // 1. 抓取数据（使用配置中的筛选器）
  const filters = config.filters || { exchange: 'binance', coin: 'USDT', timeframe: '1h' };
  const { fetchRateData } = await import('./scraper.js');
  const rateData = await fetchRateData(filters);
  if (!rateData) {
    console.error('数据抓取失败');
    return;
  }

  console.log('2. 数据抓取成功，开始检查阈值...');
  console.log('使用筛选器:', filters);

  // 3. 检查每个币种的阈值
  for (const coin of config.coins.filter(c => c.enabled)) {
    await checkCoinThreshold(env, coin, rateData, config);
  }

  console.log('3. 阈值检查完成');
}

/**
 * 检查单个币种的阈值
 */
export async function checkCoinThreshold(env, coin, rateData, config) {
  const currentRate = rateData.coins[coin.symbol]?.annual_rate;
  if (!currentRate) {
    console.log(`币种 ${coin.symbol} 数据不存在`);
    return;
  }

  // 获取币种状态
  const state = await getCoinState(env, coin.symbol);
  const now = new Date();

  // 状态机逻辑
  if (currentRate > coin.threshold) {
    // 利率超过阈值
    if (state.status === 'normal' || !state.status) {
      // 首次触发
      if (isWithinNotificationHours(config)) {
        // 在允许时间段内，立即通知
        const { sendAlert } = await import('./email.js');
        await sendAlert(env, coin, currentRate, rateData, config);
        await updateCoinState(env, coin.symbol, 'alert', {
          last_notification: now.toISOString(),
          next_notification: new Date(now.getTime() + config.repeat_interval * 60 * 60 * 1000).toISOString(),
          last_rate: currentRate
        });
      } else {
        // 非时间段内，延迟到下一个允许时间段
        const nextNotificationTime = getNextNotificationTime(config);
        await scheduleNotification(env, coin.symbol, 'alert', {
          coin,
          currentRate,
          rateData,
          config,
          scheduled_time: nextNotificationTime.toISOString()
        });
        await updateCoinState(env, coin.symbol, 'alert', {
          last_rate: currentRate,
          pending_notification: true
        });
        console.log(`币种 ${coin.symbol} 触发警报，但不在通知时间段内，已安排在 ${nextNotificationTime.toLocaleString()} 发送`);
      }
    } else if (state.status === 'alert' && now >= new Date(state.next_notification)) {
      // 冷却期结束，再次通知
      if (isWithinNotificationHours(config)) {
        const { sendAlert } = await import('./email.js');
        await sendAlert(env, coin, currentRate, rateData, config);
        await updateCoinState(env, coin.symbol, 'alert', {
          last_notification: now.toISOString(),
          next_notification: new Date(now.getTime() + config.repeat_interval * 60 * 60 * 1000).toISOString(),
          last_rate: currentRate
        });
      } else {
        // 非时间段内，延迟到下一个允许时间段
        const nextNotificationTime = getNextNotificationTime(config);
        await scheduleNotification(env, coin.symbol, 'alert', {
          coin,
          currentRate,
          rateData,
          config,
          scheduled_time: nextNotificationTime.toISOString()
        });
        await updateCoinState(env, coin.symbol, 'alert', {
          next_notification: nextNotificationTime.toISOString(),
          last_rate: currentRate
        });
        console.log(`币种 ${coin.symbol} 重复警报，但不在通知时间段内，已安排在 ${nextNotificationTime.toLocaleString()} 发送`);
      }
    }
  } else {
    // 利率回落到阈值以下
    if (state.status === 'alert') {
      if (isWithinNotificationHours(config)) {
        const { sendRecovery } = await import('./email.js');
        await sendRecovery(env, coin, currentRate, config);
        await updateCoinState(env, coin.symbol, 'normal', {
          last_rate: currentRate
        });
      } else {
        // 非时间段内，延迟到下一个允许时间段
        const nextNotificationTime = getNextNotificationTime(config);
        await scheduleNotification(env, coin.symbol, 'recovery', {
          coin,
          currentRate,
          config,
          scheduled_time: nextNotificationTime.toISOString()
        });
        await updateCoinState(env, coin.symbol, 'normal', {
          last_rate: currentRate,
          pending_notification: true
        });
        console.log(`币种 ${coin.symbol} 回落通知，但不在通知时间段内，已安排在 ${nextNotificationTime.toLocaleString()} 发送`);
      }
    }
  }

  // 检查是否有待发送的通知
  const { checkPendingNotifications } = await import('../utils/config.js');
  await checkPendingNotifications(env, config);
}