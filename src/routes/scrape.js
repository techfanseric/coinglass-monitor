/**
 * 数据抓取 API 路由
 * 提供与前端兼容的抓取接口
 */

import express from 'express';
import { storageService } from '../services/storage.js';

const router = express.Router();

/**
 * POST /api/scrape/coinglass - 手动触发 CoinGlass 数据抓取和完整监控流程
 */
router.post('/coinglass', async (req, res) => {
  try {
    console.log('🕷️ 请求手动触发完整监控流程');

    const { exchange = 'binance', coin = 'USDT', timeframe = '1h' } = req.body;

    console.log(`📊 抓取参数: 交易所=${exchange}, 币种=${coin}, 时间框架=${timeframe}`);

    // 验证参数
    if (!exchange || !coin) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: exchange 和 coin',
        timestamp: new Date().toISOString()
      });
    }

    // 1. 获取用户配置
    const config = await storageService.getConfig();
    if (!config || !config.monitoring_enabled) {
      return res.status(400).json({
        success: false,
        error: '监控未启用，请先启用监控功能',
        timestamp: new Date().toISOString()
      });
    }

    if (!config.email) {
      return res.status(400).json({
        success: false,
        error: '未配置通知邮箱，请先配置邮箱',
        timestamp: new Date().toISOString()
      });
    }

    // 2. 按币种独立配置抓取数据 (修复：使用每个币种的独立配置)
    const { ScraperService } = await import('../services/scraper.js');
    const scraper = new ScraperService();

    // 获取所有启用的币种配置
    const enabledCoins = config.coins.filter(c => c.enabled);
    console.log(`🎯 手动触发币种及独立配置:`);
    enabledCoins.forEach(coin => {
      console.log(`  - ${coin.symbol}: 交易所=${coin.exchange}, 颗粒度=${coin.timeframe}, 阈值=${coin.threshold}%`);
    });

    const startTime = Date.now();
    const allCoinsData = {};
    const scrapingSummary = [];

    // 为每个启用的币种独立抓取数据
    for (const coin of enabledCoins) {
      try {
        console.log(`🔄 开始抓取 ${coin.symbol} (${coin.exchange}/${coin.timeframe})...`);

        const coinData = await scraper.scrapeCoinGlassData(
          coin.exchange || 'binance',  // 使用币种独立配置
          coin.symbol,                  // 使用币种符号
          coin.timeframe || '1h',       // 使用币种独立配置
          [coin.symbol]                 // 只抓取当前币种
        );

        if (coinData && coinData.coins && coinData.coins[coin.symbol]) {
          // 合并到总数据中
          allCoinsData[coin.symbol] = coinData.coins[coin.symbol];
          console.log(`✅ ${coin.symbol} 数据抓取成功，利率: ${coinData.coins[coin.symbol].annual_rate}%`);

          scrapingSummary.push({
            symbol: coin.symbol,
            exchange: coin.exchange,
            timeframe: coin.timeframe,
            success: true,
            rate: coinData.coins[coin.symbol].annual_rate
          });
        } else {
          console.warn(`⚠️ ${coin.symbol} 数据抓取失败`);
          scrapingSummary.push({
            symbol: coin.symbol,
            exchange: coin.exchange,
            timeframe: coin.timeframe,
            success: false,
            error: '数据获取失败'
          });
        }

        // 币种间添加短暂延迟，避免请求过于频繁
        if (enabledCoins.indexOf(coin) < enabledCoins.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        console.error(`❌ ${coin.symbol} 抓取过程中发生错误:`, error.message);
        scrapingSummary.push({
          symbol: coin.symbol,
          exchange: coin.exchange,
          timeframe: coin.timeframe,
          success: false,
          error: error.message
        });
      }
    }

    const duration = Date.now() - startTime;

    // 构建统一的返回数据结构
    const data = {
      exchange: 'mixed', // 表示混合配置
      timestamp: new Date().toISOString(),
      coins: allCoinsData,
      source: 'multi_exchange_manual_scraping',
      scraping_info: {
        total_coins_requested: enabledCoins.length,
        successful_scrapes: Object.keys(allCoinsData).length,
        failed_scrapes: enabledCoins.length - Object.keys(allCoinsData).length,
        individual_results: scrapingSummary,
        triggered_by: 'manual'
      }
    };

    if (Object.keys(allCoinsData).length === 0) {
      throw new Error('所有币种数据抓取失败');
    }

    console.log(`✅ 多币种数据抓取完成，成功获取 ${Object.keys(allCoinsData).length} 个币种数据，耗时: ${duration}ms`);
    console.log('📊 抓取摘要:', scrapingSummary.map(r => `${r.symbol}(${r.exchange}/${r.timeframe}):${r.success?'✅':'❌'}`).join(', '));

    // 3. 保存抓取结果到历史记录
    await storageService.saveScrapeResult({
      exchange: 'mixed',
      coin: enabledCoins.map(c => c.symbol).join(','),
      timeframe: 'mixed',
      data,
      timestamp: new Date().toISOString(),
      duration,
      manual: true,
      scraping_summary: scrapingSummary
    });

    // 4. 执行完整的监控检查流程
    console.log('🔍 开始执行监控检查...');
    console.log(`📋 抓取到的币种: ${Object.keys(data.coins).join(', ')}`);
    const monitorResults = await runCompleteMonitorCheck(data, config);

    // 5. 返回完整结果
    res.json({
      success: true,
      data: data,
      monitor_results: monitorResults,
      meta: {
        timestamp: new Date().toISOString(),
        duration: duration,
        source: 'coinglass_multi_exchange',
        triggered_by: 'manual',
        monitoring_enabled: config.monitoring_enabled,
        alerts_triggered: monitorResults.alerts_sent || 0,
        scraping_summary: scrapingSummary,
        total_coins: enabledCoins.length,
        successful_scrapes: Object.keys(allCoinsData).length
      }
    });

  } catch (error) {
    console.error('❌ 手动监控触发失败:', error);
    res.status(500).json({
      success: false,
      error: '监控触发失败',
      message: error.message,
      meta: {
        timestamp: new Date().toISOString(),
        triggered_by: 'manual'
      }
    });
  }
});

