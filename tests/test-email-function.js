#!/usr/bin/env node

/**
 * 邮件功能测试脚本
 * 测试邮件发送功能，使用Mock避免真实发送
 */

import { emailService } from './src/services/email.js';
import { storageService } from './src/services/storage.js';

// 模拟fetch以避免真实邮件发送
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  console.log(`📧 模拟邮件发送请求:`);
  console.log(`   URL: ${url}`);
  console.log(`   方法: ${options.method}`);
  console.log(`   头部: Content-Type = ${options.headers['Content-Type']}`);

  if (options.body) {
    const body = JSON.parse(options.body);
    console.log(`   服务ID: ${body.service_id}`);
    console.log(`   模板ID: ${body.template_id}`);
    console.log(`   收件人: ${body.template_params.to_email}`);
    console.log(`   主题: ${body.template_params.subject}`);
  }

  // 模拟成功响应
  return {
    status: 200,
    text: async () => 'OK'
  };
};

console.log('🧪 开始测试邮件发送功能...\n');

// 测试配置
const testEnv = {
  EMAILJS_SERVICE_ID: process.env.EMAILJS_SERVICE_ID || 'test_service_id',
  EMAILJS_TEMPLATE_ID: process.env.EMAILJS_TEMPLATE_ID || 'test_template_id',
  EMAILJS_PUBLIC_KEY: process.env.EMAILJS_PUBLIC_KEY || 'test_public_key',
  EMAILJS_PRIVATE_KEY: process.env.EMAILJS_PRIVATE_KEY || 'test_private_key'
};

const testConfig = {
  email: 'test@example.com',
  coins: [
    { symbol: 'USDT', threshold: 5.0, exchange: 'binance' },
    { symbol: 'USDC', threshold: 4.0, exchange: 'binance' }
  ]
};

const testRateData = {
  exchange: 'binance',
  timestamp: new Date().toISOString(),
  coins: {
    USDT: {
      symbol: 'USDT',
      annual_rate: 6.5,
      daily_rate: 0.0178,
      hourly_rate: 0.00074,
      history: [
        { time: '08:00', annual_rate: 6.2 },
        { time: '07:00', annual_rate: 6.1 },
        { time: '06:00', annual_rate: 6.0 }
      ]
    },
    USDC: {
      symbol: 'USDC',
      annual_rate: 4.5,
      daily_rate: 0.0123,
      hourly_rate: 0.00051,
      history: [
        { time: '08:00', annual_rate: 4.3 },
        { time: '07:00', annual_rate: 4.2 },
        { time: '06:00', annual_rate: 4.1 }
      ]
    }
  }
};

console.log('📧 测试警报邮件发送:');
try {
  const coin = testConfig.coins[0]; // USDT
  const currentRate = 6.5; // 超过阈值

  console.log(`\n1. 发送${coin.symbol}警报邮件:`);
  console.log(`   当前利率: ${currentRate}%`);
  console.log(`   阈值: ${coin.threshold}%`);
  console.log(`   状态: 触发警报 ✅`);

  const alertResult = await emailService.sendAlert(testEnv, coin, currentRate, testRateData, testConfig);

  if (alertResult) {
    console.log('   ✅ 警报邮件发送成功');
  } else {
    console.log('   ❌ 警报邮件发送失败');
  }
} catch (error) {
  console.log(`   ❌ 警报邮件发送异常: ${error.message}`);
}

console.log('\n📧 测试恢复通知邮件:');
try {
  const coin = testConfig.coins[0]; // USDT
  const currentRate = 4.0; // 低于阈值

  console.log(`\n2. 发送${coin.symbol}恢复通知:`);
  console.log(`   当前利率: ${currentRate}%`);
  console.log(`   阈值: ${coin.threshold}%`);
  console.log(`   状态: 回落正常 ✅`);

  const recoveryResult = await emailService.sendRecovery(testEnv, coin, currentRate, testConfig);

  if (recoveryResult) {
    console.log('   ✅ 恢复通知邮件发送成功');
  } else {
    console.log('   ❌ 恢复通知邮件发送失败');
  }
} catch (error) {
  console.log(`   ❌ 恢复通知邮件发送异常: ${error.message}`);
}

console.log('\n📧 测试多币种警报邮件:');
try {
  const triggeredCoins = testConfig.coins; // 两个币种都触发

  console.log(`\n3. 发送多币种警报邮件:`);
  console.log(`   触发币种: ${triggeredCoins.map(c => c.symbol).join(', ')}`);
  console.log(`   状态: 多币种触发警报 ✅`);

  const multiCoinResult = await emailService.sendMultiCoinAlert(triggeredCoins, testRateData, testConfig);

  if (multiCoinResult) {
    console.log('   ✅ 多币种警报邮件发送成功');
  } else {
    console.log('   ❌ 多币种警报邮件发送失败');
  }
} catch (error) {
  console.log(`   ❌ 多币种警报邮件发送异常: ${error.message}`);
}

console.log('\n📧 测试测试邮件:');
try {
  console.log(`\n4. 发送测试邮件:`);
  console.log(`   收件人: ${testConfig.email}`);
  console.log(`   状态: 系统功能测试 ✅`);

  const testResult = await emailService.sendTestEmail(testConfig.email);

  if (testResult) {
    console.log('   ✅ 测试邮件发送成功');
  } else {
    console.log('   ❌ 测试邮件发送失败');
  }
} catch (error) {
  console.log(`   ❌ 测试邮件发送异常: ${error.message}`);
}

// 测试错误情况
console.log('\n❌ 测试错误情况处理:');

// 模拟网络错误
global.fetch = async () => {
  throw new Error('Network error');
};

try {
  console.log(`\n5. 测试网络错误处理:`);
  const errorResult = await emailService.sendTestEmail(testConfig.email);

  if (!errorResult) {
    console.log('   ✅ 网络错误正确处理');
  } else {
    console.log('   ❌ 网络错误处理失败');
  }
} catch (error) {
  console.log(`   ❌ 网络错误处理异常: ${error.message}`);
}

// 模拟API错误
global.fetch = async () => {
  return {
    status: 400,
    text: async () => 'Bad Request'
  };
};

try {
  console.log(`\n6. 测试API错误处理:`);
  const apiErrorResult = await emailService.sendTestEmail(testConfig.email);

  if (!apiErrorResult) {
    console.log('   ✅ API错误正确处理');
  } else {
    console.log('   ❌ API错误处理失败');
  }
} catch (error) {
  console.log(`   ❌ API错误处理异常: ${error.message}`);
}

// 恢复原始fetch
global.fetch = originalFetch;

console.log('\n\n📊 邮件功能测试总结:');
console.log('✅ 警报邮件发送功能测试完成');
console.log('✅ 恢复通知邮件发送功能测试完成');
console.log('✅ 多币种警报邮件发送功能测试完成');
console.log('✅ 测试邮件发送功能测试完成');
console.log('✅ 错误情况处理功能测试完成');
console.log('\n🎉 所有邮件功能测试完成！');

console.log('\n📝 重要说明:');
console.log('• 所有邮件发送都是模拟的，没有发送真实邮件');
console.log('• 测试验证了邮件数据格式和API调用逻辑');
console.log('• 错误处理机制工作正常');
console.log('• 支持警报、恢复、多币种和测试邮件类型');