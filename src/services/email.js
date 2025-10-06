/**
 * 邮件发送服务 - 从Cloudflare Workers迁移
 * 保持所有原有邮件逻辑不变，增加多币种支持
 */

import { storageService } from './storage.js';
import { loggerService } from './logger.js';
import { formatDateTime, formatDateTimeCN } from '../utils/time-utils.js';

// 从环境变量加载配置
const emailConfig = {
  currencyDecimalPlaces: parseInt(process.env.CURRENCY_DECIMAL_PLACES) || 2,
  rateDecimalPlaces: parseInt(process.env.RATE_DECIMAL_PLACES) || 4,
  percentageDecimalPlaces: parseInt(process.env.PERCENTAGE_DECIMAL_PLACES) || 1,
  emailjsApiUrl: process.env.EMAILJS_API_URL || 'https://api.emailjs.com/api/v1.0/email/send',
  emailjsTimeout: parseInt(process.env.EMAILJS_TIMEOUT) || 10000
};

/**
 * 获取币种历史数据（支持多交易所、多时间框架）
 */
function getCoinHistory(coinsData, coin, config) {
  console.log(`🔍 开始历史数据匹配: 币种 ${coin.symbol}, 交易所 ${coin.exchange}, 时间框架 ${coin.timeframe}`);

  // 1. 优先尝试查找匹配的复合键（交易所+时间框架）
  const coinKey = `${coin.symbol}_${coin.exchange}_${coin.timeframe}`;
  let history = coinsData[coinKey]?.history || [];
  if (history.length > 0) {
    console.log(`✅ 历史数据匹配: 使用复合键 ${coinKey}, 找到 ${history.length} 条历史数据`);
    return history;
  }

  // 2. 遍历所有数据，查找精确匹配的币种（包括交易所和时间框架）
  for (const [key, data] of Object.entries(coinsData)) {
    if (data.symbol === coin.symbol &&
        data.exchange === coin.exchange &&
        data.timeframe === coin.timeframe &&
        data.history && data.history.length > 0) {
      console.log(`✅ 历史数据匹配: 遍历精确匹配找到 ${key}, 找到 ${data.history.length} 条历史数据`);
      return data.history;
    }
  }

  // 3. 遍历所有数据，查找匹配的币种符号且交易所匹配（不考虑时间框架）
  for (const [key, data] of Object.entries(coinsData)) {
    if (data.symbol === coin.symbol &&
        data.exchange === coin.exchange &&
        data.history && data.history.length > 0) {
      console.log(`⚠️ 历史数据匹配: 交易所匹配找到 ${key}, 找到 ${data.history.length} 条历史数据 (时间框架可能不匹配)`);
      return data.history;
    }
  }

  // 4. 最后尝试：直接匹配币种符号（仅在没有其他匹配时使用）
  history = coinsData[coin.symbol]?.history || [];
  if (history.length > 0) {
    console.log(`⚠️ 历史数据匹配: 仅使用币种符号 ${coin.symbol}, 找到 ${history.length} 条历史数据 (交易所和时间框架可能不匹配)`);
    return history;
  }

  console.log(`❌ 历史数据匹配失败: 币种 ${coin.symbol}, 交易所 ${coin.exchange}, 时间框架 ${coin.timeframe}`);
  return [];
}

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

  // 获取交易所信息（去重，确保显示所有配置的交易所）
  const exchanges = [...new Set(coins.map(coin => coin.exchange || 'binance').filter(Boolean))];

  // 如果有多个交易所，显示为"多交易所监控"
  const exchangeDisplay = exchanges.length > 1 ? '多交易所监控' : exchanges[0] || 'CoinGlass';

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
    exchanges: exchangeDisplay,
    exchanges_detail: exchanges.join(', '), // 保留详细信息用于调试
    trigger_times: triggerDescriptions.join(', ') || '未设置',
    enabled_coins_count: enabledCoinsCount,
    total_coins_count: coins.length,
    notification_hours: notificationDescription,
    repeat_interval: repeatDescription,
    monitoring_enabled: config?.monitoring_enabled !== false,
    next_check_time: formatDateTime(calculateNextCheckTime(config))
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
      timestamp: formatDateTime(new Date()),
      email: config.email,
      exchange: rateData.exchange,
      detection_time: formatDateTimeCN(new Date()),
      history: getCoinHistory(rateData.coins, coin, config),
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
      timestamp: formatDateTime(new Date()),
      email: config.email,
      recovery_time: formatDateTimeCN(new Date())
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
      timestamp: formatDateTime(new Date()),
      test_time: formatDateTimeCN(new Date())
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
  // 检查是否有抓取摘要信息（来自多交易所抓取）
  const scrapingSummary = alertData.scraping_summary || alertData.data?.scraping_info?.individual_results || [];

  // 如果有抓取摘要，使用独立的抓取结果
  if (scrapingSummary.length > 0) {
    console.log(`📧 使用多交易所抓取数据准备邮件，共 ${scrapingSummary.length} 个独立结果`);

    const triggeredCoins = scrapingSummary
      .filter(result => {
        if (!result.success) return false;

        // 查找该币种在配置中的信息
        const coinConfig = config.coins?.find(c =>
          c.symbol === result.symbol &&
          c.exchange === result.exchange &&
          c.timeframe === result.timeframe
        );
        const threshold = coinConfig ? coinConfig.threshold : alertData.threshold;

        // 检查是否超过阈值
        return result.rate > threshold;
      })
      .map(result => {
        // 查找该币种在配置中的信息
        const coinConfig = config.coins?.find(c =>
          c.symbol === result.symbol &&
          c.exchange === result.exchange &&
          c.timeframe === result.timeframe
        );
        const threshold = coinConfig ? coinConfig.threshold : alertData.threshold;

        // 计算超出百分比
        const coinExcess = ((result.rate - threshold) / threshold * 100).toFixed(emailConfig.percentageDecimalPlaces);

        // 格式化交易所和时间框架显示
        const exchangeDisplay = result.exchange.charAt(0).toUpperCase() + result.exchange.slice(1);
        const timeframeDisplay = result.timeframe === '1h' ? '1小时' : result.timeframe === '24h' ? '24小时' : result.timeframe;

        // 构建币种信息用于历史数据获取
        const coinInfo = {
          symbol: result.symbol,
          exchange: result.exchange,
          timeframe: result.timeframe
        };

        // 获取历史数据
        const coinHistory = getCoinHistory(alertData.all_coins, coinInfo, config);

        return {
          symbol: result.symbol,
          current_rate: result.rate.toFixed(emailConfig.currencyDecimalPlaces),
          threshold: threshold.toFixed(emailConfig.currencyDecimalPlaces),
          excess: coinExcess,
          daily_rate: (result.rate / 365).toFixed(emailConfig.currencyDecimalPlaces),
          hourly_rate: (result.rate / 365 / 24).toFixed(emailConfig.rateDecimalPlaces),
          exchange_name: exchangeDisplay,
          timeframe: timeframeDisplay,
          exchange: result.exchange,
          timeframe_original: result.timeframe,
          history: coinHistory.slice(0, 5).map(h => {
            const timeMatch = h.time ? h.time.match(/(\d{1,2}:\d{2})/) : null;
            const timeStr = timeMatch ? timeMatch[1] : (h.time || 'N/A');
            const rate = h.annual_rate || h.rate || 0;
            return {
              time: timeStr,
              rate: rate.toFixed(emailConfig.currencyDecimalPlaces),
              daily_rate: (rate / 365).toFixed(emailConfig.currencyDecimalPlaces),
              hourly_rate: (rate / 365 / 24).toFixed(emailConfig.rateDecimalPlaces)
            };
          })
        };
      })
      .sort((a, b) => parseFloat(b.current_rate) - parseFloat(a.current_rate));

    // 构建所有币种状态
    const allCoinsStatus = scrapingSummary
      .filter(result => result.success)
      .map(result => {
        const coinConfig = config.coins?.find(c => c.symbol === result.symbol);
        const threshold = coinConfig ? coinConfig.threshold : alertData.threshold;

        return {
          symbol: result.symbol,
          annual_rate: result.rate.toFixed(emailConfig.currencyDecimalPlaces),
          threshold: threshold.toFixed(emailConfig.currencyDecimalPlaces),
          is_above_threshold: result.rate > threshold,
          exchange_info: `${result.exchange.charAt(0).toUpperCase() + result.exchange.slice(1)} (${result.timeframe})`
        };
      });

    // 继续构建其他部分...
    const maxCoinsInTitle = 4;
    const coinSummaries = triggeredCoins.slice(0, maxCoinsInTitle).map(coin => `${coin.symbol}(${coin.current_rate}%)`).join(' ');
    const title = `${formatDateTime(new Date())} | ${coinSummaries}${triggeredCoins.length > maxCoinsInTitle ? '...' : ''}`;

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
        triggered_count: triggeredCoins.length,
        triggered_coins: triggeredCoins,
        all_coins_status: allCoinsStatus,
        total_coins: scrapingSummary.filter(r => r.success).length,
        check_interval: '每小时',
        next_check_time: formatDateTime(calculateNextCheckTime(config)),
        exchanges_display: monitoringSettings.exchanges,
        exchanges_detail: monitoringSettings.exchanges_detail,
        monitoring_settings: monitoringSettings
      }
    };
  }

  // 优先使用抓取摘要数据（支持重复币种），回退到原始逻辑（用于兼容性）
  console.log(`✅ 使用抓取摘要数据构建触发币种列表（支持重复币种），scrapingSummary长度: ${scrapingSummary?.length || 0}`);

  // 构建触发币种数组（基于抓取摘要，支持重复币种的不同配置）
  let triggeredCoins = [];

  if (scrapingSummary && scrapingSummary.length > 0) {
    // 使用抓取摘要数据，支持重复币种的不同配置
    triggeredCoins = scrapingSummary
      .filter(result => result.success && result.rate !== null)
      .map(result => {
        // 查找该币种在配置中的详细信息
        const coinKey = `${result.symbol}_${result.exchange}_${result.timeframe}`;
        const coinConfig = config.coins?.find(c =>
          c.symbol === result.symbol &&
          c.exchange === result.exchange &&
          c.timeframe === result.timeframe
        );

        // 如果找不到精确匹配，尝试按symbol匹配
        const fallbackCoinConfig = coinConfig || config.coins?.find(c => c.symbol === result.symbol);
        const threshold = coinConfig ? coinConfig.threshold : (fallbackCoinConfig ? fallbackCoinConfig.threshold : alertData.threshold);

        // 检查是否超过阈值
        if (result.rate <= threshold) {
          return null; // 未超过阈值，不包含在触发列表中
        }

        // 计算超出百分比
        const coinExcess = ((result.rate - threshold) / threshold * 100).toFixed(emailConfig.percentageDecimalPlaces);

        // 获取历史数据 - 优先从抓取摘要中获取，否则从all_coins获取
        let coinHistory = [];

        // 使用新的历史数据获取函数
        const coinInfo = {
          symbol: result.symbol,
          exchange: result.exchange,
          timeframe: result.timeframe
        };
        coinHistory = getCoinHistory(alertData.all_coins, coinInfo, config);

        // 格式化显示名称
        const exchangeDisplay = result.exchange.charAt(0).toUpperCase() + result.exchange.slice(1);
        const timeframeDisplay = result.timeframe === '1h' ? '1小时' : result.timeframe === '24h' ? '24小时' : result.timeframe;

        // 如果是重复币种，添加标识区分
        const coinConfigs = config.coins?.filter(c => c.symbol === result.symbol) || [];
        const isDuplicateCoin = coinConfigs.length > 1;
        const symbolDisplay = isDuplicateCoin
          ? `${result.symbol} (${timeframeDisplay})`
          : result.symbol;

        const coinData = {
          symbol: symbolDisplay,
          original_symbol: result.symbol,
          current_rate: result.rate.toFixed(emailConfig.currencyDecimalPlaces),
          threshold: threshold.toFixed(emailConfig.currencyDecimalPlaces),
          excess: coinExcess,
          daily_rate: (result.rate / 365).toFixed(emailConfig.currencyDecimalPlaces),
          hourly_rate: (result.rate / 365 / 24).toFixed(emailConfig.rateDecimalPlaces),
          exchange_name: exchangeDisplay,
          timeframe: timeframeDisplay,
          history: coinHistory.slice(0, 5).map(h => {
            const timeMatch = h.time ? h.time.match(/(\d{1,2}:\d{2})/) : null;
            const timeStr = timeMatch ? timeMatch[1] : (h.time || 'N/A');
            const rate = h.annual_rate || h.rate || 0; // 支持两种字段名
            return {
              time: timeStr,
              rate: rate.toFixed(emailConfig.currencyDecimalPlaces),
              daily_rate: (rate / 365).toFixed(emailConfig.currencyDecimalPlaces),
              hourly_rate: (rate / 365 / 24).toFixed(emailConfig.rateDecimalPlaces)
            };
          })
        };

        // 调试日志：检查每个币种的历史数据（第一个分支）
        console.log(`🔧 邮件数据调试-分支1 ${symbolDisplay} (${result.exchange}/${result.timeframe}):`);
        console.log(`  - 历史数据原始数量: ${coinHistory.length}`);
        console.log(`  - 格式化后历史数据数量: ${coinData.history.length}`);
        console.log(`  - 历史数据样例:`, coinData.history[0]);

        return coinData;
      })
      .filter(coin => coin !== null) // 过滤掉未超过阈值的币种
      .sort((a, b) => parseFloat(b.current_rate) - parseFloat(a.current_rate));
  } else {
    // 回退到原始逻辑
    console.log('⚠️ 抓取摘要数据不可用，回退到原始邮件数据准备逻辑');
    triggeredCoins = Object.entries(alertData.all_coins || {})
      .filter(([symbol, data]) => {
        const coinConfig = config.coins?.find(c => c.symbol === symbol);
        const threshold = coinConfig ? coinConfig.threshold : alertData.threshold;
        return data.annual_rate > threshold;
      })
      .map(([symbol, data]) => {
        const coinConfig = config.coins?.find(c => c.symbol === symbol);
        const threshold = coinConfig ? coinConfig.threshold : alertData.threshold;
        const coinExcess = ((data.annual_rate - threshold) / threshold * 100).toFixed(emailConfig.percentageDecimalPlaces);
        const coinInfo = {
          symbol: symbol,
          exchange: data.exchange || coinConfig?.exchange || '未知',
          timeframe: data.timeframe || coinConfig?.timeframe || '1h'
        };
        const coinHistory = getCoinHistory(alertData.all_coins, coinInfo, config);
        const exchange = data.exchange || coinConfig?.exchange || '未知';
        const timeframe = data.timeframe || coinConfig?.timeframe || '1h';
        const exchangeDisplay = exchange.charAt(0).toUpperCase() + exchange.slice(1);
        const timeframeDisplay = timeframe === '1h' ? '1小时' : timeframe === '24h' ? '24小时' : timeframe;

        const coinData = {
          symbol: symbol,
          current_rate: data.annual_rate.toFixed(emailConfig.currencyDecimalPlaces),
          threshold: threshold.toFixed(emailConfig.currencyDecimalPlaces),
          excess: coinExcess,
          daily_rate: (data.annual_rate / 365).toFixed(emailConfig.currencyDecimalPlaces),
          hourly_rate: (data.annual_rate / 365 / 24).toFixed(emailConfig.rateDecimalPlaces),
          exchange_name: exchangeDisplay,
          timeframe: timeframeDisplay,
          history: coinHistory.slice(0, 5).map(h => {
            const timeMatch = h.time ? h.time.match(/(\d{1,2}:\d{2})/) : null;
            const timeStr = timeMatch ? timeMatch[1] : (h.time || 'N/A');
            const rate = h.annual_rate || h.rate || 0; // 支持两种字段名
            return {
              time: timeStr,
              rate: rate.toFixed(emailConfig.currencyDecimalPlaces),
              daily_rate: (rate / 365).toFixed(emailConfig.currencyDecimalPlaces),
              hourly_rate: (rate / 365 / 24).toFixed(emailConfig.rateDecimalPlaces)
            };
          })
        };

        // 调试日志：检查每个币种的历史数据
        console.log(`🔧 邮件数据调试 ${symbol} (${exchange}/${timeframe}):`);
        console.log(`  - 历史数据原始数量: ${coinHistory.length}`);
        console.log(`  - 格式化后历史数据数量: ${coinData.history.length}`);
        console.log(`  - 历史数据样例:`, coinData.history[0]);

        return coinData;
      })
      .sort((a, b) => parseFloat(b.current_rate) - parseFloat(a.current_rate));
  }

  // 生成标题：时间 | 币种1(利率1) 币种2(利率2) ...
  // 使用与内容相同的触发币种列表，确保一致性
  const maxCoinsInTitle = 4; // 增加到4个币种，因为你有3个币种触发
  const coinSummaries = triggeredCoins.slice(0, maxCoinsInTitle).map(coin => `${coin.symbol}(${coin.current_rate}%)`).join(' ');
  const title = `${formatDateTime(new Date())} | ${coinSummaries}${triggeredCoins.length > maxCoinsInTitle ? '...' : ''}`;

  // 构建所有币种状态数组（支持重复币种）
  let allCoinsStatus = [];

  if (scrapingSummary && scrapingSummary.length > 0) {
    // 使用抓取摘要数据，支持重复币种的不同配置
    allCoinsStatus = scrapingSummary
      .filter(result => result.success && result.rate !== null)
      .map(result => {
        // 查找该币种在配置中的详细信息
        const coinConfig = config.coins?.find(c =>
          c.symbol === result.symbol &&
          c.exchange === result.exchange &&
          c.timeframe === result.timeframe
        );

        // 如果找不到精确匹配，尝试按symbol匹配
        const fallbackCoinConfig = coinConfig || config.coins?.find(c => c.symbol === result.symbol);
        const threshold = coinConfig ? coinConfig.threshold : (fallbackCoinConfig ? fallbackCoinConfig.threshold : alertData.threshold);

        // 格式化显示名称
        const exchangeDisplay = result.exchange.charAt(0).toUpperCase() + result.exchange.slice(1);
        const timeframeDisplay = result.timeframe === '1h' ? '1小时' : result.timeframe === '24h' ? '24小时' : result.timeframe;

        // 如果是重复币种，添加标识区分
        const coinConfigs = config.coins?.filter(c => c.symbol === result.symbol) || [];
        const isDuplicateCoin = coinConfigs.length > 1;
        const symbolDisplay = isDuplicateCoin
          ? `${result.symbol} (${timeframeDisplay})`
          : result.symbol;

        return {
          symbol: symbolDisplay,
          annual_rate: result.rate.toFixed(emailConfig.currencyDecimalPlaces),
          threshold: threshold.toFixed(emailConfig.currencyDecimalPlaces),
          is_above_threshold: result.rate > threshold,
          exchange_info: `${exchangeDisplay} (${timeframeDisplay})`
        };
      })
      .sort((a, b) => a.symbol.localeCompare(b.symbol)); // 按币种名称排序
  } else {
    // 回退到原始逻辑
    console.log('⚠️ 抓取摘要数据不可用，回退到原始状态表格逻辑');
    allCoinsStatus = Object.entries(alertData.all_coins || {}).map(([symbol, data]) => {
      const coinConfig = config.coins?.find(c => c.symbol === symbol);
      const threshold = coinConfig ? coinConfig.threshold : alertData.threshold;
      const exchange = data.exchange || coinConfig?.exchange || '未知';
      const timeframe = data.timeframe || coinConfig?.timeframe || '1h';
      const exchangeDisplay = exchange.charAt(0).toUpperCase() + exchange.slice(1);

      return {
        symbol: symbol,
        annual_rate: data.annual_rate.toFixed(emailConfig.currencyDecimalPlaces),
        threshold: threshold.toFixed(emailConfig.currencyDecimalPlaces),
        is_above_threshold: data.annual_rate > threshold,
        exchange_info: `${exchangeDisplay} (${timeframe})`
      };
    });
  }

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
      total_coins: allCoinsStatus.length,
      check_interval: '每小时',
      next_check_time: formatDateTime(calculateNextCheckTime(config)),
      // 交易所和时间框架信息
      exchanges_display: monitoringSettings.exchanges,
      exchanges_detail: monitoringSettings.exchanges_detail,
      // 完整的监控设置信息
      monitoring_settings: monitoringSettings
    }
  };
}