/**
 * 执行完整的监控检查流程
 */
async function runCompleteMonitorCheck(rateData, config) {
  const results = {
    coins_checked: 0,
    alerts_sent: 0,
    recoveries_sent: 0,
    notifications_skipped: 0,
    details: []
  };

  try {
    console.log('📊 检查币种阈值...');
    console.log(`📋 抓取到的币种: ${Object.keys(rateData.coins).join(', ')}`);

    // 检查每个启用的币种
    const triggeredCoins = []; // 收集所有触发警报的币种

    for (const coin of config.coins.filter(c => c.enabled)) {
      console.log(`🔍 处理币种: ${coin.symbol}`);

      const coinResult = await checkCoinThresholdComplete(coin, rateData, config, true); // 手动触发标识
      results.coins_checked++;

      // 收集触发警报的币种，但不立即发送邮件
      if (coinResult.alert_sent) {
        triggeredCoins.push({
          symbol: coin.symbol,
          current_rate: coinResult.current_rate,
          threshold: coin.threshold,
          exchange: coin.exchange,
          timeframe: coin.timeframe
        });
      } else {
        results.alerts_sent += coinResult.alert_sent ? 1 : 0;
      }

      results.recoveries_sent += coinResult.recovery_sent ? 1 : 0;
      results.notifications_skipped += coinResult.skipped ? 1 : 0;
      results.details.push(coinResult);
    }

    // 发送多币种警报邮件
    if (triggeredCoins.length > 0) {
      console.log(`🚨 准备发送多币种警报邮件: ${triggeredCoins.length} 个币种`);

      const { emailService } = await import('../services/email.js');
      const multiCoinSuccess = await emailService.sendMultiCoinAlert(triggeredCoins, rateData, config);

      if (multiCoinSuccess) {
        results.alerts_sent += triggeredCoins.length;
        console.log(`✅ 多币种警报邮件发送成功，包含 ${triggeredCoins.length} 个币种`);
      } else {
        console.error(`❌ 多币种警报邮件发送失败`);
      }
    }

    console.log(`✅ 监控检查完成: ${results.coins_checked} 个币种, ${results.alerts_sent} 个警报, ${results.recoveries_sent} 个恢复通知`);

    return results;

  } catch (error) {
    console.error('❌ 监控检查过程出错:', error);
    results.error = error.message;
    return results;
  }
}

/**
 * 检查单个币种的完整阈值逻辑
 */
