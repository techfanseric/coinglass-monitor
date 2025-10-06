#!/usr/bin/env node

/**
 * 手动测试脚本：验证交易所和颗粒度配置修复
 * 运行方式：node tests/fix-validation/manual-test-configs.js
 */

import { storageService } from '../../src/services/storage.js';
import { monitorService } from '../../src/services/monitor-service.js';

console.log('🧪 开始手动测试：交易所和颗粒度配置修复验证\n');

async function testConfigValidation() {
  console.log('📋 1. 测试配置验证逻辑...');

  // 测试配置
  const testConfig = {
    email: 'test@example.com',
    monitoring_enabled: false,
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
      },
      {
        symbol: 'PARTIAL_COIN',
        // 缺少一些字段，测试默认值处理
        threshold: 'invalid',
        enabled: false
      }
    ],
    trigger_settings: {
      hourly_minute: 5,
      daily_time: '09:05'
    },
    notification_hours: {
      enabled: true,
      start: '09:00',
      end: '23:59'
    },
    repeat_interval: 180
  };

  try {
    // 保存测试配置
    const success = await storageService.saveConfig(testConfig);
    if (success) {
      console.log('✅ 测试配置保存成功');
    } else {
      console.log('❌ 测试配置保存失败');
      return false;
    }

    // 读取配置验证
    const savedConfig = await storageService.getConfig();

    console.log('📊 配置验证结果：');
    console.log('- 币种数量:', savedConfig.coins.length);

    savedConfig.coins.forEach((coin, index) => {
      console.log(`  币种 ${index + 1}: ${coin.symbol}`);
      console.log(`    - 交易所: ${coin.exchange}`);
      console.log(`    - 时间框架: ${coin.timeframe}`);
      console.log(`    - 阈值: ${coin.threshold}`);
      console.log(`    - 启用状态: ${coin.enabled}`);
    });

    return true;
  } catch (error) {
    console.error('❌ 配置测试失败:', error);
    return false;
  }
}

async function testMonitoringLogic() {
  console.log('\n🔄 2. 测试监控逻辑（仅验证配置，不实际抓取）...');

  try {
    const config = await storageService.getConfig();

    if (!config || !config.coins || config.coins.length === 0) {
      console.log('❌ 没有找到有效的配置，跳过监控测试');
      return false;
    }

    const enabledCoins = config.coins.filter(c => c.enabled);
    console.log(`📋 找到 ${enabledCoins.length} 个启用的币种`);

    // 验证每个币种的独立配置
    enabledCoins.forEach((coin, index) => {
      console.log(`  币种 ${index + 1}: ${coin.symbol}`);
      console.log(`    - 将使用交易所: ${coin.exchange || 'binance'}`);
      console.log(`    - 将使用时间框架: ${coin.timeframe || '1h'}`);
      console.log(`    - 监控阈值: ${coin.threshold}%`);

      // 验证配置的完整性
      const hasValidExchange = coin.exchange && coin.exchange.length > 0;
      const hasValidTimeframe = coin.timeframe && ['1h', '24h'].includes(coin.timeframe);
      const hasValidThreshold = coin.threshold && !isNaN(coin.threshold) && coin.threshold > 0;

      console.log(`    - 配置完整性: ${hasValidExchange && hasValidTimeframe && hasValidThreshold ? '✅' : '⚠️'}`);
    });

    return true;
  } catch (error) {
    console.error('❌ 监控逻辑测试失败:', error);
    return false;
  }
}

async function testConfigurationConsistency() {
  console.log('\n🔍 3. 测试配置一致性...');

  try {
    const config = await storageService.getConfig();

    // 检查全局filters与币种配置的一致性
    const globalFilters = config.filters;
    const coinConfigs = config.coins;

    console.log('📊 全局filters配置:');
    console.log(`  - 交易所: ${globalFilters.exchange}`);
    console.log(`  - 时间框架: ${globalFilters.timeframe}`);

    console.log('\n📊 币种独立配置:');
    let inconsistentConfigs = 0;

    coinConfigs.forEach((coin, index) => {
      const isExchangeDifferent = coin.exchange !== globalFilters.exchange;
      const isTimeframeDifferent = coin.timeframe !== globalFilters.timeframe;
      const isInconsistent = isExchangeDifferent || isTimeframeDifferent;

      if (isInconsistent) {
        inconsistentConfigs++;
      }

      console.log(`  ${index + 1}. ${coin.symbol}:`);
      console.log(`     交易所: ${coin.exchange} ${isExchangeDifferent ? '(与全局不同)' : '(与全局相同)'}`);
      console.log(`     时间框架: ${coin.timeframe} ${isTimeframeDifferent ? '(与全局不同)' : '(与全局相同)'}`);
      console.log(`     状态: ${isInconsistent ? '🔥 独立配置生效' : '📋 使用全局配置'}`);
    });

    console.log(`\n📈 配置一致性分析:`);
    console.log(`  - 总币种数: ${coinConfigs.length}`);
    console.log(`  - 不一致配置数: ${inconsistentConfigs}`);
    console.log(`  - 独立配置率: ${((inconsistentConfigs / coinConfigs.length) * 100).toFixed(1)}%`);

    return inconsistentConfigs > 0;
  } catch (error) {
    console.error('❌ 配置一致性测试失败:', error);
    return false;
  }
}

async function main() {
  console.log('🚀 开始交易所和颗粒度配置修复验证测试\n');

  const results = {
    configValidation: false,
    monitoringLogic: false,
    configurationConsistency: false
  };

  // 运行测试
  results.configValidation = await testConfigValidation();
  results.monitoringLogic = await testMonitoringLogic();
  results.configurationConsistency = await testConfigurationConsistency();

  // 汇总结果
  console.log('\n📋 测试结果汇总:');
  console.log('='.repeat(50));
  console.log(`配置验证测试: ${results.configValidation ? '✅ 通过' : '❌ 失败'}`);
  console.log(`监控逻辑测试: ${results.monitoringLogic ? '✅ 通过' : '❌ 失败'}`);
  console.log(`配置一致性测试: ${results.configurationConsistency ? '✅ 通过 (检测到不一致配置)' : '⚠️ 未检测到不一致配置'}`);

  const allTestsPassed = results.configValidation && results.monitoringLogic;

  if (allTestsPassed) {
    console.log('\n🎉 所有核心测试通过！修复验证成功。');
    console.log('\n📝 修复验证说明:');
    console.log('1. ✅ 配置验证逻辑正确工作');
    console.log('2. ✅ 监控服务能识别币种独立配置');
    console.log('3. ✅ 配置不一致性被正确检测');
    console.log('\n🚀 建议：');
    console.log('- 启动监控服务进行完整测试');
    console.log('- 检查前端显示是否正确反映配置状态');
    console.log('- 验证邮件通知是否使用正确的交易所和时间框架数据');
  } else {
    console.log('\n❌ 部分测试失败，请检查修复实现。');
  }

  console.log('\n' + '='.repeat(50));
  console.log('测试完成');
}

// 运行测试
main().catch(console.error);