/**
 * 准备回落通知邮件数据
 */
function prepareRecoveryEmail(recoveryData, env, config = null) {
  const title = `${formatDateTimeCN(new Date())} | ${recoveryData.coin}-回落通知`;

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
    next_check_time: formatDateTime(calculateNextCheckTime(config))
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
      next_check_time: formatDateTime(calculateNextCheckTime(config)),
      // 交易所和时间框架信息
      exchanges_display: monitoringSettings.exchanges,
      exchanges_detail: monitoringSettings.exchanges_detail,
      // 完整的监控设置信息
      monitoring_settings: monitoringSettings
    }
  };
}

/**
 * 准备测试邮件数据
 */
function prepareTestEmail(testData) {
  const title = `${formatDateTimeCN(new Date())} | CoinGlass监控系统测试`;

  // 测试邮件的默认监控设置
  const testMonitoringSettings = {
    exchanges: 'CoinGlass',
    trigger_times: '未设置',
    enabled_coins_count: 1,
    total_coins_count: 1,
    notification_hours: '24小时',
    repeat_interval: '3小时',
    monitoring_enabled: true,
    next_check_time: formatDateTime(calculateNextCheckTime())
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
      next_check_time: formatDateTime(calculateNextCheckTime()),
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
  console.log(`🔍 调试: rateData.scraping_info存在? ${!!rateData.scraping_info}`);
  console.log(`🔍 调试: individual_results长度: ${rateData.scraping_info?.individual_results?.length || 0}`);

  try {
    const alertData = {
      type: 'multi_coin_alert',
      triggered_coins: triggeredCoins,
      timestamp: formatDateTime(new Date()),
      email: config.email,
      exchange: rateData.exchange,
      detection_time: formatDateTimeCN(new Date()),
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
    const scrapingSummary = rateData.scraping_info?.individual_results || [];
    console.log(`🔧 修复调试: scrapingSummary长度=${scrapingSummary.length}, rateData.scraping_info存在=${!!rateData.scraping_info}`);

    const unifiedAlertData = {
      type: 'alert',
      coin: primaryCoin.symbol, // 主要币种
      current_rate: primaryCoin.current_rate,
      threshold: primaryCoin.threshold,
      timestamp: alertData.timestamp,
      email: alertData.email,
      exchange: alertData.exchange,
      detection_time: alertData.detection_time,
      history: getCoinHistory(rateData.coins, primaryCoin, config),
      all_coins: rateData.coins, // 关键：包含所有币种数据
      // 修复：确保抓取摘要数据正确传递
      scraping_summary: scrapingSummary,
      // 添加完整的抓取信息
      scraping_info: rateData.scraping_info,
      data: rateData // 传递完整的rateData作为备用
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
export { generateMonitoringSettingsInfo, getCoinHistory, prepareAlertEmail };