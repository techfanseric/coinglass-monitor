# CoinGlass 页面选择器分析报告

## 概述

本文档分析了 CoinGlass 借贷利率历史页面 (`https://www.coinglass.com/zh/pro/i/MarginFeeChart`) 的市场和币种选择器结构，为监控系统的自动化数据抓取提供技术实现方案。

## 页面选择器结构分析

### 1. 交易所选择器

- **元素类型**: `button[role="combobox"]`
- **类名**: `MuiSelect-button cg-style-1qmzz5g`
- **可用选项**: Binance, OKX, Bybit
- **定位方式**: 可通过按钮文本或 CSS 类名定位
- **交互方式**: 点击按钮展开下拉菜单，然后点击对应选项

### 2. 币种选择器

- **元素类型**: `input[role="combobox"][autocomplete="list"]`
- **类名**: `MuiAutocomplete-input cg-style-1lv7pyi`
- **可用选项**: 支持超过 1000 种加密货币（包括 BTC, ETH, USDT 等）
- **特点**: 支持搜索和自动完成功能
- **交互方式**: 点击输入框，输入币种符号，从下拉列表中选择

### 3. 时间框架选择器

- **元素类型**: `tab[role="tab"]`
- **选项**: 1小时、24小时
- **类名**: 包含 MuiTab 相关类名
- **交互方式**: 直接点击对应的标签页

### 4. 页面数据结构

- **表格标题**: 动态显示当前选择的交易所和币种
- **数据列**: 时间、年利率、日利率、小时利率
- **分页**: 支持多页数据浏览

## 自动选择实现建议

### 1. 选择器定位函数

```javascript
// 在 scraper.js 中添加
function locateSelectors(page) {
  return {
    exchangeButton: page.locator('button[role="combobox"]').filter({ hasText: /(Binance|OKX|Bybit)/ }),
    coinInput: page.locator('input[role="combobox"][autocomplete="list"]'),
    timeTabs: page.locator('tab[role="tab"]'),
    tableRows: page.locator('table tr'),
    heading: page.locator('h1')
  };
}
```

### 2. 自动选择函数

```javascript
async function selectExchange(page, exchangeName) {
  const { exchangeButton } = locateSelectors(page);
  await exchangeButton.click();
  await page.locator('li[role="option"]').filter({ hasText: exchangeName }).click();
  await page.waitForTimeout(1000); // 等待页面更新
}

async function selectCoin(page, coinSymbol) {
  const { coinInput } = locateSelectors(page);
  await coinInput.click();
  await coinInput.clear();
  await coinInput.fill(coinSymbol);
  await page.locator('li[role="option"]').filter({ hasText: coinSymbol }).click();
  await page.waitForTimeout(1000); // 等待页面更新
}

async function selectTimeframe(page, timeframe) {
  const { timeTabs } = locateSelectors(page);
  await timeTabs.filter({ hasText: timeframe }).click();
  await page.waitForTimeout(1000); // 等待页面更新
}
```

### 3. 配置驱动的选择流程

```javascript
async function configurePage(page, config) {
  // 根据配置文件中的 filters 进行选择
  console.log(`配置页面: 交易所=${config.filters.exchange}, 币种=${config.filters.coin}, 时间框架=${config.filters.timeframe}`);

  // 1. 选择交易所
  await selectExchange(page, config.filters.exchange);

  // 2. 选择币种
  await selectCoin(page, config.filters.coin);

  // 3. 选择时间框架
  await selectTimeframe(page, config.filters.timeframe);

  // 4. 等待页面数据加载
  await page.waitForSelector('table tr', { timeout: 10000 });

  // 5. 验证选择是否成功
  await validateSelection(page, config.filters);
}
```

### 4. 选择验证函数

```javascript
async function validateSelection(page, expectedValues) {
  const { heading } = locateSelectors(page);
  const headingText = await heading.textContent();

  if (!headingText.includes(expectedValues.exchange) ||
      !headingText.includes(expectedValues.coin)) {
    throw new Error(`页面选择验证失败: ${headingText}`);
  }

  console.log(`页面配置验证成功: ${headingText}`);
}
```

## 与现有架构的集成方案

### 1. 修改 scraper.js 主函数

