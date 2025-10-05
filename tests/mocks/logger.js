/**
 * 日志服务模拟文件
 * 用于测试环境
 */

export const loggerService = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  log: jest.fn()
};