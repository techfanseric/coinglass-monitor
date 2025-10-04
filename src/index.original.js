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

    // 主页路由
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return getHomePage();
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

    if (url.pathname === '/api/history') {
      return getEmailHistory(env);
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

  // 2. 获取用户配置（先获取配置以确定筛选器）
  const config = await getUserConfig(env);
  if (!config || !config.monitoring_enabled) {
    console.log('监控未启用');
    return;
  }

  // 1. 抓取数据（使用配置中的筛选器）
  const filters = config.filters || { exchange: 'binance', coin: 'USDT', timeframe: '1h' };
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
 * 抓取 CoinGlass 利率数据
 */
async function fetchRateData(filters = null) {
  try {
    // 构建带筛选参数的URL
    let url = 'https://www.coinglass.com/zh/pro/i/MarginFeeChart';

    if (filters) {
      const params = new URLSearchParams();
      if (filters.exchange && filters.exchange !== 'binance') {
        params.append('exchange', filters.exchange);
      }
      if (filters.coin && filters.coin !== 'USDT') {
        params.append('coin', filters.coin);
      }
      if (params.toString()) {
        url += '?' + params.toString();
      }
    }

    console.log('抓取URL:', url);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.8,en-US;q=0.5,en;q=0.3',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();

    // 解析 HTML 提取利率数据，传入筛选参数
    return parseRateData(html, filters);
  } catch (error) {
    console.error('抓取数据失败:', error);
    return null;
  }
}

/**
 * 解析 HTML 提取利率数据
 */
function parseRateData(html, filters = null) {
  try {
    // 尝试从 HTML 中提取 JSON 数据
    const jsonMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});/);
    if (jsonMatch) {
      try {
        const initialState = JSON.parse(jsonMatch[1]);
        return extractFromInitialState(initialState, filters);
      } catch (e) {
        console.warn('解析初始状态失败，尝试其他方法:', e);
      }
    }

    // 尝试查找其他数据源
    const apiDataMatch = html.match(/"data":\s*({.+?})\s*}/);
    if (apiDataMatch) {
      try {
        const apiData = JSON.parse(apiDataMatch[1]);
        return extractFromApiData(apiData, filters);
      } catch (e) {
        console.warn('解析API数据失败:', e);
      }
    }

    // 如果都失败了，尝试直接从页面文本中提取
    return extractFromText(html, filters);

  } catch (error) {
    console.error('解析利率数据失败:', error);
    return null;
  }
}

/**
 * 从初始状态提取数据
 */
function extractFromInitialState(initialState, filters = null) {
  const result = {
    exchange: filters?.exchange || 'Binance',
    timestamp: new Date().toISOString(),
    filters: filters,
    coins: {}
  };

  // 根据筛选器确定数据路径
  let marginData = null;

  // 可能的路径
  const possiblePaths = [
    () => initialState?.margin?.[filters?.exchange || 'binance']?.data,
    () => initialState?.data?.margin,
    () => initialState?.marginData,
    () => initialState?.coinglass?.margin
  ];

  for (const path of possiblePaths) {
    marginData = path();
    if (marginData) break;
  }

  if (!marginData) {
    console.warn('无法找到保证金数据，使用备用解析方法');
    return extractFromText(JSON.stringify(initialState), filters);
  }

  // 提取币种数据
  if (Array.isArray(marginData)) {
    for (const item of marginData) {
      // 如果有筛选器且指定了币种，只提取该币种的数据
      if (filters?.coin && item.symbol !== filters.coin) {
        continue;
      }

      if (item.symbol && item.rate !== undefined) {
        const rate = parseFloat(item.rate) || 0;
        result.coins[item.symbol] = {
          annual_rate: rate,
          daily_rate: parseFloat(item.dailyRate || (rate / 365)) || 0,
          hourly_rate: parseFloat(item.hourlyRate || (rate / 365 / 24)) || 0,
          history: generateMockHistory(item.symbol, rate, filters?.timeframe)
        };
      }
    }
  }

  return result.coins && Object.keys(result.coins).length > 0 ? result : null;
}

/**
 * 从API数据提取
 */
