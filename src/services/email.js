/**
 * 邮件发送服务 - 从Cloudflare Workers迁移
 * 保持所有原有邮件逻辑不变，增加多币种支持
 */

import { storageService } from './storage.js';
import { loggerService } from './logger.js';

// 从环境变量加载配置
const emailConfig = {
  currencyDecimalPlaces: parseInt(process.env.CURRENCY_DECIMAL_PLACES) || 2,
  rateDecimalPlaces: parseInt(process.env.RATE_DECIMAL_PLACES) || 4,
  percentageDecimalPlaces: parseInt(process.env.PERCENTAGE_DECIMAL_PLACES) || 1,
  emailjsApiUrl: process.env.EMAILJS_API_URL || 'https://api.emailjs.com/api/v1.0/email/send',
  emailjsTimeout: parseInt(process.env.EMAILJS_TIMEOUT) || 10000
};

/**
 * 计算下次检查时间
 */
function calculateNextCheckTime(config) {
  const now = new Date();
  const triggerSettings = config?.trigger_settings || { hourly_minute: 0 };

  // 计算下一个小时的触发时间
  const nextHour = new Date(now);
  nextHour.setHours(nextHour.getHours() + 1);
  nextHour.setMinutes(triggerSettings.hourly_minute || 0);
  nextHour.setSeconds(0);
  nextHour.setMilliseconds(0);

  return nextHour;
}

/**
 * 生成完整的监控设置信息
 */
function generateMonitoringSettingsInfo(config) {
  const triggerSettings = config?.trigger_settings || { hourly_minute: 0, daily_time: '09:00' };
  const notificationHours = config?.notification_hours || { enabled: false, start: '09:00', end: '18:00' };
  const coins = config?.coins || [];

  // 获取启用的币种数量
  const enabledCoinsCount = coins.filter(coin => coin.enabled).length;

  // 获取交易所信息（去重）
  const exchanges = [...new Set(coins.map(coin => coin.exchange))];

  // 生成触发时间描述
  const triggerDescriptions = [];
  if (triggerSettings.hourly_minute !== undefined) {
    triggerDescriptions.push(`每小时第${triggerSettings.hourly_minute}分钟`);
  }
  if (triggerSettings.daily_time) {
    triggerDescriptions.push(`每日${triggerSettings.daily_time}`);
  }

  // 生成通知时间描述
  let notificationDescription = '24小时';
  if (notificationHours.enabled) {
    notificationDescription = `${notificationHours.start} - ${notificationHours.end}`;
  }

  // 生成重复间隔描述
  const repeatInterval = config?.repeat_interval || 180;
  let repeatDescription = `${repeatInterval}分钟`;
  if (repeatInterval >= 60) {
    repeatDescription = `${Math.floor(repeatInterval / 60)}小时${repeatInterval % 60 > 0 ? repeatInterval % 60 + '分钟' : ''}`;
  }

  return {
    exchanges: exchanges.join(', '),
    trigger_times: triggerDescriptions.join(', ') || '未设置',
    enabled_coins_count: enabledCoinsCount,
    total_coins_count: coins.length,
    notification_hours: notificationDescription,
    repeat_interval: repeatDescription,
    monitoring_enabled: config?.monitoring_enabled !== false,
    next_check_time: calculateNextCheckTime(config).toLocaleString('zh-CN')
  };
}

/**
 * 发送警报邮件
 */
