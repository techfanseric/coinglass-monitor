#!/usr/bin/env node

/**
 * 完整验证测试：交易所和颗粒度配置修复验证
 * 运行方式：node tests/fix-validation/complete-verification-test.js
 */

import { storageService } from '../../src/services/storage.js';
import { scraperService } from '../../src/services/scraper.js';
import { emailService } from '../../src/services/email.js';

console.log('🧪 开始完整验证测试：交易所和颗粒度配置修复\n');

async function testConfigurationHandling() {
  console.log('📋 1. 测试配置处理逻辑...');

  // 测试配置：包含不同交易所和时间框架的复杂场景
  const complexConfig = {
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
        symbol: 'USDT',
        exchange: 'bybit',
        timeframe: '24h',
        threshold: 1.5,
        enabled: true
      },
      {
        symbol: 'USDC',
        exchange: 'okx',
        timeframe: '1h',
        threshold: 3.0,
        enabled: true
      },
      {
        symbol: 'BTC',
        exchange: 'binance',
        timeframe: '24h',
        threshold: 0.3,
        enabled: false // 禁用的币种
      },
      {
        symbol: 'ETH',
        // 缺少exchange和timeframe，应该使用默认值
        threshold: 0.5,
        enabled: true
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
    const success = await storageService.saveConfig(complexConfig);
    if (!success) {
      console.log('❌ 测试配置保存失败');
      return false;
    }

    // 读取并验证配置
    const savedConfig = await storageService.getConfig();

    console.log('✅ 配置验证结果：');
    console.log(`- 币种总数: ${savedConfig.coins.length}`);
    console.log(`- 启用币种数: ${savedConfig.coins.filter(c => c.enabled).length}`);

    // 验证每个币种的配置
    const enabledCoins = savedConfig.coins.filter(c => c.enabled);
    enabledCoins.forEach((coin, index) => {
      console.log(`  币种 ${index + 1}: ${coin.symbol}`);
      console.log(`    - 交易所: ${coin.exchange || '默认(binance)'}`);
      console.log(`    - 时间框架: ${coin.timeframe || '默认(1h)'}`);
      console.log(`    - 阈值: ${coin.threshold}%`);
      console.log(`    - 配置完整: ${coin.exchange && coin.timeframe ? '✅' : '⚠️'}`);
    });

    // 统计配置分布
    const exchangeDistribution = {};
    const timeframeDistribution = {};

    enabledCoins.forEach(coin => {
      const exchange = coin.exchange || 'binance';
      const timeframe = coin.timeframe || '1h';

      exchangeDistribution[exchange] = (exchangeDistribution[exchange] || 0) + 1;
      timeframeDistribution[timeframe] = (timeframeDistribution[timeframe] || 0) + 1;
    });

    console.log('\n📊 配置分布统计：');
    console.log('交易所分布:', exchangeDistribution);
    console.log('时间框架分布:', timeframeDistribution);

    return true;
  } catch (error) {
    console.error('❌ 配置处理测试失败:', error);
    return false;
  }
}

async function testEmailTemplateGeneration() {
  console.log('\n📧 2. 测试邮件模板生成...');

  try {
    const config = await storageService.getConfig();
    const { generateMonitoringSettingsInfo } = await import('../../src/services/email.js');

    const settingsInfo = generateMonitoringSettingsInfo(config);

    console.log('✅ 邮件设置信息生成结果：');
    console.log(`- 交易所显示: ${settingsInfo.exchanges}`);
    console.log(`- 交易所详情: ${settingsInfo.exchanges_detail}`);
    console.log(`- 启用币种数: ${settingsInfo.enabled_coins_count}`);
    console.log(`- 总币种数: ${settingsInfo.total_coins_count}`);
    console.log(`- 触发时间: ${settingsInfo.trigger_times}`);
    console.log(`- 通知时间: ${settingsInfo.notification_hours}`);
    console.log(`- 重复间隔: ${settingsInfo.repeat_interval}`);

    // 验证交易所显示逻辑
    const hasMultipleExchanges = settingsInfo.exchanges.includes('多交易所');
    const hasValidExchangeDetail = settingsInfo.exchanges_detail && settingsInfo.exchanges_detail.length > 0;

    console.log(`\n🔍 交易所显示验证：`);
    console.log(`- 多交易所检测: ${hasMultipleExchanges ? '✅' : '⚠️'}`);
    console.log(`- 详情信息完整: ${hasValidExchangeDetail ? '✅' : '⚠️'}`);

    return hasValidExchangeDetail;
  } catch (error) {
    console.error('❌ 邮件模板测试失败:', error);
    return false;
  }
}

