/**
 * 邮件发送模块
 */

import { recordEmailHistory } from '../utils/config.js';

/**
 * 发送警报邮件
 */
export async function sendAlert(env, coin, currentRate, rateData, config) {
  console.log(`发送警报: ${coin.symbol} 当前利率 ${currentRate}% 超过阈值 ${coin.threshold}%`);

  try {
    const alertData = {
      type: 'alert',
      coin: coin.symbol,
      current_rate: currentRate,
      threshold: coin.threshold,
      timestamp: new Date().toISOString(),
      email: config.email,
      exchange: rateData.exchange,
      detection_time: new Date().toLocaleString('zh-CN'),
      history: rateData.coins[coin.symbol]?.history || [],
      all_coins: rateData.coins
    };

    // 准备邮件数据
    const emailData = prepareAlertEmail(alertData);

    // 发送邮件
    const success = await sendEmailJS(env, emailData);

    if (success) {
      console.log(`✅ 警报邮件发送成功: ${coin.symbol}`);
      // 记录发送历史
      await recordEmailHistory(env, alertData);
    } else {
      console.error(`❌ 警报邮件发送失败: ${coin.symbol}`);
    }

    return success;
  } catch (error) {
    console.error('发送警报邮件异常:', error);
    return false;
  }
}

/**
 * 发送回落通知
 */
export async function sendRecovery(env, coin, currentRate, config) {
  console.log(`发送回落通知: ${coin.symbol} 当前利率 ${currentRate}% 已回落到阈值以下`);

  try {
    const recoveryData = {
      type: 'recovery',
      coin: coin.symbol,
      current_rate: currentRate,
      threshold: coin.threshold,
      timestamp: new Date().toISOString(),
      email: config.email,
      recovery_time: new Date().toLocaleString('zh-CN')
    };

    // 准备邮件数据
    const emailData = prepareRecoveryEmail(recoveryData);

    // 发送邮件
    const success = await sendEmailJS(env, emailData);

    if (success) {
      console.log(`✅ 回落通知邮件发送成功: ${coin.symbol}`);
      // 记录发送历史
      await recordEmailHistory(env, recoveryData);
    } else {
      console.error(`❌ 回落通知邮件发送失败: ${coin.symbol}`);
    }

    return success;
  } catch (error) {
    console.error('发送回落通知邮件异常:', error);
    return false;
  }
}

/**
 * 准备警报邮件数据
 */
function prepareAlertEmail(alertData) {
  const triggeredCoins = [alertData.coin];
  const title = `${new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })} | ${triggeredCoins.join(', ')}`;

  return {
    service_id: env.EMAILJS_SERVICE_ID,
    template_id: env.EMAILJS_TEMPLATE_ID,
    user_id: env.EMAILJS_PUBLIC_KEY,
    template_params: {
      to_email: alertData.email,
      subject: title,
      exchange_name: alertData.exchange,
      detection_time: alertData.detection_time,
      triggered_coins: [{
        symbol: alertData.coin,
        current_rate: `${alertData.current_rate}%`,
        threshold: `${alertData.threshold}%`,
        history: alertData.history.map(h => `${h.time}: ${h.rate}%`).join('\\n')
      }],
      all_coins_status: Object.entries(alertData.all_coins).map(([symbol, data]) =>
        symbol + ': ' + data.annual_rate + '%'
      ).join(', '),
      next_check_time: new Date(Date.now() + 60 * 60 * 1000).toLocaleString('zh-CN')
    }
  };
}

/**
 * 准备回落通知邮件数据
 */
function prepareRecoveryEmail(recoveryData) {
  const title = `${new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })} | ${recoveryData.coin}-回落通知`;

  return {
    service_id: env.EMAILJS_SERVICE_ID,
    template_id: env.EMAILJS_TEMPLATE_ID,
    user_id: env.EMAILJS_PUBLIC_KEY,
    template_params: {
      to_email: recoveryData.email,
      subject: title,
      coin_symbol: recoveryData.coin,
      recovery_time: recoveryData.recovery_time,
      current_rate: `${recoveryData.current_rate}%`,
      threshold: `${recoveryData.threshold}%`
    }
  };
}

/**
 * 通过EmailJS发送邮件
 */
async function sendEmailJS(env, emailData) {
  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData)
    });

    if (response.status === 200) {
      console.log('EmailJS 发送成功');
      return true;
    } else {
      const errorText = await response.text();
      console.error('EmailJS 发送失败:', response.status, errorText);
      return false;
    }
  } catch (error) {
    console.error('EmailJS 发送异常:', error);
    return false;
  }
}