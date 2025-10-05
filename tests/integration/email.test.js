/**
 * 多币种邮件发送集成测试
 * 测试符合EmailJS官方规范的多币种邮件模板
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendAlert, sendRecovery } from '../../src/modules/email.js';

// 模拟环境变量
const mockEnv = {
  EMAILJS_SERVICE_ID: 'service_njwa17p',
  EMAILJS_TEMPLATE_ID: 'template_2a6ntkh',
  EMAILJS_PUBLIC_KEY: 'R2I8depNfmvcV7eTz',
  EMAILJS_PRIVATE_KEY: 'R2I8depNfmvcV7eTz',
  CONFIG_KV: {
    put: vi.fn()
  },
  STATE_KV: {
    put: vi.fn()
  }
};

// 模拟 fetch 全局函数
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('多币种邮件发送集成测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendAlert - 多币种警报', () => {
    it('应该成功发送多币种警报邮件', async () => {
      // 模拟 EmailJS API 成功响应
      mockFetch.mockResolvedValueOnce({
        status: 200
      });

      const coin = {
        symbol: 'USDT',
        threshold: 5.0
      };

      const rateData = {
        exchange: 'Binance',
        coins: {
          USDT: {
            annual_rate: 8.5,
            history: [
              { time: '14:00', rate: 8.5 },
              { time: '13:00', rate: 7.8 }
            ]
          }
        }
      };

      const config = {
        email: 'test@example.com'
      };

      const result = await sendAlert(mockEnv, coin, 8.5, rateData, config);

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
          body: expect.stringContaining('test@example.com')
        })
      );

      // 验证邮件历史记录
      expect(mockEnv.STATE_KV.put).toHaveBeenCalledWith(
        expect.stringMatching(/^email_history_/),
        expect.stringContaining('"type":"alert"'),
        expect.objectContaining({
          expirationTtl: expect.any(Number)
        })
      );
    });

    it('应该处理 EmailJS API 错误', async () => {
      // 模拟 EmailJS API 错误响应
      mockFetch.mockResolvedValueOnce({
        status: 400,
        text: () => Promise.resolve('Bad Request')
      });

      const coin = {
        symbol: 'USDT',
        threshold: 5.0
      };

      const rateData = {
        exchange: 'Binance',
        coins: {
          USDT: {
            history: []
          }
        }
      };

      const config = {
        email: 'test@example.com'
      };

      const result = await sendAlert(mockEnv, coin, 8.5, rateData, config);

      expect(result).toBe(false);
    });

    it('应该处理网络异常', async () => {
      // 模拟网络错误
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const coin = {
        symbol: 'USDT',
        threshold: 5.0
      };

      const rateData = {
        exchange: 'Binance',
        coins: {
          USDT: {
            history: []
          }
        }
      };

      const config = {
        email: 'test@example.com'
      };

      const result = await sendAlert(mockEnv, coin, 8.5, rateData, config);

      expect(result).toBe(false);
    });
  });

  describe('sendRecovery', () => {
    it('应该成功发送回落通知邮件', async () => {
      // 模拟 EmailJS API 成功响应
      mockFetch.mockResolvedValueOnce({
        status: 200
      });

      const coin = {
        symbol: 'USDT',
        threshold: 5.0
      };

      const config = {
        email: 'test@example.com'
      };

      const result = await sendRecovery(mockEnv, coin, 4.5, config);

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
          body: expect.stringContaining('"triggered_coins"')
        })
      );

      // 验证邮件历史记录
      expect(mockEnv.STATE_KV.put).toHaveBeenCalledWith(
        expect.stringMatching(/^email_history_/),
        expect.stringContaining('"type":"recovery"'),
        expect.objectContaining({
          expirationTtl: expect.any(Number)
        })
      );
    });

    it('应该处理 EmailJS API 错误', async () => {
      // 模拟 EmailJS API 错误响应
      mockFetch.mockResolvedValueOnce({
        status: 500,
        text: () => Promise.resolve('Internal Server Error')
      });

      const coin = {
        symbol: 'USDT',
        threshold: 5.0
      };

      const config = {
        email: 'test@example.com'
      };

      const result = await sendRecovery(mockEnv, coin, 4.5, config);

      expect(result).toBe(false);
    });
  });

  describe('邮件内容验证', () => {
    it('应该包含正确的警报邮件参数', async () => {
      mockFetch.mockResolvedValueOnce({ status: 200 });

      const coin = {
        symbol: 'USDT',
        threshold: 5.0
      };

      const rateData = {
        exchange: 'Binance',
        coins: {
          USDT: {
            annual_rate: 8.5,
            history: [
              { time: '14:00', rate: 8.5 },
              { time: '13:00', rate: 7.8 },
              { time: '12:00', rate: 7.2 }
            ]
          }
        }
      };

      const config = {
        email: 'test@example.com'
      };

      await sendAlert(mockEnv, coin, 8.5, rateData, config);

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody.service_id).toBe('service_njwa17p');
      expect(requestBody.template_id).toBe('template_2a6ntkh');
      expect(requestBody.user_id).toBe('R2I8depNfmvcV7eTz');
      expect(requestBody.template_params.to_email).toBe('test@example.com');
      expect(requestBody.template_params.exchange_name).toBe('Binance');
      expect(requestBody.template_params.triggered_coins[0].symbol).toBe('USDT');
      expect(requestBody.template_params.triggered_coins[0].current_rate).toBe('8.5');
      expect(requestBody.template_params.triggered_coins[0].threshold).toBe('5.0');
    });

    it('应该包含正确的回落通知邮件参数', async () => {
      mockFetch.mockResolvedValueOnce({ status: 200 });

      const coin = {
        symbol: 'USDT',
        threshold: 5.0
      };

      const config = {
        email: 'test@example.com'
      };

      await sendRecovery(mockEnv, coin, 4.5, config);

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody.service_id).toBe('service_njwa17p');
      expect(requestBody.template_id).toBe('template_2a6ntkh');
      expect(requestBody.template_params.triggered_coins[0].symbol).toBe('USDT');
      expect(requestBody.template_params.triggered_coins[0].current_rate).toBe('4.5');
      expect(requestBody.template_params.triggered_coins[0].threshold).toBe('5.0');
    });
  });
});