/**
 * 配置管理工具模块
 */

/**
 * 获取用户配置
 */
export async function getUserConfig(env) {
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
export async function getCoinState(env, coinSymbol) {
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
export async function updateCoinState(env, coinSymbol, status, data) {
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
 * 检查当前时间是否在允许的通知时间段内
 */
export function isWithinNotificationHours(config) {
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
 * 检查当前时间是否满足触发条件
 */
export function shouldTriggerNow(config) {
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
 * 获取下一个触发时间
 */
export function getNextTriggerTime(config) {
  const now = new Date();

  // 如果没有配置触发设置，使用默认行为（下一个小时0分）
  if (!config.trigger_settings) {
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1);
    nextHour.setMinutes(0);
    nextHour.setSeconds(0);
    nextHour.setMilliseconds(0);
    return nextHour;
  }

  const triggerSettings = config.trigger_settings;
  const possibleTimes = [];

  // 计算下一个每时触发时间 - 总是启用
  const nextHourly = new Date(now);
  if (now.getMinutes() < triggerSettings.hourly_minute) {
    nextHourly.setMinutes(triggerSettings.hourly_minute);
  } else {
    nextHourly.setHours(nextHourly.getHours() + 1);
    nextHourly.setMinutes(triggerSettings.hourly_minute);
  }
  nextHourly.setSeconds(0);
  nextHourly.setMilliseconds(0);
  possibleTimes.push(nextHourly);

  // 计算下一个每24时触发时间 - 总是启用
  const nextDaily = new Date(now);
  if (now.getHours() < triggerSettings.daily_hour ||
      (now.getHours() === triggerSettings.daily_hour && now.getMinutes() < triggerSettings.daily_minute)) {
    nextDaily.setHours(triggerSettings.daily_hour);
    nextDaily.setMinutes(triggerSettings.daily_minute);
  } else {
    nextDaily.setDate(nextDaily.getDate() + 1);
    nextDaily.setHours(triggerSettings.daily_hour);
    nextDaily.setMinutes(triggerSettings.daily_minute);
  }
  nextDaily.setSeconds(0);
  nextDaily.setMilliseconds(0);
  possibleTimes.push(nextDaily);

  // 返回最早的触发时间
  return new Date(Math.min(...possibleTimes.map(t => t.getTime())));
}

/**
 * 解析时间字符串为分钟数
 */
export function parseTime(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * 生成 cron 表达式
 */
export function generateCronExpression(config) {
  // 如果没有配置触发设置，使用默认表达式（每小时0分）
  if (!config.trigger_settings) {
    return "0 * * * *";
  }

  const triggerSettings = config.trigger_settings;

  // 每时触发更频繁，优先使用它来保证监控的及时性
  return `${triggerSettings.hourly_minute} * * * *`;
}

/**
 * 获取下一个通知时间
 */
export function getNextNotificationTime(config) {
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
export async function scheduleNotification(env, coinSymbol, type, data) {
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
export async function checkPendingNotifications(env, config) {
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

          // 这里需要动态导入邮件模块来避免循环依赖
          const { sendAlert, sendRecovery } = await import('../modules/email.js');

          if (notification.type === 'alert') {
            await sendAlert(env, notification.data.coin, notification.data.currentRate, notification.data.rateData, notification.data.config);
          } else if (notification.type === 'recovery') {
            await sendRecovery(env, notification.data.coin, notification.data.currentRate, notification.data.config);
          }

          // 删除已处理的待处理通知
          await env.STATE_KV.delete(key.name);

          // 更新币种状态，清除待处理标记
          const { getCoinState, updateCoinState } = await import('./config.js');
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

/**
 * 记录邮件发送历史
 */
export async function recordEmailHistory(env, emailData) {
  try {
    const historyKey = `email_history_${Date.now()}`;
    const history = {
      ...emailData,
      sent_at: new Date().toISOString()
    };

    await env.STATE_KV.put(historyKey, JSON.stringify(history), {
      expirationTtl: 30 * 24 * 60 * 60 // 30天后过期
    });

    // 保持历史记录不超过100条
    const list = await env.STATE_KV.list({ prefix: 'email_history_' });
    if (list.keys.length > 100) {
      const sortedKeys = list.keys.sort((a, b) => a.name.localeCompare(b.name));
      const keysToDelete = sortedKeys.slice(0, list.keys.length - 100);

      for (const key of keysToDelete) {
        await env.STATE_KV.delete(key.name);
      }
    }
  } catch (error) {
    console.error('记录邮件历史失败:', error);
  }
}