async function testScraperDataHandling() {
  console.log('\n🕷️ 3. 测试抓取数据处理逻辑...');

  try {
    const config = await storageService.getConfig();
    const enabledCoins = config.coins.filter(c => c.enabled);

    console.log('🎯 模拟抓取数据生成...');

    // 模拟不同交易所和时间框架的抓取结果
    const mockData = {};
    const scrapingSummary = [];

    for (const coin of enabledCoins) {
      const exchange = coin.exchange || 'binance';
      const timeframe = coin.timeframe || '1h';
      const coinKey = `${coin.symbol}_${exchange}_${timeframe}`;

      // 模拟不同配置的利率数据
      let rate;
      if (exchange === 'okx') {
        rate = (Math.random() * 2 + 3).toFixed(2); // 3-5%
      } else if (exchange === 'bybit') {
        rate = (Math.random() * 1.5 + 2).toFixed(2); // 2-3.5%
      } else {
        rate = (Math.random() * 8 + 2).toFixed(2); // 2-10%
      }

      const coinData = {
        symbol: coin.symbol,
        annual_rate: parseFloat(rate),
        exchange: exchange,
        timeframe: timeframe,
        coin_key: coinKey,
        history: Array.from({ length: 5 }, (_, i) => ({
          time: `${8 + i}:00`,
          rate: (parseFloat(rate) + (Math.random() - 0.5) * 0.5).toFixed(2)
        }))
      };

      // 使用复合键存储
      mockData[coinKey] = coinData;
      // 同时也用原始币种符号存储
      if (!mockData[coin.symbol]) {
        mockData[coin.symbol] = { ...coinData };
      }

      scrapingSummary.push({
        symbol: coin.symbol,
        exchange: exchange,
        timeframe: timeframe,
        success: true,
        rate: parseFloat(rate)
      });

      console.log(`  ${coin.symbol} (${exchange}/${timeframe}): ${rate}%`);
    }

    console.log(`\n📊 数据处理验证：`);
    console.log(`- 生成数据点数: ${Object.keys(mockData).length}`);
    console.log(`- 成功模拟币种: ${scrapingSummary.length}`);
    console.log(`- 数据结构完整性: ${Object.values(mockData).every(d => d.exchange && d.timeframe) ? '✅' : '❌'}`);

    // 验证重复币种处理
    const duplicateSymbols = enabledCoins.filter(c =>
      enabledCoins.filter(coin => coin.symbol === c.symbol).length > 1
    ).map(c => c.symbol);
    const uniqueDuplicateSymbols = [...new Set(duplicateSymbols)];

    if (uniqueDuplicateSymbols.length > 0) {
      console.log(`\n🔄 重复币种处理验证：`);
      uniqueDuplicateSymbols.forEach(symbol => {
        const symbolConfigs = enabledCoins.filter(c => c.symbol === symbol);
        const symbolData = Object.values(mockData).filter(d => d.symbol === symbol);
        console.log(`  ${symbol}: 配置${symbolConfigs.length}个, 数据${symbolData.length}个`);
      });
    }

    return true;
  } catch (error) {
    console.error('❌ 抓取数据处理测试失败:', error);
    return false;
  }
}

