/**
 * 通知系统集成测试
 * 直接测试真实的配置和功能，避免复杂的Mock
 */

import { jest } from '@jest/globals';

// 模拟fetch以避免真实邮件发送
global.fetch = jest.fn();

describe('通知系统集成测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // 设置fetch模拟成功响应
    fetch.mockResolvedValue({
      status: 200,
      text: jest.fn().mockResolvedValue('OK')
    });
  });

  describe('触发时间配置测试', () => {
    test('每小时触发时间计算', async () => {
      // 导入真实的monitorService
      const { monitorService } = await import('../src/services/monitor-service.js');

      // 测试每小时第30分钟触发
      const config = {
        trigger_settings: {
          hourly_minute: 30,
          daily_hour: 9,
          daily_minute: 0
        }
      };

      // 模拟14:30 - 应该触发
      const mockDate1 = new Date(2024, 0, 1, 14, 30, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate1);
      expect(monitorService.shouldTriggerNow(config)).toBe(true);

      // 模拟14:31 - 不应该触发
      const mockDate2 = new Date(2024, 0, 1, 14, 31, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate2);
      expect(monitorService.shouldTriggerNow(config)).toBe(false);

      global.Date.mockRestore();
    });

    test('每日触发时间计算', async () => {
      const { monitorService } = await import('../src/services/monitor-service.js');

      const config = {
        trigger_settings: {
          hourly_minute: 0,
          daily_hour: 9,
          daily_minute: 0
        }
      };

      // 模拟09:00 - 应该触发
      const mockDate1 = new Date(2024, 0, 1, 9, 0, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate1);
      expect(monitorService.shouldTriggerNow(config)).toBe(true);

      // 模拟09:01 - 不应该触发
      const mockDate2 = new Date(2024, 0, 1, 9, 1, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate2);
      expect(monitorService.shouldTriggerNow(config)).toBe(false);

      global.Date.mockRestore();
    });
  });

  describe('通知时间段配置测试', () => {
    test('启用时间限制的通知判断', async () => {
      const { monitorService } = await import('../src/services/monitor-service.js');

      const config = {
        notification_hours: {
          enabled: true,
          start: '09:00',
          end: '18:00'
        }
      };

      // 测试在通知时间内 (10:00)
      const mockDate1 = new Date(2024, 0, 1, 10, 0, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate1);
      expect(monitorService.isWithinNotificationHours(config)).toBe(true);

      // 测试在通知时间外 (20:00)
      const mockDate2 = new Date(2024, 0, 1, 20, 0, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate2);
      expect(monitorService.isWithinNotificationHours(config)).toBe(false);

      global.Date.mockRestore();
    });

    test('禁用时间限制时始终允许通知', async () => {
      const { monitorService } = await import('../src/services/monitor-service.js');

      const config = {
        notification_hours: {
          enabled: false,
          start: '09:00',
          end: '18:00'
        }
      };

      // 任何时间都应该允许通知
      const mockDate = new Date(2024, 0, 1, 20, 0, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
      expect(monitorService.isWithinNotificationHours(config)).toBe(true);

      global.Date.mockRestore();
    });
  });

  describe('监控设置信息生成测试', () => {
    test('生成完整的监控设置信息', async () => {
      const { generateMonitoringSettingsInfo } = await import('../src/services/email.js');

      const config = createMockConfig();
      const settings = generateMonitoringSettingsInfo(config);

      expect(settings.exchanges).toBe('binance');
      expect(settings.trigger_times).toContain('每小时第0分钟');
      expect(settings.enabled_coins_count).toBe(2);
      expect(settings.total_coins_count).toBe(2);
      expect(settings.notification_hours).toBe('09:00 - 18:00');
      expect(settings.repeat_interval).toBe('3小时');
      expect(settings.monitoring_enabled).toBe(true);
      expect(settings.next_check_time).toBeDefined();
    });

    test('禁用时间限制时显示24小时', async () => {
      const { generateMonitoringSettingsInfo } = await import('../src/services/email.js');

      const config = {
        ...createMockConfig(),
        notification_hours: {
          enabled: false,
          start: '09:00',
          end: '18:00'
        }
      };

      const settings = generateMonitoringSettingsInfo(config);
      expect(settings.notification_hours).toBe('24小时');
    });

    test('自定义重复间隔显示', async () => {
      const { generateMonitoringSettingsInfo } = await import('../src/services/email.js');

      const config = {
        ...createMockConfig(),
        repeat_interval: 45
      };

      const settings = generateMonitoringSettingsInfo(config);
      expect(settings.repeat_interval).toBe('45分钟');
    });

    test('小时级重复间隔显示', async () => {
      const { generateMonitoringSettingsInfo } = await import('../src/services/email.js');

      const config = {
        ...createMockConfig(),
        repeat_interval: 125 // 2小时5分钟
      };

      const settings = generateMonitoringSettingsInfo(config);
      expect(settings.repeat_interval).toBe('2小时5分钟');
    });
  });

  describe('邮件数据格式测试', () => {
    test('警报邮件数据格式正确', async () => {
      // 需要模拟storageService来避免文件操作
      jest.doMock('../src/services/storage.js', () => ({
        storageService: {
          recordEmailHistory: jest.fn().mockResolvedValue(true),
          getConfig: jest.fn().mockResolvedValue(createMockConfig()),
          getCoinState: jest.fn().mockResolvedValue({ status: 'normal' }),
          updateCoinState: jest.fn().mockResolvedValue(true)
        }
      }));

      const { emailService } = await import('../src/services/email.js');

      const coin = { symbol: 'USDT', threshold: 5.0 };
      const currentRate = 6.5;
      const mockEnv = {
        EMAILJS_SERVICE_ID: 'test_service_id',
        EMAILJS_TEMPLATE_ID: 'test_template_id',
        EMAILJS_PUBLIC_KEY: 'test_public_key',
        EMAILJS_PRIVATE_KEY: 'test_private_key'
      };

      const result = await emailService.sendAlert(mockEnv, coin, currentRate, {}, createMockConfig());

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
    });

    test('恢复通知邮件数据格式正确', async () => {
      jest.doMock('../src/services/storage.js', () => ({
        storageService: {
          recordEmailHistory: jest.fn().mockResolvedValue(true)
        }
      }));

      const { emailService } = await import('../src/services/email.js');

      const coin = { symbol: 'USDT', threshold: 5.0 };
      const currentRate = 4.0; // 低于阈值
      const mockEnv = {
        EMAILJS_SERVICE_ID: 'test_service_id',
        EMAILJS_TEMPLATE_ID: 'test_template_id',
        EMAILJS_PUBLIC_KEY: 'test_public_key',
        EMAILJS_PRIVATE_KEY: 'test_private_key'
      };

      const result = await emailService.sendRecovery(mockEnv, coin, currentRate, createMockConfig());

      expect(result).toBe(true);
    });

    test('测试邮件发送功能', async () => {
      jest.doMock('../src/services/storage.js', () => ({
        storageService: {
          recordEmailHistory: jest.fn().mockResolvedValue(true)
        }
      }));

      const { emailService } = await import('../src/services/email.js');

      const result = await emailService.sendTestEmail('test@example.com');

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalled();
    });
  });

  describe('EmailJS API调用测试', () => {
    test('API调用参数正确', async () => {
      jest.doMock('../src/services/storage.js', () => ({
        storageService: {
          recordEmailHistory: jest.fn().mockResolvedValue(true)
        }
      }));

      const { emailService } = await import('../src/services/email.js');

      await emailService.sendTestEmail('test@example.com');

      const fetchCall = fetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.service_id).toBe(process.env.EMAILJS_SERVICE_ID);
      expect(requestBody.template_id).toBe(process.env.EMAILJS_TEMPLATE_ID);
      expect(requestBody.user_id).toBe(process.env.EMAILJS_PUBLIC_KEY);
      expect(requestBody.accessToken).toBe(process.env.EMAILJS_PRIVATE_KEY);
    });

    test('API请求头正确', async () => {
      jest.doMock('../src/services/storage.js', () => ({
        storageService: {
          recordEmailHistory: jest.fn().mockResolvedValue(true)
        }
      }));

      const { emailService } = await import('../src/services/email.js');

      await emailService.sendTestEmail('test@example.com');

      const fetchCall = fetch.mock.calls[0];
      const headers = fetchCall[1].headers;

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['User-Agent']).toContain('Mozilla');
      expect(headers['Origin']).toBe('https://www.emailjs.com');
      expect(headers['Referer']).toBe('https://www.emailjs.com/');
    });
  });

  describe('错误处理测试', () => {
    test('邮件发送失败时返回false', async () => {
      fetch.mockResolvedValue({
        status: 400,
        text: jest.fn().mockResolvedValue('Bad Request')
      });

      jest.doMock('../src/services/storage.js', () => ({
        storageService: {
          recordEmailHistory: jest.fn().mockResolvedValue(true)
        }
      }));

      const { emailService } = await import('../src/services/email.js');

      const result = await emailService.sendTestEmail('test@example.com');
      expect(result).toBe(false);
    });

    test('网络异常时返回false', async () => {
      fetch.mockRejectedValue(new Error('Network error'));

      jest.doMock('../src/services/storage.js', () => ({
        storageService: {
          recordEmailHistory: jest.fn().mockResolvedValue(true)
        }
      }));

      const { emailService } = await import('../src/services/email.js');

      const result = await emailService.sendTestEmail('test@example.com');
      expect(result).toBe(false);
    });
  });
});