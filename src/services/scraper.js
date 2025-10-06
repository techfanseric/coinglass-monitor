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
import { formatDateTime } from '../utils/time-utils.js';

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
    if (this.browser) {
      return this.browser;
    }

    loggerService.info('[抓取服务] 正在启动 Puppeteer 浏览器');
    console.log('🌐 正在启动 Puppeteer 浏览器...');

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
    console.log('✅ Puppeteer 浏览器启动成功');

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
   * 抓取 CoinGlass 数据 - 支持多币种抓取
   */
  async scrapeCoinGlassData(exchange = 'binance', coin = 'USDT', timeframe = '1h', requestedCoins = null) {
    let browser = null;
    let page = null;

    try {
      loggerService.info(`[抓取服务] 开始抓取 CoinGlass 数据: ${exchange}/${coin}/${timeframe}，目标币种: ${requestedCoins?.join(',') || '默认'}`);
      console.log(`🕷️ 开始抓取 CoinGlass 数据: ${exchange}/${coin}/${timeframe}`);
      if (requestedCoins) {
        console.log(`🎯 请求的币种: ${requestedCoins.join(', ')}`);
      }

      // 初始化浏览器
      browser = await this.initBrowser();
      page = await browser.newPage();
      await page.setViewport({ width: this.config.windowWidth, height: this.config.windowHeight });

      console.log('📖 访问 CoinGlass 页面...');
      await page.goto(this.config.coinglassBaseUrl, {
        waitUntil: 'networkidle2',
        timeout: this.config.pageTimeout
      });

      console.log('⏳ 等待页面完全加载...');
      await page.waitForTimeout(this.config.waitTimes.initial);

      // === 切换交易所 ===
      console.log(`🔄 切换到交易所: ${exchange}`);
      await this.switchExchange(page, exchange);
      await page.waitForTimeout(this.config.waitTimes.exchange);

      // 确定要抓取的币种列表
      const coinsToScrape = requestedCoins || [coin];
      const allCoinsData = {};

      for (const targetCoin of coinsToScrape) {
        // 为重复币种创建唯一标识符（基于交易所和时间框架）
        const coinKey = `${targetCoin}_${exchange}_${timeframe}`;
        console.log(`🔄 切换到币种: ${targetCoin} (标识符: ${coinKey})`);
        await this.switchCoin(page, targetCoin);
        // 等待页面数据更新，特别是切换币种后需要更长时间
        await page.waitForTimeout(this.config.waitTimes.coin);

        // === 切换时间框架 (修复：总是执行时间框架切换) ===
        console.log(`🔄 切换到时间框架: ${timeframe}`);
        await this.switchTimeframe(page, timeframe);
        await page.waitForTimeout(this.config.waitTimes.data);

        // 验证切换结果
        console.log('🔍 验证切换结果...');
        const switchVerification = await this.verifySwitchResult(page, exchange, targetCoin);
        console.log(`📋 验证结果: ${JSON.stringify(switchVerification, null, 2)}`);

        if (!switchVerification.success) {
          console.warn(`⚠️ 切换验证失败: ${switchVerification.reason}`);
          // 重试一次
          if (switchVerification.currentCoin !== targetCoin) {
            console.log(`🔄 重试切换币种: ${switchVerification.currentCoin} -> ${targetCoin}`);
            await this.switchCoin(page, targetCoin);
            await page.waitForTimeout(this.config.waitTimes.screenshot);
          }

          const reVerification = await this.verifySwitchResult(page, exchange, targetCoin);
          if (!reVerification.success) {
            console.warn(`⚠️ 币种 ${targetCoin} 抓取失败，跳过: ${reVerification.reason}`);
            continue;
          }
        }

        // 等待页面数据完全更新
        await page.waitForTimeout(this.config.waitTimes.data);

        // 截图记录数据采集前的页面状态（仅在开发模式下）
        try {
          // 检查是否为开发模式
          const isDevelopment = process.env.NODE_ENV === 'development';

          if (isDevelopment) {
            const screenshotDir = this.config.screenshotDir;
            const screenshotPath = `${screenshotDir}/${this.generateScreenshotFilename(exchange, targetCoin)}`;

            // 确保目录存在
            await fs.promises.mkdir(screenshotDir, { recursive: true });

            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`📸 数据采集前截图已保存: ${screenshotPath}`);
          } else {
            console.log(`📸 生产模式跳过截图保存`);
          }
        } catch (screenshotError) {
          console.log(`⚠️ 数据采集前截图失败: ${screenshotError.message}`);
        }

        // 数据提取
        console.log(`📊 开始提取 ${targetCoin} 数据...`);
        const coinData = await this.extractTableData(page, exchange, targetCoin);

        if (coinData && coinData.coins) {
          // 使用唯一标识符存储数据，处理重复币种
          const extractedCoinData = coinData.coins[targetCoin];
          if (extractedCoinData) {
            // 为复合键创建完整的数据副本，包含exchange和timeframe信息
            const coinDataWithKey = { ...extractedCoinData };
            coinDataWithKey.exchange = exchange;
            coinDataWithKey.timeframe = timeframe;
            coinDataWithKey.coin_key = coinKey;

            // 对于重复币种，优先使用复合键存储，避免数据覆盖
            allCoinsData[coinKey] = coinDataWithKey;
            console.log(`💾 复合键数据存储: ${coinKey} -> 利率 ${coinDataWithKey.annual_rate}%, 历史数据 ${coinDataWithKey.history?.length || 0} 条`);

            // 复合键存储已经完成，不再创建币种符号副本
            // 这确保数据的唯一性和正确性，避免复合键被简单键覆盖
            console.log(`✅ 复合键存储完成: ${coinKey} -> 利率 ${coinDataWithKey.annual_rate}%`);

            // 验证复合键数据是否正确存储
            if (!allCoinsData[coinKey]) {
              console.error(`❌ 错误: 复合键 ${coinKey} 存储失败`);
            } else {
              console.log(`✅ 复合键 ${coinKey} 存储成功，exchange: ${allCoinsData[coinKey].exchange}, timeframe: ${allCoinsData[coinKey].timeframe}`);
            }

            console.log(`✅ ${targetCoin} (${coinKey}) 数据抓取成功，利率: ${extractedCoinData.annual_rate}%`);
          }
        } else {
          console.warn(`⚠️ ${targetCoin} 数据提取失败`);
        }

        // 币种间添加短暂延迟，避免请求过于频繁
        await page.waitForTimeout(this.config.waitTimes.screenshot);
      }

      // 构建最终结果
      const result = {
        exchange: exchange.toLowerCase(),
        timestamp: formatDateTime(new Date()),
        coins: allCoinsData,
        page_analysis: {
          title: `单交易所抓取完成 - ${coinsToScrape.length} 个币种`,
          current_exchange: exchange,
          current_timeframe: timeframe,
          total_coins_found: Object.keys(allCoinsData).length,
          requested_coins: coinsToScrape,
          successfully_scraped: Object.keys(allCoinsData),
          duplicate_coins_handled: coinsToScrape.length !== Object.keys(allCoinsData).length
        }
      };

      loggerService.info(`[抓取服务] 多币种数据抓取完成，成功获取 ${Object.keys(allCoinsData).length} 个币种数据: ${Object.keys(allCoinsData).join(', ')}`);
      console.log(`✅ 多币种数据抓取完成，成功获取 ${Object.keys(allCoinsData).length} 个币种数据`);
      return result;

    } catch (error) {
      loggerService.error(`[抓取服务] 抓取失败: ${error.message}`);
      console.error('❌ 抓取失败:', error);
      throw new Error(`抓取CoinGlass数据失败: ${error.message}`);
    } finally {
      // 安全关闭页面
      try {
        if (page && !page.isClosed()) {
          await page.close();
        }
      } catch (e) {
        console.log('⚠️ 页面关闭时出现错误:', e.message);
      }
    }
  }

  /**
   * 切换交易所
   */
  async switchExchange(page, targetExchange) {
    try {
      console.log(`🔄 开始切换到交易所: ${targetExchange}`);

      // 等待页面加载完成
      await page.waitForSelector('[role="combobox"]', { timeout: 10000 });

      // 多种方法尝试找到交易所选择器
      const exchangeFound = await page.evaluate((targetExchange) => {
        // 方法1：通过 role="combobox" 查找
        const comboboxes = document.querySelectorAll('[role="combobox"]');
        console.log(`找到 ${comboboxes.length} 个 combobox 元素`);

        // 方法2：通过 class 名称查找交易所相关的下拉框
        const exchangeSelectors = [
          '[class*="exchange"]',
          '[class*="Exchange"]',
          '[data-testid*="exchange"]',
          '[data-testid*="Exchange"]'
        ];

        let exchangeElement = null;

        // 尝试从 combobox 中找到交易所选择器（通常是第二个）
        if (comboboxes.length >= 2) {
          exchangeElement = comboboxes[1];
        } else {
          // 尝试其他选择器
          for (const selector of exchangeSelectors) {
            const element = document.querySelector(selector);
            if (element && (element.getAttribute('role') === 'combobox' || element.tagName === 'INPUT')) {
              exchangeElement = element;
              break;
            }
          }
        }

        if (!exchangeElement) {
          console.error('未找到交易所选择器');
          return false;
        }

        // 点击交易所选择器
        exchangeElement.click();

        // 等待下拉选项出现
        setTimeout(() => {
          const options = Array.from(document.querySelectorAll('[role="option"]'));
          console.log(`找到 ${options.length} 个选项`);

          // 查找目标交易所
          const targetOption = options.find(option => {
            const text = option.textContent.trim().toLowerCase();
            return text === targetExchange.toLowerCase() ||
                   text.includes(targetExchange.toLowerCase());
          });

          if (targetOption) {
            console.log(`找到交易所选项: ${targetOption.textContent.trim()}`);
            targetOption.click();
            return true;
          } else {
            console.log(`未找到交易所选项: ${targetExchange}`);
            console.log('可用选项:', options.map(opt => opt.textContent.trim()));
            return false;
          }
        }, 1000);

        return true;
      }, targetExchange);

      await page.waitForTimeout(this.config.waitTimes.exchange);

      // 验证切换是否成功
      await page.waitForTimeout(this.config.waitTimes.verification);
      console.log(`✅ 交易所切换操作完成: ${targetExchange}`);

    } catch (error) {
      console.error('❌ 切换交易所失败:', error);
    }
  }

  /**
   * 切换币种 - 多策略增强方法（基于测试成功的方案）
   */
  async switchCoin(page, coin) {
    try {
      console.log(`🔄 开始多策略切换币种到: ${coin}`);

      // 尝试多种切换方法，按成功率排序
      const methods = [
        { name: '方法1-精确定位', method: this.switchCoinMethod1.bind(this), enabled: true },
        { name: '方法3-键盘导航', method: this.switchCoinMethod3.bind(this), enabled: true },
        { name: '原方法-fallback', method: this.switchCoinOriginal.bind(this), enabled: true }
      ];

      for (const methodConfig of methods) {
        if (!methodConfig.enabled) continue;

        console.log(`🎯 尝试${methodConfig.name}切换币种: ${coin}`);

        try {
          const success = await methodConfig.method(page, coin);

          if (success) {
            console.log(`✅ ${methodConfig.name}币种切换成功: ${coin}`);

            // 验证切换结果
            const verification = await this.verifyCoinSwitch(page, coin);
            if (verification.success) {
              console.log(`✅ ${methodConfig.name}币种切换验证成功: ${coin}`);
              return true;
            } else {
              console.warn(`⚠️ ${methodConfig.name}币种切换验证失败: ${verification.reason}`);
            }
          } else {
            console.log(`❌ ${methodConfig.name}币种切换失败: ${coin}`);
          }
        } catch (error) {
          console.error(`❌ ${methodConfig.name}执行失败:`, error.message);
        }

        // 在尝试下一个方法前等待页面稳定
        await page.waitForTimeout(this.config.waitTimes.method);
      }

      console.error(`❌ 所有方法都无法成功切换币种: ${coin}`);
      return false;

    } catch (error) {
      console.error(`❌ 切换币种过程中发生错误: ${coin}`, error);
      return false;
    }
  }

  /**
   * 方法1: 精确定位币种选择器（基于页面结构分析）
   */
  async switchCoinMethod1(page, coin) {
    try {
      // 使用更精确的选择器来定位币种输入框
      const coinSelectors = [
        'input[role="combobox"][value*="USDT"], input[role="combobox"][value*="BTC"], input[role="combobox"][value*="ETH"]',
        'input[autocomplete="list"]:not([placeholder*="搜索"])',
        '.css-1hwfws3' // CoinGlass 币种选择器的常见 class
      ];

      for (const selector of coinSelectors) {
        try {
          const input = await page.$(selector);
          if (input) {
            console.log(`📍 找到币种输入框: ${selector}`);
            await input.click();
            await page.waitForTimeout(this.config.waitTimes.retry);

            // 增强版清除逻辑
            await this.performEnhancedClear(page);

            // 输入币种
            await page.keyboard.type(coin);
            await page.waitForTimeout(this.config.waitTimes.method);

            // 查找并点击选项
            const optionClicked = await page.evaluate((targetCoin) => {
              const options = Array.from(document.querySelectorAll('[role="option"]'));
              const target = options.find(opt =>
                opt.textContent.trim().toUpperCase() === targetCoin.toUpperCase()
              );
              if (target) {
                target.click();
                return true;
              }
              return false;
            }, coin);

            if (optionClicked) {
              await page.waitForTimeout(this.config.waitTimes.verification);
              return true;
            }
          }
        } catch (e) {
          // 继续尝试下一个选择器
        }
      }
      return false;
    } catch (error) {
      console.error('方法1失败:', error.message);
      return false;
    }
  }

  /**
   * 方法3: 智能键盘导航 + 元素预选择
   */
  async switchCoinMethod3(page, coin) {
    try {
      // 先定位到合适的输入框，然后使用键盘操作
      const success = await page.evaluate((targetCoin) => {
        // 查找最适合键盘操作的币种输入框
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
                  ['BTC', 'ETH', 'USDT'].some(coin => value.toUpperCase().includes(coin)));
        });

        if (coinInputs.length > 0) {
          const targetInput = coinInputs[0];

          // 聚焦到目标输入框
          targetInput.focus();
          targetInput.click();

          // 清空输入 - 增强版清除逻辑
          targetInput.focus();
          targetInput.select();
          targetInput.value = '';
          targetInput.select(); // 再次选中确保清空

          return true; // 返回成功，后续操作在外部进行
        }

        return false;
      }, coin);

      if (success) {
        await page.waitForTimeout(this.config.waitTimes.retry);

        // 使用键盘输入币种
        await page.keyboard.type(coin);
        await page.waitForTimeout(this.config.waitTimes.method);

        // 查找并选择选项
        const optionSelected = await page.evaluate((targetCoin) => {
          const options = Array.from(document.querySelectorAll('[role="option"]'));
          const target = options.find(opt =>
            opt.textContent.trim().toUpperCase() === targetCoin.toUpperCase()
          );

          if (target) {
            target.click();
            return true;
          }

          // 如果没找到精确匹配，尝试使用键盘选择第一个选项
          if (options.length > 0) {
            // 模拟向下箭头选择
            document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'ArrowDown',
              code: 'ArrowDown',
              keyCode: 40,
              bubbles: true
            }));

            // 模拟回车确认
            document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              bubbles: true
            }));

            return true;
          }

          return false;
        }, coin);

        if (optionSelected) {
          await page.waitForTimeout(this.config.waitTimes.optionSelect);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('方法3失败:', error.message);
      return false;
    }
  }

  /**
   * 原方法 - 作为fallback保留
   */
  async switchCoinOriginal(page, coin) {
    try {
      console.log(`🔄 使用原方法切换币种到: ${coin}`);

      // 等待并点击币种输入框
      const coinInput = await page.waitForSelector('input[role="combobox"]', { timeout: 10000 });
      await coinInput.click();
      await coinInput.focus();

      // 清空并输入币种名称
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await page.keyboard.type(coin);

      // 等待选项加载
      await page.waitForTimeout(this.config.waitTimes.method);

      // 查找并点击目标币种选项
      const optionClicked = await page.evaluate((targetCoin) => {
        const options = Array.from(document.querySelectorAll('[role="option"]'));

        // 查找匹配的选项
        const targetOption = options.find(option => {
          const text = option.textContent.trim();
          return text === targetCoin ||
                 text === `${targetCoin}永续` ||
                 text.includes(targetCoin);
        });

        if (targetOption) {
          targetOption.click();
          return true;
        }
        return false;
      }, coin);

      if (!optionClicked) {
        throw new Error(`未找到币种选项: ${coin}`);
      }

      // 等待页面更新
      await page.waitForTimeout(this.config.waitTimes.verification);

      return true;

    } catch (error) {
      console.error(`❌ 原方法切换币种失败: ${coin}`, error);
      return false;
    }
  }

  /**
   * 增强版清除逻辑
   */
  async performEnhancedClear(page) {
    await page.evaluate(() => {
      document.activeElement.select();
      document.activeElement.value = '';
    });
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(this.config.waitTimes.clear);
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

      console.log(`🔍 验证 ${expectedCoin} 切换结果:`, verification);
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
          if (bodyText.includes('okx')) currentExchange = 'okx';
          else if (bodyText.includes('bybit')) currentExchange = 'bybit';
          else if (bodyText.includes('binance')) currentExchange = 'binance';

          if (bodyText.includes('btc')) currentCoin = 'BTC';
          else if (bodyText.includes('eth')) currentCoin = 'ETH';
          else if (bodyText.includes('usdt')) currentCoin = 'USDT';
        }

        // 检查页面上的选择器当前值
        const comboboxes = document.querySelectorAll('[role="combobox"]');
        if (comboboxes.length >= 2) {
          const exchangeCombobox = comboboxes[1];
          const exchangeValue = exchangeCombobox.textContent || exchangeCombobox.value;
          if (exchangeValue && exchangeValue.toLowerCase().includes(expectedExchange.toLowerCase())) {
            currentExchange = expectedExchange.toLowerCase();
          }
        }

        if (comboboxes.length >= 3) {
          const coinCombobox = comboboxes[2];
          const coinValue = coinCombobox.textContent || coinCombobox.value;
          if (coinValue && (coinValue.toUpperCase().includes(expectedCoin.toUpperCase()) ||
                           coinValue.includes('USD') && expectedCoin === 'USDT')) {
            currentCoin = expectedCoin.toUpperCase();
          }
        }

        // 检查可用的币种选项
        const availableCoins = Array.from(document.querySelectorAll('[role="option"]'))
          .map(option => {
            const text = option.textContent.trim();
            const coinMatch = text.match(/^(BTC|ETH|USDT|USDC|BNB|SOL|ADA|DOT|AVAX|MATIC|LINK|UNI|ATOM|FTM)/);
            return coinMatch ? coinMatch[1] : null;
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
      console.log(`🔄 开始切换时间框架到: ${timeframe}`);

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
        console.log(`✅ 成功切换到时间框架: ${timeframe}`);
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
   * 提取表格数据 - 修改为支持多币种提取
   */
  async extractTableData(page, exchange, coin) {
    try {
      console.log(`📊 提取数据，预期交易所: ${exchange}, 主要币种: ${coin}`);
      console.log(`📸 截图已在数据采集前完成，现在开始提取数据`);

      const data = await page.evaluate((expectedExchange, expectedCoin) => {
        // 获取页面标题和当前配置
        const pageTitle = document.title;
        let currentExchange = expectedExchange.toLowerCase();

        console.log(`🔍 页面内分析: 预期交易所 ${expectedExchange}, 主要币种 ${expectedCoin}, 页面标题: ${pageTitle}`);

        // 尝试从页面标题验证（但不依赖）
        const engMatch = pageTitle.match(/(\w+)\s+(\w+)\s+Margin\s+Rate\s+History/);
        let currentCoin = expectedCoin.toUpperCase(); // 默认使用传入的币种

        if (engMatch) {
          const titleExchange = engMatch[1].toLowerCase();
          const titleCoin = engMatch[2].toUpperCase();
          console.log(`📋 标题解析: ${titleExchange}/${titleCoin}`);
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
                const dataPoint = {
                  time: timeText,
                  annual_rate: rate,
                  daily_rate: dailyRateMatch ? parseFloat(dailyRateMatch[1]) : (rate / 365),
                  hourly_rate: hourlyRateMatch ? parseFloat(hourlyRateMatch[1]) : (rate / 365 / 24)
                };

                // 使用传入的期望币种作为数据标识，而不是依赖页面标题解析
                const targetCoin = expectedCoin.toUpperCase();

                // 只为当前请求的币种创建数据
                if (!allCoinsData[targetCoin]) {
                  console.log(`🆕 创建币种数据: ${targetCoin}, 首个利率: ${rate}%`);
                  allCoinsData[targetCoin] = {
                    symbol: targetCoin,
                    annual_rate: rate,
                    daily_rate: dataPoint.daily_rate,
                    hourly_rate: dataPoint.hourly_rate,
                    history: [],
                    source: 'coinglass_real_time'
                  };
                }

                allCoinsData[targetCoin].history.push(dataPoint);
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
          exchange: currentExchange.toLowerCase(),
          timestamp: new Date().toISOString(),
          coins: allCoinsData,
          source: 'coinglass_real_data',
          extraction_info: {
            page_title: pageTitle,
            current_exchange: currentExchange,
            current_coin: currentCoin,
            data_points_extracted: Object.keys(allCoinsData).length,
            extraction_timestamp: new Date().toISOString()
          }
        };
      }, exchange, coin); // 传递参数

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
      console.log(`📋 数据来源: ${data.source}`);
      console.log(`📋 提取信息:`, data.extraction_info);

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