/**
 * 监控界面模块
 * 负责监控状态显示、项目管理和手动触发监控
 */

// 导出监控UI类
class MonitorUI {
    constructor() {
        this.apiBase = window.location.origin;
    }

    // 添加监控
    addMonitor() {
        const exchange = document.getElementById('quickExchange').value;
        const coin = document.getElementById('quickCoin').value.trim().toUpperCase();
        const timeframe = document.getElementById('quickTimeframe').value;
        const threshold = parseFloat(document.getElementById('quickThreshold').value);

        // 验证输入
        if (!coin) {
            window.appUtils?.showAlert?.('请输入币种');
            return;
        }

        if (!threshold || threshold <= 0) {
            window.appUtils?.showAlert?.('请输入有效的阈值');
            return;
        }

        // 获取当前配置
        const config = window.appState.currentConfig || {};
        if (!config.coins) config.coins = [];

        // 检查是否已存在相同的监控
        const exists = config.coins.some(c =>
            c.symbol === coin && c.exchange === exchange && c.timeframe === timeframe
        );

        if (exists) {
            window.appUtils?.showAlert?.('该监控已存在');
            return;
        }

        // 添加新监控
        config.coins.push({
            symbol: coin,
            exchange: exchange,
            timeframe: timeframe,
            threshold: threshold,
            enabled: true
        });

        // 保存配置
        window.appConfig?.saveConfig?.(config);

        // 清空输入
        document.getElementById('quickCoin').value = '';
        document.getElementById('quickThreshold').value = '';

        // 检查是否需要询问启用监控
        this.checkAndAskToEnableMonitoring();

        this.loadStatus();
        // 移除全局监控开关状态更新
    }

    // 检查是否需要询问启用监控
    checkAndAskToEnableMonitoring() {
        // 这个方法在原始代码中是空的，保持原有逻辑
    }

    // 加载状态
    async loadStatus(preserveTriggerState = false) {
        try {
            const response = await fetch(`${this.apiBase}/api/status`);

            // 检测302重定向（会话失效）
            if (response.status === 302 || response.redirected) {
                window.location.href = '/login';
                return;
            }

            const data = await response.json();

            this.updateSystemStatus(true);
            this.displayStatus(data, preserveTriggerState);
        } catch (error) {
            console.error('加载状态失败:', error);
            this.updateSystemStatus(false);
            // 显示错误消息到alerts容器中
            const alertsContainer = document.getElementById('alerts');
            if (alertsContainer) {
                alertsContainer.innerHTML =
                    '<div style="background: #fef2f2; color: #dc2626; padding: 12px; border-radius: 8px; border: 1px solid #fecaca;">' +
                    '<strong>错误：</strong>状态加载失败 - ' + error.message +
                    '</div>';
            }
        }
    }

    // 更新系统状态（简化版）
    updateSystemStatus(isOnline) {
        // 移除了状态指示器，功能保留但简化
    }

