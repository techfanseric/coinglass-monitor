/**
 * 数据解析工具模块
 */

/**
 * 解析 HTML 提取利率数据
 */
export function parseRateData(html, filters = null) {
  try {
    // 尝试从 HTML 中提取 JSON 数据
    const jsonMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]+?});/);
    if (jsonMatch) {
      try {
        const initialState = JSON.parse(jsonMatch[1]);
        return extractFromInitialState(initialState, filters);
      } catch (e) {
        console.warn('解析初始状态失败，尝试其他方法:', e);
        // 从匹配的JSON中尝试提取data字段
        try {
          const dataMatch = jsonMatch[1].match(/['"]data['"]:\s*(\{[\s\S]*?\})/);
          if (dataMatch) {
            // 将单引号转换为双引号以符合JSON标准
            const jsonString = dataMatch[1].replace(/'/g, '"');
            const apiData = JSON.parse(jsonString);
            return extractFromApiData(apiData, filters);
          }
        } catch (e2) {
          console.warn('从初始状态提取data字段失败:', e2);
        }
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
          history: []
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
          history: []
        };
      }
    }
  }

  return result.coins && Object.keys(result.coins).length > 0 ? result : null;
}

/**
 * 从文本中提取数据（表格解析方案）
 */
export function extractFromText(html, filters = null) {
  const result = {
    exchange: filters?.exchange || 'Binance',
    timestamp: new Date().toISOString(),
    filters: filters,
    coins: {}
  };

  try {
    // 创建一个临时的 DOM 解析器
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 查找表格
    const tables = doc.querySelectorAll('table');

    if (tables.length === 0) {
      console.warn('未找到表格数据，回退到正则表达式解析');
      return extractFromRegex(html, filters);
    }

    // 查找包含利率数据的表格（第二个表格通常是数据表格）
    let dataTable = null;
    for (let i = tables.length - 1; i >= 0; i--) {
      const rows = tables[i].querySelectorAll('tr');
      if (rows.length > 1) {
        const firstRow = rows[0];
        const cells = firstRow.querySelectorAll('td, th');
        const headers = Array.from(cells).map(cell => cell.textContent.trim());

        // 检查是否包含我们需要的列
        if (headers.includes('年利率') || headers.some(h => h.includes('%'))) {
          dataTable = tables[i];
          break;
        }
      }
    }

    if (!dataTable) {
      console.warn('未找到包含利率数据的表格，回退到正则表达式解析');
      return extractFromRegex(html, filters);
    }

    // 解析表格数据
    const rows = dataTable.querySelectorAll('tr');
    const history = [];
    let latestRate = 0;

    for (let i = 1; i < rows.length; i++) { // 跳过标题行
      const cells = rows[i].querySelectorAll('td');
      if (cells.length >= 2) {
        const timeText = cells[0]?.textContent.trim();
        const rateText = cells[1]?.textContent.trim();

        if (timeText && rateText && rateText.includes('%')) {
          // 解析时间
          const timeMatch = timeText.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
          if (timeMatch) {
            // 解析利率
            const rateMatch = rateText.match(/(\d+\.?\d*)%/);
            if (rateMatch) {
              const rate = parseFloat(rateMatch[1]);
              history.push({
                time: timeMatch[1],
                rate: rate
              });

              if (latestRate === 0) {
                latestRate = rate; // 第一条数据是最新利率
              }
            }
          }
        }
      }
    }

    if (history.length === 0) {
      console.warn('表格中未找到有效数据，回退到正则表达式解析');
      return extractFromRegex(html, filters);
    }

    // 确定币种符号
    const coinSymbol = filters?.coin || 'USDT'; // 默认为 USDT

    result.coins[coinSymbol] = {
      annual_rate: latestRate,
      daily_rate: latestRate / 365,
      hourly_rate: latestRate / 365 / 24,
      history: history.slice(0, 24) // 最多保留24条历史记录
    };

    return result;

  } catch (error) {
    console.error('表格解析失败:', error);
    return extractFromRegex(html, filters);
  }
}

/**
 * 使用正则表达式提取数据（最后的备用方案）
 */
function extractFromRegex(html, filters = null) {
  const result = {
    exchange: filters?.exchange || 'Binance',
    timestamp: new Date().toISOString(),
    filters: filters,
    coins: {}
  };

  // 查找利率数据的正则表达式
  const ratePattern = /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})[^%]*?(\d+\.?\d+)%/g;
  const matches = [...html.matchAll(ratePattern)];

  if (matches.length === 0) {
    console.warn('正则表达式未找到利率数据');
    return null;
  }

  const history = matches.slice(0, 24).map(match => ({
    time: match[1],
    rate: parseFloat(match[2])
  }));

  const latestRate = history[0]?.rate || 0;
  const coinSymbol = filters?.coin || 'USDT';

  result.coins[coinSymbol] = {
    annual_rate: latestRate,
    daily_rate: latestRate / 365,
    hourly_rate: latestRate / 365 / 24,
    history: history
  };

  return result.coins && Object.keys(result.coins).length > 0 ? result : null;
}

// 辅助函数：从HTML中提取单个币种的利率
export function extractCoinRate(html, coinPattern) {
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

        // 如果没有百分比，尝试提取纯数字
        const numMatch = match.match(/(\d+\.?\d*)/);
        if (numMatch && parseFloat(numMatch[1]) < 100) { // 假设利率小于100%
          rate = parseFloat(numMatch[1]);
          break;
        }
      }

      if (rate > 0) break;
    }
  }

  return rate;
}

/**
 * 从真实HTML页面提取历史数据
 */
export function extractHistoryFromHTML(html, symbol, timeframe = '1h') {
  try {
    // 使用正则表达式从HTML文本中提取历史数据
    const historyPattern = /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+([\d.]+)%?\s*([\d.]+)%?\s*([\d.]+)%?/g;
    const historyData = [];
    let match;
    let dataPoints = timeframe === '1h' ? 5 : 24; // 1小时显示5个点，24小时显示24个点

    while ((match = historyPattern.exec(html)) !== null && historyData.length < dataPoints) {
      const rate = parseFloat(match[2]);
      historyData.push({
        time: match[1],
        rate: rate,
        daily_rate: parseFloat(match[3]) || parseFloat((rate / 365).toFixed(4)),
        hourly_rate: parseFloat(match[4]) || parseFloat((rate / 365 / 24).toFixed(6))
      });
    }

    // 如果没有找到历史数据，返回基于当前利率的简单历史记录
    if (historyData.length === 0) {
      const now = new Date();
      for (let i = 4; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 60 * 60 * 1000);
        historyData.push({
          time: time.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          }).replace(/\//g, '-'),
          rate: 0,
          daily_rate: 0,
          hourly_rate: 0
        });
      }
    }

    return historyData;
  } catch (error) {
    console.error('提取历史数据时出错:', error);
    return [];
  }
}

