/**
 * Puppeteer 抓取服务
 * 基于参考方案的 browser-service 实现
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { storageService } from './storage.js';
import { loggerService } from './logger.js';
import { formatDateTime, normalizeExchangeName } from '../utils/time-utils.js';

// 使用Stealth插件避免被检测
puppeteer.use(StealthPlugin());

export class ScraperService {
  constructor() {
    this.browser = null;
    this.page = null;

  
    // 从环境变量加载配置
    this.config = {
      windowWidth: parseInt(process.env.PUPPETEER_WINDOW_WIDTH) || 1920,
      windowHeight: parseInt(process.env.PUPPETEER_WINDOW_HEIGHT) || 1080,
      pageTimeout: parseInt(process.env.PUPPETEER_PAGE_TIMEOUT) || 30000,
      navigationTimeout: parseInt(process.env.PUPPETEER_NAVIGATION_TIMEOUT) || 60000,
      userAgent: process.env.PUPPETEER_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      coinglassBaseUrl: process.env.COINGLASS_BASE_URL || 'https://www.coinglass.com/zh/pro/i/MarginFeeChart',
      waitTimes: {
        initial: parseInt(process.env.COINGLASS_WAIT_TIME_INITIAL) || 5000,
        exchange: parseInt(process.env.COINGLASS_WAIT_TIME_EXCHANGE) || 3000,
        coin: parseInt(process.env.COINGLASS_WAIT_TIME_COIN) || 6000,
        data: parseInt(process.env.COINGLASS_WAIT_TIME_DATA) || 3000,
        screenshot: parseInt(process.env.COINGLASS_WAIT_TIME_SCREENSHOT) || 2000,
        verification: parseInt(process.env.COINGLASS_WAIT_TIME_VERIFICATION) || 2000,
        method: parseInt(process.env.COINGLASS_WAIT_TIME_METHOD) || 1000,
        retry: parseInt(process.env.COINGLASS_WAIT_TIME_RETRY) || 500,
        clear: parseInt(process.env.COINGLASS_WAIT_TIME_CLEAR) || 300,
        optionSelect: parseInt(process.env.COINGLASS_WAIT_TIME_OPTION_SELECT) || 2500
      },
      screenshotDir: process.env.COINGLASS_SCREENSHOT_DIR || './data/debug-screenshots'
    };
  }

  /**
   * 初始化浏览器
   */
  async initBrowser() {
    // 检查现有浏览器实例是否仍然可用
    if (this.browser) {
      try {
        // 检查浏览器连接是否还活着
        const isConnected = this.browser.isConnected();
        if (isConnected) {
          return this.browser;
        } else {
          // 浏览器已断开连接，清理并重新创建
          console.log('🔄 检测到浏览器连接已断开，重新创建...');
          this.browser = null;
          this.page = null;
        }
      } catch (error) {
        // 检查连接状态时出错，认为实例不可用
        console.log('🔄 浏览器实例状态异常，重新创建...');
        this.browser = null;
        this.page = null;
      }
    }

    console.log('🌐 启动 Puppeteer 浏览器...');

    // 自动检测Chrome路径（Windows/Mac/Linux兼容）
    let executablePath;
    if (process.platform === 'win32') {
      executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    } else if (process.platform === 'darwin') {
      executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    } else {
      executablePath = '/usr/bin/google-chrome';
    }

    // 检查Chrome是否存在，不存在则使用Puppeteer内置Chromium
    if (!fs.existsSync(executablePath)) {
      console.log(`Chrome未找到在 ${executablePath}，使用Puppeteer内置Chromium`);
      executablePath = undefined;
    }

    const options = {
      headless: process.env.PUPPETEER_HEADLESS !== 'false' ? 'new' : false,
      executablePath: executablePath,
      timeout: parseInt(process.env.PUPPETEER_TIMEOUT) || 60000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        `--window-size=${this.config.windowWidth},${this.config.windowHeight}`
      ]
    };

    this.browser = await puppeteer.launch(options);
    console.log('🌐 启动 Puppeteer 浏览器成功');

    return this.browser;
  }

  /**
   * 获取新页面
   */
  async getPage() {
    if (!this.browser) {
      await this.initBrowser();
    }

    this.page = await this.browser.newPage();

    // 设置用户代理
    await this.page.setUserAgent(this.config.userAgent);

    // 设置视窗大小
    await this.page.setViewport({ width: this.config.windowWidth, height: this.config.windowHeight });

    return this.page;
  }

  /**
   * 抓取 CoinGlass 数据 - 支持复用浏览器会话
   */
  async scrapeCoinGlassDataWithSession(exchange = 'OKX', coin = 'USDT', timeframe = '1h', requestedCoins = null, browser = null, page = null) {
    try {
      console.log(`🕷️ 抓取 CoinGlass 数据: ${exchange}/${coin}/${timeframe}，目标币种: ${requestedCoins?.join(',') || '默认'}...`);
      if (requestedCoins) {
        console.log(`🎯 请求的币种: ${requestedCoins.join(', ')}`);
      }

      // 使用现有浏览器会话或创建新的
      let useBrowser = browser;
      let usePage = page;
      let shouldCleanup = false;

      if (!useBrowser || !usePage) {
        console.log('🌐 启动新的浏览器会话...');

        // 增强的页面访问重试机制
        let pageLoadSuccess = false;
        let retryCount = 0;
        const maxPageLoadRetries = 3;

        while (!pageLoadSuccess && retryCount < maxPageLoadRetries) {
          try {
            retryCount++;
            console.log(`🔄 第 ${retryCount} 次尝试启动浏览器和访问页面...`);

            // 每次重试都创建新的浏览器实例
            if (useBrowser) {
              try {
                await useBrowser.close();
              } catch (closeError) {
                console.warn('关闭现有浏览器时出现警告:', closeError.message);
              }
            }

            useBrowser = await this.initBrowser();
            usePage = await useBrowser.newPage();
            await usePage.setViewport({ width: this.config.windowWidth, height: this.config.windowHeight });

            // 设置用户代理和其他反检测措施
            await usePage.setUserAgent(this.config.userAgent);
            await usePage.setExtraHTTPHeaders({
              'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            });

            console.log('📖 访问 CoinGlass 页面...');

            // 增加页面加载超时时间并使用更宽松的等待策略
            await usePage.goto(this.config.coinglassBaseUrl, {
              waitUntil: 'domcontentloaded',
              timeout: this.config.pageTimeout * 2 // 双倍超时时间
            });

            // 额外等待网络稳定
            console.log('⏳ 等待页面网络稳定...');
            await usePage.waitForTimeout(this.config.waitTimes.initial * 2); // 双倍等待时间

            // 验证页面是否真正加载成功
            const pageTitle = await usePage.title();
            if (pageTitle && pageTitle.includes('CoinGlass')) {
              console.log(`✅ 页面加载成功: ${pageTitle}`);
              pageLoadSuccess = true;
            } else {
              throw new Error('页面标题验证失败，可能未正确加载');
            }

          } catch (pageError) {
            console.warn(`⚠️ 第 ${retryCount} 次页面访问失败: ${pageError.message}`);

            if (retryCount >= maxPageLoadRetries) {
              throw new Error(`页面访问失败，已重试 ${maxPageLoadRetries} 次: ${pageError.message}`);
            }

            // 重试间隔
            const retryDelay = 5000 * retryCount; // 递增延迟
            console.log(`⏳ 等待 ${retryDelay/1000} 秒后重试...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }

        shouldCleanup = true;
      } else {
        console.log('📋 复用现有浏览器会话');

        // 验证现有页面是否仍然可用
        try {
          const pageTitle = await usePage.title();
          if (!pageTitle || !pageTitle.includes('CoinGlass')) {
            throw new Error('现有页面已失效');
          }
        } catch (pageError) {
          console.warn('⚠️ 现有页面失效，需要重新创建:', pageError.message);
          useBrowser = await this.initBrowser();
          usePage = await useBrowser.newPage();
          await usePage.setViewport({ width: this.config.windowWidth, height: this.config.windowHeight });

          await usePage.goto(this.config.coinglassBaseUrl, {
            waitUntil: 'domcontentloaded',
            timeout: this.config.pageTimeout * 2
          });

          await usePage.waitForTimeout(this.config.waitTimes.initial * 2);
          shouldCleanup = true;
        }
      }

      // === 智能切换交易所 ===
      await this.switchExchangeIfNeeded(usePage, exchange);
      await usePage.waitForTimeout(this.config.waitTimes.exchange);

      // 确定要抓取的币种列表
      const coinsToScrape = requestedCoins || [coin];
      const allCoinsData = {};
      // 使用标准化交易所名称，与其他模块保持一致
      const normalizedExchange = normalizeExchangeName(exchange);

      for (const targetCoin of coinsToScrape) {
        // 为重复币种创建唯一标识符（基于交易所和时间框架）
        const coinKey = `${targetCoin}_${normalizedExchange}_${timeframe}`;

        // 🔒 修正：币种切换失败时重新访问页面
        const coinSwitchSuccess = await this.switchCoin(usePage, targetCoin);
        if (!coinSwitchSuccess) {
          console.warn(`❌ 币种 ${targetCoin} 切换失败，重新访问页面...`);

          // 重新访问 CoinGlass 页面
          try {
            console.log(`🌐 重新访问 CoinGlass 页面以恢复币种 ${targetCoin}...`);
            await usePage.goto(this.config.coinglassBaseUrl, {
              waitUntil: 'networkidle2',
              timeout: this.config.pageTimeout
            });

            console.log('⏳ 等待页面完全加载...');
            await usePage.waitForTimeout(this.config.waitTimes.initial);

            // 重新切换交易所
            await this.switchExchangeIfNeeded(usePage, exchange);
            await usePage.waitForTimeout(this.config.waitTimes.exchange);

            // 再次尝试切换币种
            const retrySuccess = await this.switchCoin(usePage, targetCoin);
            if (!retrySuccess) {
              console.error(`❌ 币种 ${targetCoin} 重新访问页面后切换仍然失败，跳过此币种`);
              continue; // 只有在重新访问后仍然失败才跳过
            }

            console.log(`✅ 币种 ${targetCoin} 重新访问页面后切换成功`);
          } catch (reloadError) {
            console.error(`❌ 重新访问页面失败: ${reloadError.message}`);
            continue; // 重新访问失败才跳过
          }
        }

        // 等待页面数据更新，特别是切换币种后需要更长时间
        await usePage.waitForTimeout(this.config.waitTimes.coin);

        // === 切换时间框架 (修复：总是执行时间框架切换) ===
        await this.switchTimeframe(usePage, timeframe);
        await usePage.waitForTimeout(this.config.waitTimes.data);

        // 🔍 验证切换结果（双重验证）
        const switchVerification = await this.verifySwitchResult(usePage, exchange, targetCoin);

        if (!switchVerification.success) {
          console.warn(`⚠️ 切换验证失败: ${switchVerification.reason}`);

          // 🔄 使用智能页面重新加载机制
          console.log(`🔄 币种 ${targetCoin} 验证失败，启动智能页面重新加载...`);

          try {
            const reloadResult = await this.performSmartPageReload(
              usePage,
              exchange,
              targetCoin,
              timeframe,
              switchVerification.reason
            );

            if (reloadResult.success) {
              console.log(`✅ 智能重新加载成功，继续处理 ${targetCoin}`);
              // 重新加载成功，继续后续的数据提取流程
            } else {
              console.error(`❌ 智能重新加载失败，跳过币种 ${targetCoin}`);
              continue; // 跳过此币种
            }
          } catch (reloadError) {
            console.error(`❌ 智能页面重新加载异常: ${reloadError.message}`);
            console.log(`⚠️ 跳过币种 ${targetCoin}，将在下次监控中重试`);
            continue; // 跳过此币种
          }
        }

        // 截图（可选，用于调试）
        if (process.env.COINGLASS_DEBUG_SCREENSHOTS === 'true') {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const filename = `${timestamp}_${exchange}_${targetCoin}.png`;
          const screenshotPath = path.join(this.config.screenshotDir, filename);

          // 确保截图目录存在
          if (!fs.existsSync(path.dirname(screenshotPath))) {
            fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
          }

          await usePage.screenshot({ path: screenshotPath, fullPage: false });
          console.log(`📸 数据采集前截图已保存: ${screenshotPath}`);
        }

        // 提取数据
        console.log(`📊 提取 ${targetCoin} 数据...`);
        const extractedData = await this.extractTableData(usePage, exchange, targetCoin);

        // 使用与数据存储一致的键名格式：币种_交易所_时间框架（标准化交易所名称）
        const actualCoinKey = `${targetCoin}_${normalizedExchange}_${timeframe}`;

        if (extractedData && extractedData.coins && extractedData.coins[actualCoinKey]) {
          const coinData = extractedData.coins[actualCoinKey];

          // 🔍 严格的数据验证机制
          const validationResult = this.validateCoinData(coinData, targetCoin, exchange, timeframe);

          if (!validationResult.isValid) {
            console.warn(`❌ ${targetCoin} 数据验证失败: ${validationResult.reason}`);
            console.log(`⚠️ 跳过此币种，避免使用错误数据`);
            continue; // 跳过此币种
          }

          console.log(`📊 成功提取真实数据: 找到 ${Object.keys(extractedData.coins).length} 个币种`);
          console.log(`✅ 数据验证通过: ${validationResult.reason}`);

          // 为重复币种创建唯一标识的数据副本
          const coinDataWithKey = {
            ...coinData,
            exchange: exchange,
            timeframe: timeframe,
            coin_key: coinKey,
            symbol_display: `${targetCoin} (${timeframe === '24h' ? '24小时' : timeframe})`,
            scrape_timestamp: new Date().toISOString(),
            validation_info: validationResult // 添加验证信息
          };

          // 对于重复币种，优先使用复合键存储，避免数据覆盖
          allCoinsData[actualCoinKey] = coinDataWithKey;
          console.log(`💾 存储复合键数据: ${actualCoinKey} -> 利率 ${coinDataWithKey.annual_rate}%, 历史数据 ${coinDataWithKey.history?.length || 0} 条...`);
          console.log(`✅ ${targetCoin} 数据抓取成功`);
        } else {
          console.warn(`⚠️ ${targetCoin} 数据抓取失败`);
          console.log(`🔍 可用的数据键: ${extractedData?.coins ? Object.keys(extractedData.coins).join(', ') : '无'}`);
          console.log(`🔍 期望的键: ${actualCoinKey}`);
        }
      }

      // 关闭浏览器（仅当创建新会话时）
      if (shouldCleanup) {
        try {
          await useBrowser.close();
        } catch (closeError) {
          console.warn('浏览器关闭警告:', closeError.message);
        }
      }

      return {
        success: true,
        exchange: exchange,
        coins: allCoinsData,
        timestamp: new Date().toISOString(),
        total_coins: Object.keys(allCoinsData).length
      };

    } catch (error) {
      console.error('❌ 抓取数据失败:', error);
      return {
        success: false,
        error: error.message,
        exchange: exchange,
        coins: {}
      };
    }
  }

  /**
   * 抓取 CoinGlass 数据 - 支持多币种抓取（保持向后兼容）
   */
  async scrapeCoinGlassData(exchange = 'OKX', coin = 'USDT', timeframe = '1h', requestedCoins = null) {
    // 直接调用新的会话支持方法，保持向后兼容
    return await this.scrapeCoinGlassDataWithSession(exchange, coin, timeframe, requestedCoins);
  }

  /**
   * 切换交易所
   */
  async switchExchange(page, targetExchange) {
    try {
      console.log(`🔄 切换交易所: ${targetExchange}...`);

      // 等待页面加载完成
      await page.waitForSelector('[role="combobox"]', { timeout: 10000 });

      // 使用更精确的交易所选择器定位策略
      const exchangeFound = await page.evaluate((targetExchange) => {
        console.log(`🔍 开始定位交易所选择器，目标: ${targetExchange}`);

        // 策略1：查找 button[role="combobox"]（基于实际DOM结构）
        const exchangeButtons = Array.from(document.querySelectorAll('button[role="combobox"]'));
        console.log(`找到 ${exchangeButtons.length} 个 button[role="combobox"] 元素`);

        // 策略2：查找带有 MuiSelect 相关类的元素
        const selectElements = Array.from(document.querySelectorAll('[class*="MuiSelect"]'));
        console.log(`找到 ${selectElements.length} 个 MuiSelect 相关元素`);

        // 策略3：结合属性查找交易所选择器
        const allComboboxes = Array.from(document.querySelectorAll('[role="combobox"]'));
        console.log(`找到 ${allComboboxes.length} 个 combobox 元素`);

        let exchangeElement = null;
        let elementType = '';

        // 方法1：优先使用 button[role="combobox"]（最符合实际DOM）
        if (exchangeButtons.length > 0) {
          exchangeElement = exchangeButtons[0];
          elementType = 'button[role="combobox"]';
          console.log(`✅ 使用button选择器定位交易所`);
        }
        // 方法2：查找 MuiSelect 根元素
        else if (selectElements.length > 0) {
          // 查找可点击的选择器按钮
          for (const selectEl of selectElements) {
            const button = selectEl.querySelector('button') || selectEl;
            if (button && button.getAttribute('role') === 'combobox') {
              exchangeElement = button;
              elementType = 'MuiSelect button';
              console.log(`✅ 使用MuiSelect定位交易所`);
              break;
            }
          }
        }
        // 方法3：从所有combobox中识别交易所选择器
        else if (allComboboxes.length > 0) {
          // 通过元素内容和属性识别交易所选择器
          for (const combobox of allComboboxes) {
            const text = combobox.textContent?.trim().toLowerCase() || '';
            const value = combobox.value?.toLowerCase() || '';

            // 排除币种选择器（通常包含币种符号）
            const isCoinSelector = ['usdt', 'btc', 'eth', 'usdc'].some(coin =>
              text.includes(coin) || value.includes(coin)
            );

            // 排除语言选择器
            const isLanguageSelector = ['中文', 'english', '日本語'].some(lang =>
              text.includes(lang) || value.includes(lang)
            );

            if (!isCoinSelector && !isLanguageSelector) {
              exchangeElement = combobox;
              elementType = 'filtered combobox';
              console.log(`✅ 使用过滤的combobox定位交易所`);
              break;
            }
          }
        }

        if (!exchangeElement) {
          console.error('❌ 未找到交易所选择器');
          console.log('调试信息:');
          console.log(`- button[role="combobox"]: ${exchangeButtons.length}个`);
          console.log(`- MuiSelect元素: ${selectElements.length}个`);
          console.log(`- 总combobox: ${allComboboxes.length}个`);
          return false;
        }

        console.log(`🎯 找到交易所选择器 (${elementType})，准备点击`);
        console.log(`元素信息: tagName=${exchangeElement.tagName}, text="${exchangeElement.textContent?.trim()}", value="${exchangeElement.value || ''}"`);

        // 点击交易所选择器
        exchangeElement.click();

        // 等待下拉选项出现并选择目标交易所
        return new Promise((resolve) => {
          setTimeout(() => {
            try {
              const options = Array.from(document.querySelectorAll('[role="option"]'));
              console.log(`找到 ${options.length} 个选项`);

              // 查找目标交易所
              const targetOption = options.find(option => {
                const text = option.textContent.trim().toLowerCase();
                return text === targetExchange.toLowerCase() ||
                       text.includes(targetExchange.toLowerCase()) ||
                       targetExchange.toLowerCase().includes(text);
              });

              if (targetOption) {
                console.log(`✅ 找到交易所选项: "${targetOption.textContent.trim()}"`);
                targetOption.click();
                resolve(true);
              } else {
                console.log(`❌ 未找到交易所选项: ${targetExchange}`);
                console.log('可用选项:', options.map(opt => `"${opt.textContent.trim()}"`));
                resolve(false);
              }
            } catch (error) {
              console.error('选择交易所选项时出错:', error);
              resolve(false);
            }
          }, 1500); // 增加等待时间确保下拉选项完全加载
        });
      }, targetExchange);

      if (exchangeFound) {
        await page.waitForTimeout(this.config.waitTimes.exchange);
        console.log(`🔄 切换交易所: ${targetExchange} 成功`);
      } else {
        console.log(`⚠️ 切换交易所: ${targetExchange} 失败`);
      }

      return exchangeFound;

    } catch (error) {
      console.error('❌ 切换交易所失败:', error);
      return false;
    }
  }

  /**
   * 获取当前页面选中的交易所
   */
  async getCurrentExchange(page) {
    try {
      const currentExchange = await page.evaluate(() => {
        // 定义需要排除的关键词（语言、地区等非交易所选项）
        const excludeKeywords = [
          '简体中文', '繁体中文', 'English', '日本語', '한국어',
          '中文', '语言', 'Language', '地区', 'Region',
          '简体', '繁体', '设置', 'Settings'
        ];

        // 定义有效的交易所关键词
        const validExchangeKeywords = [
          'binance', 'okx', 'bybit', 'huobi', 'kucoin', 'mexc',
          'gate.io', 'bitget', 'crypto.com', 'coinbase', 'kraken',
          'ftx', 'bitfinex', 'bittrex', 'poloniex'
        ];

        // 使用与switchExchange相同的定位策略查找交易所元素
        const exchangeButtons = Array.from(document.querySelectorAll('button[role="combobox"]'));
        const selectElements = Array.from(document.querySelectorAll('[class*="MuiSelect"]'));
        const allComboboxes = Array.from(document.querySelectorAll('[role="combobox"]'));

        let exchangeElement = null;
        let bestMatch = null;

        // 方法1：优先使用 button[role="combobox"]
        if (exchangeButtons.length > 0) {
          console.log(`找到 ${exchangeButtons.length} 个 button[role="combobox"] 元素`);

          // 遍历所有按钮，寻找交易所选择器
          for (const button of exchangeButtons) {
            const buttonText = button.textContent?.trim() || '';
            console.log(`检查按钮文本: "${buttonText}"`);

            // 检查是否包含排除关键词
            const isExcluded = excludeKeywords.some(keyword =>
              buttonText.toLowerCase().includes(keyword.toLowerCase())
            );

            if (isExcluded) {
              console.log(`跳过非交易所按钮: "${buttonText}"`);
              continue;
            }

            // 检查是否包含有效交易所关键词
            const isValidExchange = validExchangeKeywords.some(exchange =>
              buttonText.toLowerCase().includes(exchange.toLowerCase())
            );

            if (isValidExchange) {
              bestMatch = button;
              console.log(`找到交易所按钮: "${buttonText}"`);
              break;
            }
          }

          exchangeElement = bestMatch;
        }
        // 方法2：查找 MuiSelect 根元素
        else if (selectElements.length > 0) {
          console.log(`找到 ${selectElements.length} 个 MuiSelect 元素`);

          for (const selectEl of selectElements) {
            const button = selectEl.querySelector('button') || selectEl;
            if (button && button.getAttribute('role') === 'combobox') {
              const buttonText = button.textContent?.trim() || '';
              console.log(`检查MuiSelect按钮文本: "${buttonText}"`);

              // 检查是否包含排除关键词
              const isExcluded = excludeKeywords.some(keyword =>
                buttonText.toLowerCase().includes(keyword.toLowerCase())
              );

              if (isExcluded) {
                console.log(`跳过非交易所MuiSelect: "${buttonText}"`);
                continue;
              }

              // 检查是否包含有效交易所关键词
              const isValidExchange = validExchangeKeywords.some(exchange =>
                buttonText.toLowerCase().includes(exchange.toLowerCase())
              );

              if (isValidExchange) {
                bestMatch = button;
                console.log(`找到交易所MuiSelect: "${buttonText}"`);
                break;
              }
            }
          }

          exchangeElement = bestMatch;
        }
        // 方法3：从所有combobox中识别交易所选择器
        else if (allComboboxes.length > 0) {
          console.log(`找到 ${allComboboxes.length} 个 combobox 元素`);

          for (const combobox of allComboboxes) {
            const buttonText = combobox.textContent?.trim() || '';
            console.log(`检查combobox文本: "${buttonText}"`);

            // 检查是否包含排除关键词
            const isExcluded = excludeKeywords.some(keyword =>
              buttonText.toLowerCase().includes(keyword.toLowerCase())
            );

            if (isExcluded) {
              console.log(`跳过非交易所combobox: "${buttonText}"`);
              continue;
            }

            // 检查是否包含有效交易所关键词
            const isValidExchange = validExchangeKeywords.some(exchange =>
              buttonText.toLowerCase().includes(exchange.toLowerCase())
            );

            if (isValidExchange) {
              bestMatch = combobox;
              console.log(`找到交易所combobox: "${buttonText}"`);
              break;
            }
          }

          exchangeElement = bestMatch;
        }

        if (!exchangeElement) {
          console.log('未找到有效的交易所选择器');
          return null;
        }

        // 获取当前选中的交易所名称
        const buttonText = exchangeElement.textContent?.trim();
        console.log(`最终选择器文本: "${buttonText}"`);

        if (buttonText) {
          // 提取交易所名称（优先匹配已知交易所）
          const exchangeMatch = buttonText.match(/(Binance|OKX|Bybit|Huobi|KuCoin|MEXC|Gate\.io|Bitget|Crypto\.com|Coinbase|Kraken|FTX|Bitfinex|Bittrex|Poloniex)/i);
          if (exchangeMatch) {
            const exchangeName = exchangeMatch[1].toLowerCase();
            console.log(`提取到交易所名称: ${exchangeName}`);
            return exchangeName;
          }

          // 如果没有匹配到已知交易所，检查是否包含有效关键词
          const foundKeyword = validExchangeKeywords.find(exchange =>
            buttonText.toLowerCase().includes(exchange.toLowerCase())
          );

          if (foundKeyword) {
            console.log(`通过关键词识别交易所: ${foundKeyword}`);
            return foundKeyword;
          }
        }

        return null;
      });

      return currentExchange;
    } catch (error) {
      console.error('获取当前交易所失败:', error);
      return null;
    }
  }

  /**
   * 智能切换交易所（仅在需要时切换）
   */
  async switchExchangeIfNeeded(page, targetExchange) {
    try {
      // 首先等待页面完全加载并稳定
      await this.waitForPageStability(page);

      // 读取当前页面交易所状态
      const currentExchange = await this.getCurrentExchange(page);

      // 如果无法获取当前交易所，等待一下再试
      if (currentExchange === null) {
        console.log('⏳ 页面交易所状态未就绪，等待后重试...');
        await page.waitForTimeout(2000);
        const retryExchange = await this.getCurrentExchange(page);

        if (retryExchange === null) {
          console.log('⚠️ 无法获取当前交易所状态，强制执行切换');
        } else {
          console.log(`✅ 重新检测到当前交易所: ${retryExchange}`);
        }
      }

      // 标准化交易所名称比较（忽略大小写）
      const normalizedCurrent = currentExchange?.toLowerCase();
      const normalizedTarget = targetExchange?.toLowerCase();

      if (normalizedCurrent === normalizedTarget && currentExchange !== null) {
        console.log(`📍 当前交易所已是 ${targetExchange}，跳过切换`);
        return true;
      }

      console.log(`🔄 交易所需要切换: ${currentExchange || '未知'} -> ${targetExchange}`);

      // 执行实际切换
      const success = await this.switchExchange(page, targetExchange);

      if (success) {
        // 切换后等待页面稳定
        await page.waitForTimeout(this.config.waitTimes.exchange);

        // 验证切换结果
        const verifyExchange = await this.getCurrentExchange(page);
        const normalizedVerify = verifyExchange?.toLowerCase();

        if (normalizedVerify === normalizedTarget) {
          console.log(`✅ 交易所切换成功: ${targetExchange}`);
        } else {
          console.log(`⚠️ 交易所切换验证失败: 期望 ${targetExchange}，实际 ${verifyExchange || '未知'}`);
        }
      } else {
        console.log(`❌ 交易所切换失败: ${targetExchange}`);
      }

      return success;

    } catch (error) {
      console.error('❌ 智能交易所切换失败:', error);
      return false;
    }
  }

  /**
   * 等待页面完全加载并稳定
   */
  async waitForPageStability(page) {
    try {
      // 等待主要的DOM元素加载完成
      await page.waitForSelector('[role="combobox"]', { timeout: 10000 }).catch(() => {
        console.log('⚠️ 未找到combobox元素，继续执行...');
      });

      // 等待页面JavaScript执行完成
      await page.waitForFunction(() => {
        return document.readyState === 'complete' &&
               window.performance.timing.loadEventEnd > 0;
      }, { timeout: 15000 }).catch(() => {
        console.log('⚠️ 页面加载超时，继续执行...');
      });

      // 额外等待确保动态内容加载完成
      await page.waitForTimeout(1000);

      console.log('✅ 页面状态稳定');
    } catch (error) {
      console.warn('⚠️ 页面稳定性检测失败:', error.message);
    }
  }

  /**
   * 切换币种 - Chrome DevTools验证方案
   */
  async switchCoin(page, coin) {
    try {
      console.log(`🔄 切换币种: ${coin}...`);

      // 使用Chrome DevTools验证的切换方案
      const success = await this.switchCoinMethod(page, coin);

      if (success) {
        console.log(`🔄 切换币种: ${coin} 成功`);

        // 验证切换结果
        const verification = await this.verifyCoinSwitch(page, coin);
        if (verification.success) {
          return true;
        } else {
          console.warn(`⚠️ 币种切换验证失败: ${verification.reason}`);
          return false;
        }
      } else {
        console.log(`❌ 切换币种: ${coin} 失败`);
        return false;
      }

    } catch (error) {
      console.error(`❌ 切换币种过程中发生错误: ${coin}`, error);
      return false;
    }
  }

  
  /**
   * 币种切换：Chrome DevTools验证方案
   * 流程：聚焦输入框 -> 按下箭头键触发下拉 -> 输入币种 -> 点击选项 -> 等待页面更新
   */
  async switchCoinMethod(page, coin) {
    try {
    
      // 步骤1：定位并聚焦币种输入框
      const inputFound = await page.evaluate(() => {
        // 查找最适合的币种输入框
        const inputs = Array.from(document.querySelectorAll('input[role="combobox"]'));

        // 筛选出币种输入框（排除语言选择器）
        const coinInputs = inputs.filter(input => {
          const value = input.value || '';
          const isLanguageSelector = ['简体中文', 'English', '繁體中文', '日本語'].some(lang =>
            value.includes(lang)
          );
          const isSearchBox = input.placeholder && ['搜索', 'search', 'Search'].some(term =>
            input.placeholder.toLowerCase().includes(term)
          );

          // 选择有 autocomplete 属性或包含币种值的输入框
          return !isLanguageSelector && !isSearchBox &&
                 (input.hasAttribute('autocomplete') ||
                  value.length > 0 && !['简体中文', 'English', '繁體中文', '日本語'].some(lang =>
                    value.includes(lang)
                  ));
        });

        if (coinInputs.length > 0) {
          const targetInput = coinInputs[0];
          // 聚焦并点击输入框
          targetInput.focus();
          targetInput.click();
          return true;
        }
        return false;
      });

      if (!inputFound) {
        console.log('❌ 未找到币种输入框');
        return false;
      }

      await page.waitForTimeout(this.config.waitTimes.retry);

      // 步骤2：按下箭头键触发下拉选项列表展开
      await page.evaluate(() => {
        const activeElement = document.activeElement;
        if (activeElement) {
          activeElement.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowDown',
            code: 'ArrowDown',
            bubbles: true
          }));
        }
      });

      await page.waitForTimeout(200);

      // 步骤3：清空并输入目标币种
      await page.evaluate((targetCoin) => {
        const activeElement = document.activeElement;
        if (activeElement && activeElement.role === 'combobox') {
          // 完全清空输入框
          activeElement.value = '';
          activeElement.focus();
          activeElement.select();
          activeElement.value = '';

          // 输入目标币种
          activeElement.value = targetCoin;

          // 触发输入事件
          activeElement.dispatchEvent(new Event('input', { bubbles: true }));
          activeElement.dispatchEvent(new Event('change', { bubbles: true }));

          console.log(`✅ 已输入币种: "${targetCoin}"`);
        }
      }, coin);

      await page.waitForTimeout(500);

      // 步骤4：查找并点击目标币种选项
      const optionClicked = await page.evaluate((targetCoin) => {
        const options = Array.from(document.querySelectorAll('[role="option"]'));
        console.log(`📋 找到 ${options.length} 个选项，查找目标: ${targetCoin}`);

        // 查找精确匹配的选项
        const targetOption = options.find(option => {
          const text = option.textContent.trim();
          return text === targetCoin;
        });

        if (targetOption) {
          console.log(`✅ 找到精确匹配选项: "${targetOption.textContent.trim()}"`);
          targetOption.click();
          targetOption.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          return true;
        } else {
          // 如果没有精确匹配，尝试部分匹配
          const partialOption = options.find(option => {
            const text = option.textContent.trim().toUpperCase();
            return text.includes(targetCoin.toUpperCase());
          });

          if (partialOption) {
            console.log(`✅ 找到部分匹配选项: "${partialOption.textContent.trim()}"`);
            partialOption.click();
            partialOption.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            return true;
          }

          console.log(`❌ 未找到币种选项: ${targetCoin}`);
          console.log(`可用选项: ${options.map(opt => `"${opt.textContent.trim()}"`).slice(0, 10).join(', ')}`);
          return false;
        }
      }, coin);

      if (!optionClicked) {
        console.log(`❌ 未找到币种选项，可能是交易所不支持或币种名称不匹配`);
        return false;
      }

      // 步骤5：等待页面更新完成
      await page.waitForTimeout(this.config.waitTimes.verification);

      return true;

    } catch (error) {
      console.error(`❌ Chrome DevTools方案币种切换失败: ${coin}`, error.message);
      return false;
    }
  }


  /**
   * 验证币种切换结果
   */
  async verifyCoinSwitch(page, expectedCoin) {
    try {
      const verification = await page.evaluate((expectedCoin) => {
        // 检查页面标题
        const titleIncludesCoin = document.title.toUpperCase().includes(expectedCoin.toUpperCase());

        // 检查页面内容
        const bodyIncludesCoin = document.body.textContent.toUpperCase().includes(expectedCoin.toUpperCase());

        // 检查当前选中的币种显示
        const selectedElements = document.querySelectorAll('.selected, .active, [aria-selected="true"]');
        let isSelected = false;
        for (const el of selectedElements) {
          if (el.textContent.toUpperCase().includes(expectedCoin.toUpperCase())) {
            isSelected = true;
            break;
          }
        }

        // 检查图表标题是否包含目标币种
        const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
        const chartTitleIncludesCoin = headings.some(heading =>
          heading.textContent.toUpperCase().includes(expectedCoin.toUpperCase())
        );

        // 检查币种选择器的当前值
        const comboboxValues = Array.from(document.querySelectorAll('input[role="combobox"]'))
          .map(input => input.value)
          .filter(value => value.toUpperCase().includes(expectedCoin.toUpperCase()));

        return {
          success: titleIncludesCoin || bodyIncludesCoin || isSelected || chartTitleIncludesCoin || comboboxValues.length > 0,
          titleIncludesCoin,
          bodyIncludesCoin,
          isSelected,
          chartTitleIncludesCoin,
          hasComboboxValue: comboboxValues.length > 0,
          reason: titleIncludesCoin ? '标题包含目标币种' :
                  bodyIncludesCoin ? '页面内容包含目标币种' :
                  isSelected ? '元素被选中' :
                  chartTitleIncludesCoin ? '图表标题包含目标币种' :
                  comboboxValues.length > 0 ? '选择器包含目标币种' :
                  '未找到目标币种相关内容'
        };
      }, expectedCoin);

      // 验证结果只在失败时输出详细信息，成功时不显示
      if (!verification.success) {
        console.log(`🔍 验证 ${expectedCoin} 切换失败: ${verification.reason}`);
      }
      return verification;
    } catch (error) {
      console.error(`❌ 验证币种切换失败:`, error);
      return {
        success: false,
        reason: `验证失败: ${error.message}`
      };
    }
  }

  /**
   * 等待数据刷新 - 简化等待策略
   */
  async waitForDataRefresh(page, expectedCoin) {
    console.log(`⏳ 等待 ${expectedCoin} 数据刷新...`);

    try {
      // 等待网络空闲
      await page.waitForLoadState?.('networkidle') || await page.waitForTimeout(this.config.waitTimes.data);

      // 额外等待确保数据更新
      await page.waitForTimeout(this.config.waitTimes.data);

      console.log(`✅ ${expectedCoin} 数据刷新等待完成`);
    } catch (error) {
      console.error(`❌ 等待数据刷新失败:`, error);
    }
  }

  /**
   * 验证切换结果 - 支持多币种验证
   */
  async verifySwitchResult(page, expectedExchange, expectedCoin) {
    try {
      const result = await page.evaluate((expectedExchange, expectedCoin) => {
        // 获取页面标题
        const pageTitle = document.title;
        let currentExchange = 'unknown';
        let currentCoin = 'unknown';

        // 从页面标题推断交易所和币种
        const engMatch = pageTitle.match(/(\w+)\s+(\w+)\s+Margin\s+Rate\s+History/);
        if (engMatch) {
          currentExchange = engMatch[1].toLowerCase();
          currentCoin = engMatch[2].toUpperCase();
        } else {
          const cnMatch = pageTitle.match(/(\w+)\s+(\w+)\s+杠杆借贷年利率历史图表/);
          if (cnMatch) {
            currentExchange = cnMatch[1].toLowerCase();
            currentCoin = cnMatch[2].toUpperCase();
          }
        }

        // 如果还是unknown，从body文本推断
        if (currentExchange === 'unknown' || currentCoin === 'unknown') {
          const bodyText = document.body.textContent.toLowerCase();
          if (bodyText.includes('okx')) currentExchange = 'okx';  // 统一使用小写
          else if (bodyText.includes('bybit')) currentExchange = 'bybit';  // 统一使用小写
          else if (bodyText.includes('binance')) currentExchange = 'binance';  // 统一使用小写

          // 尝试从页面文本中提取币种符号（更通用的方法）
          const coinMatches = bodyText.match(/\b[A-Z]{2,10}\b/g);
          if (coinMatches && coinMatches.length > 0) {
            // 优先选择常见的币种符号
            const commonCoins = coinMatches.filter(coin =>
              coin.length >= 2 && coin.length <= 10 && /^[A-Z]+$/.test(coin)
            );
            if (commonCoins.length > 0) {
              currentCoin = commonCoins[0];
            }
          }
        }

        // 检查页面上的选择器当前值 - 使用智能识别而非索引假设
        const allComboboxes = document.querySelectorAll('[role="combobox"]');
        console.log(`🔍 验证时找到 ${allComboboxes.length} 个 combobox 元素`);

        // 智能识别交易所选择器
        for (let i = 0; i < allComboboxes.length; i++) {
          const element = allComboboxes[i];
          const text = (element.textContent || '').trim().toLowerCase();
          const value = (element.value || '').toLowerCase();

          // 排除币种选择器
          const isCoinSelector = ['usdt', 'btc', 'eth', 'usdc'].some(coin =>
            text.includes(coin) || value.includes(coin)
          );

          // 排除语言选择器
          const isLanguageSelector = ['中文', 'english', '日本語'].some(lang =>
            text.includes(lang) || value.includes(lang)
          );

          // 如果不是币种或语言选择器，可能是交易所选择器
          if (!isCoinSelector && !isLanguageSelector) {
            const elementValue = element.textContent || element.value;
            if (elementValue && elementValue.toLowerCase().includes(expectedExchange.toLowerCase())) {
              currentExchange = expectedExchange.toLowerCase();  // 统一使用小写
              console.log(`✅ 通过combobox验证交易所: ${elementValue} -> ${expectedExchange}`);
              break;
            }
          }
        }

        // 智能识别币种选择器
        for (let i = 0; i < allComboboxes.length; i++) {
          const element = allComboboxes[i];
          const text = (element.textContent || '').trim().toLowerCase();
          const value = (element.value || '').toLowerCase();

          // 排除语言选择器
          const isLanguageSelector = ['中文', 'english', '日本語'].some(lang =>
            text.includes(lang) || value.includes(lang)
          );

          // 查找包含目标币种或币种相关值的元素
          if (!isLanguageSelector) {
            const elementValue = element.textContent || element.value;
            if (elementValue && (
              elementValue.toUpperCase().includes(expectedCoin.toUpperCase()) ||
              elementValue.includes(expectedCoin) ||
              expectedCoin.toUpperCase().includes(elementValue.toUpperCase())
            )) {
              currentCoin = expectedCoin.toUpperCase();
              console.log(`✅ 通过combobox验证币种: ${elementValue} -> ${expectedCoin}`);
              break;
            }
          }
        }

        // 检查可用的币种选项
        const availableCoins = Array.from(document.querySelectorAll('[role="option"]'))
          .map(option => {
            const text = option.textContent.trim();
            const coinMatch = text.match(/^[A-Z0-9]{2,20}/);
            return coinMatch ? coinMatch[0] : null;
          })
          .filter(coin => coin)
          .filter((coin, index, arr) => arr.indexOf(coin) === index); // 去重

        const exchangeMatch = currentExchange === expectedExchange.toLowerCase();
        const coinMatch = currentCoin === expectedCoin.toUpperCase();

        // 多币种支持：检查期望的币种是否在可用选项中
        const expectedCoinAvailable = availableCoins.includes(expectedCoin.toUpperCase());

        return {
          success: exchangeMatch && (coinMatch || expectedCoinAvailable),
          currentExchange,
          currentCoin,
          expectedExchange: expectedExchange.toLowerCase(),
          expectedCoin: expectedCoin.toUpperCase(),
          pageTitle,
          exchangeMatch,
          coinMatch,
          expectedCoinAvailable,
          availableCoins,
          availableCoinsCount: availableCoins.length,
          reason: !exchangeMatch ? `交易所不匹配: 期望 ${expectedExchange}, 实际 ${currentExchange}` :
                  !expectedCoinAvailable ? `期望币种 ${expectedCoin} 在页面选项中不存在` :
                  !coinMatch ? `币种未完全匹配，但 ${expectedCoin} 在可用选项中` :
                  '切换成功'
        };
      }, expectedExchange, expectedCoin);

      return result;

    } catch (error) {
      console.error('❌ 验证切换结果失败:', error);
      return {
        success: false,
        reason: `验证失败: ${error.message}`,
        currentExchange: 'error',
        currentCoin: 'error'
      };
    }
  }

  /**
   * 切换时间框架
   */
  async switchTimeframe(page, timeframe) {
    try {
      console.log(`🔄 切换时间框架: ${timeframe}...`);

      // 查找时间框架标签页
      const success = await page.evaluate((targetTimeframe) => {
        const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
        console.log(`📋 找到 ${tabs.length} 个标签页`);

        // 调试：输出所有标签页的文本
        tabs.forEach((tab, index) => {
          console.log(`标签页 ${index}: "${tab.textContent.trim()}"`);
        });

        // 查找目标标签页 - 增强匹配逻辑
        const targetTab = tabs.find(tab => {
          const text = tab.textContent.trim();
          if (targetTimeframe === '24h') {
            return text.includes('24') || text.includes('天') || text.includes('Day');
          } else if (targetTimeframe === '1h') {
            return text.includes('1') || text.includes('时') || text.includes('Hour') || text.includes('小时');
          }
          return false;
        });

        console.log(`🎯 目标时间框架: ${targetTimeframe}, 找到标签页: ${targetTab ? targetTab.textContent.trim() : '未找到'}`);

        if (targetTab) {
          // 确保标签页可见
          targetTab.scrollIntoView();

          // 点击标签页
          targetTab.click();
          console.log(`✅ 已点击时间框架标签页: ${targetTab.textContent.trim()}`);
          return true;
        }
        return false;
      }, timeframe);

      await page.waitForTimeout(this.config.waitTimes.verification);

      if (success) {
        console.log(`🔄 切换时间框架: ${timeframe} 成功`);
      } else {
        console.log(`⚠️ 未找到时间框架选项: ${timeframe}，将使用默认时间框架`);
        // 不抛出错误，允许继续使用默认时间框架
      }
    } catch (error) {
      console.error('❌ 切换时间框架失败:', error);
      // 不抛出错误，允许继续使用默认时间框架
    }
  }

  /**
   * 智能页面重新加载机制 - 用于恢复币种切换失败
   */
  async performSmartPageReload(page, exchange, targetCoin, timeframe, failureReason) {
    const maxRetries = 2;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      retryCount++;
      console.log(`🔄 第 ${retryCount} 次智能重新加载页面 (原因: ${failureReason})...`);

      try {
        // 1. 截图保存失败状态
        if (process.env.COINGLASS_DEBUG_SCREENSHOTS === 'true') {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const failureScreenshot = `${timestamp}_RELOAD_${retryCount}_${exchange}_${targetCoin}_failure.png`;
          const failurePath = path.join(this.config.screenshotDir, failureScreenshot);

          if (!fs.existsSync(path.dirname(failurePath))) {
            fs.mkdirSync(path.dirname(failurePath), { recursive: true });
          }

          await page.screenshot({ path: failurePath, fullPage: false });
          console.log(`📸 失败状态截图已保存: ${failurePath}`);
        }

        // 2. 记录失败信息
        const failureInfo = {
          timestamp: new Date().toISOString(),
          exchange,
          coin: targetCoin,
          timeframe,
          reason: failureReason,
          retry_count: retryCount
        };
        console.log(`💾 记录失败信息:`, failureInfo);

        // 3. 重新加载页面
        console.log(`🌐 重新加载 CoinGlass 页面...`);
        await page.reload({
          waitUntil: 'networkidle2',
          timeout: this.config.navigationTimeout
        });

        // 4. 等待页面完全稳定
        console.log(`⏳ 等待页面重新加载完成...`);
        await page.waitForTimeout(this.config.waitTimes.initial);
        await this.waitForPageStability(page);

        // 5. 验证页面基本可用性
        const pageReady = await this.verifyPageReadiness(page);
        if (!pageReady) {
          console.warn(`⚠️ 页面重新加载后仍未就绪，准备第 ${retryCount + 1} 次重试`);
          if (retryCount >= maxRetries) {
            throw new Error('页面重新加载后仍无法正常工作');
          }
          continue;
        }

        // 6. 重新切换交易所
        console.log(`🔄 重新切换交易所: ${exchange}...`);
        const exchangeSuccess = await this.switchExchangeIfNeeded(page, exchange);
        if (!exchangeSuccess) {
          console.warn(`⚠️ 交易所切换失败，准备第 ${retryCount + 1} 次重试`);
          if (retryCount >= maxRetries) {
            throw new Error('页面重新加载后交易所切换失败');
          }
          continue;
        }

        // 7. 重新切换币种
        console.log(`🔄 重新切换币种: ${targetCoin}...`);
        const coinSuccess = await this.switchCoin(page, targetCoin);
        if (!coinSuccess) {
          console.warn(`⚠️ 币种切换失败，准备第 ${retryCount + 1} 次重试`);
          if (retryCount >= maxRetries) {
            throw new Error('页面重新加载后币种切换失败');
          }
          continue;
        }

        // 8. 重新切换时间框架
        console.log(`🔄 重新切换时间框架: ${timeframe}...`);
        await this.switchTimeframe(page, timeframe);
        await page.waitForTimeout(this.config.waitTimes.data);

        // 9. 最终验证
        console.log(`🔍 最终验证页面状态...`);
        const finalVerification = await this.verifySwitchResult(page, exchange, targetCoin);

        if (finalVerification.success) {
          console.log(`✅ 智能页面重新加载成功 (第 ${retryCount} 次尝试)`);
          return {
            success: true,
            retry_count: retryCount,
            verification_result: finalVerification
          };
        } else {
          console.warn(`⚠️ 最终验证失败: ${finalVerification.reason}，准备第 ${retryCount + 1} 次重试`);
          if (retryCount >= maxRetries) {
            throw new Error(`页面重新加载后验证仍然失败: ${finalVerification.reason}`);
          }
        }

      } catch (error) {
        console.error(`❌ 第 ${retryCount} 次页面重新加载失败:`, error.message);
        if (retryCount >= maxRetries) {
          throw new Error(`智能页面重新加载失败: ${error.message}`);
        }
      }

      // 重试前等待
      await page.waitForTimeout(this.config.waitTimes.retry * 2);
    }

    throw new Error('页面重新加载重试次数已用完');
  }

  /**
   * 验证页面是否准备就绪
   */
  async verifyPageReadiness(page) {
    try {
      console.log(`🔍 检查页面准备状态...`);

      const readiness = await page.evaluate(() => {
        // 检查基本DOM元素
        const hasCombobox = document.querySelectorAll('[role="combobox"]').length > 0;
        const hasTable = document.querySelectorAll('table').length > 0;
        const hasContent = document.body.textContent.trim().length > 100;

        // 检查页面是否完全加载
        const isComplete = document.readyState === 'complete';

        // 检查是否有错误元素
        const hasError = document.body.textContent.includes('Error') ||
                        document.body.textContent.includes('错误') ||
                        document.body.textContent.includes('404');

        return {
          hasCombobox,
          hasTable,
          hasContent,
          isComplete,
          hasError,
          isReady: hasCombobox && hasTable && hasContent && isComplete && !hasError
        };
      });

      console.log(`📊 页面准备状态: ${JSON.stringify(readiness)}`);

      if (readiness.isReady) {
        console.log(`✅ 页面准备就绪`);
        return true;
      } else {
        console.warn(`⚠️ 页面未准备就绪: ${readiness.hasError ? '存在错误' : '元素缺失'}`);
        return false;
      }

    } catch (error) {
      console.error(`❌ 页面准备状态检查失败:`, error.message);
      return false;
    }
  }

  /**
   * 验证币种数据的准确性和一致性
   */
  validateCoinData(coinData, expectedCoin, expectedExchange, expectedTimeframe) {
    const validationResults = {
      isValid: true,
      reasons: [],
      warnings: []
    };

    try {
      // 1. 基本数据结构验证
      if (!coinData || typeof coinData !== 'object') {
        validationResults.isValid = false;
        validationResults.reasons.push('数据结构无效');
        return validationResults;
      }

      // 2. 币种符号验证
      if (!coinData.symbol || coinData.symbol !== expectedCoin.toUpperCase()) {
        validationResults.isValid = false;
        validationResults.reasons.push(`币种符号不匹配: 期望 ${expectedCoin.toUpperCase()}, 实际 ${coinData.symbol}`);
        return validationResults;
      }

      // 3. 利率数据验证 - 利率必须大于等于0，接受0%数据
      if (typeof coinData.annual_rate !== 'number' || coinData.annual_rate < 0) {
        validationResults.isValid = false;
        validationResults.reasons.push(`年利率数据无效: ${coinData.annual_rate}% (必须大于等于0)`);
        return validationResults;
      }

      // 4. 合理性检查 - 利率范围验证（一般借贷利率在0%到100%之间）
      if (coinData.annual_rate > 100) {
        validationResults.warnings.push(`年利率异常高: ${coinData.annual_rate}%`);
      } else if (coinData.annual_rate < 0) {
        validationResults.isValid = false;
        validationResults.reasons.push(`年利率不能为负数: ${coinData.annual_rate}%`);
      }

      // 5. 历史数据验证
      if (!coinData.history || !Array.isArray(coinData.history) || coinData.history.length === 0) {
        validationResults.warnings.push('历史数据为空或无效');
      } else {
        // 验证历史数据的一致性 - 利率必须大于等于0，接受0%数据
        const inconsistentData = coinData.history.some(point =>
          typeof point.annual_rate !== 'number' ||
          point.annual_rate < 0 ||
          typeof point.daily_rate !== 'number' ||
          point.daily_rate < 0 ||
          typeof point.hourly_rate !== 'number' ||
          point.hourly_rate < 0 ||
          !point.time
        );

        if (inconsistentData) {
          validationResults.warnings.push('历史数据中存在不一致的记录');
        }

        // 检查当前利率是否在历史数据范围内
        const minRate = Math.min(...coinData.history.map(p => p.annual_rate));
        const maxRate = Math.max(...coinData.history.map(p => p.annual_rate));

        if (coinData.annual_rate < minRate || coinData.annual_rate > maxRate) {
          validationResults.warnings.push(`当前利率 ${coinData.annual_rate}% 超出历史范围 [${minRate}%, ${maxRate}%]`);
        }
      }

      // 6. 交易所和时间框架验证
      if (coinData.exchange && coinData.exchange !== expectedExchange) {
        validationResults.warnings.push(`交易所不匹配: 期望 ${expectedExchange}, 实际 ${coinData.exchange}`);
      }

      if (coinData.timeframe && coinData.timeframe !== expectedTimeframe) {
        validationResults.warnings.push(`时间框架不匹配: 期望 ${expectedTimeframe}, 实际 ${coinData.timeframe}`);
      }

      // 7. 数据时间戳验证
      if (coinData.scrape_timestamp) {
        const scrapeTime = new Date(coinData.scrape_timestamp);
        const now = new Date();
        const ageMinutes = (now - scrapeTime) / (1000 * 60);

        if (ageMinutes > 60) {
          validationResults.warnings.push(`数据时间戳过旧: ${ageMinutes.toFixed(0)} 分钟前`);
        }
      }

      
      // 9. 数据来源验证
      if (!coinData.source || coinData.source !== 'coinglass_real_time') {
        validationResults.warnings.push(`数据来源异常: ${coinData.source}`);
      }

      // 10. 注意：移除了连续相同利率检测，因为这是正常现象
      // 连续相同的利率在稳定市场中是常见情况，不代表数据复用问题

      // 生成综合验证结果
      if (validationResults.reasons.length > 0) {
        validationResults.isValid = false;
        validationResults.reason = validationResults.reasons.join('; ');
      } else if (validationResults.warnings.length > 0) {
        validationResults.reason = `数据验证通过但有警告: ${validationResults.warnings.join('; ')}`;
      } else {
        validationResults.reason = '数据验证完全通过';
      }

      return validationResults;

    } catch (error) {
      return {
        isValid: false,
        reason: `验证过程出错: ${error.message}`,
        reasons: [error.message],
        warnings: []
      };
    }
  }

  /**
   * 提取表格数据 - 修改为支持多币种提取
   */
  async extractTableData(page, exchange, coin) {
    try {
      console.log(`📊 提取数据，预期交易所: ${exchange}, 主要币种: ${coin}`);

      // 在外部处理交易所标准化
      const normalizedExchange = normalizeExchangeName(exchange);

      const data = await page.evaluate((expectedExchange, expectedCoin, normalizedExchangeName) => {
        // 获取页面标题和当前配置
        const pageTitle = document.title;
        let currentExchange = expectedExchange;

        console.log(`🔍 页面内分析: 预期交易所 ${expectedExchange}, 主要币种 ${expectedCoin}, 页面标题: ${pageTitle}`);

        // 尝试从页面标题验证（但不依赖）
        const engMatch = pageTitle.match(/(\w+)\s+(\w+)\s+Margin\s+Rate\s+History/);
        let currentCoin = expectedCoin.toUpperCase(); // 默认使用传入的币种

        if (engMatch) {
          const titleExchange = engMatch[1].toLowerCase();
          const titleCoin = engMatch[2].toUpperCase();
          console.log(`📋 标题解析: ${titleExchange}/${titleCoin}`);
          currentExchange = titleExchange; // 使用页面标题中的交易所
          currentCoin = titleCoin; // 使用页面标题中的币种
        }

        // 提取完整的表格数据
        const tables = document.querySelectorAll('table');
        console.log(`📋 找到 ${tables.length} 个表格`);

        // 详细检查每个表格的内容
        tables.forEach((table, index) => {
          const rowCount = table.querySelectorAll('tr').length;
          console.log(`📋 表格 ${index}: ${rowCount} 行`);
          const firstRowText = table.querySelector('tr')?.textContent?.substring(0, 100) || '无内容';
          console.log(`📋 表格 ${index} 首行内容: ${firstRowText}`);
        });

        let allCoinsData = {};

        if (tables.length > 1 && tables[1]) {
          console.log(`📊 使用第二个表格进行分析，行数: ${tables[1].querySelectorAll('tr').length}`);
          const rows = tables[1].querySelectorAll('tr');

          // 输出表格的表头信息
          if (rows.length > 0) {
            const headerRow = rows[0];
            const headerCells = headerRow.querySelectorAll('th, td');
            console.log(`📋 表头: ${Array.from(headerCells).map(cell => cell.textContent.trim()).join(' | ')}`);
          }

          // 数据从第1行开始（跳过表头）
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const cells = row.querySelectorAll('td');

            // 输出前几行的详细信息用于调试
            if (i <= 3) {
              console.log(`🔍 第${i}行调试信息:`);
              console.log(`  - 单元格数量: ${cells.length}`);
              for (let j = 0; j < cells.length; j++) {
                console.log(`  - 单元格${j}: "${cells[j].textContent.trim()}"`);
              }
            }

            if (cells.length >= 4) {
              const timeText = cells[0].textContent.trim();
              const annualRateText = cells[1].textContent.trim();
              const dailyRateText = cells[2].textContent.trim();
              const hourlyRateText = cells[3].textContent.trim();

              console.log(`🔍 第${i}行解析: 时间="${timeText}", 年利率="${annualRateText}", 日利率="${dailyRateText}", 小时利率="${hourlyRateText}"`);

              const annualRateMatch = annualRateText.match(/(\d+\.?\d*)%/);
              const dailyRateMatch = dailyRateText.match(/(\d+\.?\d*)%/);
              const hourlyRateMatch = hourlyRateText.match(/(\d+\.?\d*)%/);

              if (annualRateMatch) {
                const rate = parseFloat(annualRateMatch[1]);
                console.log(`📈 找到数据点: ${timeText} -> ${rate}% (币种: ${expectedCoin})`);

                // 严格验证：利率必须大于0
                if (rate <= 0) {
                  console.log(`❌ 年利率必须大于0: ${rate}%，跳过此数据点`);
                  continue;
                }

                // 严格验证：必须有完整的年利率、日利率和小时利率数据，不接受计算填充
                if (!dailyRateMatch) {
                  console.log(`❌ 缺少日利率数据: ${timeText} | ${dailyRateText}，跳过此数据点`);
                  continue;
                }
                if (!hourlyRateMatch) {
                  console.log(`❌ 缺少小时利率数据: ${timeText} | ${hourlyRateText}，跳过此数据点`);
                  continue;
                }

                const dailyRate = parseFloat(dailyRateMatch[1]);
                const hourlyRate = parseFloat(hourlyRateMatch[1]);

                // 严格验证：日利率和小时利率也必须大于等于0，接受0%数据
                if (dailyRate < 0) {
                  console.log(`❌ 日利率不能为负数: ${dailyRate}%，跳过此数据点`);
                  continue;
                }
                if (hourlyRate < 0) {
                  console.log(`❌ 小时利率不能为负数: ${hourlyRate}%，跳过此数据点`);
                  continue;
                }

                const dataPoint = {
                  time: timeText,
                  annual_rate: rate,
                  daily_rate: dailyRate,
                  hourly_rate: hourlyRate
                };

                // 使用复合键作为数据标识，确保数据唯一性
                // 从页面标题或URL推断时间框架
                const pageUrl = window.location.href;
                let actualTimeframe = '1h';
                if (pageUrl.includes('24h') || document.title.includes('24')) {
                  actualTimeframe = '24h';
                }

                // 统一数据键格式：使用传入的标准化交易所名称
                const coinKey = `${expectedCoin.toUpperCase()}_${normalizedExchangeName}_${actualTimeframe}`;

                // 只为当前请求的币种创建数据
                if (!allCoinsData[coinKey]) {
                  console.log(`🆕 创建复合键数据: ${coinKey}, 首个利率: ${rate}%`);
                  allCoinsData[coinKey] = {
                    symbol: expectedCoin.toUpperCase(),
                    exchange: normalizedExchangeName, // 使用传入的标准化交易所名称
                    timeframe: actualTimeframe,
                    coin_key: coinKey,
                    annual_rate: rate,
                    daily_rate: dataPoint.daily_rate,
                    hourly_rate: dataPoint.hourly_rate,
                    history: [],
                    source: 'coinglass_real_time'
                  };
                }

                allCoinsData[coinKey].history.push(dataPoint);
              } else {
                console.log(`❌ 数据解析失败: ${timeText} | ${annualRateText} | ${dailyRateText} | ${hourlyRateText}`);
              }
            } else {
              console.log(`⚠️ 第${i}行单元格数量不足: ${cells.length} (期望至少4个)`);
            }
          }
        }

        // 如果没有找到真实数据，抛出错误而不是创建模拟数据
        if (Object.keys(allCoinsData).length === 0) {
          console.error(`❌ 错误: 未能从 CoinGlass 获取到 ${expectedCoin} 的真实数据`);
          console.error(`❌ 页面可能未正确加载或 CoinGlass 网站结构发生变化`);
          throw new Error(`无法获取 ${expectedCoin} 的真实利率数据，请检查 CoinGlass 网站访问状态`);
        }

        return {
          exchange: normalizedExchangeName,
          timestamp: new Date().toISOString(),
          coins: allCoinsData,
          source: 'coinglass_real_data',
          extraction_info: {
            page_title: pageTitle,
            current_exchange: normalizedExchangeName,
            current_coin: currentCoin,
            data_points_extracted: Object.keys(allCoinsData).length,
            extraction_timestamp: new Date().toISOString()
          }
        };
      }, exchange, coin, normalizedExchange); // 传递参数

      // 在外部格式化时间戳
      data.timestamp = formatDateTime(new Date());
      if (data.extraction_info) {
        data.extraction_info.extraction_timestamp = formatDateTime(new Date());
      }

      const coinKeys = Object.keys(data.coins);
      console.log(`📊 成功提取真实数据: 找到 ${coinKeys.length} 个币种`);
      coinKeys.forEach(coinKey => {
        const coin = data.coins[coinKey];
        console.log(`  - ${coinKey}: ${coin.annual_rate}% (${coin.history?.length || 0} 个历史数据点)`);
      });
      
      return data;

    } catch (error) {
      console.error('❌ 数据提取失败:', error);
      throw new Error(`数据提取失败: ${error.message}`);
    }
  }

  /**
   * 获取服务状态
   */
  async getStatus() {
    return {
      status: 'running',
      browser_open: !!this.browser,
      puppeteer_version: await this.getPuppeteerVersion(),
      last_scrape: formatDateTime(new Date())
    };
  }

  /**
   * 生成格式化的截图文件名
   * 格式: YYYY-MM-DD_HH-mm-ss_交易所_币种.png
   */
  generateScreenshotFilename(exchange, coin) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-'); // HH-mm-ss
    return `${dateStr}_${timeStr}_${exchange}_${coin}.png`;
  }

  /**
   * 获取 Puppeteer 版本
   */
  async getPuppeteerVersion() {
    try {
      const browser = await this.initBrowser();
      const version = await browser.version();
      return version;
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * 关闭浏览器
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      console.log('🔚 Puppeteer 浏览器已关闭');
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    await this.close();
  }
}

// 导出单例实例
export const scraperService = new ScraperService();

// 进程退出时清理资源
process.on('SIGINT', async () => {
  await scraperService.cleanup();
});

process.on('SIGTERM', async () => {
  await scraperService.cleanup();
});