function extractFromApiData(apiData, filters = null) {
  const result = {
    exchange: filters?.exchange || 'Binance',
    timestamp: new Date().toISOString(),
    filters: filters,
    coins: {}
  };

  // 处理不同格式的API数据
  if (apiData.list && Array.isArray(apiData.list)) {
    for (const item of apiData.list) {
      const symbol = item.symbol || item.coin || item.asset;
      const rate = item.annualRate || item.rate || item.apy;

      // 如果有筛选器且指定了币种，只提取该币种的数据
      if (filters?.coin && symbol !== filters.coin) {
        continue;
      }

      if (symbol && rate !== undefined) {
        const parsedRate = parseFloat(rate) || 0;
        result.coins[symbol] = {
          annual_rate: parsedRate,
          daily_rate: parseFloat(item.dailyRate || (parsedRate / 365)) || 0,
          hourly_rate: parseFloat(item.hourlyRate || (parsedRate / 365 / 24)) || 0,
          history: generateMockHistory(symbol, parsedRate, filters?.timeframe)
        };
      }
    }
  }

  return result.coins && Object.keys(result.coins).length > 0 ? result : null;
}

/**
 * 从文本中提取数据（最后备用方案）
 */
function extractFromText(html, filters = null) {
  const result = {
    exchange: filters?.exchange || 'Binance',
    timestamp: new Date().toISOString(),
    filters: filters,
    coins: {}
  };

  // 常见币种的正则表达式模式
  const coinPatterns = [
    { symbol: 'USDT', patterns: [/USDT.*?(\d+\.?\d*%)?/gi, /USDT.*?rate[:\s]*(\d+\.?\d*)/gi] },
    { symbol: 'CFX', patterns: [/CFX.*?(\d+\.?\d*%)?/gi, /CFX.*?rate[:\s]*(\d+\.?\d*)/gi] },
    { symbol: 'IOST', patterns: [/IOST.*?(\d+\.?\d*%)?/gi, /IOST.*?rate[:\s]*(\d+\.?\d*)/gi] },
    { symbol: 'BTC', patterns: [/BTC.*?(\d+\.?\d*%)?/gi, /BTC.*?rate[:\s]*(\d+\.?\d*)/gi] },
    { symbol: 'ETH', patterns: [/ETH.*?(\d+\.?\d*%)?/gi, /ETH.*?rate[:\s]*(\d+\.?\d*)/gi] }
  ];

  // 如果有币种筛选器，只处理该币种
  if (filters?.coin) {
    const coinPattern = coinPatterns.find(c => c.symbol === filters.coin);
    if (coinPattern) {
      const rate = extractCoinRate(html, coinPattern);
      if (rate > 0) {
        result.coins[coinPattern.symbol] = {
          annual_rate: rate,
          daily_rate: rate / 365,
          hourly_rate: rate / 365 / 24,
          history: generateMockHistory(coinPattern.symbol, rate, filters?.timeframe)
        };
      }
    }
  } else {
    // 处理所有币种
    for (const coin of coinPatterns) {
      const rate = extractCoinRate(html, coin);
      if (rate > 0) {
        result.coins[coin.symbol] = {
          annual_rate: rate,
          daily_rate: rate / 365,
          hourly_rate: rate / 365 / 24,
          history: generateMockHistory(coin.symbol, rate, filters?.timeframe)
        };
      }
    }
  }

  return result.coins && Object.keys(result.coins).length > 0 ? result : null;
}

// 辅助函数：从HTML中提取单个币种的利率
function extractCoinRate(html, coinPattern) {
  let rate = 0;

  for (const pattern of coinPattern.patterns) {
    const matches = html.match(pattern);
    if (matches && matches.length > 0) {
      for (const match of matches) {
        const rateMatch = match.match(/(\d+\.?\d*)%/);
        if (rateMatch) {
          rate = parseFloat(rateMatch[1]);
          break;
        }
      }

      if (rate === 0) {
        const numMatch = match.match(/(\d+\.?\d*)/);
        if (numMatch && parseFloat(numMatch[1]) < 100) { // 假设利率小于100%
          rate = parseFloat(numMatch[1]);
        }
      }

      if (rate > 0) break;
    }
  }

  return rate;
}

/**
 * 生成模拟历史数据
 */
