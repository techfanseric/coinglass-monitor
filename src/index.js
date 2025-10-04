/**
 * CoinGlass 利率监控 Worker
 * 主要功能：
 * 1. 定时抓取 CoinGlass 网站数据
 * 2. 检查利率阈值
 * 3. 发送邮件通知
 */

export default {
  // 定时任务入口
  async scheduled(event, env, ctx) {
    console.log('开始执行利率监控任务');

    try {
      await runMonitoring(env);
      console.log('监控任务完成');
    } catch (error) {
      console.error('监控任务失败:', error);
    }
  },

  // API 请求处理
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // API 路由
    if (url.pathname === '/api/config') {
      if (request.method === 'GET') {
        return getConfig(env);
      } else if (request.method === 'POST') {
        return saveConfig(request, env);
      }
    }

    if (url.pathname === '/api/status') {
      return getStatus(env);
    }

    // 默认返回
    return new Response('Not Found', { status: 404 });
  },
};

/**
 * 运行监控逻辑
 */
async function runMonitoring(env) {
  console.log('1. 开始抓取 CoinGlass 数据...');

  // 1. 抓取数据
  const rateData = await fetchRateData();
  if (!rateData) {
    console.error('数据抓取失败');
    return;
  }

  console.log('2. 数据抓取成功，开始检查阈值...');

  // 2. 获取用户配置
  const config = await getUserConfig(env);
  if (!config || !config.monitoring_enabled) {
    console.log('监控未启用');
    return;
  }

  // 3. 检查每个币种的阈值
  for (const coin of config.coins.filter(c => c.enabled)) {
    await checkCoinThreshold(env, coin, rateData, config);
  }

  console.log('3. 阈值检查完成');
}

/**
 * 抓取 CoinGlass 利率数据
 */
