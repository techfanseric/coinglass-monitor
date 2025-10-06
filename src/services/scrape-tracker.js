/**
 * 抓取状态追踪服务
 * 追踪手动触发监控的真实过程日志
 */

import EventEmitter from 'events';

export class ScrapeTracker extends EventEmitter {
    constructor() {
        super();
        this.currentSession = null;
        this.isRunning = false;
    }

    /**
     * 开始新的抓取会话
     */
    startSession(config) {
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 计算启用的币种数量（从邮件组中）
        let totalCoins = 0;
        if (config.email_groups && Array.isArray(config.email_groups)) {
            totalCoins = config.email_groups.reduce((total, group) => {
                if (group.enabled !== false && group.coins && Array.isArray(group.coins)) {
                    return total + group.coins.filter(coin => coin.enabled !== false).length;
                }
                return total;
            }, 0);
        }

        this.currentSession = {
            id: sessionId,
            startTime: Date.now(),
            totalCoins: totalCoins,
            currentPhase: 'initializing',
            logs: [], // 存储真实过程日志
            completedCoins: 0,
            failedCoins: 0,
            results: {}
        };

        this.isRunning = true;
        this.addLog('开始监控检查');
        this.emitUpdate();

        return sessionId;
    }

    /**
     * 添加真实过程日志
     */
    addLog(message) {
        if (!this.currentSession) return;

        const timestamp = new Date().toLocaleTimeString('zh-CN', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const logEntry = `[${timestamp}] ${message}`;
        this.currentSession.logs.push(logEntry);

        // 只保留最近50条日志
        if (this.currentSession.logs.length > 50) {
            this.currentSession.logs = this.currentSession.logs.slice(-50);
        }

        this.emitUpdate();
    }

    /**
     * 更新当前阶段
     */
    updatePhase(phase, message = '') {
        if (!this.currentSession || !this.isRunning) return;

        this.currentSession.currentPhase = phase;
        if (message) {
            this.addLog(message);
        }
    }

    /**
     * 开始处理币种
     */
    startCoin(coinSymbol, exchange, timeframe) {
        if (!this.currentSession || !this.isRunning) return;
        this.addLog(`开始抓取 ${coinSymbol} (${exchange}/${timeframe})`);
    }

    /**
     * 完成币种处理
     */
    completeCoin(coinSymbol, success = true, rate = null, error = null) {
        if (!this.currentSession || !this.isRunning) return;

        if (success) {
            this.currentSession.completedCoins++;
            const rateInfo = rate !== null ? ` (${rate}%)` : '';
            this.addLog(`${coinSymbol} 抓取成功${rateInfo}`);
        } else {
            this.currentSession.failedCoins++;
            const errorInfo = error ? ` - ${error}` : '';
            this.addLog(`${coinSymbol} 抓取失败${errorInfo}`);
        }

        this.emitUpdate();
    }

    /**
     * 完成会话
     */
    completeSession(results = {}) {
        if (!this.currentSession) return;

        this.currentSession.endTime = Date.now();
        this.currentSession.duration = this.currentSession.endTime - this.currentSession.startTime;
        this.currentSession.currentPhase = 'completed';
        this.currentSession.results = results;

        // 添加完成信息
        const { alerts_sent = 0, recoveries_sent = 0, coins_checked = 0 } = results;
        if (alerts_sent > 0) {
            this.addLog(`监控完成：发现 ${alerts_sent} 个警报，已发送邮件通知`);
        } else if (recoveries_sent > 0) {
            this.addLog(`监控完成：发现 ${recoveries_sent} 个恢复通知，已发送邮件`);
        } else if (coins_checked > 0) {
            this.addLog(`监控完成：所有 ${coins_checked} 个币种利率正常`);
        } else {
            this.addLog('监控检查完成');
        }

        this.isRunning = false;
        this.emitUpdate();
    }

    /**
     * 会话失败
     */
    failSession(error, phase = 'error') {
        if (!this.currentSession) return;

        this.currentSession.endTime = Date.now();
        this.currentSession.duration = this.currentSession.endTime - this.currentSession.startTime;
        this.currentSession.currentPhase = phase;
        this.currentSession.error = error;

        this.addLog(`监控检查失败：${error}`);
        this.isRunning = false;
        this.emitUpdate();
    }

    /**
     * 获取当前状态（用于API响应）
     */
    getCurrentStatus() {
        if (!this.currentSession) {
            return {
                isRunning: false,
                hasSession: false,
                message: '当前没有正在执行的监控检查'
            };
        }

        return {
            isRunning: this.isRunning,
            hasSession: true,
            sessionId: this.currentSession.id,
            phase: this.currentSession.currentPhase,
            logs: this.currentSession.logs,
            completedCoins: this.currentSession.completedCoins,
            failedCoins: this.currentSession.failedCoins,
            totalCoins: this.currentSession.totalCoins,
            duration: this.currentSession.endTime ?
                this.currentSession.duration :
                Date.now() - this.currentSession.startTime,
            results: this.currentSession.results
        };
    }

    /**
     * 发送状态更新事件
     */
    emitUpdate() {
        this.emit('status_update', this.getCurrentStatus());
    }

    /**
     * 清理会话
     */
    clearSession() {
        this.currentSession = null;
        this.isRunning = false;
        this.emitUpdate();
    }
}

// 全局单例实例
export const scrapeTracker = new ScrapeTracker();