export async function sendAlert(env, coin, currentRate, rateData, config) {
  loggerService.info(`[邮件服务] 发送警报: ${coin.symbol} 当前利率 ${currentRate}% 超过阈值 ${coin.threshold}%`);
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
      await storageService.recordEmailHistory(alertData);
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
    const emailData = prepareRecoveryEmail(recoveryData, env, config);

    // 发送邮件
    const success = await sendEmailJS(env, emailData);

    if (success) {
      console.log(`✅ 回落通知邮件发送成功: ${coin.symbol}`);
      // 记录发送历史
      await storageService.recordEmailHistory(recoveryData);
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
 * 发送测试邮件
 */
export async function sendTestEmail(email) {
  console.log('发送测试邮件');

  try {
    const testData = {
      type: 'test',
      email: email,
      timestamp: new Date().toISOString(),
      test_time: new Date().toLocaleString('zh-CN')
    };

    const emailData = prepareTestEmail(testData);

    // 构建env对象用于测试邮件
    const env = {
      EMAILJS_SERVICE_ID: process.env.EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID: process.env.EMAILJS_TEMPLATE_ID,
      EMAILJS_PUBLIC_KEY: process.env.EMAILJS_PUBLIC_KEY,
      EMAILJS_PRIVATE_KEY: process.env.EMAILJS_PRIVATE_KEY
    };

    const success = await sendEmailJS(env, emailData);

    if (success) {
      console.log('✅ 测试邮件发送成功');
      await storageService.recordEmailHistory(testData);
    } else {
      console.error('❌ 测试邮件发送失败');
    }

    return success;
  } catch (error) {
    console.error('发送测试邮件异常:', error);
    return false;
  }
}

/**
 * 准备警报邮件数据
 */
function prepareAlertEmail(alertData, env, config = null) {
  // 构建触发币种数组（包含所有超过阈值的币种）- 使用与内容生成相同的逻辑
  const triggeredCoins = Object.entries(alertData.all_coins)
    .filter(([symbol, data]) => {
      // 查找该币种在配置中的阈值
      const coinConfig = config.coins?.find(c => c.symbol === symbol);
      const threshold = coinConfig ? coinConfig.threshold : alertData.threshold;
      return data.annual_rate > threshold;
    })
    .map(([symbol, data]) => {
      // 查找该币种在配置中的阈值
      const coinConfig = config.coins?.find(c => c.symbol === symbol);
      const threshold = coinConfig ? coinConfig.threshold : alertData.threshold;

      // 计算每个币种的超出百分比（使用自己的阈值）
      const coinExcess = ((data.annual_rate - threshold) / threshold * 100).toFixed(emailConfig.percentageDecimalPlaces);
      // 获取该币种的历史数据
      const coinHistory = alertData.all_coins[symbol]?.history || [];

      return {
        symbol: symbol,
        current_rate: data.annual_rate.toFixed(emailConfig.currencyDecimalPlaces),
        threshold: threshold.toFixed(emailConfig.currencyDecimalPlaces), // 使用该币种自己的阈值
        excess: coinExcess,
        daily_rate: (data.annual_rate / 365).toFixed(emailConfig.currencyDecimalPlaces),
        hourly_rate: (data.annual_rate / 365 / 24).toFixed(emailConfig.rateDecimalPlaces),
        history: coinHistory.slice(0, 5).map(h => {
          // 提取时间中的小时和分钟部分，去掉日期
          const timeMatch = h.time.match(/(\d{1,2}:\d{2})/);
          const timeStr = timeMatch ? timeMatch[1] : h.time;
          return {
            time: timeStr,
            rate: h.annual_rate ? h.annual_rate.toFixed(emailConfig.currencyDecimalPlaces) : 'N/A',
            daily_rate: h.annual_rate ? (h.annual_rate / 365).toFixed(emailConfig.currencyDecimalPlaces) : 'N/A',
            hourly_rate: h.annual_rate ? (h.annual_rate / 365 / 24).toFixed(emailConfig.rateDecimalPlaces) : 'N/A'
          };
        })
      };
    })
    .sort((a, b) => parseFloat(b.current_rate) - parseFloat(a.current_rate)); // 按利率从高到低排序

  // 生成标题：时间 | 币种1(利率1) 币种2(利率2) ...
  // 使用与内容相同的触发币种列表，确保一致性
  const maxCoinsInTitle = 4; // 增加到4个币种，因为你有3个币种触发
  const coinSummaries = triggeredCoins.slice(0, maxCoinsInTitle).map(coin => `${coin.symbol}(${coin.current_rate}%)`).join(' ');
  const title = `${new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })} | ${coinSummaries}${triggeredCoins.length > maxCoinsInTitle ? '...' : ''}`;

  // 构建所有币种状态数组
  const allCoinsStatus = Object.entries(alertData.all_coins).map(([symbol, data]) => {
    // 查找该币种在配置中的阈值
    const coinConfig = config.coins?.find(c => c.symbol === symbol);
    const threshold = coinConfig ? coinConfig.threshold : alertData.threshold;

    return {
      symbol: symbol,
      annual_rate: data.annual_rate.toFixed(emailConfig.currencyDecimalPlaces),
      threshold: threshold.toFixed(emailConfig.currencyDecimalPlaces), // 使用该币种自己的阈值
      is_above_threshold: data.annual_rate > threshold
    };
  });

  // 生成完整的监控设置信息
  const monitoringSettings = generateMonitoringSettingsInfo(config);

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
      triggered_count: triggeredCoins.length,
      triggered_coins: triggeredCoins,
      all_coins_status: allCoinsStatus,
      total_coins: Object.keys(alertData.all_coins).length,
      check_interval: '每小时',
      next_check_time: calculateNextCheckTime(config).toLocaleString('zh-CN'),
      // 完整的监控设置信息
      monitoring_settings: monitoringSettings
    }
  };
}

/**
 * 准备回落通知邮件数据
 */
