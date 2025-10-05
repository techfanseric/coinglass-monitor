/**
 * 存储服务模拟文件
 * 用于测试环境
 */

export const storageService = {
  // 获取配置
  getConfig: jest.fn().mockResolvedValue({
    email: 'test@example.com',
    monitoring_enabled: true,
    filters: {
      exchange: 'binance',
      coin: 'USDT',
      timeframe: '1h'
    },
    coins: [
      {
        symbol: 'USDT',
        exchange: 'binance',
        timeframe: '1h',
        threshold: 5.0,
        enabled: true
      }
    ],
    trigger_settings: {
      hourly_minute: 0,
      daily_hour: 9,
      daily_minute: 0
    },
    notification_hours: {
      enabled: true,
      start: '09:00',
      end: '18:00'
    },
    repeat_interval: 180
  }),

  // 获取币种状态
  getCoinState: jest.fn().mockResolvedValue({
    status: 'normal',
    last_notification: null,
    next_notification: null,
    last_rate: 5.0
  }),

  // 更新币种状态
  updateCoinState: jest.fn().mockResolvedValue(true),

  // 记录邮件历史
  recordEmailHistory: jest.fn().mockResolvedValue(true),

  // 保存预定通知
  saveScheduledNotification: jest.fn().mockResolvedValue(true),

  // 获取预定通知
  getScheduledNotifications: jest.fn().mockResolvedValue([]),

  // 删除预定通知
  deleteScheduledNotification: jest.fn().mockResolvedValue(true),

  // 保存配置
  saveConfig: jest.fn().mockResolvedValue(true),

  // 记录抓取历史
  recordScrapeHistory: jest.fn().mockResolvedValue(true)
};