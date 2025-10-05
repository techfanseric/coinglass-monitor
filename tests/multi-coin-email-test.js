/**
 * 多币种邮件功能重点测试
 * 专门测试刚刚修复的邮件逻辑
 */

import { sendAlert, sendRecovery } from '../src/modules/email.js';

// 模拟环境变量
const env = {
  EMAILJS_SERVICE_ID: 'service_njwa17p',
  EMAILJS_TEMPLATE_ID: 'template_2a6ntkh',
  EMAILJS_PUBLIC_KEY: 'R2I8depNfmvcV7eTz',
  EMAILJS_PRIVATE_KEY: 'R2I8depNfmvcV7eTz',
  CONFIG_KV: {
    put: async (key, value) => {
      console.log(`✅ KV 存储: ${key}`);
    }
  },
  STATE_KV: {
    put: async (key, value) => {
      console.log(`✅ 状态存储: ${key}`);
    }
  }
};

// 测试配置
const testConfig = {
  email: '86978970@qq.com',
  repeat_interval: 3,
  monitoring_enabled: true
};

async function testMultiCoinLogic() {
  console.log('🎯 重点测试多币种邮件逻辑...');
  console.log('📧 测试邮箱: 86978970@qq.com');
  console.log('');

  try {
    // 测试1：单币种超过阈值
    console.log('📝 测试1: 单币种超过阈值');
    const singleCoinData = {
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
        },
        USDC: {
          annual_rate: 3.5,
          history: [
            { time: '14:00', rate: 3.5 },
            { time: '13:00', rate: 3.2 }
          ]
        }
      }
    };

    const singleCoin = {
      symbol: 'USDT',
      threshold: 5.0
    };

    const alert1 = await sendAlert(env, singleCoin, 8.5, singleCoinData, testConfig);
    console.log(`   单币种警报结果: ${alert1 ? '✅ 成功' : '❌ 失败'}`);

    // 等待2秒
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 测试2：多币种超过阈值
    console.log('\n📝 测试2: 多币种超过阈值');
    const multiCoinData = {
      exchange: 'Binance',
      coins: {
        USDT: {
          annual_rate: 9.2,
          history: [
            { time: '14:00', rate: 9.2 },
            { time: '13:00', rate: 8.8 },
            { time: '12:00', rate: 8.1 },
            { time: '11:00', rate: 7.5 },
            { time: '10:00', rate: 6.9 }
          ]
        },
        USDC: {
          annual_rate: 7.8,
          history: [
            { time: '14:00', rate: 7.8 },
            { time: '13:00', rate: 7.2 },
            { time: '12:00', rate: 6.8 }
          ]
        },
        BUSD: {
          annual_rate: 3.2,
          history: [
            { time: '14:00', rate: 3.2 },
            { time: '13:00', rate: 3.0 }
          ]
        }
      }
    };

    const multiCoin = {
      symbol: 'USDT',
      threshold: 5.0
    };

    const alert2 = await sendAlert(env, multiCoin, 9.2, multiCoinData, testConfig);
    console.log(`   多币种警报结果: ${alert2 ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   📊 应该显示: USDT(9.2%) USDC(7.8%) 超过阈值`);

    // 等待2秒
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 测试3：三个币种全部超过阈值
    console.log('\n📝 测试3: 三个币种全部超过阈值');
    const allCoinsData = {
      exchange: 'Binance',
      coins: {
        USDT: {
          annual_rate: 12.5,
          history: [
            { time: '14:00', rate: 12.5 },
            { time: '13:00', rate: 11.8 },
            { time: '12:00', rate: 11.2 },
            { time: '11:00', rate: 10.5 },
            { time: '10:00', rate: 9.8 }
          ]
        },
        USDC: {
          annual_rate: 8.9,
          history: [
            { time: '14:00', rate: 8.9 },
            { time: '13:00', rate: 8.3 },
            { time: '12:00', rate: 7.8 }
          ]
        },
        BUSD: {
          annual_rate: 6.7,
          history: [
            { time: '14:00', rate: 6.7 },
            { time: '13:00', rate: 6.2 },
            { time: '12:00', rate: 5.9 }
          ]
        }
      }
    };

    const allCoinsTrigger = {
      symbol: 'USDT',
      threshold: 5.0
    };

    const alert3 = await sendAlert(env, allCoinsTrigger, 12.5, allCoinsData, testConfig);
    console.log(`   三币种警报结果: ${alert3 ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   📊 应该显示: USDT(12.5%) USDC(8.9%) BUSD(6.7%) 全部超过阈值`);

    // 等待2秒
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 测试4：回落通知
    console.log('\n📝 测试4: 回落通知');
    const recovery = await sendRecovery(env, singleCoin, 4.2, testConfig);
    console.log(`   回落通知结果: ${recovery ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   📊 应该显示: USDT 已回落到 4.2%`);

    // 等待2秒
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 测试5：极大利率值
    console.log('\n📝 测试5: 极大利率值测试');
    const extremeRateData = {
      exchange: 'Binance',
      coins: {
        USDT: {
          annual_rate: 999.99,
          history: [
            { time: '14:00', rate: 999.99 },
            { time: '13:00', rate: 899.5 }
          ]
        },
        USDC: {
          annual_rate: 888.88,
          history: [
            { time: '14:00', rate: 888.88 },
            { time: '13:00', rate: 777.7 }
          ]
        }
      }
    };

    const extremeAlert = await sendAlert(env, singleCoin, 999.99, extremeRateData, testConfig);
    console.log(`   极大利率警报结果: ${extremeAlert ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   📊 应该显示: USDT(999.99%) USDC(888.88%) 极高利率`);

    console.log('\n🎉 多币种邮件逻辑测试完成！');
    console.log('📬 请检查邮箱 86978970@qq.com 查看以下邮件:');
    console.log('   1. 单币种警报邮件');
    console.log('   2. 多币种警报邮件');
    console.log('   3. 三币种全部警报邮件');
    console.log('   4. 回落通知邮件');
    console.log('   5. 极大利率警报邮件');
    console.log('\n📋 验证要点:');
    console.log('   ✅ 邮件标题显示所有触发币种');
    console.log('   ✅ 正文显示所有超过阈值的币种详情');
    console.log('   ✅ 包含完整的历史数据表格');
    console.log('   ✅ 显示所有币种的状态对比');
    console.log('   ✅ 正确的%符号和利率格式');
    console.log('   ✅ 智能的超额百分比计算');

  } catch (error) {
    console.error('❌ 测试过程中出现异常:', error);
  }
}

// 运行测试
testMultiCoinLogic().catch(console.error);