    // 显示监控状态（简化版，适配邮件分组）
    displayStatus(data, preserveTriggerState = false) {
        // 状态显示现在主要通过邮件分组界面展示
        // 这个函数主要用于处理触发按钮状态
        const config = window.appState.currentConfig || {};

        // 如果配置还未加载，显示加载状态
        if (!window.appState.currentConfig) {
            return;
        }

        if (!config.email_groups || config.email_groups.length === 0) {
            // 没有邮件分组时不需要显示状态
            return;
        }

        // 保存触发按钮状态（如果需要保持）
        let triggerBtnState = null;
        if (preserveTriggerState) {
            const triggerBtn = document.getElementById('triggerBtn');
            const triggerStatus = document.getElementById('triggerStatus');
            if (triggerBtn && triggerBtn.disabled) {
                triggerBtnState = {
                    disabled: true,
                    text: triggerBtn.textContent,
                    statusText: triggerStatus ? triggerStatus.textContent : '',
                    statusVisible: triggerStatus ? triggerStatus.style.display !== 'none' : false
                };
            }
        }

        let html = '';

        // 兼容新的分组格式和旧的币种格式
        let coinsArray = [];
        if (config.email_groups && config.email_groups.length > 0) {
            // 新的分组格式：从所有分组中收集币种
            config.email_groups.forEach(group => {
                if (group.coins && group.coins.length > 0) {
                    coinsArray.push(...group.coins.map(coin => ({
                        ...coin,
                        group_id: group.id,
                        group_name: group.name,
                        group_email: group.email
                    })));
                }
            });
        } else if (config.coins && config.coins.length > 0) {
            // 旧的币种格式：直接使用币种数组
            coinsArray = config.coins;
        }

        // 如果没有币种，不执行循环
        if (coinsArray.length === 0) {
            return; // 没有币种时直接返回
        }

        coinsArray.forEach((coin, index) => {
            // 使用复合键名匹配分组监控格式（与后端API保持一致）
            const coinStateKey = `${coin.symbol}_${coin.exchange}_${coin.timeframe}`;
            const state = data.monitoring_status && data.monitoring_status.coins_state && data.monitoring_status.coins_state[coinStateKey] ? data.monitoring_status.coins_state[coinStateKey] : { status: 'normal' };
            const statusClass = state.status === 'alert' ? '#ef4444' :
                               state.status === 'normal' ? '#10b981' : '#f59e0b';
            const statusText = state.status === 'alert' ? '警报' :
                              state.status === 'normal' ? '正常' : '冷却期内';

            // 格式化时间显示
            const timeframeText = coin.timeframe === '1h' ? '每小时' :
                                coin.timeframe === '24h' ? '每天' : coin.timeframe;

            // 计算下次通知时间
            let nextNotificationText = '';
            if (state.status === 'alert' && state.next_notification) {
                const nextTime = new Date(state.next_notification);
                const now = new Date();
                const diffMs = nextTime - now;

                if (diffMs > 0) {
                    const diffMins = Math.floor(diffMs / (1000 * 60));
                    if (diffMins < 60) {
                        nextNotificationText = ' <small style="color: #6b7280;">(' + diffMins + '分钟后通知)</small>';
                    } else {
                        const diffHours = Math.floor(diffMins / 60);
                        const remainingMins = diffMins % 60;
                        if (diffHours < 24) {
                            nextNotificationText = ' <small style="color: #6b7280;">(' + diffHours + '小时' + (remainingMins > 0 ? remainingMins + '分钟' : '') + '后通知)</small>';
                        } else {
                            const diffDays = Math.floor(diffHours / 24);
                            const remainingHours = diffHours % 24;
                            nextNotificationText = ' <small style="color: #6b7280;">(' + diffDays + '天' + (remainingHours > 0 ? remainingHours + '小时' : '') + '后通知)</small>';
                        }
                    }
                }
            }

            // 判断是否显示冷却期重置选项（只有在警报状态且还在冷却期内时显示）
            const isInCooldown = state.status === 'alert' && state.next_notification && new Date(state.next_notification) > new Date();
            const showCooldownOption = isInCooldown;

            // 显示配置信息
            const exchangeDisplay = coin.exchange || 'binance';
            const timeframeDisplay = timeframeText;

            html += '<div class="monitor-item">' +
                    '<div class="monitor-info">' +
                        '<strong>' + exchangeDisplay + ' - ' + coin.symbol + '</strong>' +
                        '<div class="secondary-info">' +
                        '阈值: ' + coin.threshold + '% | 颗粒度: ' + timeframeDisplay +
                        nextNotificationText +
                    '</div>' +
                    '</div>' +
                    '<div class="monitor-actions">' +
                        '<div class="more-menu">' +
                            '<button onclick="window.appMonitorUI.toggleMoreMenu(' + index + ')" class="more-btn">⋮</button>' +
                            '<div id="moreMenu_' + index + '" class="more-dropdown">' +
                                (showCooldownOption ?
                                    '<button onclick="window.appMonitorUI.togglePause(\'' + coin.symbol + '\', \'' + coin.group_id + '\', \'' + coin.exchange + '\', \'' + coin.timeframe + '\')" class="more-dropdown-item">重置冷却期</button>' : ''
                                ) +
                                '<button onclick="window.appMonitorUI.editMonitor(' + index + ')" class="more-dropdown-item">编辑</button>' +
                                '<button onclick="window.appMonitorUI.removeMonitor(' + index + ')" class="more-dropdown-item danger">删除</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        });

        const alertsContainer = document.getElementById('alerts');
        if (alertsContainer) {
            alertsContainer.innerHTML = html;
        }

        // 恢复触发按钮状态
        if (triggerBtnState) {
            const triggerBtn = document.getElementById('triggerBtn');
            const triggerStatus = document.getElementById('triggerStatus');
            if (triggerBtn) {
                triggerBtn.disabled = triggerBtnState.disabled;
                triggerBtn.textContent = triggerBtnState.text;
            }
            if (triggerStatus && triggerBtnState.statusVisible) {
                triggerStatus.style.display = 'inline';
                triggerStatus.textContent = triggerBtnState.statusText;
            }
        }
    }

    // 编辑监控
    editMonitor(index) {
        // 关闭菜单
        this.closeAllMoreMenus();

        const config = window.appState.currentConfig || {};
        if (config.coins && config.coins[index]) {
            const coin = config.coins[index];
            const currentThreshold = coin.threshold;
            const newThreshold = prompt(`编辑 ${coin.exchange} - ${coin.symbol} 的阈值:`, currentThreshold);

            if (newThreshold !== null) {
                const parsedThreshold = parseFloat(newThreshold);
                if (!isNaN(parsedThreshold) && parsedThreshold > 0) {
                    config.coins[index].threshold = parsedThreshold;
                    window.appConfig?.saveConfig?.(config);
                    window.appUtils?.showAlert?.('阈值已更新', 'success');
                    this.loadStatus();
                } else {
                    window.appUtils?.showAlert?.('请输入有效的阈值数值', 'error');
                }
            }
        }
    }

    // 删除监控
    removeMonitor(index) {
        // 关闭菜单
        this.closeAllMoreMenus();

        const config = window.appState.currentConfig || {};
        if (config.coins && config.coins[index]) {
            const coin = config.coins[index];
            if (confirm('确定要删除监控 ' + coin.exchange + ' - ' + coin.symbol + ' 吗？')) {
                config.coins.splice(index, 1);
                window.appConfig?.saveConfig?.(config);
                window.appUtils?.showAlert?.('监控已删除', 'success');
                this.loadStatus();
                // 移除全局监控开关状态更新
            }
        }
    }

    // 切换更多菜单
    toggleMoreMenu(index) {
        // 关闭所有其他菜单
        const allMenus = document.querySelectorAll('.more-dropdown');
        allMenus.forEach(menu => {
            if (menu.id !== `moreMenu_${index}`) {
                menu.classList.remove('show');
            }
        });

        // 切换当前菜单
        const currentMenu = document.getElementById(`moreMenu_${index}`);
        if (currentMenu) {
            currentMenu.classList.toggle('show');
        }
    }

    // 关闭所有更多菜单
    closeAllMoreMenus() {
        const allMenus = document.querySelectorAll('.more-dropdown');
        allMenus.forEach(menu => {
            menu.classList.remove('show');
        });
    }

    // 暂停/继续通知
    async togglePause(coinSymbol, groupId, exchange, timeframe, menuIndex) {
        // 关闭菜单
        this.closeAllMoreMenus();
        try {
            const response = await fetch(`${this.apiBase}/api/status/cooldown/reset`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    coinSymbol,
                    groupId,
                    exchange,
                    timeframe
                })
            });

            // 检测302重定向（会话失效）
            if (response.status === 302 || response.redirected) {
                window.location.href = '/login';
                return;
            }

            const result = await response.json();

            if (result.success) {
                // 刷新状态显示，不显示提示
                await this.loadStatus();
                // 同时刷新邮件分组界面以更新冷却状态
                if (window.appConfig?.renderEmailGroups) {
                    await window.appConfig.renderEmailGroups();
                }
            } else {
                // 静默失败，不显示错误
            }
        } catch (error) {
            // 静默失败
            console.error('暂停/继续操作失败:', error);
        }
    }

    // 批量重置分组冷却期
    async resetGroupCooldown(groupId) {
        // 关闭所有菜单
        this.closeAllMoreMenus();

        try {
            const config = window.appState.currentConfig || {};
            const group = config.email_groups?.find(g => g.id === groupId);

            if (!group || !group.coins || group.coins.length === 0) {
                window.appUtils?.showAlert?.('分组信息不存在或无监控币种', 'error');
                return;
            }

            // 找出所有需要重置冷却期的币种
            const coinsToReset = [];

            // 获取当前监控状态
            const statusResponse = await fetch(`${this.apiBase}/api/status`);
            if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                const monitoringStatus = statusData.monitoring_status?.coins_state || {};

                group.coins.forEach(coin => {
                    const coinStateKey = `${coin.symbol}_${coin.exchange}_${coin.timeframe}`;
                    const coinState = monitoringStatus[coinStateKey];

                    // 检查是否处于警报状态且有冷却期
                    if (coinState &&
                        coinState.status === 'alert' &&
                        coinState.next_notification &&
                        new Date(coinState.next_notification) > new Date()) {
                        coinsToReset.push(coin);
                    }
                });
            }

            if (coinsToReset.length === 0) {
                window.appUtils?.showAlert?.('该分组没有需要重置冷却期的币种', 'info');
                return;
            }

            // 确认对话框
            const coinList = coinsToReset.map(c => `${c.exchange}-${c.symbol}(${c.timeframe})`).join(', ');
            if (!confirm(`确定要重置以下币种的冷却期吗？\n\n${coinList}\n\n重置后可以立即触发警报通知。`)) {
                return;
            }

            // 批量重置冷却期
            let successCount = 0;
            for (const coin of coinsToReset) {
                try {
                    const response = await fetch(`${this.apiBase}/api/status/cooldown/reset`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            coinSymbol: coin.symbol,
                            groupId: groupId,
                            exchange: coin.exchange,
                            timeframe: coin.timeframe
                        })
                    });

                    if (response.ok) {
                        const result = await response.json();
                        if (result.success) {
                            successCount++;
                        }
                    }
                } catch (error) {
                    console.error(`重置 ${coin.symbol} 冷却期失败:`, error);
                }
            }

            // 刷新状态显示
            await this.loadStatus();
            // 同时刷新邮件分组界面以更新冷却状态
            if (window.appConfig?.renderEmailGroups) {
                await window.appConfig.renderEmailGroups();
            }

            // 显示结果
            if (successCount > 0) {
                window.appUtils?.showAlert?.(`已成功重置 ${successCount} 个币种的冷却期`, 'success');
            } else {
                window.appUtils?.showAlert?.('重置冷却期失败，请重试', 'error');
            }

        } catch (error) {
            console.error('批量重置冷却期失败:', error);
            window.appUtils?.showAlert?.('操作失败，请重试', 'error');
        }
    }

    // 立即触发监控
    async triggerMonitoring() {
        const triggerBtn = document.getElementById('triggerBtn');
        const triggerStatus = document.getElementById('triggerStatus');

        // 检查按钮是否已经在执行中
        if (triggerBtn.disabled) {
            return;
        }

        // 检查是否有启用的邮件组配置
        if (!window.appConfig?.canEnableMonitoring?.()) {
            window.appConfig?.showEnableMonitoringError?.();
            return;
        }

        try {
            // 禁用按钮并显示初始状态
            triggerBtn.disabled = true;
            triggerBtn.style.opacity = '0.5';
            triggerBtn.textContent = '▶';
            triggerStatus.style.display = 'inline';

            window.appUtils?.showAlert?.('正在触发监控检查...', 'info');

            // 清空并显示实时日志容器
            this.showRealtimeLog();

            // 开始状态轮询获取真实日志
            let pollInterval = null;
            let scrapeCompleted = false;

            // 立即开始轮询真实日志
            pollInterval = setInterval(async () => {
                try {
                    const statusResponse = await fetch(`${this.apiBase}/api/scrape/status`);
                    const statusData = await statusResponse.json();

                    if (statusData.success && statusData.status) {
                        // 更新真实日志显示
                        this.updateRealtimeLog(statusData.status);

                        // 检查是否已完成或失败
                        if (!statusData.status.isRunning) {
                            clearInterval(pollInterval);

                            // 获取最终结果
                            if (!scrapeCompleted) {
                                setTimeout(async () => {
                                    try {
                                        const finalResponse = await fetch(`${this.apiBase}/api/scrape/coinglass`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({})
                                        });

                                        // 检测302重定向（会话失效）
                                        if (finalResponse.status === 302 || finalResponse.redirected) {
                                            window.location.href = '/login';
                                            return;
                                        }

                                        if (finalResponse.ok) {
                                            const finalData = await finalResponse.json();
                                            this.handleScrapeComplete(finalData, statusData.status);
                                        } else {
                                            this.handleScrapeComplete({}, statusData.status);
                                        }
                                    } catch (finalError) {
                                        console.error('获取最终结果失败:', finalError);
                                        this.handleScrapeComplete({}, statusData.status);
                                    }
                                }, 1000);
                            } else {
                                this.handleScrapeComplete({}, statusData.status);
                            }
                        }
                    }
                } catch (statusError) {
                    console.error('状态查询失败:', statusError);
                    // 状态查询失败不影响主流程，继续轮询
                }
            }, 1000); // 每1秒查询一次真实日志

            // 同时发起抓取请求
            fetch(`${this.apiBase}/api/scrape/coinglass`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({})
            }).then(async (response) => {
                // 检测302重定向（会话失效）
                if (response.status === 302 || response.redirected) {
                    window.location.href = '/login';
                    return;
                }

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
                }
                scrapeCompleted = true;
            }).catch(async error => {
                console.error('触发监控失败:', error);
                scrapeCompleted = true;

                // 尝试解析错误响应
                let errorData = error;
                try {
                    const errorResponse = await fetch(`${this.apiBase}/api/scrape/coinglass`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({})
                    }).catch(() => null);

                    if (errorResponse && !errorResponse.ok) {
                        errorData = await errorResponse.json().catch(() => ({ error: 'Network error' }));
                    }
                } catch (parseError) {
                    // 解析失败，使用原始错误
                }

                this.handleScrapeError(errorData);
            });

        } catch (error) {
            console.error('触发监控失败:', error);
            this.handleScrapeError(error);
        }
    }

    // 恢复触发按钮状态的函数
    resetTriggerButton() {
        const triggerBtn = document.getElementById('triggerBtn');
        const triggerStatus = document.getElementById('triggerStatus');

        if (triggerBtn) {
            triggerBtn.disabled = false;
            triggerBtn.style.opacity = '1';
            triggerBtn.style.color = '';
            triggerBtn.textContent = '▶';
        }

        if (triggerStatus) {
            triggerStatus.style.display = 'none';
            triggerStatus.textContent = '';
        }
    }

    // 显示实时日志
    showRealtimeLog() {
        const triggerStatus = document.getElementById('triggerStatus');

        // 清理可能存在的旧容器
        const oldContainer = document.getElementById('realtimeLogContainer');
        if (oldContainer) {
            oldContainer.remove();
        }

        // 设置显示样式
        triggerStatus.style.display = 'block';
        triggerStatus.style.whiteSpace = 'nowrap';
        triggerStatus.style.fontSize = '12px';
        triggerStatus.style.lineHeight = '1.4';
        triggerStatus.style.textAlign = 'left';
        triggerStatus.style.padding = '2px 4px';
        triggerStatus.style.backgroundColor = 'transparent';
        triggerStatus.style.border = 'none';
        triggerStatus.style.borderRadius = '0';
        triggerStatus.style.overflow = 'hidden';
        triggerStatus.style.textOverflow = 'ellipsis';
        triggerStatus.style.color = '#6b7280'; // 普通灰色
        triggerStatus.style.fontFamily = 'monospace';

        // 开始旋转动画（会自动显示初始文本）
        this.startSpinnerAnimation(triggerStatus);

        // 存储当前日志数量，用于增量更新
        this.currentLogCount = 0;
    }

  // 更新真实日志显示
    updateRealtimeLog(status) {
        if (!status.logs) return;

        // 更新当前日志文本（去掉时间戳）
        if (status.logs.length > 0) {
            // 获取最新的一条日志
            const latestLog = status.logs[status.logs.length - 1];

            // 彻底清理日志：去掉时间戳 [YYYY-MM-DD HH:MM:SS] 和其他可能的时间格式
            let cleanLog = latestLog
                .replace(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]\s*/, '') // 标准时间戳
                .replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '') // 简化时间戳
                .trim(); // 去除首尾空格

            // 更新当前日志文本（旋转动画会自动显示新文本）
            this.currentLogText = cleanLog;
        }
    }

    // 开始旋转动画
    startSpinnerAnimation(element) {
        const spinners = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

        // 清理可能存在的旧动画
        if (this.spinnerInterval) {
            clearInterval(this.spinnerInterval);
        }

        // 初始化旋转状态
        this.spinnerIndex = 0;
        this.spinners = spinners;
        this.currentLogText = '开始监控检查...';

        // 开始独立的旋转动画
        this.spinnerInterval = setInterval(() => {
            this.spinnerIndex = (this.spinnerIndex + 1) % this.spinners.length;
            this.updateDisplayWithSpinner(element);
        }, 100); // 每100ms切换一个字符
    }

    // 更新显示（旋转字符+当前日志）
    updateDisplayWithSpinner(element) {
        const currentSpinner = this.spinners[this.spinnerIndex];
        element.textContent = currentSpinner + ' ' + this.currentLogText;
    }

    // 获取当前旋转字符
    getCurrentSpinner() {
        return this.spinners ? this.spinners[this.spinnerIndex] : '⠋';
    }

    // 停止旋转动画
    stopSpinnerAnimation() {
        if (this.spinnerInterval) {
            clearInterval(this.spinnerInterval);
            this.spinnerInterval = null;
        }
    }


    // 隐藏实时日志
    hideRealtimeLog() {
        const triggerStatus = document.getElementById('triggerStatus');
        if (triggerStatus) {
            triggerStatus.style.display = 'none';
            triggerStatus.textContent = '';
            this.currentLogCount = 0;
            // 停止旋转动画
            this.stopSpinnerAnimation();
        }
    }

    // 处理抓取完成
    handleScrapeComplete(scrapeData, statusData) {
        const triggerBtn = document.getElementById('triggerBtn');
        const triggerStatus = document.getElementById('triggerStatus');

        // 显示成功状态
        triggerStatus.textContent = '检查完成';
        triggerBtn.textContent = '✓';
        triggerBtn.style.color = '#10b981';

        // 根据实际监控结果显示准确的成功消息
        let successMessage = '监控检查完成！';
        if (scrapeData.monitor_results) {
            const { alerts_sent, recoveries_sent, coins_checked } = scrapeData.monitor_results;
            if (alerts_sent > 0) {
                successMessage = `发现异常！已发送 ${alerts_sent} 个警报通知`;
            } else if (recoveries_sent > 0) {
                successMessage = `恢复正常！已发送 ${recoveries_sent} 个恢复通知`;
            } else if (coins_checked > 0) {
                successMessage = `检查完成！所有 ${coins_checked} 个币种利率正常`;
            }
        }

        window.appUtils?.showAlert?.(successMessage, 'success');

        // 触发后刷新状态
        setTimeout(async () => {
            await this.loadStatus();
            // 同时刷新邮件分组界面以更新冷却状态
            if (window.appConfig?.renderEmailGroups) {
                await window.appConfig.renderEmailGroups();
            }
        }, 2000);

        // 3秒后恢复按钮状态并隐藏日志
        setTimeout(() => {
            this.resetTriggerButton();
            this.hideRealtimeLog();
        }, 3000);
    }

    // 处理抓取错误
    handleScrapeError(error) {
        const triggerBtn = document.getElementById('triggerBtn');
        const triggerStatus = document.getElementById('triggerStatus');

        // 显示错误状态
        triggerStatus.textContent = '检查失败';
        triggerBtn.textContent = '✗';
        triggerBtn.style.color = '#ef4444';

        // 处理自动监控冲突的特殊情况
        if (error.error === 'AUTO_MONITORING_RUNNING') {
            // 显示友好的冲突提示
            this.updateRealtimeLog({ logs: ['⚠️ 自动监控正在运行，请稍后再试'] });
            triggerStatus.textContent = '自动监控运行中';

            // 3秒后恢复按钮状态并隐藏日志
            setTimeout(() => {
                this.resetTriggerButton();
                this.hideRealtimeLog();
            }, 3000);
            return;
        }

        window.appUtils?.showAlert?.(`触发监控失败: ${error.message}`, 'error');

        // 3秒后恢复按钮状态并隐藏日志
        setTimeout(() => {
            this.resetTriggerButton();
            this.hideRealtimeLog();
        }, 3000);
    }
}

// 创建全局实例并导出
window.appMonitorUI = new MonitorUI();