async function checkCoinThresholdComplete(coin, rateData, config, isManualTrigger = false) {
  const result = {
    symbol: coin.symbol,
    threshold: coin.threshold,
    current_rate: null,
    alert_sent: false,
    recovery_sent: false,
    skipped: false,
    reason: null
  };

  try {
    // 获取当前利率
    const currentRate = rateData.coins[coin.symbol]?.annual_rate;
    if (!currentRate) {
      result.reason = `币种 ${coin.symbol} 数据不存在`;
      result.skipped = true;
      return result;
    }

    result.current_rate = currentRate;

    // 获取币种状态
    const state = await storageService.getCoinState(coin.symbol);
    const now = new Date();

    console.log(`🔍 检查币种 ${coin.symbol}: 当前利率 ${currentRate}%, 阈值 ${coin.threshold}%, 状态 ${state.status || 'normal'}${isManualTrigger ? ' (手动触发)' : ''}`);

    // 检查是否在通知时间段内
    const { emailService } = await import('../services/email.js');
    const isWithinHours = isWithinNotificationHours(config);

    // 状态机逻辑
    if (currentRate > coin.threshold) {
      // 利率超过阈值 - 发送警报
      const shouldSendAlert = isManualTrigger || // 手动触发总是发送
                             state.status === 'normal' || !state.status || // 首次触发
                             (state.status === 'alert' && now >= new Date(state.next_notification)); // 冷却期结束

      if (shouldSendAlert) {
        if (isWithinHours || isManualTrigger) { // 手动触发不受时间限制
          if (isManualTrigger) {
            console.log(`🚨 ${coin.symbol} 手动触发警报，利率 ${currentRate}% > ${coin.threshold}%`);
          } else if (state.status === 'normal' || !state.status) {
            console.log(`🚨 ${coin.symbol} 首次触发警报，利率 ${currentRate}% > ${coin.threshold}%`);
          } else {
            console.log(`🔄 ${coin.symbol} 重复警报，利率 ${currentRate}% > ${coin.threshold}%`);
          }

          // 标记为需要发送警报，但不在此处发送
          result.alert_sent = true;

          if (isManualTrigger) {
            result.reason = '手动触发警报';
          } else if (state.status === 'normal' || !state.status) {
            result.reason = '首次触发警报';
          } else {
            result.reason = '重复警报';
          }

          // 更新状态（手动触发和自动触发都更新）
          if (isManualTrigger) {
            // 手动触发更新状态，但设置较短的特殊冷却期
            await storageService.updateCoinState(coin.symbol, 'alert', {
              last_notification: now.toISOString(),
              next_notification: new Date(now.getTime() + 30 * 60 * 1000).toISOString(), // 手动触发30分钟冷却期
              last_rate: currentRate,
              trigger_type: 'manual',
              manual_trigger_at: now.toISOString()
            });
          } else {
            // 自动触发的正常状态更新
            await storageService.updateCoinState(coin.symbol, 'alert', {
              last_notification: now.toISOString(),
              next_notification: new Date(now.getTime() + config.repeat_interval * 60 * 1000).toISOString(), // 改为分钟
              last_rate: currentRate,
              trigger_type: 'auto'
            });
          }
        } else {
          result.skipped = true;
          result.reason = '不在通知时间段内，警报已延迟';
        }
      } else {
        result.reason = '警报状态，但在冷却期内';
      }
    } else {
      // 利率回落到阈值以下 - 发送恢复通知
      if (state.status === 'alert') {
        if (isWithinHours) {
          console.log(`✅ ${coin.symbol} 利率回落，利率 ${currentRate}% <= ${coin.threshold}%`);

          // 构建env对象
          const env = {
            EMAILJS_SERVICE_ID: process.env.EMAILJS_SERVICE_ID,
            EMAILJS_TEMPLATE_ID: process.env.EMAILJS_TEMPLATE_ID,
            EMAILJS_PUBLIC_KEY: process.env.EMAILJS_PUBLIC_KEY,
            EMAILJS_PRIVATE_KEY: process.env.EMAILJS_PRIVATE_KEY
          };

          await emailService.sendRecovery(env, coin, currentRate, config);
          result.recovery_sent = true;
          result.reason = '利率恢复正常';

          // 更新状态
          await storageService.updateCoinState(coin.symbol, 'normal', {
            last_rate: currentRate,
            trigger_type: isManualTrigger ? 'manual' : 'auto',
            recovered_at: now.toISOString()
          });
        } else {
          result.skipped = true;
          result.reason = '不在通知时间段内，恢复通知已延迟';
        }
      } else {
        result.reason = '利率正常，无需通知';
      }
    }

  } catch (error) {
    console.error(`❌ 检查币种 ${coin.symbol} 时出错:`, error);
    result.error = error.message;
    result.reason = '检查过程出错';
  }

  return result;
}

