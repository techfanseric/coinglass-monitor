/**
 * 配置管理模块
 * 负责配置的加载、保存、验证和邮件分组管理
 */

// 导出配置管理类
class ConfigManager {
    constructor() {
        this.apiBase = window.location.origin;
    }

    // 加载配置
    async loadConfig() {
        try {
            const response = await fetch(`${this.apiBase}/api/config`);
            const config = await response.json();

            if (config && Object.keys(config).length > 0) {
                window.appState.currentConfig = config;
                this.populateForm(config);
                window.appUtils?.showAlert?.('配置加载成功', 'success');
                return config;
            }
            return null;
        } catch (error) {
            console.error('加载配置失败:', error);
            window.appUtils?.showAlert?.('加载配置失败，请重试');
            return null;
        }
    }

    // 填充表单
    populateForm(config) {

        // 移除邮箱配置，现在在邮件分组中设置
        document.getElementById('repeatInterval').value = config.repeat_interval || 180;
        // 移除全局监控开关，改为组级别控制

        // 填充触发时间设置
        if (config.trigger_settings) {
            document.getElementById('hourlyMinute').value = config.trigger_settings.hourly_minute || 5;
            document.getElementById('dailyTime').value = config.trigger_settings.daily_time || '09:05';
        }

        if (config.notification_hours) {
            document.getElementById('timeControl').checked = config.notification_hours.enabled || false;
            document.getElementById('startTime').value = config.notification_hours.start || '09:00';
            document.getElementById('endTime').value = config.notification_hours.end || '23:59';
            // 根据复选框状态显示或隐藏时间输入
            this.toggleTimeInputs();
        }

        // 移除全局监控开关状态更新

        // 渲染邮件分组
        this.renderEmailGroups();
    }

    // 保存配置
    async saveConfig(inputConfig = null) {
        // 验证时间配置
        if (!this.validateTimeConfig()) {
            return; // 验证失败时中止保存
        }

        const timeControl = document.getElementById('timeControl');
        const startTime = document.getElementById('startTime').value;
        const endTime = document.getElementById('endTime').value;

        const config = inputConfig || {
            // 使用新的邮件分组结构
            email_groups: window.appState.currentConfig?.email_groups || [],
            repeat_interval: parseInt(document.getElementById('repeatInterval').value),
            // 移除全局监控开关，改为组级别控制
            trigger_settings: {
                hourly_minute: parseInt(document.getElementById('hourlyMinute').value) || 5,
                daily_time: document.getElementById('dailyTime').value || '09:05'
            },
            notification_hours: {
                enabled: timeControl.checked,
                start: startTime,
                end: endTime
            }
        };

        try {
            const response = await fetch(`${this.apiBase}/api/config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config)
            });

            if (response.ok) {
                if (!inputConfig) {
                    window.appUtils?.showAlert?.('配置保存成功！', 'success');
                }
                window.appState.currentConfig = config;
            } else {
                throw new Error('保存失败');
            }
        } catch (error) {
            console.error('保存配置失败:', error);
            if (!inputConfig) {
                window.appUtils?.showAlert?.('保存配置失败，请重试');
            }
        }
    }

    // 自动保存配置
    async autoSaveConfig() {
        // 验证时间配置
        if (!this.validateTimeConfig()) {
            return; // 验证失败时中止保存
        }

        const timeControl = document.getElementById('timeControl');
        const startTime = document.getElementById('startTime').value;
        const endTime = document.getElementById('endTime').value;

        const config = {
            // 使用新的邮件分组结构
            email_groups: window.appState.currentConfig?.email_groups || [],
            repeat_interval: parseInt(document.getElementById('repeatInterval').value),
            // 移除全局监控开关，改为组级别控制
            trigger_settings: {
                hourly_minute: parseInt(document.getElementById('hourlyMinute').value) || 5,
                daily_time: document.getElementById('dailyTime').value || '09:05'
            },
            notification_hours: {
                enabled: timeControl.checked,
                start: startTime,
                end: endTime
            }
        };

        // 移除全局监控状态检查，改为组级别控制

        try {
            const response = await fetch(`${this.apiBase}/api/config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config)
            });

