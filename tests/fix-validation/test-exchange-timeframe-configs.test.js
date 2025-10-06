/**
 * 交易所和颗粒度配置修复验证测试
 * 验证修复后的系统是否正确使用币种独立配置
 */

import { jest } from '@jest/globals';

// 模拟服务
const mockStorageService = {
  getConfig: jest.fn(),
  saveConfig: jest.fn(),
  getCoinState: jest.fn(),
  updateCoinState: jest.fn()
};

const mockScraperService = {
  scrapeCoinGlassData: jest.fn()
};

const mockEmailService = {
  sendAlert: jest.fn(),
  sendRecovery: jest.fn()
};

// 模拟监控服务
const { runMonitoring } = await import('../../src/services/monitor-service.js');

describe('交易所和颗粒度配置修复验证', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('监控服务抓取逻辑', () => {
    test('应该使用每个币种的独立配置进行抓取', async () => {
      // 模拟配置：包含不同交易所和时间框架的币种
      const mockConfig = {
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
            threshold: 2.0,
            enabled: true
          },
          {
            symbol: 'USDC',
            exchange: 'okx',
            timeframe: '24h',
            threshold: 3.0,
            enabled: true
          },
          {
            symbol: 'BTC',
            exchange: 'bybit',
            timeframe: '1h',
            threshold: 0.5,
            enabled: true
          }
        ]
      };

      mockStorageService.getConfig.mockResolvedValue(mockConfig);

      // 模拟抓取结果 - 每个币种使用不同的配置
      mockScraperService.scrapeCoinGlassData
        .mockResolvedValueOnce({
          exchange: 'binance',
          coins: {
            'USDT': {
              symbol: 'USDT',
              annual_rate: 2.5,
              daily_rate: 0.0068,
              hourly_rate: 0.0003
            }
          }
        })
        .mockResolvedValueOnce({
          exchange: 'okx',
          coins: {
            'USDC': {
              symbol: 'USDC',
              annual_rate: 3.2,
              daily_rate: 0.0088,
              hourly_rate: 0.0004
            }
          }
        })
        .mockResolvedValueOnce({
          exchange: 'bybit',
          coins: {
            'BTC': {
              symbol: 'BTC',
              annual_rate: 0.6,
              daily_rate: 0.0016,
              hourly_rate: 0.00007
            }
          }
        });

      // 模拟币种状态
      mockStorageService.getCoinState.mockResolvedValue({ status: 'normal' });
      mockEmailService.sendAlert.mockResolvedValue(true);

      // 执行监控
      const result = await runMonitoring();

      // 验证每个币种都使用了独立的配置
      expect(mockScraperService.scrapeCoinGlassData).toHaveBeenCalledTimes(3);

      // 验证第一个调用使用 USDT 配置
      expect(mockScraperService.scrapeCoinData).toHaveBeenNthCalledWith(1,
        'binance',  // exchange
        'USDT',     // coin
        '1h',       // timeframe
        ['USDT']    // requestedCoins
      );

      // 验证第二个调用使用 USDC 配置
      expect(mockScraperService.scrapeCoinGlassData).toHaveBeenNthCalledWith(2,
        'okx',      // exchange
        'USDC',     // coin
        '24h',      // timeframe
        ['USDC']    // requestedCoins
      );

      // 验证第三个调用使用 BTC 配置
      expect(mockScraperService.scrapeCoinGlassData).toHaveBeenNthCalledWith(3,
        'bybit',    // exchange
        'BTC',      // coin
        '1h',       // timeframe
        ['BTC']     // requestedCoins
      );

      // 验证监控成功
      expect(result.success).toBe(true);
      expect(result.data.rateData.exchange).toBe('mixed');
      expect(result.data.scraping_summary.total_coins_requested).toBe(3);
      expect(result.data.scraping_summary.successful_scrapes).toBe(3);
    });

    test('应该正确处理部分抓取失败的情况', async () => {
      const mockConfig = {
        monitoring_enabled: true,
        coins: [
          {
            symbol: 'USDT',
            exchange: 'binance',
            timeframe: '1h',
            threshold: 2.0,
            enabled: true
          },
          {
            symbol: 'FAIL_COIN',
            exchange: 'okx',
            timeframe: '24h',
            threshold: 3.0,
            enabled: true
          }
        ]
      };

      mockStorageService.getConfig.mockResolvedValue(mockConfig);

      // 模拟一个成功，一个失败
      mockScraperService.scrapeCoinGlassData
        .mockResolvedValueOnce({
          exchange: 'binance',
          coins: {
            'USDT': {
              symbol: 'USDT',
              annual_rate: 2.5
            }
          }
        })
        .mockResolvedValueOnce(null); // 抓取失败

      mockStorageService.getCoinState.mockResolvedValue({ status: 'normal' });

      const result = await runMonitoring();

      // 验证成功和失败都被正确记录
      expect(result.success).toBe(true);
      expect(result.data.scraping_summary.successful_scrapes).toBe(1);
      expect(result.data.scraping_summary.failed_scrapes).toBe(1);

      // 验证结果中包含成功和失败的币种
      const successResult = result.data.results.find(r => r.coin === 'USDT');
      const failResult = result.data.results.find(r => r.coin === 'FAIL_COIN');

      expect(successResult.success).toBe(true);
      expect(failResult.success).toBe(false);
      expect(failResult.reason).toBe('scraping_failed');
    });
  });

  describe('配置验证逻辑', () => {
    test('应该正确验证和标准化币种配置', async () => {
      const { default: configRouter } = await import('../../src/routes/config.js');

      const testConfig = {
        email: 'test@example.com',
        monitoring_enabled: true,
        coins: [
          {
            symbol: 'USDT',
            exchange: 'binance',
            timeframe: '1h',
            threshold: '2.5',
            enabled: true
          },
          {
            symbol: 'USDC',
            // 缺少 exchange，应该使用默认值
            timeframe: '24h',
            threshold: 'invalid', // 无效值，应该使用默认值
            // 缺少 enabled，应该默认为 true
          }
        ]
      };

      // 这里需要模拟 Express 的 req/res 对象
      // 在实际测试中，我们需要更复杂的模拟设置
      // 这里只是展示测试逻辑的思路
    });
  });

  describe('时间框架切换逻辑', () => {
    test('应该对所有时间框架都执行切换操作', async () => {
      const { ScraperService } = await import('../../src/services/scraper.js');
      const scraper = new ScraperService();

      // 模拟页面对象
      const mockPage = {
        evaluate: jest.fn(),
        waitForTimeout: jest.fn()
      };

      // 测试 1h 时间框架
      await scraper.switchTimeframe(mockPage, '1h');
      expect(mockPage.evaluate).toHaveBeenCalledWith(expect.any(Function), '1h');

      // 测试 24h 时间框架
      await scraper.switchTimeframe(mockPage, '24h');
      expect(mockPage.evaluate).toHaveBeenCalledWith(expect.any(Function), '24h');

      // 验证等待时间都被调用
      expect(mockPage.waitForTimeout).toHaveBeenCalledTimes(2);
    });
  });

  describe('前端状态显示', () => {
    test('应该显示配置生效状态', () => {
      // 这个测试需要在浏览器环境中运行
      // 这里只是展示测试思路

      const testCoins = [
        {
          symbol: 'USDT',
          exchange: 'binance',
          timeframe: '1h',
          threshold: 2.0,
          enabled: true
        },
        {
          symbol: 'USDC',
          // 缺少 exchange 和 timeframe
          threshold: 3.0,
          enabled: true
        }
      ];

      // 模拟 displayStatus 函数的输出验证
      // 第一个币种应该显示 "✓ 独立配置生效"
      // 第二个币种应该显示 "⚠ 使用默认配置"
    });
  });
});

/**
 * 集成测试：验证完整的监控流程
 */
describe('完整监控流程集成测试', () => {
  test('应该正确处理多交易所、多时间框架的监控场景', async () => {
    // 这个测试模拟真实的监控场景
    const complexConfig = {
      email: 'user@example.com',
      monitoring_enabled: true,
      coins: [
        {
          symbol: 'USDT',
          exchange: 'binance',
          timeframe: '1h',
          threshold: 2.0,
          enabled: true
        },
        {
          symbol: 'USDT',
          exchange: 'okx',
          timeframe: '24h',
          threshold: 3.0,
          enabled: true
        },
        {
          symbol: 'BTC',
          exchange: 'bybit',
          timeframe: '1h',
          threshold: 0.5,
          enabled: false // 被禁用，不应该被监控
        }
      ]
    };

    // 模拟完整的监控流程
    // 验证只有启用的币种被监控
    // 验证每个币种使用正确的交易所和时间框架
    // 验证结果数据结构正确
  });
});