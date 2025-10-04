/**
 * 数据抓取模块
 */

/**
 * 抓取 CoinGlass 利率数据
 */
export async function fetchRateData(filters = null) {
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
    const { parseRateData } = await import('../utils/parser.js');
    return parseRateData(html, filters);
  } catch (error) {
    console.error('抓取数据失败:', error);
    return null;
  }
}