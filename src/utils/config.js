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
 * 解析时间字符串为分钟数
 */
export function parseTime(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
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