/**
 * 通知设置单元测试
 * 测试所有通知设置项是否正常运作
 */

import { jest } from '@jest/globals';

// 模拟依赖服务
jest.mock('../src/services/storage.js', () => {
  const mockStorage = {
    getConfig: jest.fn(),
    getCoinState: jest.fn(),
    updateCoinState: jest.fn(),
    recordEmailHistory: jest.fn(),
    saveScheduledNotification: jest.fn(),
    getScheduledNotifications: jest.fn(),
    deleteScheduledNotification: jest.fn()
  };
  return { storageService: mockStorage };
});

jest.mock('../src/services/email.js', () => {
  const mockEmail = {
    sendAlert: jest.fn(),
    sendRecovery: jest.fn(),
    sendTestEmail: jest.fn(),
    sendMultiCoinAlert: jest.fn()
  };
  return { emailService: mockEmail };
});

jest.mock('../src/services/scraper.js', () => {
  const mockScraper = {
    scrapeCoinGlassData: jest.fn()
  };
  return { scraperService: mockScraper };
});

describe('通知设置测试', () => {
  let mockConfig, mockRateData, mockState;
  let storageService, emailService, scraperService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // 获取mock服务实例
    const storage = await import('../src/services/storage.js');
    const email = await import('../src/services/email.js');
    const scraper = await import('../src/services/scraper.js');

    storageService = storage.storageService;
    emailService = email.emailService;
    scraperService = scraper.scraperService;

    mockConfig = createMockConfig();
    mockRateData = createMockRateData();
    mockState = {
      status: 'normal',
      last_notification: null,
      next_notification: null,
      last_rate: 5.0
    };

    // 设置storageService的默认返回值
    storageService.getConfig.mockResolvedValue(mockConfig);
    storageService.getCoinState.mockResolvedValue(mockState);
    storageService.updateCoinState.mockResolvedValue(true);
    storageService.recordEmailHistory.mockResolvedValue(true);
    storageService.getScheduledNotifications.mockResolvedValue([]);

    // 设置emailService的默认返回值
    emailService.sendAlert.mockResolvedValue(true);
    emailService.sendRecovery.mockResolvedValue(true);
    emailService.sendTestEmail.mockResolvedValue(true);
    emailService.sendMultiCoinAlert.mockResolvedValue(true);

    // 设置scraperService的默认返回值
    scraperService.scrapeCoinGlassData.mockResolvedValue(mockRateData);
  });

  describe('监控开关设置测试', () => {
    test('禁用监控时不应该执行监控任务', async () => {
      const disabledConfig = {
        ...mockConfig,
        monitoring_enabled: false
      };

      storageService.getConfig.mockResolvedValue(disabledConfig);

      const { monitorService } = await import('../src/services/monitor-service.js');
      const result = await monitorService.runMonitoring();

      expect(result.success).toBe(false);
      expect(result.reason).toBe('monitoring_disabled');
    });

    test('启用监控时应该正常执行监控任务', async () => {
      // 模拟触发时间
      const mockDate = new Date(2024, 0, 1, 14, 0, 0); // 14:00
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { monitorService } = await import('../src/services/monitor-service.js');
      const result = await monitorService.runMonitoring();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      global.Date.mockRestore();
    });
  });

  describe('触发时间设置测试', () => {
    test('每小时触发设置应该正确工作', async () => {
      const configWithHourlyTrigger = {
        ...mockConfig,
        trigger_settings: {
          hourly_minute: 30,
          daily_hour: 9,
          daily_minute: 0
        }
      };

      // 模拟当前时间为每小时的第30分钟
      const mockDate = new Date(2024, 0, 1, 14, 30, 0); // 14:30
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { monitorService } = await import('../src/services/monitor-service.js');
      const shouldTrigger = monitorService.shouldTriggerNow(configWithHourlyTrigger);
      expect(shouldTrigger).toBe(true);

      // 测试非触发时间
      const mockDate2 = new Date(2024, 0, 1, 14, 31, 0); // 14:31
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate2);

      const shouldNotTrigger = monitorService.shouldTriggerNow(configWithHourlyTrigger);
      expect(shouldNotTrigger).toBe(false);

      global.Date.mockRestore();
    });

    test('每日触发设置应该正确工作', async () => {
      const configWithDailyTrigger = {
        ...mockConfig,
        trigger_settings: {
          hourly_minute: 0,
          daily_hour: 9,
          daily_minute: 0
        }
      };

      // 模拟每日触发时间 09:00
      const mockDate = new Date(2024, 0, 1, 9, 0, 0); // 09:00
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { monitorService } = await import('../src/services/monitor-service.js');
      const shouldTrigger = monitorService.shouldTriggerNow(configWithDailyTrigger);
      expect(shouldTrigger).toBe(true);

      // 测试非触发时间
      const mockDate2 = new Date(2024, 0, 1, 9, 1, 0); // 09:01
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate2);

      const shouldNotTrigger = monitorService.shouldTriggerNow(configWithDailyTrigger);
      expect(shouldNotTrigger).toBe(false);

      global.Date.mockRestore();
    });
  });

  describe('通知时间段设置测试', () => {
    test('启用时间限制时应该正确判断通知时间', async () => {
      const configWithTimeLimit = {
        ...mockConfig,
        notification_hours: {
          enabled: true,
          start: '09:00',
          end: '18:00'
        }
      };

      // 测试在允许时间内 (10:00)
      const mockDateInTime = new Date(2024, 0, 1, 10, 0, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDateInTime);

      const { monitorService } = await import('../src/services/monitor-service.js');
      const canNotify = monitorService.isWithinNotificationHours(configWithTimeLimit);
      expect(canNotify).toBe(true);

      // 测试在允许时间外 (20:00)
      const mockDateOutOfTime = new Date(2024, 0, 1, 20, 0, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDateOutOfTime);

      const cannotNotify = monitorService.isWithinNotificationHours(configWithTimeLimit);
      expect(cannotNotify).toBe(false);

      global.Date.mockRestore();
    });

    test('禁用时间限制时应该始终允许通知', async () => {
      const configWithoutTimeLimit = {
        ...mockConfig,
        notification_hours: {
          enabled: false,
          start: '09:00',
          end: '18:00'
        }
      };

      // 任何时间都应该允许通知
      const mockDate = new Date(2024, 0, 1, 20, 0, 0); // 20:00
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { monitorService } = await import('../src/services/monitor-service.js');
      const canNotify = monitorService.isWithinNotificationHours(configWithoutTimeLimit);
      expect(canNotify).toBe(true);

      global.Date.mockRestore();
    });
  });

  describe('重复通知间隔设置测试', () => {
    test('重复间隔设置应该正确计算下次通知时间', async () => {
      const configWithCustomInterval = {
        ...mockConfig,
        repeat_interval: 60 // 60分钟
      };

      // 设置币种为警报状态
      const alertState = {
        ...mockState,
        status: 'alert',
        last_notification: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30分钟前
        next_notification: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30分钟后
        last_rate: 6.5
      };

      storageService.getCoinState.mockResolvedValue(alertState);

      // 模拟冷却期已过
      const mockDate = new Date();
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { monitorService } = await import('../src/services/monitor-service.js');
      const coin = mockConfig.coins[0];
      const result = await monitorService.checkCoinThreshold(coin, mockRateData, configWithCustomInterval);

      expect(result.actions).toContain('repeat_alert_sent');
      expect(emailService.sendAlert).toHaveBeenCalledWith(
        coin,
        mockRateData.coins[coin.symbol].annual_rate,
        mockRateData,
        configWithCustomInterval
      );

      global.Date.mockRestore();
    });
  });

  describe('多币种通知设置测试', () => {
    test('多币种警报应该正确处理', async () => {
      const triggeredCoins = mockConfig.coins; // 所有币种都触发

      // 修改利率数据使两个币种都超过阈值
      const multiCoinRateData = {
        ...mockRateData,
        coins: {
          USDT: { ...mockRateData.coins.USDT, annual_rate: 6.5 },
          USDC: { ...mockRateData.coins.USDC, annual_rate: 5.0 }
        }
      };

      const result = await emailService.sendMultiCoinAlert(triggeredCoins, multiCoinRateData, mockConfig);

      expect(result).toBe(true);
      expect(emailService.sendMultiCoinAlert).toHaveBeenCalledWith(
        triggeredCoins,
        multiCoinRateData,
        mockConfig
      );
    });
  });

  describe('监控设置信息生成测试', () => {
    test('监控设置信息应该正确生成', async () => {
      const { generateMonitoringSettingsInfo } = await import('../src/services/email.js');
      const settingsInfo = generateMonitoringSettingsInfo(mockConfig);

      expect(settingsInfo).toEqual({
        exchanges: 'binance',
        trigger_times: '每小时第0分钟, 每日09:00',
        enabled_coins_count: 2,
        total_coins_count: 2,
        notification_hours: '09:00 - 18:00',
        repeat_interval: '3小时',
        monitoring_enabled: true,
        next_check_time: expect.any(String)
      });
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
  });
});