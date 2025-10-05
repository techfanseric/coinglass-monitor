/**
 * 邮件内容结构验证测试
 * 验证刚刚修复的多币种邮件逻辑
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendAlert, sendRecovery } from '../../src/modules/email.js';

// 模拟 fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// 模拟 recordEmailHistory
vi.mock('../../src/utils/config.js', () => ({
  recordEmailHistory: vi.fn().mockResolvedValue(true)
}));

describe('邮件内容结构验证测试', () => {
  let mockEnv;
  let capturedEmailData = [];

  beforeEach(() => {
    vi.clearAllMocks();
    capturedEmailData = [];

    mockEnv = {
      EMAILJS_SERVICE_ID: 'service_test123',
      EMAILJS_TEMPLATE_ID: 'template_test456',
      EMAILJS_PUBLIC_KEY: 'public_key_test',
      EMAILJS_PRIVATE_KEY: 'private_key_test',
      CONFIG_KV: { put: vi.fn() },
      STATE_KV: { put: vi.fn() }
    };

    // 捕获所有发送的邮件数据
    mockFetch.mockImplementation((url, options) => {
      capturedEmailData.push(JSON.parse(options.body));
      return Promise.resolve({ status: 200 });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('多币种警报邮件内容验证', () => {
    it('应该正确生成包含多个触发币种的标题', async () => {
      const rateData = {
        exchange: 'Binance',
        coins: {
          USDT: { annual_rate: 9.2, history: [{ time: '14:00', rate: 9.2 }] },
          USDC: { annual_rate: 7.8, history: [{ time: '14:00', rate: 7.8 }] },
          BUSD: { annual_rate: 3.5, history: [] }
        }
      };

      const coin = { symbol: 'USDT', threshold: 5.0 };
      const config = { email: 'test@example.com' };

      await sendAlert(mockEnv, coin, 9.2, rateData, config);

      const emailParams = capturedEmailData[0].template_params;

      // 验证标题包含所有触发币种
      expect(emailParams.subject).toContain('USDT(9.2%)');
      expect(emailParams.subject).toContain('USDC(7.8%)');
      expect(emailParams.subject).not.toContain('BUSD'); // BUSD 未超过阈值

      console.log('✅ 邮件标题验证通过:', emailParams.subject);
    });

    it('应该包含所有超过阈值的币种详情', async () => {
      const rateData = {
        exchange: 'Binance',
        coins: {
          USDT: {
            annual_rate: 12.5,
            history: [
              { time: '14:00', rate: 12.5 },
              { time: '13:00', rate: 11.8 }
            ]
          },
          USDC: {
            annual_rate: 8.9,
            history: [
              { time: '14:00', rate: 8.9 },
              { time: '13:00', rate: 8.3 }
            ]
          },
          BUSD: {
            annual_rate: 6.7,
            history: [
              { time: '14:00', rate: 6.7 }
            ]
          }
        }
      };

      const coin = { symbol: 'USDT', threshold: 5.0 };
      const config = { email: 'test@example.com' };

      await sendAlert(mockEnv, coin, 12.5, rateData, config);

      const emailParams = capturedEmailData[0].template_params;

      // 验证触发币种数量
      expect(emailParams.triggered_count).toBe(3);

      // 验证每个触发币种的数据
      const triggeredCoins = emailParams.triggered_coins;
      expect(triggeredCoins).toHaveLength(3);

      // 验证 USDT 数据
      const usdtData = triggeredCoins.find(c => c.symbol === 'USDT');
      expect(usdtData.current_rate).toBe('12.5');
      expect(usdtData.threshold).toBe('5.0');
      expect(usdtData.excess).toBe('150.0'); // (12.5-5.0)/5.0*100 = 150%
      expect(usdtData.daily_rate).toBe('0.034'); // 12.5/365
      expect(usdtData.hourly_rate).toBe('0.0014'); // 12.5/365/24
      expect(usdtData.history).toHaveLength(2);

      // 验证 USDC 数据
      const usdcData = triggeredCoins.find(c => c.symbol === 'USDC');
      expect(usdcData.current_rate).toBe('8.9');
      expect(usdcData.excess).toBe('78.0'); // (8.9-5.0)/5.0*100 = 78%

      // 验证 BUSD 数据
      const busdData = triggeredCoins.find(c => c.symbol === 'BUSD');
      expect(busdData.current_rate).toBe('6.7');
      expect(busdData.excess).toBe('34.0'); // (6.7-5.0)/5.0*100 = 34%

      console.log('✅ 触发币种详情验证通过');
      console.log(`   - 触发币种数量: ${emailParams.triggered_count}`);
      console.log(`   - USDT: ${usdtData.current_rate}% (超额 ${usdtData.excess}%)`);
      console.log(`   - USDC: ${usdcData.current_rate}% (超额 ${usdcData.excess}%)`);
      console.log(`   - BUSD: ${busdData.current_rate}% (超额 ${busdData.excess}%)`);
    });

    it('应该包含所有币种的状态对比', async () => {
      const rateData = {
        exchange: 'Binance',
        coins: {
          USDT: { annual_rate: 8.5, history: [] }, // 超过阈值
          USDC: { annual_rate: 3.5, history: [] }, // 低于阈值
          BUSD: { annual_rate: 5.0, history: [] }  // 等于阈值
        }
      };

      const coin = { symbol: 'USDT', threshold: 5.0 };
      const config = { email: 'test@example.com' };

      await sendAlert(mockEnv, coin, 8.5, rateData, config);

      const emailParams = capturedEmailData[0].template_params;

      // 验证总币种数量
      expect(emailParams.total_coins).toBe(3);

      // 验证所有币种状态
      const allCoinsStatus = emailParams.all_coins_status;
      expect(allCoinsStatus).toHaveLength(3);

      // 验证 USDT 状态 (超过阈值)
      const usdtStatus = allCoinsStatus.find(c => c.symbol === 'USDT');
      expect(usdtStatus.annual_rate).toBe('8.5');
      expect(usdtStatus.is_above_threshold).toBe(true);

      // 验证 USDC 状态 (低于阈值)
      const usdcStatus = allCoinsStatus.find(c => c.symbol === 'USDC');
      expect(usdcStatus.annual_rate).toBe('3.5');
      expect(usdcStatus.is_above_threshold).toBe(false);

      // 验证 BUSD 状态 (等于阈值，不算超过)
      const busdStatus = allCoinsStatus.find(c => c.symbol === 'BUSD');
      expect(busdStatus.annual_rate).toBe('5.0');
      expect(busdStatus.is_above_threshold).toBe(false);

      console.log('✅ 所有币种状态验证通过');
      console.log(`   - 总币种数: ${emailParams.total_coins}`);
      console.log(`   - 超过阈值: ${allCoinsStatus.filter(c => c.is_above_threshold).length} 个`);
      console.log(`   - 正常范围: ${allCoinsStatus.filter(c => !c.is_above_threshold).length} 个`);
    });

    it('应该正确处理历史数据时间格式', async () => {
      const rateData = {
        exchange: 'Binance',
        coins: {
          USDT: {
            annual_rate: 8.5,
            history: [
              { time: '2024-01-01 14:00:00', rate: 8.5 },
              { time: '2024-01-01 13:00:00', rate: 7.8 },
              { time: '2024-01-01 12:00:00', rate: 7.2 }
            ]
          }
        }
      };

      const coin = { symbol: 'USDT', threshold: 5.0 };
      const config = { email: 'test@example.com' };

      await sendAlert(mockEnv, coin, 8.5, rateData, config);

      const emailParams = capturedEmailData[0].template_params;
      const usdtData = emailParams.triggered_coins.find(c => c.symbol === 'USDT');

      // 验证历史数据时间格式 (只保留时间部分)
      expect(usdtData.history[0].time).toBe('14:00');
      expect(usdtData.history[1].time).toBe('13:00');
      expect(usdtData.history[2].time).toBe('12:00');

      // 验证历史数据利率
      expect(usdtData.history[0].rate).toBe('8.5');
      expect(usdtData.history[1].rate).toBe('7.8');
      expect(usdtData.history[2].rate).toBe('7.2');

      console.log('✅ 历史数据时间格式验证通过');
      console.log(`   - 时间格式: ${usdtData.history[0].time}, ${usdtData.history[1].time}, ${usdtData.history[2].time}`);
    });

    it('应该正确处理回落通知邮件', async () => {
      const coin = { symbol: 'USDT', threshold: 5.0 };
      const config = { email: 'test@example.com' };

      await sendRecovery(mockEnv, coin, 4.2, config);

      const emailParams = capturedEmailData[0].template_params;

      // 验证回落通知标题
      expect(emailParams.subject).toContain('USDT-回落通知');

      // 验证回落通知数据
      expect(emailParams.triggered_count).toBe(1);
      expect(emailParams.triggered_coins).toHaveLength(1);

      const recoveryData = emailParams.triggered_coins[0];
      expect(recoveryData.symbol).toBe('USDT');
      expect(recoveryData.current_rate).toBe('4.2');
      expect(recoveryData.threshold).toBe('5.0');
      expect(recoveryData.excess).toBe('0'); // 回落通知超额为0
      expect(recoveryData.history).toHaveLength(0); // 回落通知不需要历史数据

      // 验证状态显示
      expect(emailParams.all_coins_status).toHaveLength(1);
      expect(emailParams.all_coins_status[0].is_above_threshold).toBe(false);

      console.log('✅ 回落通知邮件验证通过');
      console.log(`   - 标题: ${emailParams.subject}`);
      console.log(`   - 当前利率: ${recoveryData.current_rate}%`);
      console.log(`   - 阈值: ${recoveryData.threshold}%`);
      console.log(`   - 状态: 正常`);
    });

    it('应该正确处理极大利率值', async () => {
      const rateData = {
        exchange: 'Binance',
        coins: {
          USDT: { annual_rate: 999.99, history: [] },
          USDC: { annual_rate: 888.88, history: [] }
        }
      };

      const coin = { symbol: 'USDT', threshold: 5.0 };
      const config = { email: 'test@example.com' };

      await sendAlert(mockEnv, coin, 999.99, rateData, config);

      const emailParams = capturedEmailData[0].template_params;
      const triggeredCoins = emailParams.triggered_coins;

      // 验证极大利率处理
      const usdtData = triggeredCoins.find(c => c.symbol === 'USDT');
      const usdcData = triggeredCoins.find(c => c.symbol === 'USDC');

      expect(parseFloat(usdtData.current_rate)).toBeGreaterThan(999);
      expect(parseFloat(usdcData.current_rate)).toBeGreaterThan(888);

      // 验证超额百分比计算 (使用实际计算值)
      expect(parseFloat(usdtData.excess)).toBeGreaterThan(19000); // 极高超额百分比
      expect(parseFloat(usdcData.excess)).toBeGreaterThan(17000); // 极高超额百分比

      console.log('✅ 极大利率值验证通过');
      console.log(`   - USDT: ${usdtData.current_rate}% (超额 ${usdtData.excess}%)`);
      console.log(`   - USDC: ${usdcData.current_rate}% (超额 ${usdcData.excess}%)`);
    });
  });

  describe('邮件模板参数完整性验证', () => {
    it('应该包含所有必需的模板参数', async () => {
      const rateData = {
        exchange: 'Binance',
        coins: {
          USDT: { annual_rate: 8.5, history: [] },
          USDC: { annual_rate: 3.5, history: [] }
        }
      };

      const coin = { symbol: 'USDT', threshold: 5.0 };
      const config = { email: 'test@example.com' };

      await sendAlert(mockEnv, coin, 8.5, rateData, config);

      const emailParams = capturedEmailData[0].template_params;

      // 验证必需参数
      expect(emailParams.to_email).toBe('test@example.com');
      expect(emailParams.subject).toBeDefined();
      expect(emailParams.exchange_name).toBe('Binance');
      expect(emailParams.detection_time).toBeDefined();
      expect(emailParams.triggered_count).toBe(1);
      expect(emailParams.triggered_coins).toBeDefined();
      expect(emailParams.all_coins_status).toBeDefined();
      expect(emailParams.total_coins).toBe(2);
      expect(emailParams.check_interval).toBe('每小时');
      expect(emailParams.next_check_time).toBeDefined();

      console.log('✅ 邮件模板参数完整性验证通过');
      console.log(`   - 收件人: ${emailParams.to_email}`);
      console.log(`   - 交易所: ${emailParams.exchange_name}`);
      console.log(`   - 检测时间: ${emailParams.detection_time}`);
      console.log(`   - 检查间隔: ${emailParams.check_interval}`);
    });
  });
});

// 运行测试
console.log('🔍 开始邮件内容结构验证测试...');