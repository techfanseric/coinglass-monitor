export default {
  // 测试环境
  testEnvironment: 'node',

  // 支持ES模块
  preset: null,
  testEnvironmentOptions: {
    customExportConditions: ['']
  },
  extensionsToTreatAsEsm: [],
  transform: {},

  // 测试文件匹配模式
  testMatch: [
    '**/*.test.js',
    '**/test-*.js'
  ],

  // 覆盖率配置
  collectCoverage: true,
  collectCoverageFrom: [
    '../src/**/*.js',
    '!../src/app.js',
    '!**/node_modules/**'
  ],
  coverageDirectory: './coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  // 设置文件
  setupFilesAfterEnv: ['./setup.js'],

  // 清除模拟
  clearMocks: true,

  // 详细输出
  verbose: true
};