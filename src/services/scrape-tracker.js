/**
 * 抓取状态追踪服务
 * 追踪手动触发监控的关键节点进度
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

        this.currentSession = {
            id: sessionId,
            startTime: Date.now(),
            config: {
                totalCoins: config.coins?.filter(c => c.enabled).length || 0,
                coins: config.coins?.filter(c => c.enabled) || []
            },
            currentPhase: 'initializing',
            currentCoin: null,
            completedCoins: [],
            failedCoins: [],
            message: '正在初始化...',
            progress: 0,
            errors: []
        };

        this.isRunning = true;
        this.emitUpdate();

        console.log(`📊 [状态追踪] 开始抓取会话: ${sessionId}`);
        return sessionId;
    }

    /**
     * 更新当前阶段
     */
    updatePhase(phase, message = '', details = {}) {
        if (!this.currentSession || !this.isRunning) return;

        this.currentSession.currentPhase = phase;
        this.currentSession.message = message;
        this.currentSession.timestamp = Date.now();

        // 合并详细信息
        Object.assign(this.currentSession, details);

        // 计算进度
        this.calculateProgress();

        this.emitUpdate();
        console.log(`📊 [状态追踪] 阶段更新: ${phase} - ${message}`);
    }

    /**
     * 开始处理币种
     */
    startCoin(coinSymbol, exchange, timeframe) {
        if (!this.currentSession || !this.isRunning) return;

        this.currentSession.currentCoin = {
            symbol: coinSymbol,
            exchange: exchange,
            timeframe: timeframe
        };

        // 获取当前币种在总列表中的位置
        const totalCoins = this.currentSession.config.totalCoins;
        const currentIndex = this.currentSession.completedCoins.length + 1;

        this.updatePhase('scraping_coin',
            `正在连接 CoinGlass 网站...`,
            {
                coinStartTime: Date.now(),
                currentIndex: currentIndex,
                currentCoinSymbol: coinSymbol,
                currentExchange: exchange,
                currentTimeframe: timeframe,
                scrapingStep: 'connecting'
            }
        );
    }

    /**
     * 完成币种处理
     */
    completeCoin(coinSymbol, success = true, error = null) {
        if (!this.currentSession || !this.isRunning) return;

        if (success) {
            this.currentSession.completedCoins.push({
                symbol: coinSymbol,
                completedAt: Date.now()
            });
        } else {
            this.currentSession.failedCoins.push({
                symbol: coinSymbol,
                error: error,
                failedAt: Date.now()
            });
        }

        this.calculateProgress();
        this.emitUpdate();
    }

    /**
     * 更新币种抓取步骤
     */
    updateCoinScrapingStep(step, details = {}) {
        if (!this.currentSession || !this.isRunning) return;

        const currentIndex = this.currentSession.completedCoins.length + 1;
        const totalCoins = this.currentSession.config.totalCoins;

        let message = '';
        switch (step) {
            case 'connecting':
                message = '正在连接 CoinGlass 网站...';
                break;
            case 'loading_page':
                message = '正在加载币种页面...';
                break;
            case 'switching_exchange':
                message = `正在切换到交易所: ${details.exchange || '目标交易所'}...`;
                break;
            case 'waiting_for_elements':
                message = '正在等待页面元素加载...';
                break;
            case 'waiting_data':
                message = '正在等待数据加载...';
                break;
            case 'extracting_data':
                message = '正在提取利率数据...';
                break;
            case 'extracting_history':
                message = '正在提取历史数据...';
                break;
            case 'validating_data':
                message = '正在验证数据完整性...';
                break;
            case 'processing_data':
                message = '正在处理数据格式...';
                break;
            case 'calculating_rates':
                message = '正在计算利率数值...';
                break;
            case 'finalizing_coin':
                message = '正在完成币种数据处理...';
                break;
            default:
                message = details.message || `正在处理币种数据...`;
                break;
        }

        this.updatePhase('scraping_coin', message, {
            scrapingStep: step,
            stepDetails: details,
            currentIndex: currentIndex,
            totalCoins: totalCoins
        });
    }

    /**
     * 完成会话
     */
    completeSession(results = {}) {
        if (!this.currentSession) return;

        this.currentSession.endTime = Date.now();
        this.currentSession.duration = this.currentSession.endTime - this.currentSession.startTime;
        this.currentSession.currentPhase = 'completed';
        this.currentSession.message = '监控检查完成';
        this.currentSession.results = results;

        this.isRunning = false;
        this.emitUpdate();

        console.log(`📊 [状态追踪] 会话完成: ${this.currentSession.id}, 耗时: ${this.currentSession.duration}ms`);
    }

    /**
     * 会话失败
     */
    failSession(error, phase = 'error') {
        if (!this.currentSession) return;

        this.currentSession.endTime = Date.now();
        this.currentSession.duration = this.currentSession.endTime - this.currentSession.startTime;
        this.currentSession.currentPhase = phase;
        this.currentSession.message = '监控检查失败';
        this.currentSession.error = error;

        this.isRunning = false;
        this.emitUpdate();

        console.log(`📊 [状态追踪] 会话失败: ${this.currentSession.id}, 错误: ${error}`);
    }

    /**
     * 计算进度百分比和预期时间
     */
    calculateProgress() {
        if (!this.currentSession) return;

        const total = this.currentSession.config.totalCoins;
        const completed = this.currentSession.completedCoins.length;
        const failed = this.currentSession.failedCoins.length;
        const elapsed = Date.now() - this.currentSession.startTime;

        // 阶段进度调整
        let baseProgress;
        switch (this.currentSession.currentPhase) {
            case 'initializing':
                baseProgress = 5;
                break;
            case 'starting_browser':
                baseProgress = 10;
                break;
            case 'loading_page':
                baseProgress = 20;
                break;
            case 'scraping_coins':
            case 'scraping_coin':
                // 基础进度：币种处理进度，占70%，但起始进度为20%
                const coinProgress = ((completed + failed) / total) * 70;
                baseProgress = Math.max(20, coinProgress); // 最低20%，最高90%

                // 基于已完成币种估算剩余时间
                if (completed > 0) {
                    const avgTimePerCoin = elapsed / completed;
                    const remainingCoins = total - completed;
                    const estimatedRemainingTime = remainingCoins * avgTimePerCoin;
                    this.currentSession.estimatedRemainingTime = estimatedRemainingTime;
                }

                // 计算初始预期总时间（基于实际经验）
                if (completed === 0) {
                    this.currentSession.estimatedTotalTime = total * 35000; // 35秒每个币种
                }
                break;
            case 'analyzing_thresholds':
                baseProgress = 80;
                break;
            case 'sending_notifications':
                baseProgress = 90;
                break;
            case 'completed':
                baseProgress = 100;
                break;
            case 'error':
                baseProgress = Math.min(95, ((completed + failed) / total) * 70); // 错误时不超过95%
                break;
            default:
                baseProgress = ((completed + failed) / total) * 70;
                break;
        }

        this.currentSession.progress = Math.round(baseProgress);
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
            message: this.currentSession.message,
            progress: this.currentSession.progress,
            currentCoin: this.currentSession.currentCoin,
            completedCoins: this.currentSession.completedCoins.length,
            totalCoins: this.currentSession.config.totalCoins,
            failedCoins: this.currentSession.failedCoins.length,
            startTime: this.currentSession.startTime,
            duration: Date.now() - this.currentSession.startTime,
            scrapingStep: this.currentSession.scrapingStep || null,
            currentIndex: this.currentSession.currentIndex || null,
            errors: this.currentSession.errors.slice(-3) // 只保留最近3个错误
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