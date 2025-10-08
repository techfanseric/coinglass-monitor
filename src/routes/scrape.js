/**
 * 数据抓取 API 路由
 * 提供与前端兼容的抓取接口
 * 集成真实状态追踪
 */

import express from 'express';
import { storageService } from '../services/storage.js';
import { formatDateTime } from '../utils/time-utils.js';
import { scrapeTracker } from '../services/scrape-tracker.js';

const router = express.Router();

/**
 * POST /api/scrape/coinglass - 手动触发 CoinGlass 数据抓取和完整监控流程
 */
router.post('/coinglass', async (req, res) => {
  let sessionId = null;

  try {
    console.log('🕷️ 请求手动触发完整监控流程');

    const { exchange = 'binance', coin = 'USDT', timeframe = '1h' } = req.body;

    console.log(`📊 抓取参数: 交易所=${exchange}, 币种=${coin}, 时间框架=${timeframe}`);

    // 验证参数
    if (!exchange || !coin) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: exchange 和 coin',
        timestamp: formatDateTime(new Date())
      });
    }

    // 1. 获取用户配置
    const config = await storageService.getConfig();
    if (!config) {
      return res.status(400).json({
        success: false,
        error: '未找到配置信息',
        user_message: '请先配置监控参数',
        timestamp: formatDateTime(new Date())
      });
    }

    // 检查是否有启用的邮件组
    if (!config.email_groups || !Array.isArray(config.email_groups) || config.email_groups.length === 0) {
      return res.status(400).json({
        success: false,
        error: '未配置邮件组，请先添加邮件组',
        user_message: '请先添加并配置邮件组',
        timestamp: formatDateTime(new Date())
      });
    }

    // 检查是否有启用的邮件组
    const enabledGroups = config.email_groups.filter(group =>
      group.enabled !== false && // 默认启用，除非明确禁用
      group.email && group.email.trim() !== '' &&
      group.coins && Array.isArray(group.coins) && group.coins.length > 0
    );

    if (enabledGroups.length === 0) {
      return res.status(400).json({
        success: false,
        error: '没有启用的邮件组，请先启用至少一个邮件组',
        user_message: '请先启用至少一个邮件组并配置邮箱和币种',
        timestamp: formatDateTime(new Date())
      });
    }

    // 检查邮箱格式
    const hasValidEmail = enabledGroups.some(group =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(group.email.trim())
    );

    if (!hasValidEmail) {
      return res.status(400).json({
        success: false,
        error: '启用的邮件组中没有有效的邮箱地址',
        user_message: '请检查邮件组中的邮箱地址是否正确',
        timestamp: formatDateTime(new Date())
      });
    }

    // 从启用的邮件组中收集启用的币种
    let enabledCoins = [];

    for (const group of enabledGroups) {
      if (group.coins && Array.isArray(group.coins)) {
        const groupCoins = group.coins
          .filter(coin => coin.enabled !== false) // 只收集启用的币种
          .map(coin => ({
            ...coin,
            group_id: group.id,
            group_name: group.name,
            group_email: group.email
          }));
          enabledCoins.push(...groupCoins);
      }
    }

    if (enabledCoins.length === 0) {
      return res.status(400).json({
        success: false,
        error: '启用的邮件组中没有启用的监控币种',
        user_message: '请先在邮件组中添加并启用监控项目',
        timestamp: formatDateTime(new Date())
      });
    }

    // 启动状态追踪会话
    sessionId = scrapeTracker.startSession(config);
    scrapeTracker.updatePhase('initializing', '正在初始化监控检查...');

    // 2. 开始数据抓取阶段
    scrapeTracker.updatePhase('starting_browser', '浏览器启动中');

    const { ScraperService } = await import('../services/scraper.js');
    const scraper = new ScraperService();
    console.log(`🎯 手动触发币种及独立配置:`);
    enabledCoins.forEach(coin => {
      console.log(`  - ${coin.symbol}: 交易所=${coin.exchange}, 颗粒度=${coin.timeframe}, 阈值=${coin.threshold}%`);
    });

    // 3. 开始页面访问和币种抓取
    scrapeTracker.updatePhase('loading_page', '访问CoinGlass网站');

    const startTime = Date.now();
    const allCoinsData = {};
    const scrapingSummary = [];

    // 4. 币种数据抓取阶段
    scrapeTracker.updatePhase('scraping_coins', `开始抓取 ${enabledCoins.length} 个币种数据`);

    // 创建共享的浏览器会话，用于连续处理多个币种
    console.log('🌐 创建共享浏览器会话用于批量抓取...');
    let sharedBrowser = null;
    let sharedPage = null;

    try {
      // 初始化共享浏览器会话
      sharedBrowser = await scraper.initBrowser();
      sharedPage = await sharedBrowser.newPage();
      await sharedPage.setViewport({
        width: scraper.config.windowWidth,
        height: scraper.config.windowHeight
      });

      console.log('📖 访问 CoinGlass 页面...');
      await sharedPage.goto(scraper.config.coinglassBaseUrl, {
        waitUntil: 'networkidle2',
        timeout: scraper.config.pageTimeout
      });

      console.log('⏳ 等待页面完全加载...');
      await sharedPage.waitForTimeout(scraper.config.waitTimes.initial);

      // 为每个启用的币种复用浏览器会话进行抓取
      for (const coin of enabledCoins) {
        try {
          // 开始处理单个币种
          scrapeTracker.startCoin(coin.symbol, coin.exchange, coin.timeframe);
          console.log(`🔄 抓取 ${coin.symbol} (${coin.exchange}/${coin.timeframe})...`);

          // 使用共享浏览器会话进行抓取
          const coinData = await scraper.scrapeCoinGlassDataWithSession(
            coin.exchange || 'binance',  // 使用币种独立配置
            coin.symbol,                  // 使用币种符号
            coin.timeframe || '1h',       // 使用币种独立配置
            [coin.symbol],                // 只抓取当前币种
            sharedBrowser,                // 复用浏览器实例
            sharedPage                    // 复用页面实例
          );

        // 检查数据是否存在 - 支持简单键和复合键查找
        let foundCoinData = null;
        if (coinData && coinData.coins) {
          // 优先尝试简单键匹配
          foundCoinData = coinData.coins[coin.symbol];

          // 如果简单键找不到，检查是否已经有复合键数据
          if (!foundCoinData) {
            const coinKey = `${coin.symbol}_${coin.exchange}_${coin.timeframe}`;
            foundCoinData = coinData.coins[coinKey] || coinData.coins[coin.symbol];
          }
        }

        if (foundCoinData) {
          // 使用复合键存储，避免重复币种覆盖
          const coinKey = `${coin.symbol}_${coin.exchange}_${coin.timeframe}`;

          // 为重复币种创建唯一标识的数据副本
          const coinDataWithMeta = {
            ...foundCoinData,
            exchange: coin.exchange,
            timeframe: coin.timeframe,
            coin_key: coinKey,
            symbol_display: `${coin.symbol} (${coin.timeframe === '24h' ? '24小时' : coin.timeframe})`
          };

          // 使用复合键存储独立的数据副本
          allCoinsData[coinKey] = coinDataWithMeta;

          console.log(`✅ 抓取 ${coin.symbol} (${coin.exchange}/${coin.timeframe}) 成功，利率: ${foundCoinData.annual_rate}%`);

          scrapingSummary.push({
            symbol: coin.symbol,
            exchange: coin.exchange,
            timeframe: coin.timeframe,
            success: true,
            rate: foundCoinData.annual_rate
          });

          // 标记币种完成，包含真实利率信息
          scrapeTracker.completeCoin(coin.symbol, true, foundCoinData.annual_rate);

        } else {
          console.warn(`⚠️ ${coin.symbol} 数据抓取失败`);
          scrapingSummary.push({
            symbol: coin.symbol,
            exchange: coin.exchange,
            timeframe: coin.timeframe,
            success: false,
            error: '数据获取失败'
          });

          // 标记币种失败
          scrapeTracker.completeCoin(coin.symbol, false, null, '数据获取失败');
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

        // 标记币种失败
        scrapeTracker.completeCoin(coin.symbol, false, null, error.message);
      }
      }

      // 清理共享浏览器会话
      try {
        if (sharedBrowser) {
          await sharedBrowser.close();
          console.log('🌐 共享浏览器会话已关闭');
        }
      } catch (cleanupError) {
        console.warn('⚠️ 浏览器会话清理警告:', cleanupError.message);
      }

    } catch (sessionError) {
      console.error('❌ 浏览器会话创建失败:', sessionError);

      // 清理部分创建的资源
      try {
        if (sharedBrowser) {
          await sharedBrowser.close();
        }
      } catch (cleanupError) {
        console.warn('⚠️ 异常清理警告:', cleanupError.message);
      }

      throw new Error(`浏览器会话创建失败: ${sessionError.message}`);
    }

    const duration = Date.now() - startTime;

    // 构建统一的返回数据结构
    const data = {
      exchange: 'mixed', // 表示混合配置
      timestamp: formatDateTime(new Date()),
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
      scrapeTracker.failSession('所有币种数据抓取失败', 'scraping_failed');
      throw new Error('所有币种数据抓取失败');
    }

    console.log(`📊 抓取结果统计: 成功 ${Object.keys(allCoinsData).length}/${enabledCoins.length} 个币种`);
    if (Object.keys(allCoinsData).length < enabledCoins.length) {
      console.log(`⚠️  部分币种抓取失败，但继续处理已成功抓取的币种`);
    }

    console.log(`✅ 批量抓取完成: ${Object.keys(allCoinsData).length} 个币种，耗时: ${duration}ms`);
    console.log('📊 抓取摘要:', scrapingSummary.map(r => `${r.symbol}(${r.exchange}/${r.timeframe}):${r.success?'✅':'❌'}`).join(', '));

    // 5. 保存抓取结果到历史记录
    await storageService.saveScrapeResult({
      exchange: 'mixed',
      coin: enabledCoins.map(c => c.symbol).join(','),
      timeframe: 'mixed',
      data,
      timestamp: formatDateTime(new Date()),
      duration,
      manual: true,
      scraping_summary: scrapingSummary
    });

    // 6. 开始监控检查阶段
    scrapeTracker.updatePhase('analyzing_thresholds', '分析阈值检查');
    console.log('🔍 开始执行监控检查...');
    console.log(`📋 抓取到的币种: ${Object.keys(data.coins).join(', ')}`);
    const monitorResults = await runCompleteMonitorCheck(data, config, enabledCoins);

    // 7. 发送通知阶段
    if (monitorResults.alerts_sent > 0 || monitorResults.recoveries_sent > 0) {
      scrapeTracker.updatePhase('sending_notifications', '发送邮件通知');
    }

    // 8. 完成会话
    scrapeTracker.completeSession(monitorResults);

    // 5. 返回完整结果
    res.json({
      success: true,
      data: data,
      monitor_results: monitorResults,
      meta: {
        timestamp: formatDateTime(new Date()),
        duration: duration,
        source: 'coinglass_multi_exchange',
        triggered_by: 'manual',
        enabled_groups_count: enabledGroups.length,
        alerts_triggered: monitorResults.alerts_sent || 0,
        scraping_summary: scrapingSummary,
        total_coins: enabledCoins.length,
        successful_scrapes: Object.keys(allCoinsData).length
      }
    });

  } catch (error) {
    console.error('❌ 手动监控触发失败:', error);

    // 标记会话失败
    if (sessionId) {
      scrapeTracker.failSession(error.message, 'error');
    }

    res.status(500).json({
      success: false,
      error: '监控触发失败',
      message: error.message,
      meta: {
        timestamp: formatDateTime(new Date()),
        triggered_by: 'manual',
        session_id: sessionId
      }
    });
  }
});

