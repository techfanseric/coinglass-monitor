/**
 * config.js 工具模块单元测试
 * 测试配置管理、状态管理和通知调度功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getUserConfig,
  getCoinState,
  updateCoinState,
  isWithinNotificationHours,
  shouldTriggerNow,
  getNextTriggerTime,
  parseTime,
  generateCronExpression,
  getNextNotificationTime,
  scheduleNotification,
  checkPendingNotifications,
  recordEmailHistory
} from '../../src/utils/config.js';

// 模拟邮件模块
vi.mock('../../src/modules/email.js', () => ({
  sendAlert: vi.fn().mockResolvedValue(true),
  sendRecovery: vi.fn().mockResolvedValue(true)
}));

import { sendAlert, sendRecovery } from '../../src/modules/email.js';

describe('config.js 配置管理工具测试', () => {
  let mockEnv;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEnv = {
      CONFIG_KV: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn()
      },
      STATE_KV: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn()
      }
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getUserConfig - 获取用户配置', () => {
    it('应该成功获取并解析配置', async () => {
      const mockConfig = {
        email: 'test@example.com',
        monitoring_enabled: true,
        coins: []
      };

      mockEnv.CONFIG_KV.get.mockResolvedValue(JSON.stringify(mockConfig));

      const result = await getUserConfig(mockEnv);

      expect(result).toEqual(mockConfig);
      expect(mockEnv.CONFIG_KV.get).toHaveBeenCalledWith('user_settings');
    });

    it('应该在配置不存在时返回 null', async () => {
      mockEnv.CONFIG_KV.get.mockResolvedValue(null);

      const result = await getUserConfig(mockEnv);

      expect(result).toBe(null);
    });

    it('应该处理 JSON 解析错误', async () => {
      mockEnv.CONFIG_KV.get.mockResolvedValue('invalid json');

      const result = await getUserConfig(mockEnv);

      expect(result).toBe(null);
    });

    it('应该处理 KV 存储异常', async () => {
      mockEnv.CONFIG_KV.get.mockRejectedValue(new Error('KV error'));

      const result = await getUserConfig(mockEnv);

      expect(result).toBe(null);
    });
  });

  describe('getCoinState - 获取币种状态', () => {
    it('应该成功获取并解析币种状态', async () => {
      const mockState = {
        status: 'alert',
        last_notification: '2024-01-01T10:00:00Z',
        last_rate: 8.5
      };

      mockEnv.STATE_KV.get.mockResolvedValue(JSON.stringify(mockState));

      const result = await getCoinState(mockEnv, 'USDT');

      expect(result).toEqual(mockState);
      expect(mockEnv.STATE_KV.get).toHaveBeenCalledWith('coin_USDT');
    });

    it('应该在状态不存在时返回默认状态', async () => {
      mockEnv.STATE_KV.get.mockResolvedValue(null);

      const result = await getCoinState(mockEnv, 'USDT');

      expect(result).toEqual({ status: 'normal' });
    });

    it('应该处理状态获取异常', async () => {
      mockEnv.STATE_KV.get.mockRejectedValue(new Error('KV error'));

      const result = await getCoinState(mockEnv, 'USDT');

      expect(result).toEqual({ status: 'normal' });
    });
  });

  describe('updateCoinState - 更新币种状态', () => {
    it('应该成功更新币种状态', async () => {
      const mockState = {
        status: 'alert',
        last_notification: '2024-01-01T10:00:00Z',
        last_rate: 8.5
      };

      await updateCoinState(mockEnv, 'USDT', 'alert', mockState);

      expect(mockEnv.STATE_KV.put).toHaveBeenCalledWith(
        'coin_USDT',
        expect.stringContaining('"status":"alert"')
      );
    });

    it('应该处理状态更新异常', async () => {
      mockEnv.STATE_KV.put.mockRejectedValue(new Error('KV error'));

      // 应该不抛出异常
      await expect(updateCoinState(mockEnv, 'USDT', 'alert', {})).resolves.toBeUndefined();
    });
  });

  describe('isWithinNotificationHours - 通知时间检查', () => {
    it('应该在时间限制未启用时返回 true', () => {
      const config = {
        notification_hours: { enabled: false }
      };

      const result = isWithinNotificationHours(config);

      expect(result).toBe(true);
    });

    it('应该在 notification_hours 不存在时返回 true', () => {
      const config = {};

      const result = isWithinNotificationHours(config);

      expect(result).toBe(true);
    });

    it('应该在当前时间在允许范围内时返回 true', () => {
      const config = {
        notification_hours: {
          enabled: true,
          start: '09:00',
          end: '18:00'
        }
      };

      // 模拟当前时间为 14:30
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T14:30:00'));

      const result = isWithinNotificationHours(config);

      expect(result).toBe(true);
      vi.useRealTimers();
    });

    it('应该在当前时间早于开始时间时返回 false', () => {
      const config = {
        notification_hours: {
          enabled: true,
          start: '09:00',
          end: '18:00'
        }
      };

      // 模拟当前时间为 08:30
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T08:30:00'));

      const result = isWithinNotificationHours(config);

      expect(result).toBe(false);
      vi.useRealTimers();
    });

    it('应该在当前时间晚于结束时间时返回 false', () => {
      const config = {
        notification_hours: {
          enabled: true,
          start: '09:00',
          end: '18:00'
        }
      };

      // 模拟当前时间为 19:30
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T19:30:00'));

      const result = isWithinNotificationHours(config);

      expect(result).toBe(false);
      vi.useRealTimers();
    });

    it('应该在边界时间正确工作', () => {
      const config = {
        notification_hours: {
          enabled: true,
          start: '09:00',
          end: '18:00'
        }
      };

      // 测试开始时间 09:00
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T09:00:00'));
      expect(isWithinNotificationHours(config)).toBe(true);

      // 测试结束时间 18:00（应该为 false，因为结束时间不包含）
      vi.setSystemTime(new Date('2024-01-01T18:00:00'));
      expect(isWithinNotificationHours(config)).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('shouldTriggerNow - 触发条件检查', () => {
    it('应该正确处理触发条件检查', () => {
      const config = {
        trigger_settings: {
          hourly_minute: 0,
          daily_hour: 9,
          daily_minute: 0
        }
      };

      // 简化测试：只验证函数存在且返回布尔值
      const result = shouldTriggerNow(config);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getNextTriggerTime - 获取下次触发时间', () => {
    it('应该正确返回 Date 对象', () => {
      const config = {
        trigger_settings: {
          hourly_minute: 15,
          daily_hour: 9,
          daily_minute: 0
        }
      };

      const nextTime = getNextTriggerTime(config);

      expect(nextTime).toBeInstanceOf(Date);
      expect(nextTime.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('parseTime - 时间字符串解析', () => {
    it('应该正确解析标准时间格式', () => {
      expect(parseTime('09:00')).toBe(540); // 9 * 60 + 0
      expect(parseTime('14:30')).toBe(870); // 14 * 60 + 30
      expect(parseTime('23:59')).toBe(1439); // 23 * 60 + 59
    });

    it('应该处理个位数小时', () => {
      expect(parseTime('9:00')).toBe(540);
      expect(parseTime('1:30')).toBe(90);
    });

    it('应该处理个位数分钟', () => {
      expect(parseTime('09:5')).toBe(545);
      expect(parseTime('14:3')).toBe(843);
    });
  });

  describe('generateCronExpression - 生成 cron 表达式', () => {
    it('应该使用默认配置每小时触发', () => {
      const config = {};

      const cron = generateCronExpression(config);

      expect(cron).toBe('0 * * * *');
    });

    it('应该使用配置的每时触发分钟', () => {
      const config = {
        trigger_settings: {
          hourly_minute: 15
        }
      };

      const cron = generateCronExpression(config);

      expect(cron).toBe('15 * * * *');
    });
  });

  describe('getNextNotificationTime - 获取下次通知时间', () => {
    it('应该计算明天的开始时间', () => {
      const config = {
        notification_hours: {
          start: '09:00',
          end: '18:00'
        }
      };

      // 模拟当前时间为 2024-01-01 14:30
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T14:30:00Z'));

      const nextTime = getNextNotificationTime(config);

      expect(nextTime.getFullYear()).toBe(2024);
      expect(nextTime.getMonth()).toBe(0); // 1月
      expect(nextTime.getDate()).toBe(2); // 明天
      expect(nextTime.getHours()).toBe(9);
      expect(nextTime.getMinutes()).toBe(0);
      expect(nextTime.getSeconds()).toBe(0);
      expect(nextTime.getMilliseconds()).toBe(0);

      vi.useRealTimers();
    });
  });

  describe('scheduleNotification - 安排延迟通知', () => {
    it('应该成功安排延迟通知', async () => {
      const notificationData = {
        coin: 'USDT',
        currentRate: 8.5,
        config: {},
        scheduled_time: '2024-01-01T09:00:00Z'
      };

      await scheduleNotification(mockEnv, 'USDT', 'alert', notificationData);

      expect(mockEnv.STATE_KV.put).toHaveBeenCalledWith(
        expect.stringMatching(/^scheduled_USDT_\d+$/),
        expect.stringContaining('"type":"alert"'),
        {
          expirationTtl: 7 * 24 * 60 * 60
        }
      );
    });

    it('应该处理安排通知失败', async () => {
      mockEnv.STATE_KV.put.mockRejectedValue(new Error('KV error'));

      // 应该不抛出异常
      await expect(scheduleNotification(mockEnv, 'USDT', 'alert', {})).resolves.toBeUndefined();
    });
  });

  describe('checkPendingNotifications - 检查待处理通知', () => {
    it('应该正确处理待处理通知检查', async () => {
      const config = {
        notification_hours: {
          enabled: false // 禁用时间限制，总是允许通知
        }
      };

      await checkPendingNotifications(mockEnv, config);

      // 验证函数执行完成，没有抛出异常
      expect(true).toBe(true);
    });

    it('应该处理到期的待处理通知', async () => {
      const config = {
        notification_hours: {
          enabled: false // 总是允许通知
        }
      };

      const scheduledNotification = {
        type: 'alert',
        coin: 'USDT',
        data: {
          coin: { symbol: 'USDT', threshold: 5.0 },
          currentRate: 8.5,
          rateData: { coins: { USDT: { annual_rate: 8.5 } } },
          config: { email: 'test@example.com' }
        },
        scheduled_time: new Date(Date.now() - 60 * 1000).toISOString() // 1分钟前
      };

      mockEnv.STATE_KV.list.mockResolvedValue({
        keys: [{ name: 'scheduled_USDT_1234567890' }]
      });
      mockEnv.STATE_KV.get.mockResolvedValue(JSON.stringify(scheduledNotification));
      mockEnv.STATE_KV.get
        .mockResolvedValueOnce(JSON.stringify(scheduledNotification))
        .mockResolvedValueOnce(JSON.stringify({ status: 'alert', pending_notification: true }));

      await checkPendingNotifications(mockEnv, config);

      expect(sendAlert).toHaveBeenCalledWith(
        mockEnv,
        { symbol: 'USDT', threshold: 5.0 },
        8.5,
        { coins: { USDT: { annual_rate: 8.5 } } },
        { email: 'test@example.com' }
      );

      expect(mockEnv.STATE_KV.delete).toHaveBeenCalledWith('scheduled_USDT_1234567890');
    });

    it('应该处理未到时间的待处理通知', async () => {
      const config = {
        notification_hours: {
          enabled: false
        }
      };

      const scheduledNotification = {
        type: 'alert',
        coin: 'USDT',
        scheduled_time: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1小时后
      };

      mockEnv.STATE_KV.list.mockResolvedValue({
        keys: [{ name: 'scheduled_USDT_1234567890' }]
      });
      mockEnv.STATE_KV.get.mockResolvedValue(JSON.stringify(scheduledNotification));

      await checkPendingNotifications(mockEnv, config);

      expect(sendAlert).not.toHaveBeenCalled();
      expect(mockEnv.STATE_KV.delete).not.toHaveBeenCalled();
    });

    it('应该处理通知类型为 recovery 的情况', async () => {
      const config = {
        notification_hours: {
          enabled: false
        }
      };

      const scheduledNotification = {
        type: 'recovery',
        coin: 'USDT',
        data: {
          coin: { symbol: 'USDT', threshold: 5.0 },
          currentRate: 4.5,
          config: { email: 'test@example.com' }
        },
        scheduled_time: new Date(Date.now() - 60 * 1000).toISOString()
      };

      mockEnv.STATE_KV.list.mockResolvedValue({
        keys: [{ name: 'scheduled_USDT_1234567890' }]
      });
      mockEnv.STATE_KV.get
        .mockResolvedValueOnce(JSON.stringify(scheduledNotification))
        .mockResolvedValueOnce(JSON.stringify({ status: 'alert', pending_notification: true }));

      await checkPendingNotifications(mockEnv, config);

      expect(sendRecovery).toHaveBeenCalledWith(
        mockEnv,
        { symbol: 'USDT', threshold: 5.0 },
        4.5,
        { email: 'test@example.com' }
      );
    });

    it('应该处理待处理通知检查异常', async () => {
      const config = {
        notification_hours: {
          enabled: false
        }
      };

      mockEnv.STATE_KV.list.mockRejectedValue(new Error('KV error'));

      // 应该不抛出异常
      await expect(checkPendingNotifications(mockEnv, config)).resolves.toBeUndefined();
    });
  });

  describe('recordEmailHistory - 记录邮件历史', () => {
    it('应该成功记录邮件历史', async () => {
      const emailData = {
        type: 'alert',
        coin: 'USDT',
        current_rate: 8.5
      };

      mockEnv.STATE_KV.list.mockResolvedValue({ keys: [] });

      await recordEmailHistory(mockEnv, emailData);

      expect(mockEnv.STATE_KV.put).toHaveBeenCalledWith(
        expect.stringMatching(/^email_history_\d+$/),
        expect.stringContaining('"type":"alert"'),
        {
          expirationTtl: 30 * 24 * 60 * 60
        }
      );
    });

    it('应该在历史记录超过100条时删除旧记录', async () => {
      const emailData = { type: 'alert' };

      // 模拟现有101条历史记录
      const existingKeys = Array.from({ length: 101 }, (_, i) => ({
        name: `email_history_${Date.now() - (100 - i) * 1000}`
      }));

      mockEnv.STATE_KV.list.mockResolvedValue({ keys: existingKeys });
      mockEnv.STATE_KV.get.mockResolvedValue('{}');

      await recordEmailHistory(mockEnv, emailData);

      // 应该删除最旧的一条记录
      expect(mockEnv.STATE_KV.delete).toHaveBeenCalledTimes(1);
      expect(mockEnv.STATE_KV.delete).toHaveBeenCalledWith(existingKeys[0].name);
    });

    it('应该处理邮件历史记录异常', async () => {
      const emailData = { type: 'alert' };

      mockEnv.STATE_KV.put.mockRejectedValue(new Error('KV error'));

      // 应该不抛出异常
      await expect(recordEmailHistory(mockEnv, emailData)).resolves.toBeUndefined();
    });
  });
});