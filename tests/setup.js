/**
 * Vitest 测试环境设置
 */

import { vi } from 'vitest';

// 模拟 Cloudflare Workers 环境
global.Request = class MockRequest {
  constructor(url, options = {}) {
    this.url = url;
    this.method = options.method || 'GET';
    this.headers = new Map(Object.entries(options.headers || {}));
    this.body = options.body;
  }
};

global.Response = class MockResponse {
  constructor(body, options = {}) {
    this.body = body;
    this.status = options.status || 200;
    this.headers = new Map(Object.entries(options.headers || {}));
  }

  async json() {
    return typeof this.body === 'string' ? JSON.parse(this.body) : this.body;
  }

  async text() {
    return typeof this.body === 'string' ? this.body : JSON.stringify(this.body);
  }
};

// 模拟 fetch API
global.fetch = vi.fn();

// 模拟 console 方法以避免测试输出干扰
Object.keys(console).forEach(method => {
  if (typeof console[method] === 'function') {
    console[method] = vi.fn();
  }
});

// 设置测试超时
vi.setConfig({
  testTimeout: 10000,
  hookTimeout: 10000
});