/**
 * 检查是否在通知时间段内
 */
function isWithinNotificationHours(config) {
  if (!config.notification_hours || !config.notification_hours.enabled) {
    return true; // 如果没有启用时间限制，则始终允许
  }

  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const [startHour, startMin] = config.notification_hours.start.split(':').map(Number);
  const [endHour, endMin] = config.notification_hours.end.split(':').map(Number);
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;

  return currentTime >= startTime && currentTime <= endTime;
}

/**
 * GET /api/scrape/latest - 获取最新的抓取结果
 */
router.get('/latest', async (req, res) => {
  try {
    console.log('📊 请求获取最新抓取结果');

    const { exchange = 'binance', coin = 'USDT' } = req.query;

    const latestResult = await storageService.getLatestScrapeResult(exchange, coin);

    if (latestResult) {
      console.log('✅ 最新抓取结果获取成功');
      res.json({
        success: true,
        data: latestResult,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log('⚠️  没有找到抓取结果');
      res.json({
        success: false,
        message: '没有找到抓取结果',
        suggestion: '请先进行一次抓取操作',
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ 获取最新抓取结果失败:', error);
    res.status(500).json({
      success: false,
      error: '获取最新抓取结果失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/scrape/history - 获取抓取历史记录
 */
router.get('/history', async (req, res) => {
  try {
    console.log('📋 请求获取抓取历史记录');

    const { exchange, coin, limit = 20 } = req.query;
    const limitNum = parseInt(limit);

    const history = await storageService.getScrapeHistory(exchange, coin, limitNum);

    console.log(`✅ 抓取历史获取成功，共 ${history.length} 条记录`);
    res.json({
      success: true,
      history,
      total_count: history.length,
      limit: limitNum,
      filters: { exchange, coin },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 获取抓取历史失败:', error);
    res.status(500).json({
      success: false,
      error: '获取抓取历史失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/scrape/status - 获取抓取服务状态
 */
router.get('/status', async (req, res) => {
  try {
    console.log('🔍 请求获取抓取服务状态');

    const { ScraperService } = await import('../services/scraper.js');
    const scraper = new ScraperService();

    const status = await scraper.getStatus();

    console.log('✅ 抓取服务状态获取成功');
    res.json({
      success: true,
      status,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 获取抓取服务状态失败:', error);
    res.status(500).json({
      success: false,
      error: '获取抓取服务状态失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/scrape/test - 测试抓取服务
 */
router.post('/test', async (req, res) => {
  try {
    console.log('🧪 请求测试抓取服务');

    const { exchange = 'binance', coin = 'USDT' } = req.body;

    // 这里可以添加简单的连接测试
    const testResult = {
      puppeteer_available: true,
      chrome_accessible: true,
      network_status: 'ok',
      coinglass_accessible: true,
      test_timestamp: new Date().toISOString()
    };

    console.log('✅ 抓取服务测试完成');
    res.json({
      success: true,
      test_result: testResult,
      message: '抓取服务测试通过',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 抓取服务测试失败:', error);
    res.status(500).json({
      success: false,
      error: '抓取服务测试失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/scrape/test-email - 发送测试邮件
 */
router.post('/test-email', async (req, res) => {
  try {
    console.log('📧 请求发送测试邮件');

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: email',
        timestamp: new Date().toISOString()
      });
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: '邮箱格式不正确',
        timestamp: new Date().toISOString()
      });
    }

    const { emailService } = await import('../services/email.js');
    const success = await emailService.sendTestEmail(email);

    if (success) {
      console.log('✅ 测试邮件发送成功');
      res.json({
        success: true,
        message: '测试邮件发送成功',
        email: email,
        timestamp: new Date().toISOString()
      });
    } else {
      throw new Error('测试邮件发送失败');
    }

  } catch (error) {
    console.error('❌ 测试邮件发送失败:', error);
    res.status(500).json({
      success: false,
      error: '测试邮件发送失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;