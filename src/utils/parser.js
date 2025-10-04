/**
 * 数据解析工具模块
 */

/**
 * 解析 HTML 提取利率数据
 */
export function parseRateData(html, filters = null) {
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
export function extractFromInitialState(initialState, filters = null) {
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
export function extractFromApiData(apiData, filters = null) {
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
export function extractFromText(html, filters = null) {
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
export function generateMockHistory(symbol, currentRate, timeframe = '1h') {
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