function prepareRecoveryEmail(recoveryData, env, config = null) {
  const title = `${new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })} | ${recoveryData.coin}-回落通知`;

  // 构建触发币种数组（回落通知时币种在正常范围内）
  const triggeredCoins = [{
    symbol: recoveryData.coin,
    current_rate: recoveryData.current_rate.toFixed(emailConfig.currencyDecimalPlaces),
    threshold: recoveryData.threshold.toFixed(emailConfig.currencyDecimalPlaces),
    excess: '0',
    daily_rate: (recoveryData.current_rate / 365).toFixed(emailConfig.currencyDecimalPlaces),
    hourly_rate: (recoveryData.current_rate / 365 / 24).toFixed(emailConfig.rateDecimalPlaces),
    history: [] // 回落通知不需要历史数据
  }];

  // 构建所有币种状态数组
  const allCoinsStatus = [{
    symbol: recoveryData.coin,
    annual_rate: recoveryData.current_rate.toFixed(emailConfig.currencyDecimalPlaces),
    threshold: recoveryData.threshold.toFixed(emailConfig.currencyDecimalPlaces),
    is_above_threshold: false
  }];

  // 生成监控设置信息（如果有配置则使用配置，否则使用默认值）
  const monitoringSettings = config ? generateMonitoringSettingsInfo(config) : {
    exchanges: 'CoinGlass',
    trigger_times: '未设置',
    enabled_coins_count: 1,
    total_coins_count: 1,
    notification_hours: '24小时',
    repeat_interval: '3小时',
    monitoring_enabled: true,
    next_check_time: calculateNextCheckTime(config).toLocaleString('zh-CN')
  };

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
      next_check_time: calculateNextCheckTime(config).toLocaleString('zh-CN'),
      // 完整的监控设置信息
      monitoring_settings: monitoringSettings
    }
  };
}

/**
 * 准备测试邮件数据
 */
function prepareTestEmail(testData) {
  const title = `${new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })} | CoinGlass监控系统测试`;

  // 测试邮件的默认监控设置
  const testMonitoringSettings = {
    exchanges: 'CoinGlass',
    trigger_times: '未设置',
    enabled_coins_count: 1,
    total_coins_count: 1,
    notification_hours: '24小时',
    repeat_interval: '3小时',
    monitoring_enabled: true,
    next_check_time: calculateNextCheckTime().toLocaleString('zh-CN')
  };

  return {
    service_id: process.env.EMAILJS_SERVICE_ID,
    template_id: process.env.EMAILJS_TEMPLATE_ID,
    user_id: process.env.EMAILJS_PUBLIC_KEY,
    template_params: {
      to_email: testData.email,
      subject: title,
      exchange_name: 'CoinGlass监控测试',
      detection_time: testData.test_time,
      // 测试邮件的多币种数组结构
      triggered_count: 1,
      triggered_coins: [{
        symbol: 'TEST',
        current_rate: '5.0',
        threshold: '5.0',
        excess: '0',
        daily_rate: '0.014',
        hourly_rate: '0.0006',
        history: []
      }],
      all_coins_status: [{
        symbol: 'TEST',
        annual_rate: '5.0',
        threshold: '5.0',
        is_above_threshold: false
      }],
      total_coins: 1,
      check_interval: '每小时',
      next_check_time: calculateNextCheckTime().toLocaleString('zh-CN'),
      // 完整的监控设置信息
      monitoring_settings: testMonitoringSettings
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
    const response = await fetch(emailConfig.emailjsApiUrl, {
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
      loggerService.info('[邮件服务] EmailJS 发送成功');
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

/**
 * 发送多币种警报邮件
 */
export async function sendMultiCoinAlert(triggeredCoins, rateData, config) {
  console.log(`发送多币种警报: ${triggeredCoins.length} 个币种触发阈值`);

  try {
    const alertData = {
      type: 'multi_coin_alert',
      triggered_coins: triggeredCoins,
      timestamp: new Date().toISOString(),
      email: config.email,
      exchange: rateData.exchange,
      detection_time: new Date().toLocaleString('zh-CN'),
      all_coins: rateData.coins
    };

    // 准备邮件数据 - 使用第一个触发币种的阈值作为基准
    const primaryCoin = triggeredCoins[0];
    const env = {
      EMAILJS_SERVICE_ID: process.env.EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID: process.env.EMAILJS_TEMPLATE_ID,
      EMAILJS_PUBLIC_KEY: process.env.EMAILJS_PUBLIC_KEY,
      EMAILJS_PRIVATE_KEY: process.env.EMAILJS_PRIVATE_KEY
    };

    // 构建类似单币种的alertData结构，但包含所有触发币种
    const unifiedAlertData = {
      type: 'alert',
      coin: primaryCoin.symbol, // 主要币种
      current_rate: primaryCoin.current_rate,
      threshold: primaryCoin.threshold,
      timestamp: alertData.timestamp,
      email: alertData.email,
      exchange: alertData.exchange,
      detection_time: alertData.detection_time,
      history: rateData.coins[primaryCoin.symbol]?.history || [],
      all_coins: rateData.coins // 关键：包含所有币种数据
    };

    const emailData = prepareAlertEmail(unifiedAlertData, env, config); // 传递config参数

    // 发送邮件
    const success = await sendEmailJS(env, emailData);

    if (success) {
      console.log(`✅ 多币种警报邮件发送成功: ${triggeredCoins.map(c => c.symbol).join(', ')}`);
      // 记录发送历史
      await storageService.recordEmailHistory(alertData);
    } else {
      console.error(`❌ 多币种警报邮件发送失败`);
    }

    return success;
  } catch (error) {
    console.error('发送多币种警报邮件异常:', error);
    return false;
  }
}

// 导出邮件服务
export const emailService = {
  sendAlert,
  sendRecovery,
  sendTestEmail,
  sendMultiCoinAlert
};

// 导出测试用的函数
export { generateMonitoringSettingsInfo };