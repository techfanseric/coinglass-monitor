/**
 * 监控逻辑服务 - 从Cloudflare Workers迁移
 * 保持所有原有监控逻辑和Hysteresis状态机不变
 */

import { storageService } from './storage.js';
import { emailService } from './email.js';
import { scraperService } from './scraper.js';
import { loggerService } from './logger.js';
import { formatDateTime, formatDateTimeCN } from '../utils/time-utils.js';

/**
 * 运行监控逻辑 - 支持邮件分组
 */
export async function runMonitoring() {
  const logPrefix = '[监控任务]';

  try {
    // 1. 获取用户配置
    const config = await storageService.getConfig();
    if (!config) {
      loggerService.warn(`${logPrefix} 未找到配置信息`);
      return { success: false, reason: 'no_config' };
    }

    // 2. 检查当前时间是否满足监控条件（触发条件 + 时间限制）
    const monitoringResult = shouldRunMonitoringWithReason(config);
    if (!monitoringResult.shouldTrigger) {
      // 静默处理，不输出日志（这是正常行为）
      return { success: false, reason: 'monitoring_condition_not_met', details: monitoringResult.reason };
    }

    // 满足条件，开始执行监控任务
    loggerService.info(`${logPrefix} 开始执行监控任务`);
    console.log('1. 开始执行监控任务...');

    // 检查是否有邮件组配置
    if (!config.email_groups || !Array.isArray(config.email_groups) || config.email_groups.length === 0) {
      loggerService.warn(`${logPrefix} 未配置邮件组`);
      console.log('未配置邮件组');
      return { success: false, reason: 'no_email_groups' };
    }

    // 使用邮件组监控逻辑
    return await runGroupedMonitoring(config);
  } catch (error) {
    console.error('监控执行异常:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 运行分组监控 - 新的主要监控逻辑
 */
async function runGroupedMonitoring(config) {
  const logPrefix = '[分组监控]';
  loggerService.info(`${logPrefix} 开始执行分组监控任务`);
  console.log('2. 使用邮件分组模式执行监控...');

  const groupResults = [];

  // 按分组处理，只处理启用的组
  const enabledGroups = config.email_groups.filter(group =>
    group.enabled !== false && // 默认启用，除非明确禁用
    group.email && group.email.trim() !== '' &&
    group.coins && Array.isArray(group.coins) && group.coins.length > 0
  );

  if (enabledGroups.length === 0) {
    loggerService.warn(`${logPrefix} 没有启用的邮件组`);
    console.log('没有启用的邮件组');
    return { success: false, reason: 'no_enabled_groups' };
  }

  // 先进行冷却期预检查，收集所有需要抓取的币种（去重）
  const allCoinsToScrape = [];
  const coinMap = new Map(); // 用于去重，key为 "symbol_exchange_timeframe"
  const totalSkippedCoins = [];

  console.log(`🔄 开始对所有分组进行冷却期检查...`);

  for (const group of enabledGroups) {
    console.log(`🔄 处理启用的分组: ${group.name} (${group.email})`);

    // 获取分组状态
    const state = await storageService.getGroupState(group.id) || {
      status: 'normal',
      coin_states: {}
    };

    const enabledCoins = group.coins.filter(c => c.enabled);
    let groupSkippedCount = 0;

    console.log(`🔄 冷却期检查: ${enabledCoins.length} 个币种...`);

    for (const coin of enabledCoins) {
      const coinStateKey = `${coin.symbol}_${coin.exchange}_${coin.timeframe}`;
      const coinState = state.coin_states && state.coin_states[coinStateKey];

      if (coinState && coinState.status === 'alert') {
        const nextNotificationTime = new Date(coinState.next_notification);
        const now = new Date();

        if (now < nextNotificationTime) {
          // 仍在冷却期内，跳过抓取
          const remainingTime = Math.ceil((nextNotificationTime - now) / (1000 * 60)); // 分钟
          console.log(`  - ${coin.symbol}: 跳过抓取，仍在冷却期内，距离下次通知还有 ${remainingTime} 分钟（下次通知时间：${formatDateTimeCN(nextNotificationTime)}）`);
          totalSkippedCoins.push({
            coin,
            group: group.name,
            remainingTime,
            nextNotificationTime: formatDateTimeCN(nextNotificationTime)
          });
          groupSkippedCount++;
          continue;
        }
        // 冷却期结束，需要检查
      }

      // 需要抓取检查的币种（首次检查或冷却期结束）
      const coinKey = `${coin.symbol}_${coin.exchange || 'binance'}_${coin.timeframe || '1h'}`;
      if (!coinMap.has(coinKey)) {
        coinMap.set(coinKey, {
          ...coin,
          originalGroup: group.name,
          originalEmail: group.email
        });
        allCoinsToScrape.push(coinMap.get(coinKey));
      }
    }

    console.log(`🎯 ${group.name}: 准备抓取 ${enabledCoins.length - groupSkippedCount} 个币种（跳过 ${groupSkippedCount} 个冷却期币种）`);
  }

  console.log(`🎯 总共收集到 ${allCoinsToScrape.length} 个唯一币种需要抓取（跳过 ${totalSkippedCoins.length} 个冷却期币种）`);

  // 显示即将抓取的币种详情
  if (allCoinsToScrape.length > 0) {
    console.log(`📋 准备抓取的币种详情:`);
    allCoinsToScrape.forEach(coin => {
      console.log(`  - ${coin.symbol}: 交易所=${coin.exchange}, 颗粒度=${coin.timeframe}, 阈值=${coin.threshold}% (来自分组: ${coin.originalGroup})`);
    });
  }

  // 如果所有币种都在冷却期内，直接返回
  if (allCoinsToScrape.length === 0) {
    console.log(`✅ 冷却期检查完成：所有币种都在冷却期内，无需抓取数据`);

    // 构建跳过的币种结果
    const skippedResults = [];
    for (const group of enabledGroups) {
      const groupSkippedCoins = totalSkippedCoins.filter(item => item.group === group.name);
      skippedResults.push({
        groupId: group.id,
        groupName: group.name,
        email: group.email,
        triggeredCount: 0,
        recoveredCount: 0,
        enabledCoinsCount: group.coins.filter(c => c.enabled).length,
        skippedCoinsCount: groupSkippedCoins.length,
        skippedCoins: groupSkippedCoins.map(item => ({
          symbol: item.coin.symbol,
          exchange: item.coin.exchange,
          timeframe: item.coin.timeframe,
          threshold: item.coin.threshold,
          remainingTime: item.remainingTime,
          nextNotificationTime: item.nextNotificationTime
        })),
        emailSent: false,
        success: true,
        skipped: true
      });
    }

    return {
      success: true,
      type: 'grouped',
      results: skippedResults,
      totalGroups: enabledGroups.length,
      totalTriggered: 0,
      totalSkipped: totalSkippedCoins.length
    };
  }

  // 使用全局浏览器会话一次性抓取所有币种
  const allScrapedData = await scrapeAllCoinsOnce(allCoinsToScrape, logPrefix);

  // 按分组处理通知（只处理通知逻辑，不再抓取）
  for (const group of enabledGroups) {
    try {
      console.log(`🔄 处理分组通知: ${group.name} (${group.email})`);

      // 获取该组跳过的币种信息
      const groupSkippedCoins = totalSkippedCoins.filter(item => item.group === group.name);

      const result = await processGroupNotificationsOnly(group, config, allScrapedData, groupSkippedCoins);
      groupResults.push(result);

      // 组间延迟，避免邮件发送过于频繁
      if (enabledGroups.indexOf(group) < enabledGroups.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`❌ 处理分组 ${group.name} 通知失败:`, error);
      groupResults.push({
        groupId: group.id,
        groupName: group.name,
        success: false,
        error: error.message
      });
    }
  }

  // 检查是否有待发送的通知
  await checkPendingNotifications(config);

  const totalTriggered = groupResults.reduce((sum, result) => sum + (result.triggeredCount || 0), 0);
  const totalSkipped = groupResults.reduce((sum, result) => sum + (result.skippedCoinsCount || 0), 0);

  loggerService.info(`${logPrefix} 分组监控完成，总触发 ${totalTriggered} 个币种，跳过 ${totalSkipped} 个冷却期币种`);
  console.log(`✅ 分组监控完成，总触发 ${totalTriggered} 个币种，跳过 ${totalSkipped} 个冷却期币种`);

  return {
    success: true,
    type: 'grouped',
    results: groupResults,
    totalGroups: config.email_groups.length,
    totalTriggered,
    totalSkipped
  };
}

/**
 * 处理单个分组的监控
 */
async function processGroupMonitoring(group, globalConfig) {
  const logPrefix = `[分组${group.name}]`;

  try {
    // 获取该组启用的币种
    const enabledCoins = group.coins.filter(c => c.enabled);
    if (enabledCoins.length === 0) {
      console.log(`⚠️ 分组 ${group.name} 没有启用的币种，跳过`);
      return {
        groupId: group.id,
        groupName: group.name,
        email: group.email,
        triggeredCount: 0,
        enabledCoinsCount: 0,
        success: true,
        skipped: true
      };
    }

    // 获取分组状态
    const state = await storageService.getGroupState(group.id) || {
      status: 'normal',
      coin_states: {}
    };

    // 冷却期预检查 - 过滤掉不需要抓取的币种
    const now = new Date();
    const coinsToScrape = [];
    const skippedCoins = [];

    console.log(`🔄 冷却期检查: ${enabledCoins.length} 个币种...`);

    for (const coin of enabledCoins) {
      const coinStateKey = `${coin.symbol}_${coin.exchange}_${coin.timeframe}`;
      const coinState = state.coin_states && state.coin_states[coinStateKey];

      if (coinState && coinState.status === 'alert') {
        const nextNotificationTime = new Date(coinState.next_notification);

        if (now < nextNotificationTime) {
          // 仍在冷却期内，跳过抓取
          const remainingTime = Math.ceil((nextNotificationTime - now) / (1000 * 60)); // 分钟
          console.log(`  - ${coin.symbol}: 跳过抓取，仍在冷却期内，距离下次通知还有 ${remainingTime} 分钟（下次通知时间：${formatDateTimeCN(nextNotificationTime)}）`);
          skippedCoins.push({ coin, remainingTime, nextNotificationTime: formatDateTimeCN(nextNotificationTime) });
          continue;
        }
        // 冷却期结束，需要检查
      }
      // 需要抓取检查的币种（首次检查或冷却期结束）
      coinsToScrape.push(coin);
    }

    if (coinsToScrape.length === 0) {
      console.log(`✅ 冷却期检查: 所有币种都在冷却期内`);
      return {
        groupId: group.id,
        groupName: group.name,
        email: group.email,
        triggeredCount: 0,
        recoveredCount: 0,
        enabledCoinsCount: enabledCoins.length,
        skippedCoinsCount: skippedCoins.length,
        skippedCoins,
        emailSent: false,
        coinResults: skippedCoins.map(s => ({
          symbol: s.coin.symbol,
          exchange: s.coin.exchange,
          timeframe: s.coin.timeframe,
          threshold: s.coin.threshold,
          status: 'skipped_cooling',
          reason: `仍在冷却期内，距离下次通知还有 ${s.remainingTime} 分钟`,
          nextNotificationTime: s.nextNotificationTime
        })),
        success: true,
        skipped: true
      };
    }

    console.log(`🎯 ${group.name}: 准备抓取 ${coinsToScrape.length} 个币种（跳过 ${skippedCoins.length} 个冷却期币种）`);
    coinsToScrape.forEach(coin => {
      console.log(`  - ${coin.symbol}: 交易所=${coin.exchange}, 颗粒度=${coin.timeframe}, 阈值=${coin.threshold}%`);
    });

    // 使用共享浏览器会话批量抓取数据
    console.log(`🌐 创建共享浏览器会话用于分组监控...`);
    const allCoinsData = {};
    const coinResults = [];
    let sharedBrowser = null;
    let sharedPage = null;

    try {
      // 初始化共享浏览器会话
      sharedBrowser = await scraperService.initBrowser();
      sharedPage = await sharedBrowser.newPage();
      await sharedPage.setViewport({
        width: scraperService.config.windowWidth,
        height: scraperService.config.windowHeight
      });

      console.log('📖 访问 CoinGlass 页面...');
      await sharedPage.goto(scraperService.config.coinglassBaseUrl, {
        waitUntil: 'networkidle2',
        timeout: scraperService.config.pageTimeout
      });

      console.log('⏳ 等待页面完全加载...');
      await sharedPage.waitForTimeout(scraperService.config.waitTimes.initial);

      // 使用共享浏览器会话批量抓取所有币种
      for (const coin of coinsToScrape) {
        try {
          console.log(`🔄 抓取 ${coin.symbol} (${coin.exchange}/${coin.timeframe})...`);

          // 使用共享浏览器会话进行抓取
          const coinRateData = await scraperService.scrapeCoinGlassDataWithSession(
            coin.exchange || 'binance',
            coin.symbol,
            coin.timeframe || '1h',
            [coin.symbol],
            sharedBrowser,
            sharedPage
          );

          const coinKey = `${coin.symbol}_${coin.exchange}_${coin.timeframe}`;

          if (coinRateData && coinRateData.coins && coinRateData.coins[coinKey]) {
            allCoinsData[coinKey] = coinRateData.coins[coinKey];

            console.log(`✅ 抓取 ${coin.symbol} (${coin.exchange}/${coin.timeframe}) 成功，利率: ${coinRateData.coins[coinKey].annual_rate}%`);

            coinResults.push({
              coin: coin.symbol,
              exchange: coin.exchange,
              timeframe: coin.timeframe,
              success: true,
              currentRate: coinRateData.coins[coinKey].annual_rate,
              reason: 'scraping_success'
            });
          } else {
            console.warn(`⚠️ ${coin.symbol} 数据抓取失败，跳过阈值检查`);
            coinResults.push({
              coin: coin.symbol,
              exchange: coin.exchange,
              timeframe: coin.timeframe,
              success: false,
              reason: 'scraping_failed',
              currentRate: null
            });
          }

          // 币种间添加短暂延迟
          await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
          console.error(`❌ ${coin.symbol} 抓取过程中发生错误:`, error.message);
          coinResults.push({
            coin: coin.symbol,
            exchange: coin.exchange,
            timeframe: coin.timeframe,
            success: false,
            reason: 'scraping_error',
            error: error.message,
            currentRate: null
          });
        }
      }

      // 清理共享浏览器会话
      try {
        if (sharedBrowser) {
          await sharedBrowser.close();
          console.log('🌐 分组监控浏览器会话已关闭');
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

      // 如果会话创建失败，将所有币种标记为失败
      for (const coin of coinsToScrape) {
        coinResults.push({
          coin: coin.symbol,
          exchange: coin.exchange,
          timeframe: coin.timeframe,
          success: false,
          reason: 'session_creation_failed',
          error: sessionError.message,
          currentRate: null
        });
      }

      return {
        groupId: group.id,
        groupName: group.name,
        email: group.email,
        triggeredCount: 0,
        recoveredCount: 0,
        enabledCoinsCount: enabledCoins.length,
        skippedCoinsCount: skippedCoins.length,
        skippedCoins,
        emailSent: false,
        coinResults,
        success: false,
        error: 'browser_session_failed',
        errorMessage: sessionError.message
      };
    }

    // 检查该组所有币种的阈值
    const triggeredCoins = [];

    for (const coin of coinsToScrape) {
      const coinKey = `${coin.symbol}_${coin.exchange}_${coin.timeframe}`;
      const coinData = allCoinsData[coinKey];

      if (!coinData) {
        console.warn(`⚠️ 币种 ${coin.symbol} 数据不存在，跳过阈值检查`);
        continue;
      }

      const currentRate = coinData.annual_rate;
      console.log(`🔍 ${coin.symbol}: 当前利率 ${currentRate}% vs 阈值 ${coin.threshold}%`);

      try {
        const result = await checkGroupCoinThreshold(group, coin, currentRate, allCoinsData, globalConfig);
        coinResults.push(result);

        if (result.triggered) {
          triggeredCoins.push({
            ...coin,
            current_rate: currentRate,
            currentRate, // 保留兼容性
            excess: ((currentRate - coin.threshold) / coin.threshold * 100).toFixed(1),
            exchange: coin.exchange,
            timeframe: coin.timeframe
          });
        }
      } catch (error) {
        console.error(`❌ 检查币种 ${coin.symbol} 阈值时发生异常:`, error);
        coinResults.push({
          coin: coin.symbol,
          success: false,
          reason: 'threshold_check_error',
          error: error.message
        });
      }
    }

    // 如果该组有触发的币种，发送组邮件
    let emailSent = false;
    if (triggeredCoins.length > 0) {
      console.log(`📧 ${group.name}: ${triggeredCoins.length} 个币种触发阈值，准备发送邮件`);
      emailSent = await emailService.sendGroupAlert(group, triggeredCoins, allCoinsData, globalConfig);
    }

    // 检查是否有恢复通知需要发送
    const recoveredCoins = [];
    for (const result of coinResults) {
      if (result.actions && result.actions.includes('recovery_marked')) {
        // 找到对应的币种信息
        const coinInfo = enabledCoins.find(c => c.symbol === result.coin);
        if (coinInfo) {
          recoveredCoins.push({
            ...coinInfo,
            current_rate: result.currentRate
          });
        }
      }
    }

    // 如果有恢复的币种，发送恢复邮件
    if (recoveredCoins.length > 0) {
      console.log(`📧 ${group.name}: ${recoveredCoins.length} 个币种恢复到正常水平，准备发送恢复邮件`);
      // 这里可以发送恢复邮件，或者包含在下一封触发邮件中
      // 暂时记录日志，恢复通知可以包含在下次触发邮件中
      for (const coin of recoveredCoins) {
        console.log(`  - ${coin.symbol}: 已恢复到 ${coin.current_rate}% (阈值 ${coin.threshold}%)`);
      }
    }

    return {
      groupId: group.id,
      groupName: group.name,
      email: group.email,
      triggeredCount: triggeredCoins.length,
      recoveredCount: recoveredCoins.length,
      enabledCoinsCount: enabledCoins.length,
      scrapedCoinsCount: coinsToScrape.length,
      skippedCoinsCount: skippedCoins.length,
      triggeredCoins: triggeredCoins.map(c => c.symbol),
      recoveredCoins: recoveredCoins.map(c => c.symbol),
      skippedCoins: skippedCoins.map(s => ({
        symbol: s.coin.symbol,
        exchange: s.coin.exchange,
        timeframe: s.coin.timeframe,
        threshold: s.coin.threshold,
        remainingTime: s.remainingTime,
        nextNotificationTime: s.nextNotificationTime
      })),
      emailSent,
      coinResults: [
        ...coinResults,
        ...skippedCoins.map(s => ({
          coin: s.coin.symbol,
          exchange: s.coin.exchange,
          timeframe: s.coin.timeframe,
          threshold: s.coin.threshold,
          status: 'skipped_cooling',
          reason: `仍在冷却期内，距离下次通知还有 ${s.remainingTime} 分钟`,
          nextNotificationTime: s.nextNotificationTime,
          actions: ['in_cooling_period']
        }))
      ],
      success: true
    };

  } catch (error) {
    console.error(`❌ 处理分组 ${group.name} 时发生异常:`, error);
    return {
      groupId: group.id,
      groupName: group.name,
      email: group.email,
      triggeredCount: 0,
      success: false,
      error: error.message
    };
  }
}

/**
 * 检查分组中单个币种的阈值 - 新的分组监控逻辑
 */
async function checkGroupCoinThreshold(group, coin, currentRate, allCoinsData, globalConfig) {
  // 使用复合键查找币种数据
  const coinKey = `${coin.symbol}_${coin.exchange}_${coin.timeframe}`;
  let coinData = allCoinsData[coinKey];

  // 如果复合键找不到，回退到简单键查找（向后兼容）
  if (!coinData) {
    coinData = allCoinsData[coin.symbol];
    console.log(`⚠️ 复合键 ${coinKey} 未找到，使用简单键 ${coin.symbol} 查找`);
  }

  if (!coinData) {
    console.log(`❌ 分组${group.name} 币种 ${coin.symbol} 数据不存在`);
    return {
      coin: coin.symbol,
      success: false,
      reason: 'data_not_found',
      triggered: false
    };
  }

  // 币种数据已在调用方处理，这里不再重复输出

  // 获取分组状态（而不是币种状态）
  const state = await storageService.getGroupState(group.id);
  const coinStateKey = `${coin.symbol}_${coin.exchange}_${coin.timeframe}`;
  const coinState = state.coin_states?.[coinStateKey] || { status: 'normal' };

  const now = new Date();
  const result = {
    coin: coin.symbol,
    currentRate,
    threshold: coin.threshold,
    previousState: coinState.status,
    actions: [],
    triggered: false
  };

  try {
    // 状态机逻辑（复用原有逻辑，但使用分组状态）
    if (currentRate > coin.threshold) {
      // 利率超过阈值
      if (coinState.status === 'normal' || !coinState.status) {
        // 首次触发
        if (isWithinNotificationHours(globalConfig)) {
          // 在允许时间段内，标记需要发送邮件（统一在processGroupMonitoring中发送）
          result.triggered = true;

          // 更新分组状态中的币种状态
          if (!state.coin_states) state.coin_states = {};
          state.coin_states[coinStateKey] = {
            status: 'alert',
            last_notification: formatDateTime(now),
            next_notification: formatDateTime(new Date(now.getTime() + globalConfig.repeat_interval * 60 * 1000)),
            last_rate: currentRate
          };
          await storageService.updateGroupState(group.id, 'alert', state);

          result.actions.push('alert_marked');
          console.log(`🚨 分组${group.name} 币种 ${coin.symbol} 触发警报，标记为待发送，利率 ${currentRate}% > ${coin.threshold}%`);
        } else {
          // 非时间段内，延迟到下一个允许时间段
          const nextNotificationTime = getNextNotificationTime(globalConfig);
          await storageService.saveScheduledNotification(`${group.id}_${coin.symbol}`, 'alert', {
            group,
            coin,
            currentRate,
            rateData: { coins: allCoinsData },
            config: globalConfig,
            scheduled_time: formatDateTime(nextNotificationTime)
          });

          if (!state.coin_states) state.coin_states = {};
          state.coin_states[coinStateKey] = {
            status: 'alert',
            last_rate: currentRate,
            pending_notification: true
          };
          await storageService.updateGroupState(group.id, 'alert', state);

          result.actions.push('alert_scheduled');
          console.log(`分组${group.name} 币种 ${coin.symbol} 触发警报，但不在通知时间段内，已安排在 ${formatDateTimeCN(nextNotificationTime)} 发送`);
        }
      } else if (coinState.status === 'alert' && now >= new Date(coinState.next_notification)) {
        // 冷却期结束，再次通知
        if (isWithinNotificationHours(globalConfig)) {
          // 标记需要发送重复邮件（统一在processGroupMonitoring中发送）
          result.triggered = true;

          if (!state.coin_states) state.coin_states = {};
          state.coin_states[coinStateKey] = {
            status: 'alert',
            last_notification: formatDateTime(now),
            next_notification: formatDateTime(new Date(now.getTime() + globalConfig.repeat_interval * 60 * 1000)),
            last_rate: currentRate
          };
          await storageService.updateGroupState(group.id, 'alert', state);

          result.actions.push('repeat_alert_marked');
          console.log(`分组${group.name} 币种 ${coin.symbol} 重复警报，标记为待发送分组邮件`);
        } else {
          // 非时间段内，延迟到下一个允许时间段
          const nextNotificationTime = getNextNotificationTime(globalConfig);
          await storageService.saveScheduledNotification(`${group.id}_${coin.symbol}`, 'alert', {
            group,
            coin,
            currentRate,
            rateData: { coins: allCoinsData },
            config: globalConfig,
            scheduled_time: formatDateTime(nextNotificationTime)
          });

          if (!state.coin_states) state.coin_states = {};
          state.coin_states[coinStateKey] = {
            status: 'alert',
            next_notification: formatDateTime(nextNotificationTime),
            last_rate: currentRate
          };
          await storageService.updateGroupState(group.id, 'alert', state);

          result.actions.push('repeat_alert_scheduled');
          console.log(`分组${group.name} 币种 ${coin.symbol} 重复警报，但不在通知时间段内，已安排在 ${formatDateTimeCN(nextNotificationTime)} 发送`);
        }
      } else {
        const nextNotificationTime = new Date(coinState.next_notification);
        const remainingTime = Math.ceil((nextNotificationTime - now) / (1000 * 60)); // 分钟
        console.log(`分组${group.name} 币种 ${coin.symbol} 仍在冷却期内，距离下次通知还有 ${remainingTime} 分钟（下次通知时间：${formatDateTimeCN(nextNotificationTime)}）`);
        result.actions.push('in_cooling_period');
      }
    } else {
      // 利率回落到阈值以下
      if (coinState.status === 'alert') {
        if (isWithinNotificationHours(globalConfig)) {
          // 标记需要发送恢复通知（统一在processGroupMonitoring中处理）
          if (!state.coin_states) state.coin_states = {};
          state.coin_states[coinStateKey] = {
            status: 'normal',
            last_rate: currentRate
          };
          await storageService.updateGroupState(group.id, 'normal', state);

          result.actions.push('recovery_marked');
          console.log(`分组${group.name} 币种 ${coin.symbol} 回落通知，标记为待发送分组邮件`);
        } else {
          // 非时间段内，延迟到下一个允许时间段
          const nextNotificationTime = getNextNotificationTime(globalConfig);
          await storageService.saveScheduledNotification(`${group.id}_${coin.symbol}`, 'recovery', {
            group,
            coin,
            currentRate,
            config: globalConfig,
            scheduled_time: formatDateTime(nextNotificationTime)
          });

          if (!state.coin_states) state.coin_states = {};
          state.coin_states[coinStateKey] = {
            status: 'normal',
            last_rate: currentRate,
            pending_notification: true
          };
          await storageService.updateGroupState(group.id, 'normal', state);

          result.actions.push('recovery_scheduled');
          console.log(`分组${group.name} 币种 ${coin.symbol} 回落通知，但不在通知时间段内，已安排在 ${formatDateTimeCN(nextNotificationTime)} 发送`);
        }
      } else {
        result.actions.push('already_normal');
      }
    }

    result.success = true;
    // 不再更新币种状态，因为现在使用分组状态管理

  } catch (error) {
    console.error(`检查分组${group.name} 币种 ${coin.symbol} 阈值时发生异常:`, error);
    result.success = false;
    result.error = error.message;
  }

  return result;
}

/**
 * 向下兼容：运行原有的单币种监控逻辑
 */
async function runLegacyMonitoring(config) {
  try {
  const logPrefix = '[传统监控]';
  loggerService.info(`${logPrefix} 使用传统监控模式`);
  console.log('2. 使用传统模式执行监控...');

  // 原有的监控逻辑，保持不变
  loggerService.info(`${logPrefix} 触发条件满足，开始按币种独立抓取 CoinGlass 数据`);
  console.log('3. 触发条件满足，开始按币种独立抓取 CoinGlass 数据...');

  // 3. 使用共享浏览器会话批量抓取数据
  const enabledCoins = config.coins.filter(c => c.enabled);
  const allCoinsData = {};
  const results = [];

  loggerService.info(`${logPrefix} 准备按独立配置抓取币种: ${enabledCoins.map(c => `${c.symbol}(${c.exchange}/${c.timeframe})`).join(', ')}`);
  console.log(`🎯 准备按独立配置抓取币种:`);
  enabledCoins.forEach(coin => {
    console.log(`  - ${coin.symbol}: 交易所=${coin.exchange}, 颗粒度=${coin.timeframe}`);
  });

  // 创建共享浏览器会话用于传统监控
  console.log(`🌐 创建共享浏览器会话用于传统监控...`);
  let sharedBrowser = null;
  let sharedPage = null;

  try {
    // 初始化共享浏览器会话
    sharedBrowser = await scraperService.initBrowser();
    sharedPage = await sharedBrowser.newPage();
    await sharedPage.setViewport({
      width: scraperService.config.windowWidth,
      height: scraperService.config.windowHeight
    });

    console.log('📖 访问 CoinGlass 页面...');
    await sharedPage.goto(scraperService.config.coinglassBaseUrl, {
      waitUntil: 'networkidle2',
      timeout: scraperService.config.pageTimeout
    });

    console.log('⏳ 等待页面完全加载...');
    await sharedPage.waitForTimeout(scraperService.config.waitTimes.initial);

    // 使用共享浏览器会话批量抓取所有币种
    for (const coin of enabledCoins) {
      try {
        console.log(`🔄 抓取 ${coin.symbol} (${coin.exchange}/${coin.timeframe})...`);

        const coinRateData = await scraperService.scrapeCoinGlassDataWithSession(
          coin.exchange || 'binance',  // 使用币种独立配置
          coin.symbol,                  // 使用币种符号
          coin.timeframe || '1h',       // 使用币种独立配置
          [coin.symbol],                // 只抓取当前币种
          sharedBrowser,                // 复用浏览器实例
          sharedPage                    // 复用页面实例
        );

        // 使用复合键避免重复币种覆盖
        const coinKey = `${coin.symbol}_${coin.exchange}_${coin.timeframe}`;
        if (coinRateData && coinRateData.coins && coinRateData.coins[coinKey]) {
          allCoinsData[coinKey] = coinRateData.coins[coinKey];

          // 为重复币种创建唯一标识的数据副本
          const coinDataWithMeta = {
            ...coinRateData.coins[coinKey],
            exchange: coin.exchange,
            timeframe: coin.timeframe,
            coin_key: coinKey,
            symbol_display: `${coin.symbol} (${coin.timeframe === '24h' ? '24小时' : coin.timeframe})`
          };

          // 复合键存储已经完成，不再创建币种符号副本
          // 这确保数据的唯一性和正确性，避免复合键被简单键覆盖

          console.log(`✅ 抓取 ${coin.symbol} (${coin.exchange}/${coin.timeframe}) 成功，利率: ${coinRateData.coins[coinKey].annual_rate}%`);

          // 注意：阈值检查将在所有币种抓取完成后统一进行（第147-157行）
        } else {
          console.warn(`⚠️ ${coin.symbol} 数据抓取失败，跳过阈值检查`);
          results.push({
            coin: coin.symbol,
            success: false,
            reason: 'scraping_failed',
            currentRate: null
          });
        }

        // 币种间添加短暂延迟，避免请求过于频繁
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`❌ ${coin.symbol} 抓取过程中发生错误:`, error.message);
        results.push({
          coin: coin.symbol,
          success: false,
          reason: 'scraping_error',
          error: error.message
        });
      }
    }

    // 清理共享浏览器会话
    try {
      if (sharedBrowser) {
        await sharedBrowser.close();
        console.log('🌐 传统监控浏览器会话已关闭');
      }
    } catch (cleanupError) {
      console.warn('⚠️ 浏览器会话清理警告:', cleanupError.message);
    }

  } catch (sessionError) {
    console.error('❌ 传统监控浏览器会话创建失败:', sessionError);

    // 清理部分创建的资源
    try {
      if (sharedBrowser) {
        await sharedBrowser.close();
      }
    } catch (cleanupError) {
      console.warn('⚠️ 异常清理警告:', cleanupError.message);
    }

    // 如果会话创建失败，将所有币种标记为失败
    for (const coin of enabledCoins) {
      results.push({
        coin: coin.symbol,
        exchange: coin.exchange,
        timeframe: coin.timeframe,
        success: false,
        reason: 'session_creation_failed',
        error: sessionError.message,
        currentRate: null
      });
    }

    loggerService.error(`${logPrefix} 浏览器会话创建失败: ${sessionError.message}`);
    return {
      success: false,
      error: 'browser_session_failed',
      errorMessage: sessionError.message,
      results: results,
      timestamp: formatDateTime(new Date())
    };
  }

    // 构建统一的返回数据结构
    const combinedRateData = {
      exchange: 'mixed', // 表示混合配置
      timestamp: formatDateTime(new Date()),
      coins: allCoinsData,
      source: 'multi_exchange_scraping',
      scraping_info: {
        total_coins_requested: enabledCoins.length,
        successful_scrapes: Object.keys(allCoinsData).length,
        failed_scrapes: enabledCoins.length - Object.keys(allCoinsData).length,
        individual_configs: enabledCoins.map(c => {
        const coinData = allCoinsData[c.symbol];
        const coinKey = `${c.symbol}_${c.exchange}_${c.timeframe}`;
        // 尝试从复合键获取数据，如果没有则从简单键获取
        const actualData = allCoinsData[coinKey] || allCoinsData[c.symbol];

        return {
          symbol: c.symbol,
          exchange: c.exchange,
          timeframe: c.timeframe,
          success: !!actualData,
          rate: actualData?.annual_rate || null
        };
      })
      }
    };

    if (Object.keys(allCoinsData).length === 0) {
      loggerService.error(`${logPrefix} 所有币种数据抓取失败`);
      console.error('所有币种数据抓取失败');
      return { success: false, reason: 'all_scraping_failed' };
    }

    loggerService.info(`${logPrefix} 多币种数据抓取完成，成功获取 ${Object.keys(allCoinsData).length} 个币种数据`);
    console.log('3. 多币种数据抓取完成，开始阈值检查...');
    console.log('抓取详情:', combinedRateData.scraping_info);

      // 4. 检查每个币种的阈值（传递完整的抓取信息）
    for (const coin of config.coins.filter(c => c.enabled)) {
      // 为每个币种创建单独的rateData对象
      const coinRateData = {
        ...combinedRateData,
        coins: allCoinsData,
        scraping_info: combinedRateData.scraping_info
      };
      const result = await checkCoinThreshold(coin, coinRateData, config);
      results.push(result);
    }

    // 5. 检查是否有待发送的通知
    await checkPendingNotifications(config);

    return {
      success: true,
      data: {
        rateData: combinedRateData,
        results,
        timestamp: formatDateTime(new Date()),
        scraping_summary: combinedRateData.scraping_info
      }
    };

  } catch (error) {
    console.error('监控执行异常:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 检查单个币种的阈值
 */
export async function checkCoinThreshold(coin, rateData, config) {
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
    return { coin: coin.symbol, success: false, reason: 'data_not_found' };
  }

  // 币种数据已在调用方处理，这里不再重复输出

  // 获取币种状态
  const state = await storageService.getCoinState(coin.symbol);
  const now = new Date();
  const result = {
    coin: coin.symbol,
    currentRate,
    threshold: coin.threshold,
    previousState: state.status,
    actions: []
  };

  try {
    // 状态机逻辑
    if (currentRate > coin.threshold) {
      // 利率超过阈值
      if (state.status === 'normal' || !state.status) {
        // 首次触发
        if (isWithinNotificationHours(config)) {
          // 在允许时间段内，立即通知
          const success = await emailService.sendAlert(coin, currentRate, rateData, config);
          if (success) {
            await storageService.updateCoinState(coin.symbol, 'alert', {
              last_notification: formatDateTime(now),
              next_notification: formatDateTime(new Date(now.getTime() + config.repeat_interval * 60 * 1000)), // 改为分钟
              last_rate: currentRate
            });
            result.actions.push('alert_sent');
            console.log(`✅ 币种 ${coin.symbol} 触发警报，邮件已发送，利率 ${currentRate}% > ${coin.threshold}%`);
          } else {
            result.actions.push('alert_failed');
            console.error(`❌ 币种 ${coin.symbol} 警报邮件发送失败`);
          }
        } else {
          // 非时间段内，延迟到下一个允许时间段
          const nextNotificationTime = getNextNotificationTime(config);
          await storageService.saveScheduledNotification(coin.symbol, 'alert', {
            coin,
            currentRate,
            rateData,
            config,
            scheduled_time: formatDateTime(nextNotificationTime)
          });
          await storageService.updateCoinState(coin.symbol, 'alert', {
            last_rate: currentRate,
            pending_notification: true
          });
          result.actions.push('alert_scheduled');
          console.log(`币种 ${coin.symbol} 触发警报，但不在通知时间段内，已安排在 ${formatDateTimeCN(nextNotificationTime)} 发送`);
        }
      } else if (state.status === 'alert' && now >= new Date(state.next_notification)) {
        // 冷却期结束，再次通知
        if (isWithinNotificationHours(config)) {
          const success = await emailService.sendAlert(coin, currentRate, rateData, config);
          if (success) {
            await storageService.updateCoinState(coin.symbol, 'alert', {
              last_notification: formatDateTime(now),
              next_notification: formatDateTime(new Date(now.getTime() + config.repeat_interval * 60 * 1000)), // 改为分钟
              last_rate: currentRate
            });
            result.actions.push('repeat_alert_sent');
            console.log(`币种 ${coin.symbol} 重复警报，邮件已发送`);
          } else {
            result.actions.push('repeat_alert_failed');
          }
        } else {
          // 非时间段内，延迟到下一个允许时间段
          const nextNotificationTime = getNextNotificationTime(config);
          await storageService.saveScheduledNotification(coin.symbol, 'alert', {
            coin,
            currentRate,
            rateData,
            config,
            scheduled_time: formatDateTime(nextNotificationTime)
          });
          await storageService.updateCoinState(coin.symbol, 'alert', {
            next_notification: formatDateTime(nextNotificationTime),
            last_rate: currentRate
          });
          result.actions.push('repeat_alert_scheduled');
          console.log(`币种 ${coin.symbol} 重复警报，但不在通知时间段内，已安排在 ${formatDateTimeCN(nextNotificationTime)} 发送`);
        }
      } else {
        const nextNotificationTime = new Date(state.next_notification);
        const remainingTime = Math.ceil((nextNotificationTime - now) / (1000 * 60)); // 分钟
        console.log(`币种 ${coin.symbol} 仍在冷却期内，距离下次通知还有 ${remainingTime} 分钟（下次通知时间：${formatDateTimeCN(nextNotificationTime)}）`);
        result.actions.push('in_cooling_period');
      }
    } else {
      // 利率回落到阈值以下
      if (state.status === 'alert') {
        if (isWithinNotificationHours(config)) {
          const success = await emailService.sendRecovery(coin, currentRate, config);
          if (success) {
            await storageService.updateCoinState(coin.symbol, 'normal', {
              last_rate: currentRate
            });
            result.actions.push('recovery_sent');
            console.log(`币种 ${coin.symbol} 回落通知，邮件已发送`);
          } else {
            result.actions.push('recovery_failed');
          }
        } else {
          // 非时间段内，延迟到下一个允许时间段
          const nextNotificationTime = getNextNotificationTime(config);
          await storageService.saveScheduledNotification(coin.symbol, 'recovery', {
            coin,
            currentRate,
            config,
            scheduled_time: formatDateTime(nextNotificationTime)
          });
          await storageService.updateCoinState(coin.symbol, 'normal', {
            last_rate: currentRate,
            pending_notification: true
          });
          result.actions.push('recovery_scheduled');
          console.log(`币种 ${coin.symbol} 回落通知，但不在通知时间段内，已安排在 ${formatDateTimeCN(nextNotificationTime)} 发送`);
        }
      } else {
        result.actions.push('already_normal');
      }
    }

    result.success = true;
    result.newState = (await storageService.getCoinState(coin.symbol)).status;

  } catch (error) {
    console.error(`检查币种 ${coin.symbol} 阈值时发生异常:`, error);
    result.success = false;
    result.error = error.message;
  }

  return result;
}

/**
 * 检查当前时间是否满足触发条件，返回详细原因
 */
function shouldTriggerNow(config) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // 如果没有配置触发设置，使用默认行为（每小时0分触发）
  if (!config.trigger_settings) {
    return currentMinute === 0;
  }

  const triggerSettings = config.trigger_settings;

  // 检查每时触发 - 总是启用
  if (currentMinute === triggerSettings.hourly_minute) {
    return true;
  }

  // 检查每24时触发 - 总是启用
  if (currentHour === triggerSettings.daily_hour &&
      currentMinute === triggerSettings.daily_minute) {
    return true;
  }

  return false;
}

/**
 * 检查当前时间是否满足触发条件，返回详细原因
 */
function shouldTriggerNowWithReason(config) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // 格式化时间显示
  const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

  // 如果没有配置触发设置，使用默认行为（每小时0分触发）
  if (!config.trigger_settings) {
    const shouldTrigger = currentMinute === 0;
    if (!shouldTrigger) {
      return {
        shouldTrigger: false,
        reason: `当前时间 ${timeStr} 不满足触发条件（默认每小时0分触发，需等到 ${currentHour}:00）`
      };
    }
    return { shouldTrigger: true, reason: '' };
  }

  const triggerSettings = config.trigger_settings;
  const hourlyMinute = triggerSettings.hourly_minute || 0;
  const dailyHour = triggerSettings.daily_hour;
  const dailyMinute = triggerSettings.daily_minute;

  // 检查每时触发 - 总是启用
  if (currentMinute === hourlyMinute) {
    return { shouldTrigger: true, reason: '' };
  }

  // 检查每24时触发 - 总是启用
  if (currentHour === dailyHour && currentMinute === dailyMinute) {
    return { shouldTrigger: true, reason: '' };
  }

  // 构建详细的不满足原因
  const nextHourly = `${String(currentHour).padStart(2, '0')}:${String(hourlyMinute).padStart(2, '0')}`;
  const nextDaily = `${String(dailyHour).padStart(2, '0')}:${String(dailyMinute).padStart(2, '0')}`;

  // 如果当前分钟已过每时触发时间，显示下一个小时的触发时间
  const nextHourlyTime = currentMinute > hourlyMinute
    ? `${String((currentHour + 1) % 24).padStart(2, '0')}:${String(hourlyMinute).padStart(2, '0')}`
    : nextHourly;

  // 如果今天已过每日触发时间，显示明天的触发时间
  const nextDailyTime = (currentHour > dailyHour || (currentHour === dailyHour && currentMinute > dailyMinute))
    ? `明天 ${nextDaily}`
    : (currentHour < dailyHour || (currentHour === dailyHour && currentMinute < dailyMinute))
      ? `今天 ${nextDaily}`
      : `明天 ${nextDaily}`;

  return {
    shouldTrigger: false,
    reason: `当前时间 ${timeStr} 不满足触发条件（每小时${hourlyMinute}分触发，下次：${nextHourlyTime}；每日${dailyHour}:${String(dailyMinute).padStart(2, '0')}触发，下次：${nextDailyTime}）`
  };
}

/**
 * 检查监控条件（触发条件 + 时间限制），返回详细原因
 */
function shouldRunMonitoringWithReason(config) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

  // 1. 检查触发条件
  const triggerResult = shouldTriggerNowWithReason(config);
  if (!triggerResult.shouldTrigger) {
    return triggerResult; // 直接返回触发条件不满足的原因
  }

  // 2. 检查时间限制（满足触发条件时才检查）
  if (config.notification_hours && config.notification_hours.enabled) {
    const isWithinHours = isWithinNotificationHours(config);
    if (!isWithinHours) {
      const start = config.notification_hours.start;
      const end = config.notification_hours.end;

      // 计算下一个允许的通知时间
      const startTime = parseTime(start);
      const endTime = parseTime(end);
      const currentTime = currentHour * 60 + currentMinute;

      let nextNotificationTime = '';
      if (startTime <= endTime) {
        // 正常时间段
        if (currentTime < startTime) {
          nextNotificationTime = `今天 ${start}`;
        } else {
          nextNotificationTime = `明天 ${start}`;
        }
      } else {
        // 跨天时间段
        if (currentTime >= startTime || currentTime < endTime) {
          // 当前在允许时间段内（这里不应该执行到，因为isWithinHours返回false）
          nextNotificationTime = `当前时间 ${timeStr}`;
        } else {
          // 当前在不允许时间段，计算下一个允许时间
          if (currentTime < startTime) {
            nextNotificationTime = `今天 ${start}`;
          } else {
            nextNotificationTime = `明天 ${start}`;
          }
        }
      }

      return {
        shouldTrigger: false,
        reason: `当前时间 ${timeStr} 满足触发条件但不在通知时间段内（通知时间：${start}-${end}，下次通知时间：${nextNotificationTime}）`
      };
    }
  }

  // 3. 满足所有条件
  return { shouldTrigger: true, reason: '' };
}

/**
 * 检查当前时间是否在允许的通知时间段内，支持跨天逻辑和配置验证
 */
function isWithinNotificationHours(config) {
  // 如果没有启用时间限制，始终允许通知
  if (!config.notification_hours || !config.notification_hours.enabled) {
    return true;
  }

  // 验证时间配置完整性
  if (!config.notification_hours.start || !config.notification_hours.end) {
    console.warn('⚠️ notification_hours 配置不完整，自动禁用时间限制');
    return true; // 配置不完整时回退到无限制状态
  }

  const startTime = parseTime(config.notification_hours.start);
  const endTime = parseTime(config.notification_hours.end);

  // 验证时间格式有效性
  if (startTime === null || endTime === null) {
    console.warn('⚠️ notification_hours 时间格式无效，自动禁用时间限制');
    return true; // 时间格式无效时回退到无限制状态
  }

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

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
 * 获取下一个通知时间，支持配置验证
 */
function getNextNotificationTime(config) {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // 验证时间配置完整性
  if (!config.notification_hours || !config.notification_hours.start) {
    console.warn('⚠️ getNextNotificationTime: 配置不完整，使用默认时间 09:00');
    tomorrow.setHours(9);
    tomorrow.setMinutes(0);
    tomorrow.setSeconds(0);
    tomorrow.setMilliseconds(0);
    return tomorrow;
  }

  const startTime = parseTime(config.notification_hours.start);

  // 验证时间格式有效性
  if (startTime === null) {
    console.warn('⚠️ getNextNotificationTime: 时间格式无效，使用默认时间 09:00');
    tomorrow.setHours(9);
    tomorrow.setMinutes(0);
  } else {
    tomorrow.setHours(Math.floor(startTime / 60));
    tomorrow.setMinutes(startTime % 60);
  }

  tomorrow.setSeconds(0);
  tomorrow.setMilliseconds(0);

  return tomorrow;
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
 * 检查并发送待处理的通知
 */
async function checkPendingNotifications(config) {
  try {
    const notifications = await storageService.getScheduledNotifications();
    const now = new Date();

    for (const notification of notifications) {
      try {
        const scheduledTime = new Date(notification.scheduled_time);

        // 如果已到发送时间，发送通知
        if (now >= scheduledTime) {
          const isGroupNotification = notification.data.isGroupNotification;
          const coinSymbol = notification.data.coin?.symbol || notification.coin;
          const coinInfo = notification.data.coin;

          if (isGroupNotification) {
            console.log(`发送分组延迟通知: ${notification.data.group?.name} - ${coinSymbol} ${notification.type}`);
          } else {
            console.log(`发送延迟通知: ${coinSymbol} ${notification.type}`);
          }

          let success = false;
          if (notification.type === 'alert') {
            if (isGroupNotification && notification.data.group) {
              // 发送分组警报邮件
              const group = notification.data.group;
              const triggeredCoins = [{
                ...coinInfo,
                current_rate: notification.data.currentRate,
                excess: ((notification.data.currentRate - coinInfo.threshold) / coinInfo.threshold * 100).toFixed(1),
                exchange: coinInfo.exchange,
                timeframe: coinInfo.timeframe
              }];

              success = await emailService.sendGroupAlert(
                group,
                triggeredCoins,
                notification.data.rateData?.coins || {},
                notification.data.config
              );
            } else {
              // 向下兼容：发送单币种警报邮件
              success = await emailService.sendAlert(
                coinInfo,
                notification.data.currentRate,
                notification.data.rateData,
                notification.data.config
              );
            }
          } else if (notification.type === 'recovery') {
            if (isGroupNotification && notification.data.group) {
              // 发送分组恢复邮件 - 可以使用恢复邮件模板或修改分组邮件
              const group = notification.data.group;
              console.log(`分组恢复通知: ${group.name} - ${coinSymbol} 已恢复到 ${notification.data.currentRate}%`);

              // 暂时记录日志，恢复通知可以包含在下次触发邮件中
              success = true; // 标记为成功，避免重复处理
            } else {
              // 向下兼容：发送单币种恢复邮件
              success = await emailService.sendRecovery(
                coinInfo,
                notification.data.currentRate,
                notification.data.config
              );
            }
          }

          if (success) {
            // 删除已处理的通知
            await storageService.deleteScheduledNotification(notification.key);
            if (isGroupNotification) {
              console.log(`分组延迟通知发送成功: ${notification.data.group?.name} - ${coinSymbol} ${notification.type}`);
            } else {
              console.log(`延迟通知发送成功: ${coinSymbol} ${notification.type}`);
            }
          }
        }
      } catch (error) {
        console.error(`处理延迟通知失败:`, error);
      }
    }
  } catch (error) {
    console.error('检查待处理通知失败:', error);
  }
}

/**
 * 获取所有币种的当前状态（支持分组监控）
 */
export async function getAllCoinsStatus() {
  try {
    const config = await storageService.getConfig();
    if (!config) {
      return [];
    }

    const statusList = [];

    // 检查是否使用新的分组格式
    if (config.email_groups && config.email_groups.length > 0) {
      // 使用分组监控格式
      for (const group of config.email_groups) {
        const groupState = await storageService.getGroupState(group.id);

        for (const coin of group.coins) {
          const coinStateKey = `${coin.symbol}_${coin.exchange}_${coin.timeframe}`;
          const coinState = groupState.coin_states?.[coinStateKey] || { status: 'normal' };

          statusList.push({
            symbol: coin.symbol,
            exchange: coin.exchange,
            timeframe: coin.timeframe,
            threshold: coin.threshold,
            enabled: coin.enabled,
            group_id: group.id,
            group_name: group.name,
            group_email: group.email,
            state: coinState.status || 'normal',
            last_notification: coinState.last_notification,
            next_notification: coinState.next_notification,
            last_rate: coinState.last_rate,
            pending_notification: coinState.pending_notification
          });
        }
      }
    } else if (config.coins) {
      // 向下兼容：使用旧的币种监控格式
      for (const coin of config.coins) {
        const state = await storageService.getCoinState(coin.symbol);
        statusList.push({
          symbol: coin.symbol,
          exchange: coin.exchange || 'binance',
          timeframe: coin.timeframe || '1h',
          threshold: coin.threshold,
          enabled: coin.enabled,
          group_id: null,
          group_name: null,
          group_email: config.email || null,
          state: state.status || 'normal',
          last_notification: state.last_notification,
          next_notification: state.next_notification,
          last_rate: state.last_rate,
          pending_notification: state.pending_notification
        });
      }
    }

    return statusList;
  } catch (error) {
    console.error('获取币种状态失败:', error);
    return [];
  }
}

/**
 * 一次性抓取所有币种数据（全局浏览器会话）
 */
async function scrapeAllCoinsOnce(allCoinsToScrape, logPrefix) {
  const startTime = Date.now();
  const allCoinsData = {};
  const coinResults = [];

  console.log(`🌐 创建全局浏览器会话，一次性抓取 ${allCoinsToScrape.length} 个币种...`);

  let sharedBrowser = null;
  let sharedPage = null;

  try {
    // 初始化全局浏览器会话
    sharedBrowser = await scraperService.initBrowser();
    sharedPage = await sharedBrowser.newPage();
    await sharedPage.setViewport({
      width: scraperService.config.windowWidth,
      height: scraperService.config.windowHeight
    });

    console.log('📖 访问 CoinGlass 页面...');
    await sharedPage.goto(scraperService.config.coinglassBaseUrl, {
      waitUntil: 'networkidle2',
      timeout: scraperService.config.pageTimeout
    });

    console.log('⏳ 等待页面完全加载...');
    await sharedPage.waitForTimeout(scraperService.config.waitTimes.initial);

    // 按交易所分组币种，减少交易所切换次数
    const coinsByExchange = {};
    for (const coin of allCoinsToScrape) {
      const exchange = coin.exchange || 'binance';
      if (!coinsByExchange[exchange]) {
        coinsByExchange[exchange] = [];
      }
      coinsByExchange[exchange].push(coin);
    }

    console.log(`📍 按交易所分组: ${Object.keys(coinsByExchange).join(', ')}`);

    // 对每个交易所进行一次切换，然后抓取该交易所的所有币种
    for (const [exchange, coins] of Object.entries(coinsByExchange)) {
      console.log(`🔄 处理交易所: ${exchange} (${coins.length} 个币种)`);

      // 智能切换交易所（每个交易所只切换一次）
      await scraperService.switchExchangeIfNeeded(sharedPage, exchange);

      // 抓取该交易所的所有币种
      for (const coin of coins) {
        try {
          console.log(`🔄 抓取 ${coin.symbol} (${coin.exchange}/${coin.timeframe})...`);

          const coinRateData = await scraperService.scrapeCoinGlassDataWithSession(
            coin.exchange || 'binance',
            coin.symbol,
            coin.timeframe || '1h',
            [coin.symbol],
            sharedBrowser,
            sharedPage
          );

          const coinKey = `${coin.symbol}_${coin.exchange}_${coin.timeframe}`;

          if (coinRateData && coinRateData.coins && coinRateData.coins[coinKey]) {
            allCoinsData[coinKey] = coinRateData.coins[coinKey];
            console.log(`✅ 抓取 ${coin.symbol} (${coin.exchange}/${coin.timeframe}) 成功，利率: ${coinRateData.coins[coinKey].annual_rate}%`);
          } else {
            console.warn(`⚠️ ${coin.symbol} 数据抓取失败`);
            coinResults.push({
              coin: coin.symbol,
              exchange: coin.exchange,
              timeframe: coin.timeframe,
              success: false,
              reason: 'scraping_failed'
            });
          }

          // 币种间添加短暂延迟
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          console.error(`❌ ${coin.symbol} 抓取过程中发生错误:`, error.message);
          coinResults.push({
            coin: coin.symbol,
            exchange: coin.exchange,
            timeframe: coin.timeframe,
            success: false,
            reason: 'scraping_error',
            error: error.message
          });
        }
      }
    }

    // 清理全局浏览器会话
    try {
      if (sharedBrowser) {
        await sharedBrowser.close();
        console.log('🌐 全局浏览器会话已关闭');
      }
    } catch (cleanupError) {
      console.warn('⚠️ 浏览器会话清理警告:', cleanupError.message);
    }

    const duration = Date.now() - startTime;
    console.log(`✅ 全局抓取完成: ${Object.keys(allCoinsData).length} 个币种成功，耗时: ${duration}ms`);

    return {
      success: true,
      allCoinsData,
      coinResults,
      duration,
      timestamp: formatDateTime(new Date())
    };

  } catch (sessionError) {
    console.error('❌ 全局浏览器会话创建失败:', sessionError);

    // 清理部分创建的资源
    try {
      if (sharedBrowser) {
        await sharedBrowser.close();
      }
    } catch (cleanupError) {
      console.warn('⚠️ 异常清理警告:', cleanupError.message);
    }

    // 如果会话创建失败，将所有币种标记为失败
    for (const coin of allCoinsToScrape) {
      coinResults.push({
        coin: coin.symbol,
        exchange: coin.exchange,
        timeframe: coin.timeframe,
        success: false,
        reason: 'session_creation_failed',
        error: sessionError.message
      });
    }

    return {
      success: false,
      allCoinsData: {},
      coinResults,
      error: 'browser_session_failed',
      errorMessage: sessionError.message
    };
  }
}

/**
 * 仅处理分组通知（不进行数据抓取）
 */
async function processGroupNotificationsOnly(group, globalConfig, allScrapedData, skippedCoins = []) {
  const logPrefix = `[分组${group.name}]`;

  try {
    // 获取该组启用的币种
    const enabledCoins = group.coins.filter(c => c.enabled);
    if (enabledCoins.length === 0) {
      console.log(`⚠️ 分组 ${group.name} 没有启用的币种，跳过`);
      return {
        groupId: group.id,
        groupName: group.name,
        email: group.email,
        triggeredCount: 0,
        recoveredCount: 0,
        enabledCoinsCount: 0,
        success: true,
        skipped: true
      };
    }

    // 检查该组所有币种的阈值
    const triggeredCoins = [];

    for (const coin of enabledCoins) {
      const coinKey = `${coin.symbol}_${coin.exchange}_${coin.timeframe}`;
      const coinData = allScrapedData.allCoinsData?.[coinKey];

      if (!coinData) {
        console.warn(`⚠️ 币种 ${coin.symbol} 数据不存在，跳过阈值检查`);
        continue;
      }

      const currentRate = coinData.annual_rate;
      const threshold = coin.threshold;

      console.log(`🔍 检查币种 ${coin.symbol}: 当前利率 ${currentRate}% vs 阈值 ${threshold}%`);

      // 检查阈值
      if (currentRate > threshold) {
        console.log(`🚨 ${coin.symbol} 触发警报，利率 ${currentRate}% > 阈值 ${threshold}%`);
        triggeredCoins.push({
          ...coin,
          current_rate: currentRate,
          currentRate, // 保留兼容性
          excess: ((currentRate - coin.threshold) / coin.threshold * 100).toFixed(1),
          coinData
        });
      }
    }

    // 发送邮件通知
    if (triggeredCoins.length > 0) {
      console.log(`📧 准备发送 ${group.name} 的警报通知: ${triggeredCoins.length} 个币种`);

      // 这里调用邮件发送逻辑
      const emailSuccess = await emailService.sendGroupAlert(
        group,
        triggeredCoins,
        allScrapedData.allCoinsData,
        globalConfig
      );

      return {
        groupId: group.id,
        groupName: group.name,
        email: group.email,
        triggeredCount: triggeredCoins.length,
        recoveredCount: 0,
        enabledCoinsCount: enabledCoins.length,
        skippedCoinsCount: skippedCoins.length,
        skippedCoins: skippedCoins.map(item => ({
          symbol: item.coin.symbol,
          exchange: item.coin.exchange,
          timeframe: item.coin.timeframe,
          threshold: item.coin.threshold,
          remainingTime: item.remainingTime,
          nextNotificationTime: item.nextNotificationTime
        })),
        emailSent: emailSuccess,
        success: true
      };
    } else {
      return {
        groupId: group.id,
        groupName: group.name,
        email: group.email,
        triggeredCount: 0,
        recoveredCount: 0,
        enabledCoinsCount: enabledCoins.length,
        skippedCoinsCount: skippedCoins.length,
        skippedCoins: skippedCoins.map(item => ({
          symbol: item.coin.symbol,
          exchange: item.coin.exchange,
          timeframe: item.coin.timeframe,
          threshold: item.coin.threshold,
          remainingTime: item.remainingTime,
          nextNotificationTime: item.nextNotificationTime
        })),
        emailSent: false,
        success: true
      };
    }

  } catch (error) {
    console.error(`❌ 处理分组 ${group.name} 通知时发生异常:`, error);
    return {
      groupId: group.id,
      groupName: group.name,
      email: group.email,
      success: false,
      error: error.message
    };
  }
}

// 导出监控服务
export const monitorService = {
  runMonitoring,
  checkCoinThreshold,
  getAllCoinsStatus,
  shouldTriggerNow,
  isWithinNotificationHours
};