function generateMockHistory(symbol, currentRate, timeframe = '1h') {
  const history = [];
  const now = new Date();

  // 根据时间维度确定历史数据点数量和间隔
  const dataPoints = timeframe === '1h' ? 5 : 24; // 1小时显示5个点，24小时显示24个点
  const interval = timeframe === '1h' ? 60 * 60 * 1000 : 60 * 60 * 1000; // 都是1小时间隔

  for (let i = dataPoints - 1; i >= 0; i--) {
    const time = new Date(now.getTime() - i * interval);
    // 添加一些随机波动
    const variation = (Math.random() - 0.5) * 0.5; // -0.25 到 +0.25 的波动
    const rate = Math.max(0, currentRate + variation);

    history.push({
      time: time.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).replace(/\//g, '-'),
      rate: parseFloat(rate.toFixed(2))
    });
  }

  return history;
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
async function sendRecovery(env, coin, currentRate, config) {
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
 * 获取主页
 */
async function getHomePage() {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CoinGlass 利率监控</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: system-ui, -apple-system, sans-serif;
            background: #fafbfc;
            padding: 12px;
            line-height: 1.5;
            color: #2d3748;
        }

        .container {
            max-width: 520px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
        }

        .header {
            background: #f8fafc;
            color: #4a5568;
            padding: 16px 20px;
            text-align: center;
            border-bottom: 1px solid #e2e8f0;
        }

        .header h1 {
            font-size: 1.25em;
            font-weight: 600;
            margin-bottom: 2px;
        }

        .header p {
            font-size: 0.875em;
            color: #718096;
        }

        .content {
            padding: 20px;
        }

        .section {
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 1px solid #f1f5f9;
        }

        .section:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }

        .section h2 {
            color: #2d3748;
            margin-bottom: 12px;
            font-size: 1.1em;
            font-weight: 600;
        }

        .form-group {
            margin-bottom: 12px;
        }

        label {
            display: block;
            margin-bottom: 4px;
            color: #4a5568;
            font-size: 0.875em;
            font-weight: 500;
        }

        input, select {
            width: 100%;
            padding: 8px 10px;
            border: 1px solid #cbd5e0;
            border-radius: 4px;
            font-size: 0.9em;
            background: #ffffff;
            transition: border-color 0.15s ease;
        }

        input:focus, select:focus {
            outline: none;
            border-color: #718096;
            box-shadow: 0 0 0 1px #718096;
        }

        .coin-config {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 8px;
        }

        .coin-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .coin-symbol {
            font-weight: 600;
            color: #2d3748;
            font-size: 0.95em;
        }

        .toggle-switch {
            position: relative;
            width: 36px;
            height: 18px;
        }

        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #cbd5e0;
            transition: .15s ease;
            border-radius: 18px;
        }

        .slider:before {
            position: absolute;
            content: "";
            height: 14px;
            width: 14px;
            left: 2px;
            bottom: 2px;
            background-color: white;
            transition: .15s ease;
            border-radius: 50%;
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }

        input:checked + .slider {
            background-color: #718096;
        }

        input:checked + .slider:before {
            transform: translateX(18px);
        }

        .time-inputs {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }

        .btn {
            background: #4a5568;
            color: white;
            border: none;
            padding: 8px 16px;
            font-size: 0.9em;
            cursor: pointer;
            width: 100%;
            border-radius: 4px;
            font-weight: 500;
            transition: background-color 0.15s ease;
        }

        .btn:hover {
            background: #2d3748;
        }

        .btn.secondary {
            background: #718096;
        }

        .btn.secondary:hover {
            background: #4a5568;
        }

        .monitor-list {
            margin-top: 12px;
        }

        .monitor-item {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .monitor-info {
            flex: 1;
            font-size: 0.9em;
            line-height: 1.4;
        }

        .monitor-info strong {
            color: #2d3748;
        }

        .monitor-info .timeframe {
            color: #718096;
            font-weight: normal;
        }

        .monitor-info small {
            color: #718096;
        }

        .monitor-actions {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .remove-btn {
            background: #e53e3e;
            color: white;
            border: none;
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.75em;
        }

        .remove-btn:hover {
            background: #c53030;
        }

        .alert {
            background: #fef5e7;
            border: 1px solid #f9e79f;
            padding: 8px 12px;
            margin-bottom: 12px;
            color: #7d6608;
            font-size: 0.9em;
            border-radius: 4px;
        }

        .success {
            background: #eafaf1;
            border: 1px solid #a9dfbf;
            color: #239b56;
        }

        .loading {
            text-align: center;
            padding: 16px;
            color: #718096;
            font-size: 0.9em;
        }

        .main-toggle {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 12px 16px;
            margin-bottom: 16px;
        }

        .main-toggle h3 {
            color: #2d3748;
            font-size: 1em;
            font-weight: 600;
        }

        /* 快速添加监控样式 */
        .add-monitor-row {
            display: flex;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
        }

        .add-monitor-row input,
        .add-monitor-row select {
            flex: 1;
            min-width: 80px;
            padding: 6px 8px;
            border: 1px solid #cbd5e0;
            border-radius: 4px;
            font-size: 0.85em;
        }

        .add-monitor-row input[type="number"] {
            flex: 0.5;
        }

        .add-btn {
            background: #4a5568;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.85em;
            white-space: nowrap;
        }

        .add-btn:hover {
            background: #2d3748;
        }

        /* 两栏布局样式 */
        .two-column-layout {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
        }

        .left-column, .right-column {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        @media (max-width: 900px) {
            .two-column-layout {
                grid-template-columns: 1fr;
                gap: 16px;
            }
        }

        @media (max-width: 600px) {
            .content {
                padding: 16px;
            }
            .add-monitor-row {
                flex-direction: column;
                gap: 8px;
            }
            .add-monitor-row input,
            .add-monitor-row select {
                min-width: auto;
            }
            .time-inputs {
                grid-template-columns: 1fr;
            }
        }

        .filter-select, .filter-input {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #ccc;
            font-size: 14px;
            border-radius: 4px;
        }

        .autocomplete-container {
            position: relative;
            display: flex;
            align-items: center;
        }

        .autocomplete-container .filter-input {
            flex: 1;
            padding-right: 40px;
        }

        .search-btn {
            position: absolute;
            right: 8px;
            background: none;
            border: none;
            cursor: pointer;
            color: #666;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .search-btn:hover {
            color: #333;
        }

        .dropdown {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            border: 1px solid #ccc;
            border-top: none;
            max-height: 200px;
            overflow-y: auto;
            z-index: 1000;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .dropdown.hidden {
            display: none;
        }

        .dropdown-item {
            padding: 8px 12px;
            cursor: pointer;
            border-bottom: 1px solid #eee;
        }

        .dropdown-item:hover {
            background: #f5f5f5;
        }

        .dropdown-item:last-child {
            border-bottom: none;
        }

        .time-tabs {
            display: flex;
            border: 1px solid #ccc;
            border-radius: 4px;
            overflow: hidden;
        }

        .time-tab {
            flex: 1;
            padding: 8px 12px;
            background: white;
            border: none;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.2s;
        }

        .time-tab:hover {
            background: #f5f5f5;
        }

        .time-tab.active {
            background: #333;
            color: white;
        }

        .time-tab:first-child {
            border-right: 1px solid #ccc;
        }

        .time-tab.active:first-child {
            border-right-color: #333;
        }

        @media (max-width: 600px) {
            .filters-container {
                grid-template-columns: 1fr;
                gap: 15px;
            }
        }
            .content {
                padding: 15px;
            }

            .time-inputs {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>CoinGlass 利率监控</h1>
            <p>实时监控币种借贷利率</p>
        </div>

        <div class="content">
            <div id="alerts"></div>

            <!-- 主监控开关 -->
            <div class="section">
                <div class="main-toggle">
                    <h3>监控状态</h3>
                    <label class="toggle-switch">
                        <input type="checkbox" id="mainToggle">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>

            <!-- 两栏布局 -->
            <div class="two-column-layout">
                <!-- 左栏：监控项目管理 -->
                <div class="left-column">
                    <!-- 添加监控 -->
                    <div class="section">
                        <h2>添加监控</h2>

                        <div class="add-monitor-row">
                            <select id="quickExchange">
                                <option value="binance">Binance</option>
                                <option value="okx">OKX</option>
                                <option value="bybit">Bybit</option>
                            </select>

                            <input type="text" id="quickCoin" placeholder="币种" value="USDT">

                            <select id="quickTimeframe">
                                <option value="1h">1小时</option>
                                <option value="24h">24小时</option>
                            </select>

                            <input type="number" id="quickThreshold" placeholder="阈值%" step="0.1" min="0">

                            <button onclick="addMonitor()" class="add-btn">添加</button>
                        </div>
                    </div>

                    <!-- 监控列表 -->
                    <div class="section">
                        <h2>监控列表</h2>
                        <div id="monitorList" class="monitor-list">
                            <p style="text-align: center; color: #6b7280;">暂无监控项目</p>
                        </div>
                    </div>
                </div>

                <!-- 右栏：通知设置 -->
                <div class="right-column">
                    <!-- 基础设置 -->
                    <div class="section">
                        <h2>通知设置</h2>

                        <div class="form-group">
                            <label for="email">通知邮箱</label>
                            <input type="email" id="email" placeholder="your-email@example.com">
                        </div>

                        <div class="form-group">
                            <label for="repeatInterval">重复通知间隔</label>
                            <select id="repeatInterval">
                                <option value="3">3小时</option>
                                <option value="6">6小时</option>
                                <option value="12">12小时</option>
                                <option value="24">24小时</option>
                            </select>
                        </div>
                    </div>

                    <!-- 时间设置 -->
                    <div class="section">
                        <h2>通知时间段</h2>

                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="timeControl" style="width: auto; margin-right: 8px;">
                                启用时间限制
                            </label>
                        </div>

                        <div class="time-inputs">
                            <div class="form-group">
                                <label for="startTime">开始时间</label>
                                <input type="time" id="startTime" value="09:00">
                            </div>
                            <div class="form-group">
                                <label for="endTime">结束时间</label>
                                <input type="time" id="endTime" value="24:00">
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 操作按钮 -->
            <div class="section">
                <button class="btn" onclick="saveConfig()">保存配置</button>
                <div style="margin-top: 10px;">
                    <button class="btn secondary" onclick="loadConfig()">重新加载</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        const API_BASE = window.location.origin;
        let currentConfig = null;

        // 页面加载时初始化
        document.addEventListener('DOMContentLoaded', function() {
            loadConfig();
            loadStatus();

            // 每30秒更新一次状态
            setInterval(loadStatus, 30000);
        });

        // 添加监控
        function addMonitor() {
            const exchange = document.getElementById('quickExchange').value;
            const coin = document.getElementById('quickCoin').value.trim().toUpperCase();
            const timeframe = document.getElementById('quickTimeframe').value;
            const threshold = parseFloat(document.getElementById('quickThreshold').value);

            // 验证输入
            if (!coin) {
                showAlert('请输入币种');
                return;
            }

            if (!threshold || threshold <= 0) {
                showAlert('请输入有效的阈值');
                return;
            }

            // 获取当前配置
            const config = currentConfig || {};
            if (!config.coins) config.coins = [];

            // 检查是否已存在相同的监控
            const exists = config.coins.some(c =>
                c.symbol === coin && c.exchange === exchange && c.timeframe === timeframe
            );

            if (exists) {
                showAlert('该监控已存在');
                return;
            }

            // 添加新监控
            config.coins.push({
                symbol: coin,
                exchange: exchange,
                timeframe: timeframe,
                threshold: threshold,
                enabled: true
            });

            // 保存配置
            saveConfig(config);

            // 清空输入
            document.getElementById('quickCoin').value = '';
            document.getElementById('quickThreshold').value = '';

            showAlert('监控添加成功', 'success');
            loadStatus();
        }

        // 显示提示信息
        function showAlert(message, type = 'error') {
            const alertsContainer = document.getElementById('alerts');
            const alert = document.createElement('div');
            alert.className = \`alert \${type}\`;
            alert.textContent = message;
            alertsContainer.appendChild(alert);

            setTimeout(() => {
                alert.remove();
            }, 5000);
        }

        // 加载配置
        async function loadConfig() {
            try {
                const response = await fetch(API_BASE + '/api/config');
                const config = await response.json();

                if (config && Object.keys(config).length > 0) {
                    currentConfig = config;
                    populateForm(config);
                    showAlert('配置加载成功', 'success');
                }
            } catch (error) {
                console.error('加载配置失败:', error);
                showAlert('加载配置失败，请重试');
            }
        }

        // 填充表单
        function populateForm(config) {
            document.getElementById('email').value = config.email || '';
            document.getElementById('repeatInterval').value = config.repeat_interval || 3;
            document.getElementById('mainToggle').checked = config.monitoring_enabled || false;

            if (config.notification_hours) {
                document.getElementById('timeControl').checked = config.notification_hours.enabled || false;
                document.getElementById('startTime').value = config.notification_hours.start || '09:00';
                document.getElementById('endTime').value = config.notification_hours.end || '24:00';
            }
        }

        // 保存配置
        async function saveConfig(inputConfig = null) {
            const config = inputConfig || {
                email: document.getElementById('email').value,
                repeat_interval: parseInt(document.getElementById('repeatInterval').value),
                monitoring_enabled: document.getElementById('mainToggle').checked,
                notification_hours: {
                    enabled: document.getElementById('timeControl').checked,
                    start: document.getElementById('startTime').value,
                    end: document.getElementById('endTime').value
                },
                coins: currentConfig?.coins || [] // 保持现有的监控配置
            };

            try {
                const response = await fetch(API_BASE + '/api/config', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(config)
                });

                if (response.ok) {
                    if (!inputConfig) {
                        showAlert('配置保存成功！', 'success');
                    }
                    currentConfig = config;
                } else {
                    throw new Error('保存失败');
                }
            } catch (error) {
                console.error('保存配置失败:', error);
                if (!inputConfig) {
                    showAlert('保存配置失败，请重试');
                }
            }
        }

        // 加载状态
        async function loadStatus() {
            try {
                const response = await fetch(API_BASE + '/api/status');
                const data = await response.json();

                updateSystemStatus(true);
                displayStatus(data);
            } catch (error) {
                console.error('加载状态失败:', error);
                updateSystemStatus(false);
                document.getElementById('currentStatus').innerHTML =
                    '<p style="text-align: center; color: #ef4444;">状态加载失败</p>';
            }
        }

        // 更新系统状态（简化版）
        function updateSystemStatus(isOnline) {
            // 移除了状态指示器，功能保留但简化
        }

        // 显示监控列表
        function displayStatus(data) {
            const container = document.getElementById('monitorList');
            const config = currentConfig || {};

            if (!config.coins || config.coins.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: #6b7280;">暂无监控项目</p>';
                return;
            }

            let html = '';

            config.coins.forEach((coin, index) => {
                const state = data.states && data.states[coin.symbol] ? data.states[coin.symbol] : { status: 'normal' };
                const statusClass = state.status === 'alert' ? '#ef4444' :
                                   state.status === 'normal' ? '#10b981' : '#f59e0b';
                const statusText = state.status === 'alert' ? '警报' :
                                  state.status === 'normal' ? '正常' : '冷却中';

                html += '<div class="monitor-item">' +
                        '<div class="monitor-info">' +
                            '<strong>' + coin.exchange + ' - ' + coin.symbol + '</strong> ' +
                            '<span class="timeframe">(' + coin.timeframe + ')</span>' +
                            '<br>' +
                            '<small>阈值: ' + coin.threshold + '% | 状态: </small>' +
                            '<span style="color: ' + statusClass + '; font-weight: bold;">' + statusText + '</span>' +
                            (state.last_rate ? ' | 当前: ' + state.last_rate + '%' : '') +
                        '</div>' +
                        '<div class="monitor-actions">' +
                            '<label class="toggle-switch">' +
                                '<input type="checkbox" ' + (coin.enabled ? 'checked' : '') +
                                ' onchange="toggleMonitor(' + index + ')">' +
                                '<span class="slider"></span>' +
                            '</label>' +
                            '<button onclick="removeMonitor(' + index + ')" class="remove-btn">删除</button>' +
                        '</div>' +
                    '</div>';
            });

            container.innerHTML = html;
        }

        // 切换监控开关
        function toggleMonitor(index) {
            const config = currentConfig || {};
            if (config.coins && config.coins[index]) {
                config.coins[index].enabled = !config.coins[index].enabled;
                saveConfig(config);
                showAlert(config.coins[index].enabled ? '监控已启用' : '监控已禁用', 'success');
            }
        }

        // 删除监控
        function removeMonitor(index) {
            const config = currentConfig || {};
            if (config.coins && config.coins[index]) {
                const coin = config.coins[index];
                if (confirm('确定要删除监控 ' + coin.exchange + ' - ' + coin.symbol + ' 吗？')) {
                    config.coins.splice(index, 1);
                    saveConfig(config);
                    showAlert('监控已删除', 'success');
                    loadStatus();
                }
            }
        }
    </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600', // 缓存1小时
    },
  });
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

// ==================== EmailJS 相关函数 ====================

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
    // 在服务端使用private key进行认证
    const requestBody = {
      ...emailData,
      accessToken: env.EMAILJS_PRIVATE_KEY
    };

    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
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

/**
 * 记录邮件发送历史
 */
async function recordEmailHistory(env, emailData) {
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

/**
 * API: 获取邮件发送历史
 */
async function getEmailHistory(env) {
  try {
    const list = await env.STATE_KV.list({ prefix: 'email_history_' });
    const history = [];

    for (const key of list.keys.slice(-20)) { // 最近20条
      const record = await env.STATE_KV.get(key.name);
      if (record) {
        history.push(JSON.parse(record));
      }
    }

    return new Response(JSON.stringify({ history }), {
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