            if (response.ok) {
                window.appState.currentConfig = config;
                window.appUtils?.showAlert?.('配置保存成功', 'success');
                // 移除全局监控开关状态更新
            } else {
                throw new Error('保存失败');
            }
        } catch (error) {
            console.error('自动保存配置失败:', error);
            window.appUtils?.showAlert?.('配置保存失败，请重试');
        }
    }

    // 切换时间输入显示
    toggleTimeInputs() {
        const timeControl = document.getElementById('timeControl');
        const timeInputs = document.getElementById('timeInputs');

        if (timeControl.checked) {
            timeInputs.style.display = 'block';
        } else {
            timeInputs.style.display = 'none';
        }
    }

    // 验证时间字符串格式
    validateTimeFormat(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') {
            return false;
        }

        const parts = timeStr.split(':');
        if (parts.length !== 2) {
            return false;
        }

        const hours = Number(parts[0]);
        const minutes = Number(parts[1]);

        return !isNaN(hours) && !isNaN(minutes) &&
               hours >= 0 && hours <= 23 &&
               minutes >= 0 && minutes <= 59;
    }

    // 验证并修复时间配置
    validateTimeConfig() {
        const timeControl = document.getElementById('timeControl');
        const startTime = document.getElementById('startTime').value;
        const endTime = document.getElementById('endTime').value;

        // 如果未启用时间限制，无需验证
        if (!timeControl.checked) {
            return true;
        }

        const startValid = this.validateTimeFormat(startTime);
        const endValid = this.validateTimeFormat(endTime);

        if (!startValid || !endValid) {
            // 时间格式无效，自动取消勾选
            timeControl.checked = false;
            this.toggleTimeInputs();
            window.appUtils?.showAlert?.('时间格式无效，已自动取消时间限制', 'warning');
            return false;
        }

        return true;
    }

    // 时间输入变化时的实时验证
    onTimeInputChange() {
        const timeControl = document.getElementById('timeControl');

        // 如果未启用，无需验证
        if (!timeControl.checked) {
            return;
        }

        const startTime = document.getElementById('startTime').value;
        const endTime = document.getElementById('endTime').value;
        const startValid = this.validateTimeFormat(startTime);
        const endValid = this.validateTimeFormat(endTime);

        if (!startValid || !endValid) {
            // 显示错误提示，但不立即取消勾选
            const timeInputs = document.getElementById('timeInputs');
            if (!document.getElementById('timeErrorTip')) {
                const errorTip = document.createElement('div');
                errorTip.id = 'timeErrorTip';
                errorTip.style.cssText = 'color: #dc3545; font-size: 12px; margin-top: 5px;';
                errorTip.textContent = '⚠️ 时间格式无效，保存时将自动取消时间限制';
                timeInputs.appendChild(errorTip);
            }
        } else {
            // 移除错误提示
            const errorTip = document.getElementById('timeErrorTip');
            if (errorTip) {
                errorTip.remove();
            }
        }
    }

    // 检查监控状态是否可以开启（基于邮件组）
    canEnableMonitoring() {
        const config = window.appState.currentConfig || {};

        // 检查是否有启用的邮件分组
        const hasEnabledGroups = config.email_groups && config.email_groups.some(group => {
            // 检查组是否启用
            if (group.enabled === false) return false;

            // 检查邮箱是否有效
            const email = group.email?.trim();
            if (!email) return false;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) return false;

            // 检查是否有启用的币种
            return group.coins && group.coins.some(coin => coin.enabled !== false);
        });

        return hasEnabledGroups;
    }

    // 获取监控启用提示信息
    getMonitoringEnabledTip() {
        return ' 请在邮件组中启用监控以开始接收通知';
    }

    // 显示具体的启用错误提示（基于邮件组）
    showEnableMonitoringError() {
        const config = window.appState.currentConfig || {};

        if (!config.email_groups || config.email_groups.length === 0) {
            window.appUtils?.showAlert?.('请先添加邮件分组', 'error');
            return;
        }

        // 检查邮件组状态
        const disabledGroups = [];
        const invalidEmailGroups = [];
        const emptyEmailGroups = [];
        const noCoinsGroups = [];
        const disabledCoinsGroups = [];

        config.email_groups.forEach(group => {
            if (group.enabled === false) {
                disabledGroups.push(group.name || '未命名分组');
                return;
            }

            const email = group.email?.trim();
            if (!email) {
                emptyEmailGroups.push(group.name || '未命名分组');
                return;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                invalidEmailGroups.push(group.name || '未命名分组');
                return;
            }

            if (!group.coins || group.coins.length === 0) {
                noCoinsGroups.push(group.name || '未命名分组');
                return;
            }

            const hasEnabledCoins = group.coins.some(coin => coin.enabled !== false);
            if (!hasEnabledCoins) {
                disabledCoinsGroups.push(group.name || '未命名分组');
            }
        });

        // 按优先级显示错误
        if (disabledGroups.length > 0) {
            window.appUtils?.showAlert?.(`以下邮件组已禁用：${disabledGroups.join(', ')}`, 'error');
        } else if (emptyEmailGroups.length > 0) {
            window.appUtils?.showAlert?.(`以下邮件组未填写邮箱：${emptyEmailGroups.join(', ')}`, 'error');
        } else if (invalidEmailGroups.length > 0) {
            window.appUtils?.showAlert?.(`以下邮件组邮箱格式不正确：${invalidEmailGroups.join(', ')}`, 'error');
        } else if (noCoinsGroups.length > 0) {
            window.appUtils?.showAlert?.(`以下邮件组未添加监控项目：${noCoinsGroups.join(', ')}`, 'error');
        } else if (disabledCoinsGroups.length > 0) {
            window.appUtils?.showAlert?.(`以下邮件组中的监控项目已禁用：${disabledCoinsGroups.join(', ')}`, 'error');
        } else {
            window.appUtils?.showAlert?.('请启用至少一个邮件组并配置邮箱和监控项目', 'error');
        }
    }

    // 处理邮件组开关点击
    handleGroupToggleChange(groupId, isEnabled) {
        // 更新本地配置数据
        if (window.appState.currentConfig.email_groups) {
            const group = window.appState.currentConfig.email_groups.find(g => g.id === groupId);
            if (group) {
                // 如果尝试启用组，检查是否满足条件
                if (isEnabled) {
                    const email = group.email?.trim();
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

                    if (!email) {
                        window.appUtils?.showAlert?.('请先填写邮箱地址再启用此邮件组', 'error');
                        // 重置开关状态
                        document.getElementById(`groupToggle_${groupId}`).checked = false;
                        return;
                    }

                    if (!emailRegex.test(email)) {
                        window.appUtils?.showAlert?.('邮箱地址格式不正确，请修正后再启用此邮件组', 'error');
                        // 重置开关状态
                        document.getElementById(`groupToggle_${groupId}`).checked = false;
                        return;
                    }

                    if (!group.coins || group.coins.length === 0) {
                        window.appUtils?.showAlert?.('请先添加监控项目再启用此邮件组', 'error');
                        // 重置开关状态
                        document.getElementById(`groupToggle_${groupId}`).checked = false;
                        return;
                    }

                    const hasEnabledCoins = group.coins.some(coin => coin.enabled !== false);
                    if (!hasEnabledCoins) {
                        window.appUtils?.showAlert?.('请先启用至少一个监控项目再启用此邮件组', 'error');
                        // 重置开关状态
                        document.getElementById(`groupToggle_${groupId}`).checked = false;
                        return;
                    }
                }

                group.enabled = isEnabled;

                // 更新状态文本显示
                const statusText = document.querySelector(`[data-group-id="${groupId}"] .group-status-text`);
                if (statusText) {
                    statusText.textContent = isEnabled ? '已启用' : '已禁用';
                    statusText.style.color = isEnabled ? '#059669' : '#6b7280';
                }

                // 自动保存配置
                this.autoSaveConfig();
            }
        }
    }

    // 渲染邮件分组
    renderEmailGroups() {
        const container = document.getElementById('emailGroups');
        const groups = window.appState.currentConfig?.email_groups || [];

        if (groups.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #6b7280;">暂无邮件分组</p>';
            return;
        }

        container.innerHTML = groups.map((group, index) => `
            <div class="email-group" data-group-id="${group.id}">
                <div class="group-header">
                    <div class="group-title-section">
                        <h3>${group.name}</h3>
                        <label class="toggle-switch" style="transform: scale(0.8); margin-left: 10px;">
                            <input type="checkbox"
                                   id="groupToggle_${group.id}"
                                   ${group.enabled !== false ? 'checked' : ''}
                                   onchange="window.appConfig.handleGroupToggleChange('${group.id}', this.checked)">
                            <span class="slider"></span>
                        </label>
                        <span class="group-status-text" style="margin-left: 8px; font-size: 12px; color: ${group.enabled !== false ? '#059669' : '#6b7280'};">
                            ${group.enabled !== false ? '已启用' : '已禁用'}
                        </span>
                    </div>
                    <button onclick="window.appConfig.deleteEmailGroup('${group.id}')" class="delete-btn">删除</button>
                </div>

                <div class="group-email">
                    <label>邮箱地址:</label>
                    <input type="email"
                           value="${group.email || ''}"
                           onchange="window.appConfig.updateGroupEmail('${group.id}', this.value)"
                           placeholder="输入邮箱地址">
                </div>

                <div class="group-coins">
                    <label>监控币种:</label>

                    ${group.coins.length > 0 ? `
                        <div id="addButtonContainer_${group.id}">
                            <button onclick="window.appConfig.toggleAddCoinForm('${group.id}')" class="btn" style="width: 100%; background: #f8fafc; border: 1px dashed #cbd5e0; color: #64748b;">
                                + 添加币种
                            </button>
                        </div>
                        <div id="addCoinForm_${group.id}" class="add-coin-form" style="display: none;">
                            <select id="newCoinExchange_${group.id}">
                                <option value="binance">Binance</option>
                                <option value="okx">OKX</option>
                                <option value="bybit">Bybit</option>
                            </select>
                            <input type="text" id="newCoinSymbol_${group.id}" placeholder="币种">
                            <select id="newCoinTimeframe_${group.id}">
                                <option value="1h">1小时</option>
                                <option value="24h">24小时</option>
                            </select>
                            <input type="number" id="newCoinThreshold_${group.id}" placeholder="阈值%" step="0.1" min="0">
                            <button onclick="window.appConfig.addCoinToGroup('${group.id}')">添加</button>
                            <button onclick="window.appConfig.toggleAddCoinForm('${group.id}')" class="btn-secondary">取消</button>
                        </div>
                    ` : `
                        <div class="add-coin-form">
                            <select id="newCoinExchange_${group.id}">
                                <option value="binance">Binance</option>
                                <option value="okx">OKX</option>
                                <option value="bybit">Bybit</option>
                            </select>
                            <input type="text" id="newCoinSymbol_${group.id}" placeholder="币种">
                            <select id="newCoinTimeframe_${group.id}">
                                <option value="1h">1小时</option>
                                <option value="24h">24小时</option>
                            </select>
                            <input type="number" id="newCoinThreshold_${group.id}" placeholder="阈值%" step="0.1" min="0">
                            <button onclick="window.appConfig.addCoinToGroup('${group.id}')">添加</button>
                        </div>
                    `}

                    <div class="coins-list" style="margin-top: 12px;">
                        ${group.coins.slice().reverse().map((coin, index) => {
                            const actualIndex = group.coins.length - 1 - index;
                            return `
                            <div class="coin-item-simple">
                                <span class="coin-text">
                                    <strong>${coin.exchange} - ${coin.symbol}</strong>
                                    阈值: ${coin.threshold}% | 颗粒度: ${coin.timeframe === '24h' ? '24小时' : '每小时'}
                                </span>
                                <div class="coin-actions">
                                    <div class="more-menu">
                                        <button onclick="window.appMonitorUI.toggleMoreMenu('group_${group.id}_${actualIndex}')" class="more-btn-small">⋮</button>
                                        <div id="moreMenu_group_${group.id}_${actualIndex}" class="more-dropdown more-dropdown-small">
                                            <button onclick="window.appConfig.editCoinInGroup('${group.id}', '${actualIndex}')" class="more-dropdown-item">编辑</button>
                                            <button onclick="window.appConfig.removeCoinFromGroup('${group.id}', '${coin.symbol}_${coin.exchange}_${coin.timeframe}')" class="more-dropdown-item danger">删除</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;}).join('')}
                    </div>
                </div>
            </div>
        `).join('');
    }

    // 添加新的邮件分组
    async addEmailGroup() {
        const groups = window.appState.currentConfig?.email_groups || [];
        const groupCount = groups.length;

        // 生成分组名称 - 所有分组都显示序号
        const groupName = `邮件${groupCount + 1}`;

        const newGroup = {
            id: `group_${Date.now()}`,
            name: groupName,
            email: '',
            enabled: false, // 新邮件组默认禁用（需要填写邮箱后才能启用）
            coins: []
        };

        // 更新本地配置
        if (!window.appState.currentConfig.email_groups) {
            window.appState.currentConfig.email_groups = [];
        }
        window.appState.currentConfig.email_groups.push(newGroup);

        try {
            // 先渲染界面（给用户即时反馈）
            this.renderEmailGroups();
            window.appUtils?.showAlert?.(`已添加 ${groupName}`, 'success');

            // 然后保存到后端
            await this.saveConfig();
        } catch (error) {
            console.error('保存邮件分组失败:', error);
            window.appUtils?.showAlert?.('保存失败，请重试', 'error');

            // 如果保存失败，回滚本地状态
            const groups = window.appState.currentConfig?.email_groups || [];
            const groupIndex = groups.findIndex(g => g.id === newGroup.id);
            if (groupIndex !== -1) {
                groups.splice(groupIndex, 1);
                this.renderEmailGroups();
            }
        }
    }

    // 删除邮件分组
    async deleteEmailGroup(groupId) {
        if (!confirm('确定要删除这个邮件分组吗？')) {
            return;
        }

        const groups = window.appState.currentConfig?.email_groups || [];
        const groupIndex = groups.findIndex(g => g.id === groupId);

        if (groupIndex !== -1) {
            const groupName = groups[groupIndex].name;
            const deletedGroup = groups[groupIndex];

            // 先从本地状态移除
            groups.splice(groupIndex, 1);
            this.renderEmailGroups();

            try {
                // 保存到后端
                await this.saveConfig();
                window.appUtils?.showAlert?.(`已删除 ${groupName}`, 'success');
            } catch (error) {
                console.error('删除邮件分组失败:', error);
                window.appUtils?.showAlert?.('删除失败，请重试', 'error');

                // 如果删除失败，回滚本地状态
                window.appState.currentConfig.email_groups.splice(groupIndex, 0, deletedGroup);
                this.renderEmailGroups();
            }
        }
    }

    // 更新分组邮箱
    async updateGroupEmail(groupId, email) {
        const groups = window.appState.currentConfig?.email_groups || [];
        const group = groups.find(g => g.id === groupId);

        if (group) {
            const previousEmail = group.email;
            group.email = email;

            try {
                await this.saveConfig();
            } catch (error) {
                console.error('更新邮箱失败:', error);
                // 回滚邮箱地址
                group.email = previousEmail;
                window.appUtils?.showAlert?.('更新邮箱失败，请重试', 'error');
            }
        }
    }

    // 切换添加币种表单显示
    toggleAddCoinForm(groupId) {
        const form = document.getElementById(`addCoinForm_${groupId}`);
        const buttonContainer = document.getElementById(`addButtonContainer_${groupId}`);

        if (form && buttonContainer) {
            const isFormHidden = form.style.display === 'none' || !form.style.display;

            // 隐藏所有其他分组的表单并显示它们的按钮
            document.querySelectorAll('[id^="addCoinForm_"]').forEach(f => {
                f.style.display = 'none';
            });
            document.querySelectorAll('[id^="addButtonContainer_"]').forEach(b => {
                b.style.display = 'block';
            });

            // 切换当前分组：隐藏按钮，显示表单 或 隐藏表单，显示按钮
            if (isFormHidden) {
                buttonContainer.style.display = 'none';
                form.style.display = 'flex'; // 明确设置为 flex
            } else {
                buttonContainer.style.display = 'block';
                form.style.display = 'none';
                // 取消时清空表单内容
                this.clearAndResetForm(groupId);
            }
        }
    }

    // 清空并重置表单（用于空币种分组）
    clearAndResetForm(groupId) {
        document.getElementById(`newCoinSymbol_${groupId}`).value = '';
        document.getElementById(`newCoinThreshold_${groupId}`).value = '';
        document.getElementById(`newCoinExchange_${groupId}`).selectedIndex = 0;
        document.getElementById(`newCoinTimeframe_${groupId}`).selectedIndex = 0;
    }

    // 添加币种到分组
    async addCoinToGroup(groupId) {
        const symbol = document.getElementById(`newCoinSymbol_${groupId}`).value.trim().toUpperCase();
        const exchange = document.getElementById(`newCoinExchange_${groupId}`).value;
        const timeframe = document.getElementById(`newCoinTimeframe_${groupId}`).value;
        const threshold = parseFloat(document.getElementById(`newCoinThreshold_${groupId}`).value);

        // 验证输入
        if (!symbol) {
            window.appUtils?.showAlert?.('请输入币种');
            return;
        }

        if (!threshold || threshold <= 0) {
            window.appUtils?.showAlert?.('请输入有效的阈值');
            return;
        }

        const groups = window.appState.currentConfig?.email_groups || [];
        const group = groups.find(g => g.id === groupId);

        if (group) {
            // 检查是否已存在相同的币种配置
            const exists = group.coins.some(c =>
                c.symbol === symbol && c.exchange === exchange && c.timeframe === timeframe
            );

            if (exists) {
                window.appUtils?.showAlert?.('该币种配置已存在');
                return;
            }

            const newCoin = {
                symbol,
                exchange,
                timeframe,
                threshold,
                enabled: true
            };

            // 添加新币种
            group.coins.push(newCoin);

            try {
                // 保存配置
                await this.saveConfig();
                window.appUtils?.showAlert?.(`已添加 ${symbol} 到 ${group.name}`, 'success');

                // 清空表单并隐藏
                document.getElementById(`newCoinSymbol_${groupId}`).value = '';
                document.getElementById(`newCoinThreshold_${groupId}`).value = '';

                // 重新渲染界面以显示新币种（这会自动显示按钮并隐藏表单）
                this.renderEmailGroups();
            } catch (error) {
                console.error('添加币种失败:', error);
                window.appUtils?.showAlert?.('添加失败，请重试', 'error');

                // 回滚：移除刚添加的币种
                const coinIndex = group.coins.findIndex(c =>
                    c.symbol === symbol && c.exchange === exchange && c.timeframe === timeframe
                );
                if (coinIndex !== -1) {
                    group.coins.splice(coinIndex, 1);
                    this.renderEmailGroups();
                }
            }
        }
    }

    // 从分组中移除币种
    async editCoinInGroup(groupId, coinIndex) {
        const groups = window.appState.currentConfig?.email_groups || [];
        const group = groups.find(g => g.id === groupId);

        if (!group || !group.coins[coinIndex]) {
            window.appUtils?.showAlert?.('币种信息不存在', 'error');
            return;
        }

        const coin = group.coins[coinIndex];

        // 创建编辑对话框
        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        dialog.innerHTML = `
            <div class="dialog">
                <div class="dialog-header">
                    <h3>编辑监控币种</h3>
                    <button onclick="window.appConfig.closeDialog()" class="close-btn">&times;</button>
                </div>
                <div class="dialog-content">
                    <div class="form-group">
                        <label>交易所:</label>
                        <select id="editExchange">
                            <option value="binance" ${coin.exchange === 'binance' ? 'selected' : ''}>Binance</option>
                            <option value="okx" ${coin.exchange === 'okx' ? 'selected' : ''}>OKX</option>
                            <option value="bybit" ${coin.exchange === 'bybit' ? 'selected' : ''}>Bybit</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>币种:</label>
                        <input type="text" id="editSymbol" value="${coin.symbol}" placeholder="币种符号">
                    </div>
                    <div class="form-group">
                        <label>颗粒度:</label>
                        <select id="editTimeframe">
                            <option value="1h" ${coin.timeframe === '1h' ? 'selected' : ''}>1小时</option>
                            <option value="24h" ${coin.timeframe === '24h' ? 'selected' : ''}>24小时</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>阈值(%):</label>
                        <input type="number" id="editThreshold" value="${coin.threshold}" step="0.1" min="0" placeholder="阈值">
                    </div>
                </div>
                <div class="dialog-actions">
                    <button onclick="window.appConfig.closeDialog()" class="btn-secondary">取消</button>
                    <button onclick="window.appConfig.saveEditedCoin('${groupId}', '${coinIndex}')" class="btn-primary">保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);
    }

    async saveEditedCoin(groupId, coinIndex) {
        const groups = window.appState.currentConfig?.email_groups || [];
        const group = groups.find(g => g.id === groupId);

        if (!group || !group.coins[coinIndex]) {
            window.appUtils?.showAlert?.('币种信息不存在', 'error');
            return;
        }

        const exchange = document.getElementById('editExchange').value;
        const symbol = document.getElementById('editSymbol').value.trim();
        const timeframe = document.getElementById('editTimeframe').value;
        const threshold = parseFloat(document.getElementById('editThreshold').value);

        // 验证
        if (!symbol) {
            window.appUtils?.showAlert?.('请输入币种符号', 'error');
            return;
        }

        if (isNaN(threshold) || threshold < 0) {
            window.appUtils?.showAlert?.('请输入有效的阈值', 'error');
            return;
        }

        // 更新币种信息
        group.coins[coinIndex] = {
            ...group.coins[coinIndex],
            exchange,
            symbol: symbol.toUpperCase(),
            timeframe,
            threshold,
            enabled: true
        };

        try {
            await this.saveConfig();
            this.renderEmailGroups();
            this.closeDialog();
            window.appUtils?.showAlert?.('币种更新成功', 'success');
        } catch (error) {
            console.error('更新币种失败:', error);
            window.appUtils?.showAlert?.('更新失败，请重试', 'error');
        }
    }

    closeDialog() {
        const dialog = document.querySelector('.dialog-overlay');
        if (dialog) {
            dialog.remove();
        }
    }

    async removeCoinFromGroup(groupId, coinKey) {
        const [symbol, exchange, timeframe] = coinKey.split('_');

        if (!confirm(`确定要移除 ${symbol} 吗？`)) {
            return;
        }

        const groups = window.appState.currentConfig?.email_groups || [];
        const group = groups.find(g => g.id === groupId);

        if (group) {
            const coinIndex = group.coins.findIndex(c =>
                c.symbol === symbol && c.exchange === exchange && c.timeframe === timeframe
            );

            if (coinIndex !== -1) {
                const removedCoin = group.coins[coinIndex];

                // 先从本地状态移除
                group.coins.splice(coinIndex, 1);
                this.renderEmailGroups();

                try {
                    // 保存配置
                    await this.saveConfig();
                    window.appUtils?.showAlert?.(`已移除 ${symbol}`, 'success');
                } catch (error) {
                    console.error('移除币种失败:', error);
                    window.appUtils?.showAlert?.('移除失败，请重试', 'error');

                    // 回滚：恢复币种
                    group.coins.splice(coinIndex, 0, removedCoin);
                    this.renderEmailGroups();
                }
            }
        }
    }
}

// 创建全局实例并导出
window.appConfig = new ConfigManager();