/**
 * 抓取服务模拟文件
 * 用于测试环境
 */

export const scraperService = {
  scrapeCoinGlassData: jest.fn().mockResolvedValue({
    exchange: 'binance',
    timestamp: new Date().toISOString(),
    coins: {
      USDT: {
        symbol: 'USDT',
        annual_rate: 6.5,
        daily_rate: 0.0178,
        hourly_rate: 0.00074,
        history: [
          { time: '08:00', annual_rate: 6.2 },
          { time: '07:00', annual_rate: 6.1 },
          { time: '06:00', annual_rate: 6.0 }
        ]
      }
    }
  })
};