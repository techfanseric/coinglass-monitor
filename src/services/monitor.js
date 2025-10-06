/**
 * 监控服务占位符
 * 后续会迁移完整的监控逻辑
 */

import { formatDateTime } from '../utils/time-utils.js';

export class MonitorService {
  constructor() {
    this.isRunning = false;
  }

  async start() {
    this.isRunning = true;
    console.log('🕐 监控服务已启动（占位符）');
  }

  async stop() {
    this.isRunning = false;
    console.log('🛑 监控服务已停止');
  }

  getStatus() {
    return {
      running: this.isRunning,
      last_check: formatDateTime(new Date())
    };
  }
}

export const monitorService = new MonitorService();