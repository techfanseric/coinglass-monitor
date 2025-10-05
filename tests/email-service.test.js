/**
 * 邮件服务单元测试
 * 测试邮件发送逻辑，使用Mock避免真实邮件发送
 */

import { jest } from '@jest/globals';

// 模拟fetch函数
global.fetch = jest.fn();

// 模拟依赖服务
jest.mock('../src/services/storage.js', () => {
  const mockStorage = {
    recordEmailHistory: jest.fn(),
    getConfig: jest.fn()
  };
  return { storageService: mockStorage };
});

jest.mock('../src/services/logger.js', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn()
  };
  return { loggerService: mockLogger };
});

describe('邮件服务测试', () => {
  let mockConfig, mockRateData, mockEnv;
  let storageService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // 获取mock服务实例
    const storage = await import('../src/services/storage.js');
    storageService = storage.storageService;

    mockConfig = createMockConfig();
    mockRateData = createMockRateData();
    mockEnv = {
      EMAILJS_SERVICE_ID: process.env.EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID: process.env.EMAILJS_TEMPLATE_ID,
      EMAILJS_PUBLIC_KEY: process.env.EMAILJS_PUBLIC_KEY,
      EMAILJS_PRIVATE_KEY: process.env.EMAILJS_PRIVATE_KEY
    };

    // 设置fetch的成功响应
    fetch.mockResolvedValue({
      status: 200,
      text: jest.fn().mockResolvedValue('OK')
    });

    // 设置storageService的默认返回值
    storageService.recordEmailHistory.mockResolvedValue(true);
    storageService.getConfig.mockResolvedValue(mockConfig);
  });

  describe('警报邮件发送测试', () => {
    test('发送警报邮件应该成功', async () => {
      const { emailService } = await import('../src/services/email.js');
      const coin = mockConfig.coins[0];
      const currentRate = 6.5;

      const result = await emailService.sendAlert(mockEnv, coin, currentRate, mockRateData, mockConfig);

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.emailjs.com/api/v1.0/email/send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': expect.stringContaining('Mozilla'),
            'Origin': 'https://www.emailjs.com',
            'Referer': 'https://www.emailjs.com/'
          }),
          body: expect.stringContaining(coin.symbol)
        })
      );
      expect(storageService.recordEmailHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'alert',
          coin: coin.symbol,
          current_rate: currentRate,
          threshold: coin.threshold
        })
      );
    });

    test('邮件发送失败时应该返回false', async () => {
      // 设置fetch的失败响应
      fetch.mockResolvedValue({
        status: 400,
        text: jest.fn().mockResolvedValue('Bad Request')
      });

      const { emailService } = await import('../src/services/email.js');
      const coin = mockConfig.coins[0];
      const currentRate = 6.5;

      const result = await emailService.sendAlert(mockEnv, coin, currentRate, mockRateData, mockConfig);

      expect(result).toBe(false);
      expect(storageService.recordEmailHistory).not.toHaveBeenCalled();
    });

    test('网络异常时应该返回false', async () => {
      // 设置fetch抛出异常
      fetch.mockRejectedValue(new Error('Network error'));

      const { emailService } = await import('../src/services/email.js');
      const coin = mockConfig.coins[0];
      const currentRate = 6.5;

      const result = await emailService.sendAlert(mockEnv, coin, currentRate, mockRateData, mockConfig);

      expect(result).toBe(false);
    });
  });

  describe('恢复通知邮件测试', () => {
    test('发送恢复通知应该成功', async () => {
      const { emailService } = await import('../src/services/email.js');
      const coin = mockConfig.coins[0];
      const currentRate = 4.0; // 低于阈值

      const result = await emailService.sendRecovery(mockEnv, coin, currentRate, mockConfig);

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.emailjs.com/api/v1.0/email/send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
      expect(storageService.recordEmailHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'recovery',
          coin: coin.symbol,
          current_rate: currentRate
        })
      );
    });
  });

  describe('测试邮件发送测试', () => {
    test('发送测试邮件应该成功', async () => {
      const { emailService } = await import('../src/services/email.js');
      const testEmail = 'test@example.com';

      const result = await emailService.sendTestEmail(testEmail);

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.emailjs.com/api/v1.0/email/send',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('test@example.com')
        })
      );
      expect(storageService.recordEmailHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'test',
          email: testEmail
        })
      );
    });
  });

  describe('多币种警报邮件测试', () => {
    test('发送多币种警报邮件应该成功', async () => {
      const { emailService } = await import('../src/services/email.js');
      const triggeredCoins = mockConfig.coins; // 所有币种都触发

      const result = await emailService.sendMultiCoinAlert(triggeredCoins, mockRateData, mockConfig);

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalled();
      expect(storageService.recordEmailHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'multi_coin_alert',
          triggered_coins: triggeredCoins
        })
      );
    });

    test('多币种警报邮件数据应该包含所有触发币种', async () => {
      const { emailService } = await import('../src/services/email.js');
      const triggeredCoins = mockConfig.coins;

      await emailService.sendMultiCoinAlert(triggeredCoins, mockRateData, mockConfig);

      const fetchCall = fetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.template_params.triggered_count).toBe(triggeredCoins.length);
      expect(requestBody.template_params.all_coins_status).toHaveLength(triggeredCoins.length);
    });
  });

  describe('监控设置信息生成测试', () => {
    test('监控设置信息应该正确生成', async () => {
      const { generateMonitoringSettingsInfo } = await import('../src/services/email.js');
      const settingsInfo = generateMonitoringSettingsInfo(mockConfig);

      expect(settingsInfo.exchanges).toBe('binance');
      expect(settingsInfo.trigger_times).toContain('每小时第0分钟');
      expect(settingsInfo.enabled_coins_count).toBe(2);
      expect(settingsInfo.total_coins_count).toBe(2);
      expect(settingsInfo.notification_hours).toBe('09:00 - 18:00');
      expect(settingsInfo.repeat_interval).toBe('3小时');
      expect(settingsInfo.monitoring_enabled).toBe(true);
      expect(settingsInfo.next_check_time).toBeDefined();
    });

    test('禁用时间限制的监控设置信息应该正确生成', async () => {
      const configWithoutTimeLimit = {
        ...mockConfig,
        notification_hours: {
          enabled: false,
          start: '09:00',
          end: '18:00'
        }
      };

      const { generateMonitoringSettingsInfo } = await import('../src/services/email.js');
      const settingsInfo = generateMonitoringSettingsInfo(configWithoutTimeLimit);

      expect(settingsInfo.notification_hours).toBe('24小时');
    });

    test('自定义重复间隔的监控设置信息应该正确生成', async () => {
      const configWithCustomInterval = {
        ...mockConfig,
        repeat_interval: 45 // 45分钟
      };

      const { generateMonitoringSettingsInfo } = await import('../src/services/email.js');
      const settingsInfo = generateMonitoringSettingsInfo(configWithCustomInterval);

      expect(settingsInfo.repeat_interval).toBe('45分钟');
    });

    test('小时级重复间隔的监控设置信息应该正确生成', async () => {
      const configWithHourlyInterval = {
        ...mockConfig,
        repeat_interval: 125 // 2小时5分钟
      };

      const { generateMonitoringSettingsInfo } = await import('../src/services/email.js');
      const settingsInfo = generateMonitoringSettingsInfo(configWithHourlyInterval);

      expect(settingsInfo.repeat_interval).toBe('2小时5分钟');
    });

    test('禁用监控的设置信息应该正确生成', async () => {
      const disabledConfig = {
        ...mockConfig,
        monitoring_enabled: false
      };

      const { generateMonitoringSettingsInfo } = await import('../src/services/email.js');
      const settingsInfo = generateMonitoringSettingsInfo(disabledConfig);

      expect(settingsInfo.monitoring_enabled).toBe(false);
    });
  });

  describe('EmailJS API调用测试', () => {
    test('EmailJS API调用应该使用正确的参数', async () => {
      const { emailService } = await import('../src/services/email.js');
      const coin = mockConfig.coins[0];
      const currentRate = 6.5;

      await emailService.sendAlert(mockEnv, coin, currentRate, mockRateData, mockConfig);

      const fetchCall = fetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.service_id).toBe(mockEnv.EMAILJS_SERVICE_ID);
      expect(requestBody.template_id).toBe(mockEnv.EMAILJS_TEMPLATE_ID);
      expect(requestBody.user_id).toBe(mockEnv.EMAILJS_PUBLIC_KEY);
      expect(requestBody.accessToken).toBe(mockEnv.EMAILJS_PRIVATE_KEY);
      expect(requestBody.template_params).toBeDefined();
    });

    test('EmailJS API调用应该包含正确的请求头', async () => {
      const { emailService } = await import('../src/services/email.js');
      const coin = mockConfig.coins[0];
      const currentRate = 6.5;

      await emailService.sendAlert(mockEnv, coin, currentRate, mockRateData, mockConfig);

      const fetchCall = fetch.mock.calls[0];
      const headers = fetchCall[1].headers;

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['User-Agent']).toContain('Mozilla');
      expect(headers['Accept']).toContain('application/json');
      expect(headers['Origin']).toBe('https://www.emailjs.com');
      expect(headers['Referer']).toBe('https://www.emailjs.com/');
    });
  });
});