async function fetchRateData() {
  try {
    const response = await fetch('https://www.coinglass.com/zh/pro/i/MarginFeeChart', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.8,en-US;q=0.5,en;q=0.3',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();

    // 解析 HTML 提取利率数据
    return parseRateData(html);
  } catch (error) {
    console.error('抓取数据失败:', error);
    return null;
  }
}

/**
 * 解析 HTML 提取利率数据
 */
function parseRateData(html) {
  // 这里需要实现 HTML 解析逻辑
  // 暂时返回模拟数据
  return {
    exchange: 'Binance',
    timestamp: new Date().toISOString(),
    coins: {
      'USDT': {
        annual_rate: 7.09,
        daily_rate: 0.02,
        hourly_rate: 0.0008,
        history: [
          { time: '2025-10-04 23:00', rate: 7.09 },
          { time: '2025-10-04 22:00', rate: 7.09 },
          { time: '2025-10-04 21:00', rate: 7.09 },
          { time: '2025-10-04 20:00', rate: 7.09 },
          { time: '2025-10-04 19:00', rate: 7.09 },
        ]
      },
      'CFX': {
        annual_rate: 5.0,
        daily_rate: 0.014,
        hourly_rate: 0.0006,
        history: [
          { time: '2025-10-04 14:00', rate: 5.0 },
          { time: '2025-10-04 13:00', rate: 4.8 },
          { time: '2025-10-04 12:00', rate: 4.5 },
          { time: '2025-10-04 11:00', rate: 4.2 },
          { time: '2025-10-04 10:00', rate: 4.0 },
        ]
      },
      'IOST': {
        annual_rate: 8.0,
        daily_rate: 0.022,
        hourly_rate: 0.0009,
        history: [
          { time: '2025-10-04 14:00', rate: 8.0 },
          { time: '2025-10-04 13:00', rate: 7.5 },
          { time: '2025-10-04 12:00', rate: 7.2 },
          { time: '2025-10-04 11:00', rate: 6.8 },
          { time: '2025-10-04 10:00', rate: 6.5 },
        ]
      }
    }
  };
}

/**
 * 检查单个币种的阈值
 */
async function checkCoinThreshold(env, coin, rateData, config) {
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
  await checkPendingNotifications(env, config);
}

/**
 * 发送警报邮件
 */
async function sendAlert(env, coin, currentRate, rateData, config) {
  console.log(`发送警报: ${coin.symbol} 当前利率 ${currentRate}% 超过阈值 ${coin.threshold}%`);

  // TODO: 实现 EmailJS 发送逻辑
  // 这里先使用日志模拟
  const alertData = {
    type: 'alert',
    coin: coin.symbol,
    current_rate: currentRate,
    threshold: coin.threshold,
    timestamp: new Date().toISOString(),
    email: config.email,
    history: rateData.coins[coin.symbol]?.history || []
  };

  console.log('警报数据:', alertData);
}

/**
 * 发送回落通知
 */
async function sendRecovery(env, coin, currentRate, config) {
  console.log(`发送回落通知: ${coin.symbol} 当前利率 ${currentRate}% 已回落到阈值以下`);

  // TODO: 实现 EmailJS 发送逻辑
  const recoveryData = {
    type: 'recovery',
    coin: coin.symbol,
    current_rate: currentRate,
    threshold: coin.threshold,
    timestamp: new Date().toISOString(),
    email: config.email
  };

  console.log('回落通知数据:', recoveryData);
}

/**
 * 获取用户配置
 */
async function getUserConfig(env) {
  try {
    const config = await env.CONFIG_KV.get('user_settings');
    return config ? JSON.parse(config) : null;
  } catch (error) {
    console.error('获取配置失败:', error);
    return null;
  }
}

/**
 * 获取币种状态
 */
async function getCoinState(env, coinSymbol) {
  try {
    const state = await env.STATE_KV.get(`coin_${coinSymbol}`);
    return state ? JSON.parse(state) : { status: 'normal' };
  } catch (error) {
    console.error('获取币种状态失败:', error);
    return { status: 'normal' };
  }
}

/**
 * 更新币种状态
 */
async function updateCoinState(env, coinSymbol, status, data) {
  try {
    const state = {
      status,
      ...data,
      updated_at: new Date().toISOString()
    };
    await env.STATE_KV.put(`coin_${coinSymbol}`, JSON.stringify(state));
  } catch (error) {
    console.error('更新币种状态失败:', error);
  }
}

/**
 * API: 获取配置
 */
async function getConfig(env) {
  try {
    const config = await getUserConfig(env);
    return new Response(JSON.stringify(config || {}), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

/**
 * API: 保存配置
 */
async function saveConfig(request, env) {
  try {
    const config = await request.json();
    await env.CONFIG_KV.put('user_settings', JSON.stringify(config));

    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

/**
 * API: 获取状态
 */
async function getStatus(env) {
  try {
    const config = await getUserConfig(env);
    const states = {};

    if (config && config.coins) {
      for (const coin of config.coins) {
        states[coin.symbol] = await getCoinState(env, coin.symbol);
      }
    }

    return new Response(JSON.stringify({ states }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
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
 * 解析时间字符串为分钟数
 */
function parseTime(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
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
 * 安排延迟通知
 */
async function scheduleNotification(env, coinSymbol, type, data) {
  try {
    const scheduledKey = `scheduled_${coinSymbol}_${Date.now()}`;
    await env.STATE_KV.put(scheduledKey, JSON.stringify({
      type,
      data,
      coin: coinSymbol,
      scheduled_time: data.scheduled_time,
      created_at: new Date().toISOString()
    }), {
      expirationTtl: 7 * 24 * 60 * 60 // 7天后过期
    });

    console.log(`已安排延迟通知: ${coinSymbol} ${type} 在 ${data.scheduled_time}`);
  } catch (error) {
    console.error('安排延迟通知失败:', error);
  }
}

/**
 * 检查并发送待处理的通知
 */
async function checkPendingNotifications(env, config) {
  try {
    // 如果当前不在通知时间段内，不处理待处理通知
    if (!isWithinNotificationHours(config)) {
      return;
    }

    const now = new Date();
    const list = await env.STATE_KV.list({ prefix: 'scheduled_' });

    for (const key of list.keys) {
      try {
        const scheduled = await env.STATE_KV.get(key.name);
        if (!scheduled) continue;

        const notification = JSON.parse(scheduled);
        const scheduledTime = new Date(notification.scheduled_time);

        // 如果已到发送时间，发送通知
        if (now >= scheduledTime) {
          console.log(`发送延迟通知: ${notification.coin} ${notification.type}`);

          if (notification.type === 'alert') {
            await sendAlert(env, notification.data.coin, notification.data.currentRate, notification.data.rateData, notification.data.config);
          } else if (notification.type === 'recovery') {
            await sendRecovery(env, notification.data.coin, notification.data.currentRate, notification.data.config);
          }

          // 删除已处理的待处理通知
          await env.STATE_KV.delete(key.name);

          // 更新币种状态，清除待处理标记
          const state = await getCoinState(env, notification.coin);
          if (state.pending_notification) {
            await updateCoinState(env, notification.coin, state.status, {
              ...state,
              pending_notification: false
            });
          }
        }
      } catch (error) {
        console.error(`处理待处理通知失败 ${key.name}:`, error);
      }
    }
  } catch (error) {
    console.error('检查待处理通知失败:', error);
  }
}