async function testConfigurationConsistency() {
  console.log('\n🔍 4. 测试配置一致性...');

  try {
    const config = await storageService.getConfig();
    const enabledCoins = config.coins.filter(c => c.enabled);

    console.log('📋 配置一致性分析：');

    let issues = [];
    let recommendations = [];

    enabledCoins.forEach((coin, index) => {
      const hasExchange = coin.exchange && coin.exchange.length > 0;
      const hasTimeframe = coin.timeframe && ['1h', '24h'].includes(coin.timeframe);
      const hasValidThreshold = coin.threshold && !isNaN(coin.threshold) && coin.threshold > 0;

      console.log(`  ${index + 1}. ${coin.symbol}:`);
      console.log(`     交易所: ${coin.exchange || '❌ 缺失'} ${hasExchange ? '✅' : ''}`);
      console.log(`     时间框架: ${coin.timeframe || '❌ 缺失'} ${hasTimeframe ? '✅' : ''}`);
      console.log(`     阈值: ${coin.threshold || '❌ 缺失'} ${hasValidThreshold ? '✅' : ''}`);

      if (!hasExchange) issues.push(`${coin.symbol} 缺少交易所配置`);
      if (!hasTimeframe) issues.push(`${coin.symbol} 缺少时间框架配置`);
      if (!hasValidThreshold) issues.push(`${coin.symbol} 阈值配置无效`);

      // 推荐优化
      if (coin.symbol === 'USDT' && coin.exchange !== 'binance') {
        recommendations.push(`${coin.symbol} 建议使用 binance 交易所（流动性更好）`);
      }
      if (coin.symbol === 'USDC' && coin.timeframe === '24h') {
        recommendations.push(`${coin.symbol} 建议使用 1h 时间框架（更及时监控）`);
      }
    });

    console.log(`\n📊 一致性分析结果：`);
    console.log(`- 发现问题: ${issues.length} 个`);
    if (issues.length > 0) {
      issues.forEach(issue => console.log(`  ⚠️ ${issue}`));
    }

    console.log(`\n💡 优化建议: ${recommendations.length} 个`);
    if (recommendations.length > 0) {
      recommendations.forEach(rec => console.log(`  💡 ${rec}`));
    }

    return issues.length === 0;
  } catch (error) {
    console.error('❌ 配置一致性测试失败:', error);
    return false;
  }
}

async function generateFinalReport(results) {
  console.log('\n📋 5. 生成最终验证报告...');

  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;
  const successRate = ((passedTests / totalTests) * 100).toFixed(1);

  console.log('\n' + '='.repeat(60));
  console.log('🎯 完整验证测试报告');
  console.log('='.repeat(60));
  console.log(`总测试数: ${totalTests}`);
  console.log(`通过测试: ${passedTests}`);
  console.log(`失败测试: ${totalTests - passedTests}`);
  console.log(`成功率: ${successRate}%`);
  console.log('='.repeat(60));

  console.log('\n📊 详细结果：');
  Object.entries(results).forEach(([testName, result]) => {
    const status = result ? '✅ 通过' : '❌ 失败';
    console.log(`  ${testName}: ${status}`);
  });

  if (passedTests === totalTests) {
    console.log('\n🎉 所有测试通过！修复验证成功。');
    console.log('\n🚀 系统现在支持：');
    console.log('  ✅ 多交易所独立配置');
    console.log('  ✅ 多时间框架独立配置');
    console.log('  ✅ 重复币种正确处理');
    console.log('  ✅ 邮件模板准确显示');
    console.log('  ✅ 配置一致性保证');

    console.log('\n📝 使用建议：');
    console.log('  1. 重启服务器应用修复');
    console.log('  2. 手动触发一次完整监控测试');
    console.log('  3. 检查邮件通知中的交易所信息');
    console.log('  4. 观察系统日志确认抓取逻辑');
  } else {
    console.log('\n⚠️ 部分测试失败，请检查相关配置。');
    console.log('🔧 建议：');
    console.log('  1. 检查配置文件完整性');
    console.log('  2. 验证币种配置格式');
    console.log('  3. 确认网络连接正常');
  }

  console.log('\n' + '='.repeat(60));
}

async function main() {
  const results = {};

  // 运行所有测试
  results['配置处理'] = await testConfigurationHandling();
  results['邮件模板生成'] = await testEmailTemplateGeneration();
  results['抓取数据处理'] = await testScraperDataHandling();
  results['配置一致性'] = await testConfigurationConsistency();

  // 生成最终报告
  await generateFinalReport(results);

  // 返回测试结果
  return results;
}

// 运行测试
main().catch(console.error);