```javascript
async function scrapeInterestRates(page, config) {
  try {
    // 1. 导航到页面
    await page.goto('https://www.coinglass.com/zh/pro/i/MarginFeeChart');
    await page.waitForLoadState('networkidle');

    // 2. 根据配置自动选择交易所、币种和时间框架
    await configurePage(page, config);

    // 3. 等待数据加载
    await page.waitForSelector('table tr', { timeout: 10000 });

    // 4. 抓取数据
    const data = await extractTableData(page);

    return {
      success: true,
      data: data,
      config: config.filters,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('数据抓取失败:', error);
    return {
      success: false,
      error: error.message,
      config: config.filters
    };
  }
}
```

### 2. 数据提取函数

```javascript
async function extractTableData(page) {
  const { tableRows } = locateSelectors(page);
  const data = [];

  // 提取表格数据（跳过表头）
  const rows = await tableRows.all();
  for (let i = 1; i < rows.length; i++) { // 跳过第一行（表头）
    const cells = await rows[i].locator('td').allTextContents();
    if (cells.length >= 4) {
      data.push({
        time: cells[0].trim(),
        yearlyRate: parseFloat(cells[1]) || 0,
        dailyRate: parseFloat(cells[2]) || 0,
        hourlyRate: parseFloat(cells[3]) || 0
      });
    }
  }

  return data;
}
```

### 3. 配置结构支持

现有配置结构已经支持所需的筛选参数：

```json
{
  "filters": {
    "exchange": "binance",
    "coin": "USDT",
    "timeframe": "1h"
  },
  "coins": [
    {
      "symbol": "USDT",
      "exchange": "binance",
      "timeframe": "1h",
      "threshold": 5.0,
      "enabled": true
    }
  ]
}
```

## 错误处理和重试机制

### 1. 页面加载错误处理

```javascript
async function safeGoto(page, url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      return true;
    } catch (error) {
      console.warn(`页面加载失败 (尝试 ${i + 1}/${retries}):`, error.message);
      if (i === retries - 1) throw error;
      await page.waitForTimeout(2000);
    }
  }
}
```

### 2. 选择器等待和重试

```javascript
async function safeSelect(page, selectorFn, value, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await selectorFn(page, value);
      return true;
    } catch (error) {
      console.warn(`选择失败 (尝试 ${i + 1}/${retries}):`, error.message);
      if (i === retries - 1) throw error;
      await page.waitForTimeout(1000);
    }
  }
}
```

## 性能优化建议

### 1. 并发处理

- 对于多个币种的监控，可以使用 Playwright 的并发能力
- 建议限制并发数量以避免被反爬虫机制阻止

### 2. 缓存策略

- 缓存页面状态以减少重复加载
- 对相同配置的数据请求进行去重

### 3. 监控频率控制

- 根据数据更新频率调整抓取间隔
- 避免过于频繁的请求

## 测试用例

### 1. 基本功能测试

```javascript
async function testBasicSelection() {
  const config = {
    filters: {
      exchange: 'binance',
      coin: 'BTC',
      timeframe: '1h'
    }
  };

  const result = await scrapeInterestRates(page, config);
  console.log('测试结果:', result);
}
```

### 2. 多币种测试

```javascript
async function testMultipleCoins() {
  const coins = ['BTC', 'ETH', 'USDT'];
  const results = [];

  for (const coin of coins) {
    const config = {
      filters: {
        exchange: 'binance',
        coin: coin,
        timeframe: '1h'
      }
    };

    const result = await scrapeInterestRates(page, config);
    results.push(result);
  }

  return results;
}
```

## 总结

通过分析 CoinGlass 页面结构，我们确定了实现自动化数据抓取的完整技术方案。该方案：

1. **完全兼容现有架构** - 可以无缝集成到当前的监控系统中
2. **支持全自动化** - 无需人工干预即可完成页面配置和数据抓取
3. **具备容错能力** - 包含完整的错误处理和重试机制
4. **可扩展性强** - 支持新增交易所和币种的监控

建议按照本报告的技术方案，在 `src/modules/scraper.js` 中实现相关的自动化选择功能，以提升监控系统的自动化程度和数据准确性。

---

*分析日期: 2025-10-05*
*页面版本: CoinGlass 中文版本*