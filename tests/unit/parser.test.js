/**
 * parser.js 解析工具模块单元测试
 * 测试 HTML 解析和数据提取功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseRateData,
  extractFromInitialState,
  extractFromApiData,
  extractFromText,
  extractCoinRate,
  extractHistoryFromHTML
} from '../../src/utils/parser.js';

// 模拟 DOMParser
const mockDOMParser = vi.fn();

vi.stubGlobal('DOMParser', mockDOMParser);

describe('parser.js 数据解析工具测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseRateData - 主要解析函数', () => {
    it('应该从 __INITIAL_STATE__ 中解析数据', () => {
      const html = `
        <script>
          window.__INITIAL_STATE__ = {
            "margin": {
              "binance": {
                "data": [
                  {"symbol": "USDT", "rate": "8.5"},
                  {"symbol": "USDC", "rate": "7.2"}
                ]
              }
            }
          };
        </script>
      `;

      const filters = { exchange: 'binance', coin: 'USDT' };
      const result = parseRateData(html, filters);

      expect(result).not.toBeNull();
      expect(result.exchange).toBe('binance');
      expect(result.coins.USDT).toBeDefined();
      expect(result.coins.USDT.annual_rate).toBe(8.5);
    });

    it('应该处理 JSON 解析失败并尝试提取 data 字段', () => {
      const html = `
        <script>
          window.__INITIAL_STATE__ = {
            'data': {
              'list': [
                {'symbol': 'USDT', 'annualRate': '8.5'}
              ]
            }
          };
        </script>
      `;

      const result = parseRateData(html);

      expect(result).not.toBeNull();
      expect(result.coins.USDT).toBeDefined();
      expect(result.coins.USDT.annual_rate).toBe(8.5);
    });

    it('应该在所有方法失败时回退到文本解析', () => {
      const html = `
        <table>
          <tr><td>时间</td><td>年利率</td></tr>
          <tr><td>2024-01-01 14:00</td><td>8.5%</td></tr>
          <tr><td>2024-01-01 13:00</td><td>7.8%</td></tr>
        </table>
      `;

      const mockDoc = {
        querySelectorAll: vi.fn().mockReturnValue([
          { querySelectorAll: vi.fn().mockReturnValue([]) }, // 第一个表格
          {
            querySelectorAll: vi.fn()
              .mockReturnValueOnce([{ // 模拟标题行
                querySelectorAll: vi.fn().mockReturnValue([
                  { textContent: '时间' },
                  { textContent: '年利率' }
                ])
              }])
              .mockReturnValueOnce([ // 模拟数据行
                { querySelectorAll: vi.fn().mockReturnValue([
                  { textContent: '2024-01-01 14:00' },
                  { textContent: '8.5%' }
                ])
              }])
          }
        ])
      };

      mockDOMParser.mockImplementation(() => ({
        parseFromString: vi.fn().mockReturnValue(mockDoc)
      }));

      const result = parseRateData(html);

      expect(result).not.toBeNull();
      expect(result.coins.USDT).toBeDefined();
      expect(result.coins.USDT.annual_rate).toBe(8.5);
    });

    it('应该处理解析异常并返回 null', () => {
      const html = 'invalid html';

      // 模拟 DOMParser 抛出异常
      mockDOMParser.mockImplementation(() => {
        throw new Error('DOM parsing error');
      });

      const result = parseRateData(html);

      expect(result).toBeNull();
    });

    it('应该在没有筛选器时使用默认值', () => {
      const html = `
        <script>
          window.__INITIAL_STATE__ = {
            "margin": {
              "binance": {
                "data": [
                  {"symbol": "USDT", "rate": "8.5"}
                ]
              }
            }
          };
        </script>
      `;

      const result = parseRateData(html);

      expect(result.exchange).toBe('Binance');
      expect(result.coins.USDT).toBeDefined();
    });
  });

  describe('extractFromInitialState - 从初始状态提取', () => {
    it('应该从标准路径提取数据', () => {
      const initialState = {
        margin: {
          binance: {
            data: [
              { symbol: 'USDT', rate: '8.5', dailyRate: '0.023', hourlyRate: '0.001' },
              { symbol: 'USDC', rate: '7.2' }
            ]
          }
        }
      };

      const filters = { exchange: 'binance', coin: 'USDT' };
      const result = extractFromInitialState(initialState, filters);

      expect(result).not.toBeNull();
      expect(result.exchange).toBe('binance');
      expect(result.coins.USDT.annual_rate).toBe(8.5);
      expect(result.coins.USDT.daily_rate).toBe(0.023);
      expect(result.coins.USDT.hourly_rate).toBe(0.001);
      expect(result.coins.USDC).toBeUndefined(); // 筛选器指定了只获取 USDT
    });

    it('应该尝试多个可能的数据路径', () => {
      const initialState = {
        data: {
          margin: [
            { symbol: 'USDT', rate: '8.5' }
          ]
        }
      };

      const result = extractFromInitialState(initialState);

      expect(result).not.toBeNull();
      expect(result.coins.USDT.annual_rate).toBe(8.5);
    });

    it('应该处理 marginData 格式', () => {
      const initialState = {
        marginData: [
          { symbol: 'USDT', rate: '8.5' }
        ]
      };

      const result = extractFromInitialState(initialState);

      expect(result).not.toBeNull();
      expect(result.coins.USDT.annual_rate).toBe(8.5);
    });

    it('应该处理 coinglass.margin 格式', () => {
      const initialState = {
        coinglass: {
          margin: [
            { symbol: 'USDT', rate: '8.5' }
          ]
        }
      };

      const result = extractFromInitialState(initialState);

      expect(result).not.toBeNull();
      expect(result.coins.USDT.annual_rate).toBe(8.5);
    });

    it('应该在找不到数据时回退到文本解析', () => {
      const initialState = { other: 'data' };

      const result = extractFromInitialState(initialState);

      expect(result).toBeNull();
    });

    it('应该计算默认的日利率和小时利率', () => {
      const initialState = {
        margin: {
          binance: {
            data: [
              { symbol: 'USDT', rate: '8.5' }
            ]
          }
        }
      };

      const result = extractFromInitialState(initialState);

      expect(result.coins.USDT.daily_rate).toBeCloseTo(8.5 / 365, 4);
      expect(result.coins.USDT.hourly_rate).toBeCloseTo(8.5 / 365 / 24, 6);
    });

    it('应该处理无效的利率值', () => {
      const initialState = {
        margin: {
          binance: {
            data: [
              { symbol: 'USDT', rate: 'invalid' },
              { symbol: 'USDC', rate: null },
              { symbol: 'BUSD', rate: '' }
            ]
          }
        }
      };

      const result = extractFromInitialState(initialState);

      // 应该跳过无效数据
      expect(result).toBeNull();
    });

    it('应该在没有币种数据时返回 null', () => {
      const initialState = {
        margin: {
          binance: {
            data: []
          }
        }
      };

      const result = extractFromInitialState(initialState);

      expect(result).toBeNull();
    });
  });

  describe('extractFromApiData - 从API数据提取', () => {
    it('应该从 list 数组中提取数据', () => {
      const apiData = {
        list: [
          { symbol: 'USDT', annualRate: '8.5', dailyRate: '0.023', hourlyRate: '0.001' },
          { symbol: 'USDC', rate: '7.2' },
          { coin: 'BUSD', apy: '6.5' }
        ]
      };

      const filters = { exchange: 'binance', coin: 'USDT' };
      const result = extractFromApiData(apiData, filters);

      expect(result).not.toBeNull();
      expect(result.exchange).toBe('binance');
      expect(result.coins.USDT.annual_rate).toBe(8.5);
      expect(result.coins.USDC).toBeUndefined(); // 筛选器过滤
    });

    it('应该处理不同的利率字段名', () => {
      const apiData = {
        list: [
          { symbol: 'USDT', annualRate: '8.5' },
          { asset: 'USDC', rate: '7.2' },
          { coin: 'BUSD', apy: '6.5' }
        ]
      };

      const result = extractFromApiData(apiData);

      expect(result.coins.USDT.annual_rate).toBe(8.5);
      expect(result.coins.USDC.annual_rate).toBe(7.2);
      expect(result.coins.BUSD.annual_rate).toBe(6.5);
    });

    it('应该在无有效数据时返回 null', () => {
      const apiData = { list: [] };

      const result = extractFromApiData(apiData);

      expect(result).toBeNull();
    });

    it('应该处理没有 list 字段的情况', () => {
      const apiData = { other: 'data' };

      const result = extractFromApiData(apiData);

      expect(result).toBeNull();
    });
  });

  describe('extractFromText - 从表格解析', () => {
    it('应该解析包含利率数据的表格', () => {
      const html = `
        <table>
          <tr><td>时间</td><td>年利率</td></tr>
          <tr><td>2024-01-01 14:00</td><td>8.5%</td></tr>
          <tr><td>2024-01-01 13:00</td><td>7.8%</td></tr>
          <tr><td>2024-01-01 12:00</td><td>7.2%</td></tr>
        </table>
      `;

      const mockTable = {
        querySelectorAll: vi.fn()
          .mockReturnValueOnce([ // 标题行
            { textContent: '时间' },
            { textContent: '年利率' }
          ])
          .mockReturnValueOnce([ // 数据行1
            { textContent: '2024-01-01 14:00' },
            { textContent: '8.5%' }
          ])
          .mockReturnValueOnce([ // 数据行2
            { textContent: '2024-01-01 13:00' },
            { textContent: '7.8%' }
          ])
          .mockReturnValueOnce([ // 数据行3
            { textContent: '2024-01-01 12:00' },
            { textContent: '7.2%' }
          ])
      };

      const mockDoc = {
        querySelectorAll: vi.fn().mockReturnValue([mockTable])
      };

      mockDOMParser.mockImplementation(() => ({
        parseFromString: vi.fn().mockReturnValue(mockDoc)
      }));

      const filters = { coin: 'USDT' };
      const result = extractFromText(html, filters);

      expect(result).not.toBeNull();
      expect(result.coins.USDT.annual_rate).toBe(8.5);
      expect(result.coins.USDT.history).toHaveLength(3);
      expect(result.coins.USDT.history[0]).toEqual({
        time: '2024-01-01 14:00',
        rate: 8.5
      });
    });

    it('应该在没有表格时回退到正则表达式解析', () => {
      const html = '2024-01-01 14:00 8.5%';

      const mockDoc = {
        querySelectorAll: vi.fn().mockReturnValue([]) // 没有表格
      };

      mockDOMParser.mockImplementation(() => ({
        parseFromString: vi.fn().mockReturnValue(mockDoc)
      }));

      const result = extractFromText(html);

      expect(result).not.toBeNull();
      expect(result.coins.USDT.annual_rate).toBe(8.5);
    });

    it('应该在没有有效表格时回退到正则表达式解析', () => {
      const html = `
        <table>
          <tr><td>其他数据</td></tr>
        </table>
      `;

      const mockTable = {
        querySelectorAll: vi.fn().mockReturnValue([
          { textContent: '其他数据' }
        ])
      };

      const mockDoc = {
        querySelectorAll: vi.fn().mockReturnValue([mockTable])
      };

      mockDOMParser.mockImplementation(() => ({
        parseFromString: vi.fn().mockReturnValue(mockDoc)
      }));

      const result = extractFromText(html);

      expect(result).toBeNull();
    });

    it('应该限制历史记录数量', () => {
      const rows = Array.from({ length: 30 }, (_, i) =>
        `<tr><td>2024-01-01 ${14 - i}:00</td><td>${8.5 - i * 0.1}%</td></tr>`
      ).join('');

      const html = `<table><tr><td>时间</td><td>年利率</td></tr>${rows}</table>`;

      const mockTable = {
        querySelectorAll: vi.fn()
          .mockImplementation((selector) => {
            if (selector === 'tr') {
              return Array.from({ length: 31 }, (_, i) => ({
                querySelectorAll: vi.fn().mockReturnValue([
                  { textContent: i === 0 ? '时间' : `2024-01-01 ${14 - i + 1}:00` },
                  { textContent: i === 0 ? '年利率' : `${8.5 - (i - 1) * 0.1}%` }
                ])
              }));
            }
            return [];
          })
      };

      const mockDoc = {
        querySelectorAll: vi.fn().mockReturnValue([mockTable])
      };

      mockDOMParser.mockImplementation(() => ({
        parseFromString: vi.fn().mockReturnValue(mockDoc)
      }));

      const result = extractFromText(html);

      expect(result.coins.USDT.history).toHaveLength(24); // 最多保留24条
    });

    it('应该使用默认币种符号', () => {
      const html = `
        <table>
          <tr><td>时间</td><td>年利率</td></tr>
          <tr><td>2024-01-01 14:00</td><td>8.5%</td></tr>
        </table>
      `;

      const mockTable = {
        querySelectorAll: vi.fn()
          .mockReturnValueOnce([
            { textContent: '时间' },
            { textContent: '年利率' }
          ])
          .mockReturnValueOnce([
            { textContent: '2024-01-01 14:00' },
            { textContent: '8.5%' }
          ])
      };

      const mockDoc = {
        querySelectorAll: vi.fn().mockReturnValue([mockTable])
      };

      mockDOMParser.mockImplementation(() => ({
        parseFromString: vi.fn().mockReturnValue(mockDoc)
      }));

      const result = extractFromText(html); // 没有筛选器

      expect(result.coins.USDT).toBeDefined(); // 使用默认币种
    });
  });

  describe('extractCoinRate - 提取单个币种利率', () => {
    it('应该从多种模式中提取利率', () => {
      const html = 'USDT 年利率: 8.5%, 当前收益率 8.5%';

      const coinPattern = {
        patterns: [
          /USDT[^%]*?(\d+\.?\d*)%/g,
          /年利率:\s*(\d+\.?\d*)%/g
        ]
      };

      const rate = extractCoinRate(html, coinPattern);

      expect(rate).toBe(8.5);
    });

    it('应该提取纯数字利率', () => {
      const html = 'USDT 利率: 8.5';

      const coinPattern = {
        patterns: [
          /USDT[^%]*?(\d+\.?\d*)/g
        ]
      };

      const rate = extractCoinRate(html, coinPattern);

      expect(rate).toBe(8.5);
    });

    it('应该忽略大于100的数字', () => {
      const html = 'USDT 价格: 50000 USDT';

      const coinPattern = {
        patterns: [
          /USDT[^%]*?(\d+\.?\d*)/g
        ]
      };

      const rate = extractCoinRate(html, coinPattern);

      expect(rate).toBe(0); // 50000 被忽略，因为大于100
    });

    it('应该在找不到匹配时返回 0', () => {
      const html = '没有相关数据';

      const coinPattern = {
        patterns: [
          /USDT[^%]*?(\d+\.?\d*)%/g
        ]
      };

      const rate = extractCoinRate(html, coinPattern);

      expect(rate).toBe(0);
    });
  });

  describe('extractHistoryFromHTML - 提取历史数据', () => {
    it('应该从HTML中提取历史数据', () => {
      const html = `
        2024-01-01 14:00 8.5% 0.023% 0.001%
        2024-01-01 13:00 7.8% 0.021% 0.0009%
        2024-01-01 12:00 7.2% 0.020% 0.0008%
      `;

      const history = extractHistoryFromHTML(html, 'USDT', '1h');

      expect(history).toHaveLength(3);
      expect(history[0]).toEqual({
        time: '2024-01-01 14:00',
        rate: 8.5,
        daily_rate: 0.023,
        hourly_rate: 0.001
      });
    });

    it('应该计算缺失的日利率和小时利率', () => {
      const html = '2024-01-01 14:00 8.5%';

      const history = extractHistoryFromHTML(html, 'USDT', '1h');

      expect(history[0].daily_rate).toBeCloseTo(8.5 / 365, 4);
      expect(history[0].hourly_rate).toBeCloseTo(8.5 / 365 / 24, 6);
    });

    it('应该根据时间框架限制数据点数量', () => {
      const html = `
        ${Array.from({ length: 10 }, (_, i) =>
          `2024-01-01 ${14 - i}:00 ${8.5 - i * 0.1}%`
        ).join('\n')}
      `;

      const history1h = extractHistoryFromHTML(html, 'USDT', '1h');
      const history24h = extractHistoryFromHTML(html, 'USDT', '24h');

      expect(history1h).toHaveLength(5); // 1小时限制5个点
      expect(history24h).toHaveLength(10); // 24小时限制24个点
    });

    it('应该在找不到数据时生成默认历史记录', () => {
      const html = '没有历史数据';

      const history = extractHistoryFromHTML(html, 'USDT', '1h');

      expect(history).toHaveLength(5); // 默认生成5条记录
      expect(history[0].time).toMatch(/\d{2}-\d{2}-\d{2} \d{2}:\d{2}/);
      expect(history[0].rate).toBe(0);
    });

    it('应该处理解析异常', () => {
      const html = null;

      const history = extractHistoryFromHTML(html, 'USDT', '1h');

      expect(history).toEqual([]);
    });

    it('应该使用正确的时间格式', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T14:30:00Z'));

      const html = '没有历史数据';
      const history = extractHistoryFromHTML(html, 'USDT', '1h');

      expect(history[0].time).toMatch(/01-01-01 \d{2}:\d{2}/); // 应该包含正确的日期格式

      vi.useRealTimers();
    });
  });

  describe('边界条件和错误处理', () => {
    it('应该处理空的 HTML', () => {
      const result = parseRateData('');

      expect(result).toBeNull();
    });

    it('应该处理 null HTML', () => {
      const result = parseRateData(null);

      expect(result).toBeNull();
    });

    it('应该处理 undefined HTML', () => {
      const result = parseRateData(undefined);

      expect(result).toBeNull();
    });

    it('应该处理包含特殊字符的 HTML', () => {
      const html = `
        <script>
          window.__INITIAL_STATE__ = {
            "margin": {
              "binance": {
                "data": [
                  {"symbol": "USDT", "rate": "8.5", "note": "特殊字符: \"测试\" '数据'"}
                ]
              }
            }
          };
        </script>
      `;

      const result = parseRateData(html);

      expect(result).not.toBeNull();
      expect(result.coins.USDT.annual_rate).toBe(8.5);
    });

    it('应该处理非常大的利率值', () => {
      const html = `
        <script>
          window.__INITIAL_STATE__ = {
            "margin": {
              "binance": {
                "data": [
                  {"symbol": "USDT", "rate": "999.99"}
                ]
              }
            }
          };
        </script>
      `;

      const result = parseRateData(html);

      expect(result.coins.USDT.annual_rate).toBe(999.99);
    });

    it('应该处理负利率值', () => {
      const html = `
        <script>
          window.__INITIAL_STATE__ = {
            "margin": {
              "binance": {
                "data": [
                  {"symbol": "USDT", "rate": "-1.5"}
                ]
              }
            }
          };
        </script>
      `;

      const result = parseRateData(html);

      expect(result.coins.USDT.annual_rate).toBe(-1.5);
    });

    it('应该处理零利率值', () => {
      const html = `
        <script>
          window.__INITIAL_STATE__ = {
            "margin": {
              "binance": {
                "data": [
                  {"symbol": "USDT", "rate": "0"}
                ]
              }
            }
          };
        </script>
      `;

      const result = parseRateData(html);

      expect(result.coins.USDT.annual_rate).toBe(0);
    });
  });
});