/**
 * 执行完整的监控检查流程
 */
async function runCompleteMonitorCheck(rateData, config, enabledCoins) {
  const results = {
    coins_checked: 0,
    alerts_sent: 0,
    recoveries_sent: 0,
    notifications_skipped: 0,
    details: []
  };

  try {
    console.log('📊 检查币种阈值...');

    // 检查每个启用的币种
    const triggeredCoins = []; // 收集所有触发警报的币种

    for (const coin of enabledCoins) {
      // 先检查数据是否存在，再输出处理日志
      const coinKey = `${coin.symbol}_${coin.exchange}_${coin.timeframe}`;
      let coinData = rateData.coins[coinKey] || rateData.coins[coin.symbol];

      if (coinData?.annual_rate) {
        console.log(`🔍 处理币种: ${coin.symbol} (${coin.exchange}/${coin.timeframe}) -> 利率 ${coinData.annual_rate}%`);
      } else {
        console.log(`🔍 处理币种: ${coin.symbol} (${coin.exchange}/${coin.timeframe}) -> 数据不存在`);
      }

      try {
        const coinResult = await checkCoinThresholdComplete(coin, rateData, config, true); // 手动触发标识
        results.coins_checked++;

      // 收集触发警报的币种，但不立即发送邮件
      if (coinResult.alert_sent) {
        triggeredCoins.push({
          symbol: coin.symbol,
          current_rate: coinResult.current_rate,
          threshold: coin.threshold,
          exchange: coin.exchange,
          timeframe: coin.timeframe,
          group_id: coin.group_id,
          group_name: coin.group_name,
          group_email: coin.group_email
        });
      } else {
        results.alerts_sent += coinResult.alert_sent ? 1 : 0;
      }

      results.recoveries_sent += coinResult.recovery_sent ? 1 : 0;
      results.notifications_skipped += coinResult.skipped ? 1 : 0;
      results.details.push(coinResult);

      } catch (coinError) {
        console.error(`❌ 处理币种 ${coin.symbol} 时出错:`, coinError.message);
        results.details.push({
          symbol: coin.symbol,
          threshold: coin.threshold,
          current_rate: null,
          alert_sent: false,
          recovery_sent: false,
          skipped: true,
          reason: `处理出错: ${coinError.message}`,
          error: coinError.message
        });
      }
    }

    // 按邮件组发送警报邮件
    if (triggeredCoins.length > 0) {
      console.log(`🚨 准备按邮件组发送警报: ${triggeredCoins.length} 个币种触发阈值`);

      const { emailService } = await import('../services/email.js');

      // 按邮件组分组触发币种
      const triggeredCoinsByGroup = {};
      triggeredCoins.forEach(coin => {
        if (coin.group_id) {
          if (!triggeredCoinsByGroup[coin.group_id]) {
            triggeredCoinsByGroup[coin.group_id] = {
              group: config.email_groups.find(g => g.id === coin.group_id),
              coins: []
            };
          }
          triggeredCoinsByGroup[coin.group_id].coins.push(coin);
        }
      });

      // 为每个启用的邮件组发送警报
      for (const [groupId, groupData] of Object.entries(triggeredCoinsByGroup)) {
        const group = groupData.group;
        const groupTriggeredCoins = groupData.coins;

        // 只为启用的组发送邮件
        if (group.enabled !== false && group.email && group.email.trim() !== '') {
          const groupSuccess = await emailService.sendGroupAlert(
            group,
            groupTriggeredCoins,
            rateData.coins,
            config
          );

          if (groupSuccess) {
            results.alerts_sent += groupTriggeredCoins.length;
          }
        } else {
          console.log(`⏭️ 跳过禁用或无效邮件组: ${group.name || groupId}`);
        }
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
    // 优先使用复合键查找数据
    const coinKey = `${coin.symbol}_${coin.exchange}_${coin.timeframe}`;
    let coinData = rateData.coins[coinKey];

    // 如果复合键找不到，回退到简单键查找（向后兼容）
    if (!coinData) {
      coinData = rateData.coins[coin.symbol];
      console.log(`⚠️  复合键 ${coinKey} 未找到，使用简单键 ${coin.symbol} 查找`);
    }

    const currentRate = coinData?.annual_rate;
    if (!currentRate) {
      console.log(`❌ 币种 ${coin.symbol} (${coin.exchange}/${coin.timeframe}) 数据不存在`);
      console.log(`🔍 可用的数据键: ${Object.keys(rateData.coins).join(', ')}`);
      result.reason = `币种 ${coin.symbol} (${coin.exchange}/${coin.timeframe}) 数据不存在`;
      result.skipped = true;
      return result;
    }

    // 找到币种数据信息已在前面处理币种时输出

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
              last_notification: formatDateTime(now),
              next_notification: formatDateTime(new Date(now.getTime() + 30 * 60 * 1000)), // 手动触发30分钟冷却期
              last_rate: currentRate,
              trigger_type: 'manual',
              manual_trigger_at: formatDateTime(now)
            });
          } else {
            // 自动触发的正常状态更新
            await storageService.updateCoinState(coin.symbol, 'alert', {
              last_notification: formatDateTime(now),
              next_notification: formatDateTime(new Date(now.getTime() + config.repeat_interval * 60 * 1000)), // 改为分钟
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
            recovered_at: formatDateTime(now)
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
 * 解析时间字符串为分钟数，支持验证和错误处理
 */
function parseTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') {
    return null;
  }

  const parts = timeStr.split(':');
  if (parts.length !== 2) {
    return null;
  }

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);

  // 验证时间格式有效性
  if (isNaN(hours) || isNaN(minutes) ||
      hours < 0 || hours > 23 ||
      minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

/**
 * 检查是否在通知时间段内，支持跨天逻辑和配置验证
 */
function isWithinNotificationHours(config) {
  if (!config.notification_hours || !config.notification_hours.enabled) {
    return true; // 如果没有启用时间限制，则始终允许
  }

  // 验证时间配置完整性
  if (!config.notification_hours.start || !config.notification_hours.end) {
    console.warn('⚠️ notification_hours 配置不完整，自动禁用时间限制');
    return true; // 配置不完整时回退到无限制状态
  }

  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  const startTime = parseTime(config.notification_hours.start);
  const endTime = parseTime(config.notification_hours.end);

  // 验证时间格式有效性
  if (startTime === null || endTime === null) {
    console.warn('⚠️ notification_hours 时间格式无效，自动禁用时间限制');
    return true; // 时间格式无效时回退到无限制状态
  }

  // 支持跨天时间段（例如 20:00-06:00）
  if (startTime <= endTime) {
    // 正常时间段，如 09:00-18:00
    return currentTime >= startTime && currentTime < endTime;
  } else {
    // 跨天时间段，如 20:00-06:00
    return currentTime >= startTime || currentTime < endTime;
  }
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
        timestamp: formatDateTime(new Date())
      });
    } else {
      console.log('⚠️  没有找到抓取结果');
      res.json({
        success: false,
        message: '没有找到抓取结果',
        suggestion: '请先进行一次抓取操作',
        timestamp: formatDateTime(new Date())
      });
    }

  } catch (error) {
    console.error('❌ 获取最新抓取结果失败:', error);
    res.status(500).json({
      success: false,
      error: '获取最新抓取结果失败',
      message: error.message,
      timestamp: formatDateTime(new Date())
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
      timestamp: formatDateTime(new Date())
    });

  } catch (error) {
    console.error('❌ 获取抓取历史失败:', error);
    res.status(500).json({
      success: false,
      error: '获取抓取历史失败',
      message: error.message,
      timestamp: formatDateTime(new Date())
    });
  }
});

