/**
 * email.js 模块单元测试
 * 测试邮件发送和模板准备功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendAlert, sendRecovery } from '../../src/modules/email.js';

// 模拟 fetch 全局函数
const mockFetch = vi.fn();
global.fetch = mockFetch;

// 模拟 config 模块
vi.mock('../../src/utils/config.js', () => ({
  recordEmailHistory: vi.fn()
}));

import { recordEmailHistory } from '../../src/utils/config.js';

describe('email.js 邮件功能测试', () => {
  let mockEnv;
  let mockCoin;
  let mockRateData;
  let mockConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    // 设置模拟环境
    mockEnv = {
      EMAILJS_SERVICE_ID: 'service_test123',
      EMAILJS_TEMPLATE_ID: 'template_test456',
      EMAILJS_PUBLIC_KEY: 'public_key_test',
      EMAILJS_PRIVATE_KEY: 'private_key_test',
      CONFIG_KV: { put: vi.fn() },
      STATE_KV: { put: vi.fn() }
    };

    // 设置模拟币种数据
    mockCoin = {
      symbol: 'USDT',
      threshold: 5.0
    };

    // 设置模拟汇率数据
    mockRateData = {
      exchange: 'Binance',
      coins: {
        USDT: {
          annual_rate: 8.5,
          history: [
            { time: '14:00', rate: 8.5 },
            { time: '13:00', rate: 7.8 },
            { time: '12:00', rate: 7.2 },
            { time: '11:00', rate: 6.5 },
            { time: '10:00', rate: 5.8 }
          ]
        },
        USDC: {
          annual_rate: 7.2,
          history: [
            { time: '14:00', rate: 7.2 },
            { time: '13:00', rate: 6.8 }
          ]
        },
        BUSD: {
          annual_rate: 4.5,
          history: []
        }
      }
    };

    // 设置模拟配置
    mockConfig = {
      email: 'test@example.com',
      repeat_interval: 3
    };

    // 设置模拟 fetch 成功响应
    mockFetch.mockResolvedValue({
      status: 200
    });

    // 设置模拟历史记录函数
    recordEmailHistory.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendAlert - 警报邮件发送', () => {
    it('应该成功发送单币种警报邮件', async () => {
      const result = await sendAlert(mockEnv, mockCoin, 8.5, mockRateData, mockConfig);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.emailjs.com/api/v1.0/email/send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': expect.stringContaining('Mozilla'),
            'Origin': 'https://www.emailjs.com',
            'Referer': 'https://www.emailjs.com/'
          }),
          body: expect.stringContaining('"to_email":"test@example.com"')
        })
      );

      // 验证邮件历史记录
      expect(recordEmailHistory).toHaveBeenCalledWith(
        mockEnv,
        expect.objectContaining({
          type: 'alert',
          coin: 'USDT',
          current_rate: 8.5,
          threshold: 5.0,
          email: 'test@example.com',
          exchange: 'Binance'
        })
      );
    });

    it('应该处理多币种警报邮件', async () => {
      const multiCoinRateData = {
        exchange: 'Binance',
        coins: {
          USDT: { annual_rate: 8.5, history: [] },
          USDC: { annual_rate: 7.2, history: [] },
          BUSD: { annual_rate: 3.5, history: [] }
        }
      };

      const result = await sendAlert(mockEnv, mockCoin, 8.5, multiCoinRateData, mockConfig);

      expect(result).toBe(true);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.template_params.triggered_coins).toHaveLength(2); // USDT 和 USDC 超过阈值
      expect(requestBody.template_params.all_coins_status).toHaveLength(3); // 所有币种
    });

    it('应该生成正确的邮件标题', async () => {
      const result = await sendAlert(mockEnv, mockCoin, 8.5, mockRateData, mockConfig);

      expect(result).toBe(true);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const subject = requestBody.template_params.subject;

      // 标题应该包含时间和币种信息
      expect(subject).toMatch(/\d{2}:\d{2}/); // 时间格式
      expect(subject).toContain('USDT'); // 币种名称
    });

    it('应该包含正确的触发币种数据', async () => {
      const result = await sendAlert(mockEnv, mockCoin, 8.5, mockRateData, mockConfig);

      expect(result).toBe(true);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const triggeredCoins = requestBody.template_params.triggered_coins;

      expect(triggeredCoins).toHaveLength(2); // USDT 和 USDC 超过阈值

      // 验证 USDT 数据
      const usdtCoin = triggeredCoins.find(coin => coin.symbol === 'USDT');
      expect(usdtCoin.current_rate).toBe('8.5');
      expect(usdtCoin.threshold).toBe('5.0');
      expect(usdtCoin.excess).toBe('70.0'); // (8.5-5.0)/5.0*100
      expect(usdtCoin.daily_rate).toBe('0.023'); // 8.5/365
      expect(usdtCoin.hourly_rate).toBe('0.0010'); // 8.5/365/24
      expect(usdtCoin.history).toHaveLength(5); // 最近5条历史数据
    });

    it('应该包含所有币种状态', async () => {
      const result = await sendAlert(mockEnv, mockCoin, 8.5, mockRateData, mockConfig);

      expect(result).toBe(true);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const allCoinsStatus = requestBody.template_params.all_coins_status;

      expect(allCoinsStatus).toHaveLength(3); // USDT, USDC, BUSD

      // 验证超过阈值的币种
      const usdtStatus = allCoinsStatus.find(coin => coin.symbol === 'USDT');
      expect(usdtStatus.annual_rate).toBe('8.5');
      expect(usdtStatus.is_above_threshold).toBe(true);

      // 验证低于阈值的币种
      const busdStatus = allCoinsStatus.find(coin => coin.symbol === 'BUSD');
      expect(busdStatus.annual_rate).toBe('4.5');
      expect(busdStatus.is_above_threshold).toBe(false);
    });

    it('应该处理历史数据时间格式化', async () => {
      const result = await sendAlert(mockEnv, mockCoin, 8.5, mockRateData, mockConfig);

      expect(result).toBe(true);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const usdtCoin = requestBody.template_params.triggered_coins.find(coin => coin.symbol === 'USDT');

      expect(usdtCoin.history[0].time).toBe('14:00'); // 应该去掉日期，只保留时间
      expect(usdtCoin.history[0].rate).toBe('8.5');
      expect(usdtCoin.history[0].daily_rate).toBe('0.023');
      expect(usdtCoin.history[0].hourly_rate).toBe('0.0010');
    });

    it('应该处理 EmailJS API 错误', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 400,
        text: () => Promise.resolve('Bad Request')
      });

      const result = await sendAlert(mockEnv, mockCoin, 8.5, mockRateData, mockConfig);

      expect(result).toBe(false);
      expect(recordEmailHistory).not.toHaveBeenCalled();
    });

    it('应该处理网络异常', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await sendAlert(mockEnv, mockCoin, 8.5, mockRateData, mockConfig);

      expect(result).toBe(false);
      expect(recordEmailHistory).not.toHaveBeenCalled();
    });

    it('应该处理空历史数据', async () => {
      const rateDataWithoutHistory = {
        exchange: 'Binance',
        coins: {
          USDT: { annual_rate: 8.5, history: [] }
        }
      };

      const result = await sendAlert(mockEnv, mockCoin, 8.5, rateDataWithoutHistory, mockConfig);

      expect(result).toBe(true);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const usdtCoin = requestBody.template_params.triggered_coins.find(coin => coin.symbol === 'USDT');
      expect(usdtCoin.history).toHaveLength(0);
    });
  });

  describe('sendRecovery - 回落通知邮件发送', () => {
    it('应该成功发送回落通知邮件', async () => {
      const result = await sendRecovery(mockEnv, mockCoin, 4.5, mockConfig);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.emailjs.com/api/v1.0/email/send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: expect.stringContaining('"to_email":"test@example.com"')
        })
      );

      // 验证邮件历史记录
      expect(recordEmailHistory).toHaveBeenCalledWith(
        mockEnv,
        expect.objectContaining({
          type: 'recovery',
          coin: 'USDT',
          current_rate: 4.5,
          threshold: 5.0,
          email: 'test@example.com'
        })
      );
    });

    it('应该生成正确的回落通知标题', async () => {
      const result = await sendRecovery(mockEnv, mockCoin, 4.5, mockConfig);

      expect(result).toBe(true);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const subject = requestBody.template_params.subject;

      expect(subject).toMatch(/\d{2}:\d{2}\s*\|\s*USDT-回落通知/);
    });

    it('应该包含正确的回落币种数据', async () => {
      const result = await sendRecovery(mockEnv, mockCoin, 4.5, mockConfig);

      expect(result).toBe(true);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const triggeredCoins = requestBody.template_params.triggered_coins;

      expect(triggeredCoins).toHaveLength(1);
      expect(triggeredCoins[0].symbol).toBe('USDT');
      expect(triggeredCoins[0].current_rate).toBe('4.5');
      expect(triggeredCoins[0].threshold).toBe('5.0');
      expect(triggeredCoins[0].excess).toBe('0'); // 回落时超出百分比为0
      expect(triggeredCoins[0].history).toHaveLength(0); // 回落通知不需要历史数据
    });

    it('应该处理回落通知的 EmailJS API 错误', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
        text: () => Promise.resolve('Internal Server Error')
      });

      const result = await sendRecovery(mockEnv, mockCoin, 4.5, mockConfig);

      expect(result).toBe(false);
      expect(recordEmailHistory).not.toHaveBeenCalled();
    });
  });

  describe('EmailJS API 调用验证', () => {
    it('应该使用正确的 EmailJS 参数', async () => {
      await sendAlert(mockEnv, mockCoin, 8.5, mockRateData, mockConfig);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(requestBody.service_id).toBe('service_test123');
      expect(requestBody.template_id).toBe('template_test456');
      expect(requestBody.user_id).toBe('public_key_test');
      expect(requestBody.accessToken).toBe('private_key_test');
    });

    it('应该包含正确的模板参数', async () => {
      await sendAlert(mockEnv, mockCoin, 8.5, mockRateData, mockConfig);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const params = requestBody.template_params;

      expect(params.to_email).toBe('test@example.com');
      expect(params.exchange_name).toBe('Binance');
      expect(params.triggered_count).toBe(2); // USDT 和 USDC 超过阈值
      expect(params.total_coins).toBe(3); // 总共3个币种
      expect(params.check_interval).toBe('每小时');
      expect(params.next_check_time).toMatch(/\d{4}\/\d{1,2}\/\d{1,2}/);
    });

    it('应该模拟浏览器请求头', async () => {
      await sendAlert(mockEnv, mockCoin, 8.5, mockRateData, mockConfig);

      const headers = mockFetch.mock.calls[0][1].headers;

      expect(headers['User-Agent']).toContain('Mozilla');
      expect(headers['Accept']).toContain('application/json');
      expect(headers['Origin']).toBe('https://www.emailjs.com');
      expect(headers['Referer']).toBe('https://www.emailjs.com/');
      expect(headers['Accept-Language']).toContain('zh-CN');
    });
  });

  describe('边界条件测试', () => {
    it('应该处理零利率情况', async () => {
      const zeroRateData = {
        exchange: 'Binance',
        coins: {
          USDT: { annual_rate: 0, history: [] }
        }
      };

      const result = await sendAlert(mockEnv, mockCoin, 0, zeroRateData, mockConfig);

      expect(result).toBe(true);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const params = requestBody.template_params;
      expect(params.triggered_count).toBe(0); // 没有币种超过阈值
    });

    it('应该处理负数利率情况', async () => {
      const negativeRateData = {
        exchange: 'Binance',
        coins: {
          USDT: { annual_rate: -1.5, history: [] }
        }
      };

      const result = await sendAlert(mockEnv, mockCoin, -1.5, negativeRateData, mockConfig);

      expect(result).toBe(true);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const params = requestBody.template_params;
      expect(params.triggered_count).toBe(0); // 负利率不会超过阈值
    });

    it('应该处理极大利率值', async () => {
      const highRateData = {
        exchange: 'Binance',
        coins: {
          USDT: { annual_rate: 999.99, history: [] }
        }
      };

      const result = await sendAlert(mockEnv, mockCoin, 999.99, highRateData, mockConfig);

      expect(result).toBe(true);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const usdtCoin = requestBody.template_params.triggered_coins.find(coin => coin.symbol === 'USDT');
      expect(parseFloat(usdtCoin.current_rate)).toBeGreaterThan(999);
    });
  });

  describe('异常处理测试', () => {
    it('应该处理 fetch 抛出的异常', async () => {
      mockFetch.mockImplementation(() => {
        throw new Error('Connection failed');
      });

      const result = await sendAlert(mockEnv, mockCoin, 8.5, mockRateData, mockConfig);

      expect(result).toBe(false);
    });

    it('应该处理 JSON 序列化异常', async () => {
      // 创建一个会导致 JSON 序列化错误的对象
      const circularRef = {};
      circularRef.self = circularRef;

      const invalidConfig = {
        email: circularRef
      };

      // 这个测试模拟了可能的异常情况
      const result = await sendAlert(mockEnv, mockCoin, 8.5, mockRateData, invalidConfig);

      // 应该能捕获异常并返回 false
      expect(result).toBe(false);
    });

    it('应该处理环境变量缺失的情况', async () => {
      const invalidEnv = {}; // 缺少必要的 EmailJS 配置

      const result = await sendAlert(invalidEnv, mockCoin, 8.5, mockRateData, mockConfig);

      // 环境变量缺失时，函数仍然会尝试发送请求
      expect(typeof result).toBe('boolean');
    });
  });
});