/**
 * 多币种邮件发送测试脚本
 * 使用真实的 EmailJS 配置发送多币种测试邮件
 */

import { sendAlert, sendRecovery } from '../src/modules/email.js';

// 真实的环境变量配置
const env = {
  EMAILJS_SERVICE_ID: 'service_njwa17p',
  EMAILJS_TEMPLATE_ID: 'template_2a6ntkh',
  EMAILJS_PUBLIC_KEY: 'R2I8depNfmvcV7eTz',
  EMAILJS_PRIVATE_KEY: 'R2I8depNfmvcV7eTz',
  CONFIG_KV: {
    put: async (key, value) => {
      console.log(`KV 存储: ${key} = ${value.substring(0, 100)}...`);
    }
  },
  STATE_KV: {
    put: async (key, value) => {
      console.log(`状态存储: ${key} = ${value.substring(0, 100)}...`);
    }
  }
};

// 测试配置
const testCoin = {
  symbol: 'USDT',
  exchange: 'Binance',
  timeframe: '1h',
  threshold: 5.0,
  enabled: true
};

const testRateData = {
  exchange: 'Binance',
  coins: {
    USDT: {
      annual_rate: 8.5,
      history: [
        { time: '14:00', rate: 8.5 },
        { time: '13:00', rate: 7.8 },
        { time: '12:00', rate: 7.2 },
        { time: '11:00', rate: 6.5 },
        { time: '10:00', rate: 5.8 }
      ]
    }
  }
};

const testConfig = {
  email: '86978970@qq.com',
  repeat_interval: 3,
  monitoring_enabled: true
};

async function testRealEmail() {
  console.log('🚀 开始多币种邮件发送测试...');
  console.log('📧 测试邮箱: 86978970@qq.com');
  console.log('📊 测试数据: USDT 利率 8.5% (阈值: 5.0%)，包含多币种状态');
  console.log('🎨 邮件模板: 多币种监控模板 (template_2a6ntkh)');
  console.log('');

  try {
    // 测试警报邮件
    console.log('📤 发送警报邮件...');
    const alertResult = await sendAlert(env, testCoin, 8.5, testRateData, testConfig);

    if (alertResult) {
      console.log('✅ 警报邮件发送成功！');
    } else {
      console.log('❌ 警报邮件发送失败！');
    }

    // 等待 2 秒再发送第二封邮件
    console.log('⏳ 等待 2 秒...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 测试回落通知邮件
    console.log('📤 发送回落通知邮件...');
    const recoveryResult = await sendRecovery(env, testCoin, 4.5, testConfig);

    if (recoveryResult) {
      console.log('✅ 回落通知邮件发送成功！');
    } else {
      console.log('❌ 回落通知邮件发送失败！');
    }

    console.log('');
    console.log('🎉 多币种邮件测试完成！');
    console.log('📬 请检查您的邮箱: 86978970@qq.com');
    console.log('📋 邮件内容应包含: 触发币种详情 + 历史数据表格 + 所有币种状态');

  } catch (error) {
    console.error('❌ 邮件发送异常:', error);
  }
}

// 运行测试
testRealEmail().catch(console.error);