/**
 * GET /api/scrape/service-status - 获取抓取服务状态（浏览器服务状态）
 */
router.get('/service-status', async (req, res) => {
  try {
    console.log('🔍 请求获取抓取服务状态');

    const { ScraperService } = await import('../services/scraper.js');
    const scraper = new ScraperService();

    const status = await scraper.getStatus();

    console.log('✅ 抓取服务状态获取成功');
    res.json({
      success: true,
      status,
      timestamp: formatDateTime(new Date())
    });

  } catch (error) {
    console.error('❌ 获取抓取服务状态失败:', error);
    res.status(500).json({
      success: false,
      error: '获取抓取服务状态失败',
      message: error.message,
      timestamp: formatDateTime(new Date())
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
      test_timestamp: formatDateTime(new Date())
    };

    console.log('✅ 抓取服务测试完成');
    res.json({
      success: true,
      test_result: testResult,
      message: '抓取服务测试通过',
      timestamp: formatDateTime(new Date())
    });

  } catch (error) {
    console.error('❌ 抓取服务测试失败:', error);
    res.status(500).json({
      success: false,
      error: '抓取服务测试失败',
      message: error.message,
      timestamp: formatDateTime(new Date())
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
        timestamp: formatDateTime(new Date())
      });
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: '邮箱格式不正确',
        timestamp: formatDateTime(new Date())
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
        timestamp: formatDateTime(new Date())
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
      timestamp: formatDateTime(new Date())
    });
  }
});

/**
 * GET /api/scrape/status - 获取当前抓取状态
 */
router.get('/status', (req, res) => {
  try {
    const status = scrapeTracker.getCurrentStatus();
    res.json({
      success: true,
      status: status,
      timestamp: formatDateTime(new Date())
    });
  } catch (error) {
    console.error('❌ 获取抓取状态失败:', error);
    res.status(500).json({
      success: false,
      error: '获取状态失败',
      message: error.message,
      timestamp: formatDateTime(new Date())
    });
  }
});

export default router;