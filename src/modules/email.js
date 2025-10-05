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
    const emailData = prepareAlertEmail(alertData, env);

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
    const emailData = prepareRecoveryEmail(recoveryData, env);

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
function prepareAlertEmail(alertData, env) {
  // 找出所有超过阈值的币种
  const alertTriggeredCoins = Object.entries(alertData.all_coins)
    .filter(([symbol, data]) => data.annual_rate > alertData.threshold)
    .map(([symbol, data]) => ({
      symbol,
      rate: data.annual_rate.toFixed(1)
    }))
    .sort((a, b) => b.rate - a.rate); // 按利率从高到低排序

  // 生成标题：时间 | 币种1(利率1) 币种2(利率2) ...
  const coinSummaries = alertTriggeredCoins.slice(0, 3).map(coin => `${coin.symbol}(${coin.rate}%)`).join(' ');
  const title = `${new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })} | ${coinSummaries}${alertTriggeredCoins.length > 3 ? '...' : ''}`;

  // 计算主要触发币种的超出百分比
  const excess = ((alertData.current_rate - alertData.threshold) / alertData.threshold * 100).toFixed(1);

  // 构建触发币种数组（包含所有超过阈值的币种）
  const triggeredCoins = Object.entries(alertData.all_coins)
    .filter(([symbol, data]) => data.annual_rate > alertData.threshold)
    .map(([symbol, data]) => {
      // 计算每个币种的超出百分比
      const coinExcess = ((data.annual_rate - alertData.threshold) / alertData.threshold * 100).toFixed(1);
      // 获取该币种的历史数据
      const coinHistory = alertData.all_coins[symbol]?.history || [];

      return {
        symbol: symbol,
        current_rate: data.annual_rate.toFixed(1),
        threshold: alertData.threshold.toFixed(1),
        excess: coinExcess,
        daily_rate: (data.annual_rate / 365).toFixed(3),
        hourly_rate: (data.annual_rate / 365 / 24).toFixed(4),
        history: coinHistory.slice(0, 5).map(h => {
          // 提取时间中的小时和分钟部分，去掉日期
          const timeMatch = h.time.match(/(\d{1,2}:\d{2})/);
          const timeStr = timeMatch ? timeMatch[1] : h.time;
          return {
            time: timeStr,
            rate: h.rate.toFixed(1),
            daily_rate: (h.rate / 365).toFixed(3),
            hourly_rate: (h.rate / 365 / 24).toFixed(4)
          };
        })
      };
    })
    .sort((a, b) => parseFloat(b.current_rate) - parseFloat(a.current_rate)); // 按利率从高到低排序

  // 构建所有币种状态数组
  const allCoinsStatus = Object.entries(alertData.all_coins).map(([symbol, data]) => ({
    symbol: symbol,
    annual_rate: data.annual_rate.toFixed(1),
    threshold: alertData.threshold.toFixed(1),
    is_above_threshold: data.annual_rate > alertData.threshold
  }));

  return {
    service_id: env.EMAILJS_SERVICE_ID,
    template_id: env.EMAILJS_TEMPLATE_ID,
    user_id: env.EMAILJS_PUBLIC_KEY,
    template_params: {
      to_email: alertData.email,
      subject: title,
      exchange_name: alertData.exchange,
      detection_time: alertData.detection_time,
      // 多币种数组结构
      triggered_count: alertTriggeredCoins.length,
      triggered_coins: triggeredCoins,
      all_coins_status: allCoinsStatus,
      total_coins: Object.keys(alertData.all_coins).length,
      check_interval: '每小时',
      next_check_time: new Date(Date.now() + 60 * 60 * 1000).toLocaleString('zh-CN')
    }
  };
}

/**
 * 准备回落通知邮件数据
 */
function prepareRecoveryEmail(recoveryData, env) {
  const title = `${new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })} | ${recoveryData.coin}-回落通知`;

  // 构建触发币种数组（回落通知时币种在正常范围内）
  const triggeredCoins = [{
    symbol: recoveryData.coin,
    current_rate: recoveryData.current_rate.toFixed(1),
    threshold: recoveryData.threshold.toFixed(1),
    excess: '0',
    daily_rate: (recoveryData.current_rate / 365).toFixed(3),
    hourly_rate: (recoveryData.current_rate / 365 / 24).toFixed(4),
    history: [] // 回落通知不需要历史数据
  }];

  // 构建所有币种状态数组
  const allCoinsStatus = [{
    symbol: recoveryData.coin,
    annual_rate: recoveryData.current_rate.toFixed(1),
    threshold: recoveryData.threshold.toFixed(1),
    is_above_threshold: false
  }];

  return {
    service_id: env.EMAILJS_SERVICE_ID,
    template_id: env.EMAILJS_TEMPLATE_ID,
    user_id: env.EMAILJS_PUBLIC_KEY,
    template_params: {
      to_email: recoveryData.email,
      subject: title,
      exchange_name: 'CoinGlass监控',
      detection_time: recoveryData.recovery_time,
      // 多币种数组结构
      triggered_count: 1,
      triggered_coins: triggeredCoins,
      all_coins_status: allCoinsStatus,
      total_coins: 1,
      check_interval: '每小时',
      next_check_time: new Date(Date.now() + 60 * 60 * 1000).toLocaleString('zh-CN')
    }
  };
}

/**
 * 通过EmailJS发送邮件
 */
async function sendEmailJS(env, emailData) {
  try {
    // EmailJS API调用参数 - 使用Private Key认证
    const requestData = {
      service_id: emailData.service_id,
      template_id: emailData.template_id,
      user_id: emailData.user_id,
      template_params: emailData.template_params,
      accessToken: env.EMAILJS_PRIVATE_KEY || emailData.user_id
    };

    
    // 尝试直接使用JSON格式，模拟浏览器POST请求
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Origin': 'https://www.emailjs.com',
        'Referer': 'https://www.emailjs.com/',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"macOS"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site'
      },
      body: JSON.stringify(requestData)
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