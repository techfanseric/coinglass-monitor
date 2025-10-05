/**
 * monitor.js 模块单元测试
 * 测试监控逻辑和阈值检查功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as monitorModule from '../../src/modules/monitor.js';

// 模拟依赖模块
vi.mock('../../src/utils/config.js', () => ({
  getUserConfig: vi.fn(),
  getCoinState: vi.fn(),
  updateCoinState: vi.fn(),
  isWithinNotificationHours: vi.fn(),
  getNextNotificationTime: vi.fn(),
  scheduleNotification: vi.fn(),
  shouldTriggerNow: vi.fn(),
  checkPendingNotifications: vi.fn()
}));

vi.mock('../../src/modules/scraper.js', () => ({
  fetchRateData: vi.fn()
}));

vi.mock('../../src/modules/email.js', () => ({
  sendAlert: vi.fn(),
  sendRecovery: vi.fn()
}));

import {
  getUserConfig,
  getCoinState,
  updateCoinState,
  isWithinNotificationHours,
  getNextNotificationTime,
  scheduleNotification,
  shouldTriggerNow,
  checkPendingNotifications
} from '../../src/utils/config.js';

import { fetchRateData } from '../../src/modules/scraper.js';
import { sendAlert, sendRecovery } from '../../src/modules/email.js';

describe('monitor.js 监控逻辑测试', () => {
  let mockEnv;
  let mockConfig;
  let mockRateData;

  beforeEach(() => {
    vi.clearAllMocks();

    // 设置模拟环境
    mockEnv = {
      CONFIG_KV: { get: vi.fn(), put: vi.fn() },
      STATE_KV: { get: vi.fn(), put: vi.fn() }
    };

    // 设置模拟配置
    mockConfig = {
      monitoring_enabled: true,
      email: 'test@example.com',
      repeat_interval: 3,
      filters: { exchange: 'binance', coin: 'USDT', timeframe: '1h' },
      coins: [
        { symbol: 'USDT', exchange: 'binance', timeframe: '1h', threshold: 5.0, enabled: true },
        { symbol: 'USDC', exchange: 'binance', timeframe: '1h', threshold: 4.0, enabled: true }
      ],
      notification_hours: { enabled: false }
    };

    // 设置模拟汇率数据
    mockRateData = {
      exchange: 'Binance',
      coins: {
        USDT: { annual_rate: 8.5, history: [{ time: '14:00', rate: 8.5 }] },
        USDC: { annual_rate: 3.5, history: [{ time: '14:00', rate: 3.5 }] }
      }
    };

    // 设置默认返回值
    getUserConfig.mockResolvedValue(mockConfig);
    fetchRateData.mockResolvedValue(mockRateData);
    shouldTriggerNow.mockReturnValue(true);
    isWithinNotificationHours.mockReturnValue(true);
    getCoinState.mockResolvedValue({ status: 'normal' });
    checkPendingNotifications.mockResolvedValue(true);

    // 对 checkCoinThreshold 创建 spy（用于 runMonitoring 测试）
    vi.spyOn(monitorModule, 'checkCoinThreshold').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runMonitoring', () => {
    it('应该正常执行完整的监控流程', async () => {
      await monitorModule.runMonitoring(mockEnv);

      expect(getUserConfig).toHaveBeenCalledWith(mockEnv);
      expect(shouldTriggerNow).toHaveBeenCalledWith(mockConfig);
      expect(fetchRateData).toHaveBeenCalledWith(mockConfig.filters);
      expect(checkPendingNotifications).toHaveBeenCalled();
    });

    it('应该在监控未启用时跳过执行', async () => {
      getUserConfig.mockResolvedValue({ ...mockConfig, monitoring_enabled: false });

      await monitorModule.runMonitoring(mockEnv);

      expect(shouldTriggerNow).not.toHaveBeenCalled();
      expect(fetchRateData).not.toHaveBeenCalled();
    });

    it('应该在配置为空时跳过执行', async () => {
      getUserConfig.mockResolvedValue(null);

      await monitorModule.runMonitoring(mockEnv);

      expect(shouldTriggerNow).not.toHaveBeenCalled();
      expect(fetchRateData).not.toHaveBeenCalled();
    });

    it('应该在触发条件不满足时跳过监控', async () => {
      shouldTriggerNow.mockReturnValue(false);

      await monitorModule.runMonitoring(mockEnv);

      expect(fetchRateData).not.toHaveBeenCalled();
    });

    it('应该在数据抓取失败时终止执行', async () => {
      fetchRateData.mockResolvedValue(null);

      await monitorModule.runMonitoring(mockEnv);

      expect(monitorModule.checkCoinThreshold).not.toHaveBeenCalled();
    });

    it('应该只处理启用的币种', async () => {
      const configWithDisabledCoin = {
        ...mockConfig,
        coins: [
          { symbol: 'USDT', enabled: true },
          { symbol: 'USDC', enabled: false },
          { symbol: 'BUSD', enabled: true }
        ]
      };
      getUserConfig.mockResolvedValue(configWithDisabledCoin);

      await monitorModule.runMonitoring(mockEnv);

      expect(monitorModule.checkCoinThreshold).toHaveBeenCalledTimes(2);
      expect(monitorModule.checkCoinThreshold).toHaveBeenCalledWith(
        mockEnv,
        { symbol: 'USDT', enabled: true },
        mockRateData,
        configWithDisabledCoin
      );
      expect(monitorModule.checkCoinThreshold).toHaveBeenCalledWith(
        mockEnv,
        { symbol: 'BUSD', enabled: true },
        mockRateData,
        configWithDisabledCoin
      );
    });
  });

  describe('checkCoinThreshold - 首次触发警报', () => {
    beforeEach(() => {
      // 恢复真实的 checkCoinThreshold 函数
      vi.restoreAllMocks();
      // 重新设置其他 mocks
      getUserConfig.mockResolvedValue(mockConfig);
      fetchRateData.mockResolvedValue(mockRateData);
      shouldTriggerNow.mockReturnValue(true);
      isWithinNotificationHours.mockReturnValue(true);
      getCoinState.mockResolvedValue({ status: 'normal' });
      checkPendingNotifications.mockResolvedValue(true);
    });

    it('应该在利率超过阈值且状态正常时发送警报', async () => {
      const coin = { symbol: 'USDT', threshold: 5.0 };
      const currentRate = 8.5;

      getCoinState.mockResolvedValue({ status: 'normal' });

      await monitorModule.checkCoinThreshold(mockEnv, coin, mockRateData, mockConfig);

      expect(sendAlert).toHaveBeenCalledWith(
        mockEnv,
        coin,
        currentRate,
        mockRateData,
        mockConfig
      );
      expect(updateCoinState).toHaveBeenCalledWith(
        mockEnv,
        coin.symbol,
        'alert',
        expect.objectContaining({
          last_notification: expect.any(String),
          next_notification: expect.any(String),
          last_rate: currentRate
        })
      );
    });

    it('应该在币种数据不存在时跳过处理', async () => {
      const coin = { symbol: 'NONEXISTENT', threshold: 5.0 };
      const emptyRateData = { coins: {} };

      await monitorModule.checkCoinThreshold(mockEnv, coin, emptyRateData, mockConfig);

      expect(sendAlert).not.toHaveBeenCalled();
      expect(updateCoinState).not.toHaveBeenCalled();
    });

    it('应该在非通知时间段内延迟发送警报', async () => {
      const coin = { symbol: 'USDT', threshold: 5.0 };
      const nextNotificationTime = new Date('2024-01-01T09:00:00');

      isWithinNotificationHours.mockReturnValue(false);
      getNextNotificationTime.mockReturnValue(nextNotificationTime);

      await monitorModule.checkCoinThreshold(mockEnv, coin, mockRateData, mockConfig);

      expect(sendAlert).not.toHaveBeenCalled();
      expect(scheduleNotification).toHaveBeenCalledWith(
        mockEnv,
        coin.symbol,
        'alert',
        expect.objectContaining({
          coin,
          currentRate: 8.5,
          rateData: mockRateData,
          config: mockConfig,
          scheduled_time: nextNotificationTime.toISOString()
        })
      );
      expect(updateCoinState).toHaveBeenCalledWith(
        mockEnv,
        coin.symbol,
        'alert',
        expect.objectContaining({
          last_rate: 8.5,
          pending_notification: true
        })
      );
    });
  });

  describe('checkCoinThreshold - 重复警报', () => {
    it('应该在冷却期结束后发送重复警报', async () => {
      const coin = { symbol: 'USDT', threshold: 5.0 };
      const pastNotificationTime = new Date(Date.now() - 60 * 60 * 1000); // 1小时前

      getCoinState.mockResolvedValue({
        status: 'alert',
        next_notification: pastNotificationTime.toISOString()
      });

      await monitorModule.checkCoinThreshold(mockEnv, coin, mockRateData, mockConfig);

      expect(sendAlert).toHaveBeenCalledWith(
        mockEnv,
        coin,
        8.5,
        mockRateData,
        mockConfig
      );
      expect(updateCoinState).toHaveBeenCalledWith(
        mockEnv,
        coin.symbol,
        'alert',
        expect.objectContaining({
          last_notification: expect.any(String),
          next_notification: expect.any(String),
          last_rate: 8.5
        })
      );
    });

    it('应该在冷却期未结束时跳过重复警报', async () => {
      const coin = { symbol: 'USDT', threshold: 5.0 };
      const futureNotificationTime = new Date(Date.now() + 60 * 60 * 1000); // 1小时后

      getCoinState.mockResolvedValue({
        status: 'alert',
        next_notification: futureNotificationTime.toISOString()
      });

      await monitorModule.checkCoinThreshold(mockEnv, coin, mockRateData, mockConfig);

      expect(sendAlert).not.toHaveBeenCalled();
      expect(updateCoinState).not.toHaveBeenCalled();
    });

    it('应该在非通知时间段内延迟重复警报', async () => {
      const coin = { symbol: 'USDT', threshold: 5.0 };
      const pastNotificationTime = new Date(Date.now() - 60 * 60 * 1000);
      const nextNotificationTime = new Date('2024-01-01T09:00:00');

      getCoinState.mockResolvedValue({
        status: 'alert',
        next_notification: pastNotificationTime.toISOString()
      });
      isWithinNotificationHours.mockReturnValue(false);
      getNextNotificationTime.mockReturnValue(nextNotificationTime);

      await monitorModule.checkCoinThreshold(mockEnv, coin, mockRateData, mockConfig);

      expect(sendAlert).not.toHaveBeenCalled();
      expect(scheduleNotification).toHaveBeenCalledWith(
        mockEnv,
        coin.symbol,
        'alert',
        expect.objectContaining({
          scheduled_time: nextNotificationTime.toISOString()
        })
      );
    });
  });

  describe('checkCoinThreshold - 回落通知', () => {
    it('应该在利率回落且之前有警报时发送回落通知', async () => {
      const coin = { symbol: 'USDT', threshold: 5.0 };
      const lowRateData = {
        coins: {
          USDT: { annual_rate: 3.5, history: [] }
        }
      };

      getCoinState.mockResolvedValue({ status: 'alert' });

      await monitorModule.checkCoinThreshold(mockEnv, coin, lowRateData, mockConfig);

      expect(sendRecovery).toHaveBeenCalledWith(
        mockEnv,
        coin,
        3.5,
        mockConfig
      );
      expect(updateCoinState).toHaveBeenCalledWith(
        mockEnv,
        coin.symbol,
        'normal',
        expect.objectContaining({
          last_rate: 3.5
        })
      );
    });

    it('应该在非通知时间段内延迟回落通知', async () => {
      const coin = { symbol: 'USDT', threshold: 5.0 };
      const lowRateData = {
        coins: {
          USDT: { annual_rate: 3.5, history: [] }
        }
      };
      const nextNotificationTime = new Date('2024-01-01T09:00:00');

      getCoinState.mockResolvedValue({ status: 'alert' });
      isWithinNotificationHours.mockReturnValue(false);
      getNextNotificationTime.mockReturnValue(nextNotificationTime);

      await monitorModule.checkCoinThreshold(mockEnv, coin, lowRateData, mockConfig);

      expect(sendRecovery).not.toHaveBeenCalled();
      expect(scheduleNotification).toHaveBeenCalledWith(
        mockEnv,
        coin.symbol,
        'recovery',
        expect.objectContaining({
          scheduled_time: nextNotificationTime.toISOString()
        })
      );
      expect(updateCoinState).toHaveBeenCalledWith(
        mockEnv,
        coin.symbol,
        'normal',
        expect.objectContaining({
          last_rate: 3.5,
          pending_notification: true
        })
      );
    });

    it('应该在状态正常且利率正常时不发送任何通知', async () => {
      const coin = { symbol: 'USDT', threshold: 5.0 };
      const lowRateData = {
        coins: {
          USDT: { annual_rate: 3.5, history: [] }
        }
      };

      getCoinState.mockResolvedValue({ status: 'normal' });

      await monitorModule.checkCoinThreshold(mockEnv, coin, lowRateData, mockConfig);

      expect(sendAlert).not.toHaveBeenCalled();
      expect(sendRecovery).not.toHaveBeenCalled();
      expect(updateCoinState).not.toHaveBeenCalled();
    });
  });

  describe('边界条件测试', () => {
    it('应该处理利率等于阈值的情况', async () => {
      const coin = { symbol: 'USDT', threshold: 5.0 };
      const equalRateData = {
        coins: {
          USDT: { annual_rate: 5.0, history: [] }
        }
      };

      getCoinState.mockResolvedValue({ status: 'alert' });

      await checkCoinThreshold(mockEnv, coin, equalRateData, mockConfig);

      expect(sendRecovery).toHaveBeenCalledWith(
        mockEnv,
        coin,
        5.0,
        mockConfig
      );
    });

    it('应该处理空的历史数据', async () => {
      const coin = { symbol: 'USDT', threshold: 5.0 };
      const rateDataWithoutHistory = {
        coins: {
          USDT: { annual_rate: 8.5, history: [] }
        }
      };

      await checkCoinThreshold(mockEnv, coin, rateDataWithoutHistory, mockConfig);

      expect(sendAlert).toHaveBeenCalledWith(
        mockEnv,
        coin,
        8.5,
        rateDataWithoutHistory,
        mockConfig
      );
    });

    it('应该处理状态为空的情况', async () => {
      const coin = { symbol: 'USDT', threshold: 5.0 };

      getCoinState.mockResolvedValue({}); // 空状态

      await monitorModule.checkCoinThreshold(mockEnv, coin, mockRateData, mockConfig);

      expect(sendAlert).toHaveBeenCalledWith(
        mockEnv,
        coin,
        8.5,
        mockRateData,
        mockConfig
      );
    });
  });
});