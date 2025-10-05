// Jest测试环境设置文件

// 模拟环境变量
process.env.EMAILJS_SERVICE_ID = 'test_service_id';
process.env.EMAILJS_TEMPLATE_ID = 'test_template_id';
process.env.EMAILJS_PUBLIC_KEY = 'test_public_key';
process.env.EMAILJS_PRIVATE_KEY = 'test_private_key';
process.env.EMAILJS_API_URL = 'https://api.emailjs.com/api/v1.0/email/send';
process.env.CURRENCY_DECIMAL_PLACES = '2';
process.env.RATE_DECIMAL_PLACES = '4';
process.env.PERCENTAGE_DECIMAL_PLACES = '1';
process.env.EMAILJS_TIMEOUT = '10000';

// 全局测试工具函数
global.createMockConfig = (overrides = {}) => ({
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
    },
    {
      symbol: 'USDC',
      exchange: 'binance',
      timeframe: '1h',
      threshold: 4.0,
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
  repeat_interval: 180,
  ...overrides
});

global.createMockRateData = (overrides = {}) => ({
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
    },
    USDC: {
      symbol: 'USDC',
      annual_rate: 4.5,
      daily_rate: 0.0123,
      hourly_rate: 0.00051,
      history: [
        { time: '08:00', annual_rate: 4.3 },
        { time: '07:00', annual_rate: 4.2 },
        { time: '06:00', annual_rate: 4.1 }
      ]
    }
  },
  ...overrides
});

import { jest } from '@jest/globals';

// 模拟fetch全局函数
global.fetch = jest.fn();

// 在每个测试前重置模拟
beforeEach(() => {
  fetch.mockClear();
});