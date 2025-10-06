#!/usr/bin/env node

/**
 * 快速验证脚本：交易所和颗粒度配置修复验证
 * 运行方式：node tests/fix-validation/quick-verify.js
 */

import { storageService } from '../../src/services/storage.js';

console.log('⚡ 快速验证：交易所和颗粒度配置修复\n');

async function quickVerify() {
  try {
    // 1. 检查配置文件
    console.log('📋 1. 检查配置文件...');
    const config = await storageService.getConfig();

    if (!config) {
      console.log('❌ 配置文件不存在或无法读取');
      return false;
    }

    const enabledCoins = config.coins?.filter(c => c.enabled) || [];
    console.log(`✅ 配置文件读取成功`);
    console.log(`   - 启用币种数: ${enabledCoins.length}`);
    console.log(`   - 监控状态: ${config.monitoring_enabled ? '✅ 已启用' : '❌ 已禁用'}`);

    // 2. 分析配置分布
    console.log('\n📊 2. 分析配置分布...');
    const exchangeStats = {};
    const timeframeStats = {};

    enabledCoins.forEach(coin => {
      const exchange = coin.exchange || 'binance';
      const timeframe = coin.timeframe || '1h';

      exchangeStats[exchange] = (exchangeStats[exchange] || 0) + 1;
      timeframeStats[timeframe] = (timeframeStats[timeframe] || 0) + 1;
    });

    console.log('   交易所分布:', Object.entries(exchangeStats).map(([e, c]) => `${e}(${c})`).join(', '));
    console.log('   时间框架分布:', Object.entries(timeframeStats).map(([t, c]) => `${t}(${c})`).join(', '));

    // 3. 检查配置完整性
    console.log('\n🔍 3. 检查配置完整性...');
    let incompleteConfigs = 0;

    enabledCoins.forEach((coin, index) => {
      const hasExchange = !!coin.exchange;
      const hasTimeframe = !!coin.timeframe;
      const hasThreshold = !!coin.threshold && !isNaN(coin.threshold);

      if (!hasExchange || !hasTimeframe || !hasThreshold) {
        incompleteConfigs++;
        console.log(`   ⚠️ 币种 ${index + 1} (${coin.symbol}): ${!hasExchange ? '交易所缺失 ' : ''}${!hasTimeframe ? '时间框架缺失 ' : ''}${!hasThreshold ? '阈值缺失' : ''}`);
      }
    });

    if (incompleteConfigs === 0) {
      console.log('   ✅ 所有币种配置完整');
    }

    // 4. 检查重复币种
    console.log('\n🔄 4. 检查重复币种...');
    const symbolCounts = {};
    enabledCoins.forEach(coin => {
      symbolCounts[coin.symbol] = (symbolCounts[coin.symbol] || 0) + 1;
    });

    const duplicateCoins = Object.entries(symbolCounts).filter(([symbol, count]) => count > 1);

    if (duplicateCoins.length > 0) {
      console.log(`   📝 发现 ${duplicateCoins.length} 个重复币种:`);
      duplicateCoins.forEach(([symbol, count]) => {
        const configs = enabledCoins.filter(c => c.symbol === symbol);
        const details = configs.map(c => `${c.exchange}/${c.timeframe}`).join(', ');
        console.log(`      ${symbol} (x${count}): ${details}`);
      });
    } else {
      console.log('   ✅ 无重复币种');
    }

    // 5. 验证结果
    console.log('\n🎯 5. 验证结果汇总...');
    const hasMultipleExchanges = Object.keys(exchangeStats).length > 1;
    const hasMultipleTimeframes = Object.keys(timeframeStats).length > 1;
    const allConfigsComplete = incompleteConfigs === 0;
    const hasValidCoinCount = enabledCoins.length > 0;

    console.log(`   多交易所配置: ${hasMultipleExchanges ? '✅' : '⚠️'}`);
    console.log(`   多时间框架配置: ${hasMultipleTimeframes ? '✅' : '⚠️'}`);
    console.log(`   配置完整性: ${allConfigsComplete ? '✅' : '❌'}`);
    console.log(`   有效币种数量: ${hasValidCoinCount ? '✅' : '❌'}`);

    const overallSuccess = hasValidCoinCount && allConfigsComplete;

    if (overallSuccess) {
      console.log('\n🎉 快速验证通过！');
      console.log('\n💡 下一步操作：');
      console.log('   1. 重启服务器: npm start');
      console.log('   2. 手动触发监控测试');
      console.log('   3. 检查邮件通知内容');
      console.log('   4. 观察系统日志输出');
    } else {
      console.log('\n⚠️ 验证发现问题，请检查配置。');
    }

    return overallSuccess;

  } catch (error) {
    console.error('❌ 快速验证失败:', error.message);
    return false;
  }
}

// 运行快速验证
quickVerify().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('验证脚本执行失败:', error);
  process.exit(1);
});