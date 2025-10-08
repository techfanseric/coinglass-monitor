/**
 * 配置管理模块
 * 负责配置的加载、保存、验证和邮件分组管理
 */

// 邮箱建议管理类
class EmailSuggestionManager {
    constructor() {
        this.currentInput = null;
        this.currentSuggestions = [];
        this.inputTimeout = null;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // 使用事件委托处理动态创建的输入框
        document.addEventListener('focus', (e) => {
            if (e.target.matches('input[type="email"]')) {
                this.handleEmailFocus(e.target);
            }
        }, true);

        document.addEventListener('input', (e) => {
            if (e.target.matches('input[type="email"]')) {
                this.handleEmailInput(e.target);
            }
        });

        document.addEventListener('blur', (e) => {
            if (e.target.matches('input[type="email"]')) {
                this.handleEmailBlur(e.target);
            }
        }, true);
    }

    handleEmailFocus(input) {
        this.currentInput = input;
        this.showSuggestions(input);
    }

    handleEmailInput(input) {
        // 延迟显示建议，避免频繁更新
        clearTimeout(this.inputTimeout);
        this.inputTimeout = setTimeout(() => {
            this.showSuggestions(input);
        }, 300);
    }

    handleEmailBlur(input) {
        // 延迟隐藏，允许点击建议项
        setTimeout(() => {
            this.hideSuggestions();
        }, 200);
    }

    collectExistingEmails() {
        const existingEmails = new Set();
        document.querySelectorAll('input[type="email"]').forEach(input => {
            if (input.value && this.isValidEmail(input.value)) {
                existingEmails.add(input.value.toLowerCase());
            }
        });
        return Array.from(existingEmails);
    }

    showSuggestions(input) {
        const existingEmails = this.collectExistingEmails();
        const inputLower = input.value.toLowerCase().trim();

        // 排序逻辑：匹配项在前，非匹配项在后，都按字母排序
        const suggestions = existingEmails.sort((a, b) => {
            const aMatches = a.includes(inputLower);
            const bMatches = b.includes(inputLower);

            if (aMatches && !bMatches) return -1;  // a匹配，b不匹配 → a在前
            if (!aMatches && bMatches) return 1;   // a不匹配，b匹配 → b在前
            return a.localeCompare(b);             // 都匹配或都不匹配 → 字母排序
        });

        // 过滤掉当前输入框已有的邮箱
        const filteredSuggestions = suggestions.filter(email =>
            email !== inputLower
        );

        if (filteredSuggestions.length > 0) {
            this.renderSuggestions(input, filteredSuggestions);
        } else {
            this.hideSuggestions();
        }
    }

    renderSuggestions(input, suggestions) {
        // 移除现有建议框
        this.hideSuggestions();

        // 创建建议框
        const suggestionBox = document.createElement('div');
        suggestionBox.className = 'email-suggestions';

        suggestions.forEach(email => {
            const item = document.createElement('div');
            item.className = 'email-suggestion-item';
            item.textContent = email;
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                input.value = email;
                input.dispatchEvent(new Event('change', { bubbles: true }));
                this.hideSuggestions();
            });
            suggestionBox.appendChild(item);
        });

        // 添加到DOM
        input.parentElement.appendChild(suggestionBox);
        this.currentSuggestions = suggestions;
    }

    hideSuggestions() {
        const existing = document.querySelector('.email-suggestions');
        if (existing) {
            existing.remove();
        }
        this.currentSuggestions = [];
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
}

// 导出配置管理类
class ConfigManager {
    constructor() {
        this.apiBase = window.location.origin;
    }

    // 切换分组菜单显示
    toggleGroupMenu(groupId) {
        // 关闭所有其他菜单
        const allMenus = document.querySelectorAll('.more-dropdown');
        allMenus.forEach(menu => {
            if (menu.id !== `groupMenu_${groupId}`) {
                menu.classList.remove('show');
            }
        });

        // 切换当前菜单
        const currentMenu = document.getElementById(`groupMenu_${groupId}`);
        if (currentMenu) {
            currentMenu.classList.toggle('show');
        }
    }

    // 切换分组启用状态
    toggleGroupStatus(groupId) {
        const groups = window.appState.currentConfig?.email_groups || [];
        const group = groups.find(g => g.id === groupId);

        if (!group) {
            return;
        }

        const newStatus = !(group.enabled !== false);

        // 关闭菜单
        const menu = document.getElementById(`groupMenu_${groupId}`);
        if (menu) {
            menu.classList.remove('show');
        }

        // 调用现有的状态切换方法
        this.handleGroupToggleChange(groupId, newStatus);
    }

    // 重命名分组
    renameGroup(groupId) {
        const groups = window.appState.currentConfig?.email_groups || [];
        const group = groups.find(g => g.id === groupId);

        if (!group) {
            window.appUtils?.showAlert?.('分组信息不存在', 'error');
            return;
        }

        // 关闭菜单
        const menu = document.getElementById(`groupMenu_${groupId}`);
        if (menu) {
            menu.classList.remove('show');
        }

        // 创建重命名对话框
        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        dialog.innerHTML = `
            <div class="dialog">
                <div class="dialog-header">
                    <h3>重命名邮件分组</h3>
                    <button onclick="window.appConfig.closeDialog()" class="close-btn">&times;</button>
                </div>
                <div class="dialog-content">
                    <div class="form-group">
                        <label>分组名称:</label>
                        <input type="text" id="groupName" value="${group.name}" placeholder="请输入分组名称" maxlength="20">
                        <small style="color: #6b7280; font-size: 12px; margin-top: 4px; display: block;">
                            分组名称不能重复，1-20个字符
                        </small>
                    </div>
                </div>
                <div class="dialog-actions">
                    <button onclick="window.appConfig.closeDialog()" class="btn-secondary">取消</button>
                    <button onclick="window.appConfig.saveGroupName('${groupId}')" class="btn-primary">保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // 自动选中输入框内容
        setTimeout(() => {
            const input = document.getElementById('groupName');
            if (input) {
                input.focus();
                input.select();
            }
        }, 100);
    }

    // 保存分组名称
    async saveGroupName(groupId) {
        const groups = window.appState.currentConfig?.email_groups || [];
        const group = groups.find(g => g.id === groupId);

        if (!group) {
            window.appUtils?.showAlert?.('分组信息不存在', 'error');
            return;
        }

        const newName = document.getElementById('groupName').value.trim();

        // 验证
        if (!newName) {
            window.appUtils?.showAlert?.('分组名称不能为空', 'error');
            return;
        }

        if (newName.length > 20) {
            window.appUtils?.showAlert?.('分组名称不能超过20个字符', 'error');
            return;
        }

        // 检查重名
        const duplicateGroup = groups.find(g => g.id !== groupId && g.name === newName);
        if (duplicateGroup) {
            window.appUtils?.showAlert?.('组名已存在，请更换', 'error');
            return;
        }

        const oldName = group.name;
        group.name = newName;

        try {
            await this.saveConfig();
            await this.renderEmailGroups();
            this.closeDialog();
            window.appUtils?.showAlert?.(`分组名称已更新：${oldName} → ${newName}`, 'success');
        } catch (error) {
            // 回滚
            group.name = oldName;
            window.appUtils?.showAlert?.('保存失败，请重试', 'error');
        }
    }

    // 加载配置
    async loadConfig() {
        try {
            const response = await fetch(`${this.apiBase}/api/config`);

            // 检测302重定向（会话失效）
            if (response.status === 302 || response.redirected) {
                window.location.href = '/login';
                return;
            }

            const config = await response.json();

            if (config && Object.keys(config).length > 0) {
                // 标准化配置中的交易所名称（自动修复历史数据）
                this.normalizeConfigExchanges(config);

                window.appState.currentConfig = config;

                // 检查并处理无效邮箱的邮件组
                await this.validateAndHandleInvalidEmails(config);

                await this.populateForm(config);
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
    async populateForm(config) {

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
        await this.renderEmailGroups();
    }

    // 标准化交易所名称
    normalizeExchangeName(exchange) {
        if (!exchange || typeof exchange !== 'string') {
            return exchange;
        }

        const normalized = exchange.toLowerCase();
        switch (normalized) {
            case 'binance': return 'Binance';
            case 'okx': return 'OKX';
            case 'bybit': return 'Bybit';
            case 'huobi': return 'Huobi';
            case 'kucoin': return 'KuCoin';
            case 'mexc': return 'MEXC';
            case 'gate.io':
            case 'gate':
                return 'Gate.io';
            case 'bitget': return 'Bitget';
            case 'crypto.com':
            case 'crypto':
                return 'Crypto.com';
            case 'coinbase': return 'Coinbase';
            case 'kraken': return 'Kraken';
            case 'ftx': return 'FTX';
            case 'bitfinex': return 'Bitfinex';
            case 'bittrex': return 'Bittrex';
            case 'poloniex': return 'Poloniex';
            default:
                // 对于未知交易所，首字母大写其余小写
                return exchange.charAt(0).toUpperCase() + exchange.slice(1).toLowerCase();
        }
    }

    // 标准化配置中的所有交易所名称
    normalizeConfigExchanges(config) {
        if (!config) return config;

        // 标准化过滤器中的交易所
        if (config.filters && config.filters.exchange) {
            config.filters.exchange = this.normalizeExchangeName(config.filters.exchange);
        }

        // 标准化币种列表中的交易所
        if (config.coins && Array.isArray(config.coins)) {
            config.coins.forEach(coin => {
                if (coin.exchange) {
                    coin.exchange = this.normalizeExchangeName(coin.exchange);
                }
            });
        }

        // 标准化邮件分组中的交易所
        if (config.email_groups && Array.isArray(config.email_groups)) {
            config.email_groups.forEach(group => {
                if (group.coins && Array.isArray(group.coins)) {
                    group.coins.forEach(coin => {
                        if (coin.exchange) {
                            coin.exchange = this.normalizeExchangeName(coin.exchange);
                        }
                    });
                }
            });
        }

        return config;
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

        // 标准化配置中的交易所名称
        this.normalizeConfigExchanges(config);

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

    // 配置变化检测
    hasConfigChanged(newConfig) {
        if (!window.appState.currentConfig) {
            return true; // 首次保存
        }

        const current = window.appState.currentConfig;

        // 深度比较函数
        const deepEqual = (obj1, obj2) => {
            if (obj1 === obj2) return true;
            if (obj1 == null || obj2 == null) return false;
            if (typeof obj1 !== typeof obj2) return false;

            if (typeof obj1 !== 'object') return obj1 === obj2;

            const keys1 = Object.keys(obj1);
            const keys2 = Object.keys(obj2);

            if (keys1.length !== keys2.length) return false;

            for (let key of keys1) {
                if (!keys2.includes(key)) return false;
                if (!deepEqual(obj1[key], obj2[key])) return false;
            }

            return true;
        };

        // 比较关键字段
        const currentConfig = {
            repeat_interval: current.repeat_interval,
            trigger_settings: current.trigger_settings,
            notification_hours: current.notification_hours,
            email_groups: current.email_groups
        };

        const configToCompare = {
            repeat_interval: newConfig.repeat_interval,
            trigger_settings: newConfig.trigger_settings,
            notification_hours: newConfig.notification_hours,
            email_groups: newConfig.email_groups
        };

        return !deepEqual(currentConfig, configToCompare);
    }

    // 自动保存配置
    async autoSaveConfig() {
        // 验证所有输入字段
        const inputValidation = this.validateAllInputs();
        if (!inputValidation.isValid) {
            window.appUtils?.showAlert?.(inputValidation.message, 'error');
            this.restoreInvalidInputs(inputValidation.restoreValues);
            return;
        }

        const timeControl = document.getElementById('timeControl');
        const startTime = document.getElementById('startTime').value;
        const endTime = document.getElementById('endTime').value;

        // 预验证时间配置
        const timeValidation = this.preValidateTimeConfig(timeControl, startTime, endTime);

        if (!timeValidation.isValid) {
            // 验证失败，更新UI状态并中止保存
            this.updateTimeUIState(timeValidation.correctedState);
            window.appUtils?.showAlert?.(timeValidation.message, 'warning');
            return; // 中止保存，保持UI状态与数据一致
        }

        // 使用验证后的数据进行保存
        const config = {
            // 使用新的邮件分组结构
            email_groups: window.appState.currentConfig?.email_groups || [],
            repeat_interval: inputValidation.values.repeatInterval,
            // 移除全局监控开关，改为组级别控制
            trigger_settings: {
                hourly_minute: inputValidation.values.hourlyMinute,
                daily_time: inputValidation.values.dailyTime
            },
            notification_hours: timeValidation.data // 使用验证后的数据
        };

        // 标准化配置中的交易所名称
        this.normalizeConfigExchanges(config);

        // 检查配置是否真的发生了变化
        if (!this.hasConfigChanged(config)) {
            console.log('🔄 配置未发生变化，跳过保存');
            return; // 配置未变化，直接返回
        }

        console.log('💾 检测到配置变化，开始保存');

        // 移除全局监控状态检查，改为组级别控制

        try {
            const response = await fetch(`${this.apiBase}/api/config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config)
            });

            // 检测302重定向（会话失效）
            if (response.status === 302 || response.redirected) {
                window.location.href = '/login';
                return;
            }

            // 检查响应是否为JSON格式
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                // 如果不是JSON，可能是HTML重定向页面
                window.location.href = '/login';
                return;
            }

            const result = await response.json();

            if (response.ok && result.success) {
                // 检查后端是否有修改
                if (result.warnings && result.warnings.length > 0) {
                    this.syncUIWithConfig(result.config);
                    window.appUtils?.showAlert?.(`配置已保存，${result.warnings[0]}`, 'warning');
                } else {
                    window.appUtils?.showAlert?.('配置保存成功', 'success');
                }

                window.appState.currentConfig = result.config;
            } else {
                throw new Error(result.message || '保存失败');
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

    // 新的：时间输入变化并保存的方法
    onTimeInputChangeAndSave() {
        const startTime = document.getElementById('startTime').value;
        const endTime = document.getElementById('endTime').value;

        // 先执行验证
        const validation = this.validateTimeInput(startTime, endTime);

        if (validation.isValid) {
            // 验证通过才保存
            this.autoSaveConfig();
        } else {
            // 验证失败，显示错误并恢复有效值
            window.appUtils?.showAlert?.(validation.message, 'error');
            this.restoreLastValidTime();
        }
    }

    // 验证时间输入格式
    validateTimeInput(startTime, endTime) {
        if (!this.validateTimeFormat(startTime) || !this.validateTimeFormat(endTime)) {
            return {
                isValid: false,
                message: '时间格式无效，请使用 HH:mm 格式（如：09:00）'
            };
        }

        return { isValid: true, message: '' };
    }

    // 恢复到最后有效的值
    restoreLastValidTime() {
        const lastConfig = window.appState.currentConfig;
        if (lastConfig && lastConfig.notification_hours) {
            document.getElementById('startTime').value = lastConfig.notification_hours.start;
            document.getElementById('endTime').value = lastConfig.notification_hours.end;
        }
    }

    // 验证所有输入字段
    validateAllInputs() {
        const errors = [];
        const values = {};
        const restoreValues = {};

        // 验证重复通知间隔
        const repeatInterval = document.getElementById('repeatInterval').value;
        const repeatIntervalNum = parseInt(repeatInterval);
        if (isNaN(repeatIntervalNum) || repeatIntervalNum < 1 || repeatIntervalNum > 10080) {
            errors.push('重复通知间隔必须是1-10080之间的整数');
            restoreValues.repeatInterval = this.getLastValidValue('repeat_interval', 180);
        } else {
            values.repeatInterval = repeatIntervalNum;
        }

        // 验证每小时触发时机
        const hourlyMinute = document.getElementById('hourlyMinute').value;
        const hourlyMinuteNum = parseInt(hourlyMinute);
        if (isNaN(hourlyMinuteNum) || hourlyMinuteNum < 0 || hourlyMinuteNum > 59) {
            errors.push('每小时触发时机必须是0-59之间的整数');
            restoreValues.hourlyMinute = this.getLastValidValue('hourly_minute', 5);
        } else {
            values.hourlyMinute = hourlyMinuteNum;
        }

        // 验证每天触发时间
        const dailyTime = document.getElementById('dailyTime').value;
        if (!this.validateTimeFormat(dailyTime)) {
            errors.push('每天触发时间格式无效，请使用 HH:mm 格式（如：09:05）');
            restoreValues.dailyTime = this.getLastValidValue('daily_time', '09:05');
        } else {
            values.dailyTime = dailyTime;
        }

        return {
            isValid: errors.length === 0,
            message: errors[0] || '',
            values,
            restoreValues
        };
    }

    // 获取最后有效的值
    getLastValidValue(field, defaultValue) {
        const lastConfig = window.appState.currentConfig;
        if (lastConfig) {
            if (field === 'repeat_interval' && lastConfig.repeat_interval) {
                return lastConfig.repeat_interval;
            }
            if (field === 'hourly_minute' && lastConfig.trigger_settings?.hourly_minute !== undefined) {
                return lastConfig.trigger_settings.hourly_minute;
            }
            if (field === 'daily_time' && lastConfig.trigger_settings?.daily_time) {
                return lastConfig.trigger_settings.daily_time;
            }
        }
        return defaultValue;
    }

    // 恢复无效输入的值
    restoreInvalidInputs(restoreValues) {
        if (restoreValues.repeatInterval !== undefined) {
            document.getElementById('repeatInterval').value = restoreValues.repeatInterval;
        }
        if (restoreValues.hourlyMinute !== undefined) {
            document.getElementById('hourlyMinute').value = restoreValues.hourlyMinute;
        }
        if (restoreValues.dailyTime !== undefined) {
            document.getElementById('dailyTime').value = restoreValues.dailyTime;
        }
    }

    // 更新邮件组UI状态
    updateGroupUIState(groupId, enabled, email) {
        // 更新开关状态
        const toggleSwitch = document.getElementById(`groupToggle_${groupId}`);
        if (toggleSwitch) {
            toggleSwitch.checked = enabled;
        }

        // 更新状态徽章
        const statusBadge = document.querySelector(`[data-group-id="${groupId}"] .group-status-badge`);
        if (statusBadge) {
            statusBadge.textContent = enabled ? '已启用' : '已禁用';
            statusBadge.className = `group-status-badge ${enabled ? 'enabled' : 'disabled'}`;
        }

        // 更新邮箱输入框
        const emailInput = document.querySelector(`input[onchange*="updateGroupEmail('${groupId}'"]`);
        if (emailInput) {
            emailInput.value = email || '';
        }
    }

    // 只更新邮箱相关的UI，不影响其他表单元素（避免交易所选项重置）
    updateGroupEmailUI(groupId, email, isValid, isEnabled) {
        // 更新开关状态
        const toggleSwitch = document.getElementById(`groupToggle_${groupId}`);
        if (toggleSwitch) {
            toggleSwitch.checked = isEnabled;
        }

        // 更新状态徽章
        const statusBadge = document.querySelector(`[data-group-id="${groupId}"] .group-status-badge`);
        if (statusBadge) {
            statusBadge.textContent = isEnabled ? '已启用' : '已禁用';
            statusBadge.className = `group-status-badge ${isEnabled ? 'enabled' : 'disabled'}`;
        }

        // 更新邮箱输入框样式（根据验证结果）
        const inputElement = document.querySelector(`input[onchange*="updateGroupEmail('${groupId}'"]`);
        if (inputElement) {
            if (email && !isValid) {
                inputElement.classList.add('email-input-error');
            } else {
                inputElement.classList.remove('email-input-error');
            }
        }
    }

    // 验证并保存配置（用于实时输入）
    async validateAndSaveConfig() {
        // 验证所有输入字段
        const inputValidation = this.validateAllInputs();
        if (!inputValidation.isValid) {
            window.appUtils?.showAlert?.(inputValidation.message, 'error');
            this.restoreInvalidInputs(inputValidation.restoreValues);
            return;
        }

        // 验证通过，调用自动保存
        await this.autoSaveConfig();
    }

    // 预验证时间配置
    preValidateTimeConfig(timeControl, startTime, endTime) {
        // 如果未启用时间限制
        if (!timeControl.checked) {
            return {
                isValid: true,
                data: { enabled: false, start: '09:00', end: '23:59' },
                message: ''
            };
        }

        // 验证时间格式
        const startValid = this.validateTimeFormat(startTime);
        const endValid = this.validateTimeFormat(endTime);

        if (!startValid || !endValid) {
            return {
                isValid: false,
                data: { enabled: false, start: '09:00', end: '23:59' },
                correctedState: { checked: false, startTime: '09:00', endTime: '23:59' },
                message: '时间格式无效，已自动禁用时间限制'
            };
        }

        return {
            isValid: true,
            data: { enabled: true, start: startTime, end: endTime },
            message: ''
        };
    }

    // 同步UI状态
    updateTimeUIState(state) {
        if (state.checked !== undefined) {
            document.getElementById('timeControl').checked = state.checked;
            this.toggleTimeInputs();
        }
        if (state.startTime) {
            document.getElementById('startTime').value = state.startTime;
        }
        if (state.endTime) {
            document.getElementById('endTime').value = state.endTime;
        }
    }

    // 同步UI与实际保存的配置
    syncUIWithConfig(config) {
        if (config.notification_hours) {
            const { enabled, start, end } = config.notification_hours;

            document.getElementById('timeControl').checked = enabled;
            document.getElementById('startTime').value = start;
            document.getElementById('endTime').value = end;
            this.toggleTimeInputs();

            // 清除可能的错误提示
            const errorTip = document.getElementById('timeErrorTip');
            if (errorTip) {
                errorTip.remove();
            }
        }
    }

    // 验证并处理无效邮箱的邮件组
    async validateAndHandleInvalidEmails(config) {
        if (!config.email_groups || !Array.isArray(config.email_groups)) {
            return;
        }

        const invalidGroups = [];
        let configChanged = false;

        // 检查每个邮件组
        for (const group of config.email_groups) {
            const email = group.email?.trim();
            const isEnabled = group.enabled !== false;
            const isEmailInvalid = !this.validateEmailFormat(email);

            // 如果邮件组启用但邮箱无效，自动停用
            if (isEnabled && isEmailInvalid) {
                group.enabled = false;
                invalidGroups.push({
                    id: group.id,
                    name: group.name || '未命名分组',
                    email: email
                });
                configChanged = true;
            }
        }

        // 如果有邮件组被自动停用，保存配置并通知用户
        if (configChanged && invalidGroups.length > 0) {
            try {
                await this.saveConfig(config);
                console.warn('自动停用无效邮箱的邮件组:', invalidGroups);

                // 显示通知
                setTimeout(() => {
                    const groupNames = invalidGroups.map(g => g.name).join('、');
                    window.appUtils?.showAlert?.(
                        `⚠️ 发现 ${invalidGroups.length} 个邮件组的邮箱格式无效，已自动停用：${groupNames}。请检查并修正邮箱格式。`,
                        'warning'
                    );
                }, 1000);
            } catch (error) {
                console.error('自动停用邮件组并保存配置失败:', error);
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
            if (!this.validateEmailFormat(email)) return false;

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

            if (!this.validateEmailFormat(email)) {
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
            if (!group) {
                return;
            }

            const previousState = group.enabled !== false;

            // 检查状态是否真的发生了变化
            if (previousState === isEnabled) {
                console.log(`🔄 邮件组状态未发生变化，跳过更新: ${groupId}, 状态: ${isEnabled}`);
                return;
            }

            console.log(`🔄 邮件组状态变化: ${groupId}, ${previousState} -> ${isEnabled}`);

            // 如果尝试启用组，检查是否满足条件
            if (isEnabled) {
                const email = group.email?.trim();

                if (!email) {
                    window.appUtils?.showAlert?.('请先填写邮箱地址再启用此邮件组', 'error');
                    // 重置开关状态
                    this.updateGroupUIState(groupId, false, email);
                    return;
                }

                if (!this.validateEmailFormat(email)) {
                    window.appUtils?.showAlert?.('邮箱地址格式不正确，请修正后再启用此邮件组', 'error');
                    // 重置开关状态
                    this.updateGroupUIState(groupId, false, email);
                    return;
                }

                if (!group.coins || group.coins.length === 0) {
                    window.appUtils?.showAlert?.('请先添加监控项目再启用此邮件组', 'error');
                    // 重置开关状态
                    this.updateGroupUIState(groupId, false, email);
                    return;
                }

                const hasEnabledCoins = group.coins.some(coin => coin.enabled !== false);
                if (!hasEnabledCoins) {
                    window.appUtils?.showAlert?.('请先启用至少一个监控项目再启用此邮件组', 'error');
                    // 重置开关状态
                    this.updateGroupUIState(groupId, false, email);
                    return;
                }

                // 所有条件满足，启用邮件组
                group.enabled = true;
                console.log(`邮件组启用 - 组ID: ${groupId}, 邮箱: ${email}`);

            } else {
                // 用户主动禁用邮件组
                group.enabled = false;
                console.log(`邮件组禁用 - 组ID: ${groupId}`);
            }

          // 更新状态徽章显示
            const statusBadge = document.querySelector(`[data-group-id="${groupId}"] .group-status-badge`);
            if (statusBadge) {
                statusBadge.textContent = isEnabled ? '已启用' : '已禁用';
                statusBadge.className = `group-status-badge ${isEnabled ? 'enabled' : 'disabled'}`;
            }

            // 更新菜单按钮文字
            this.updateGroupMenuButton(groupId, isEnabled);

            // 自动保存配置
            this.autoSaveConfig();
        }
    }

    // 更新分组菜单按钮文字
    updateGroupMenuButton(groupId, isEnabled) {
        const menuButton = document.querySelector(`#groupMenu_${groupId} button[onclick*="toggleGroupStatus('${groupId}')"]`);
        if (menuButton) {
            menuButton.textContent = isEnabled ? '禁用' : '启用';
        }
    }

    // 渲染邮件分组
    async renderEmailGroups() {
        const container = document.getElementById('emailGroups');
        const groups = window.appState.currentConfig?.email_groups || [];

        if (groups.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #6b7280;">暂无邮件分组</p>';
            return;
        }

        // 获取监控状态数据
        let monitoringStatus = null;
        try {
            const response = await fetch(`${window.location.origin}/api/status`);
            if (response.ok) {
                const data = await response.json();
                monitoringStatus = data.monitoring_status?.coins_state || {};
            }
        } catch (error) {
            console.warn('获取监控状态失败:', error);
        }

        container.innerHTML = groups.map((group, index) => `
            <div class="email-group" data-group-id="${group.id}">
                <div class="group-header">
                    <div class="group-title-section">
                        <h3>${group.name}</h3>
                    </div>
                    <div class="group-right-section">
                        <span class="group-status-badge ${group.enabled !== false ? 'enabled' : 'disabled'}"
                              onclick="window.appConfig.toggleGroupStatus('${group.id}')"
                              style="cursor: pointer;">
                            ${group.enabled !== false ? '已启用' : '已禁用'}
                        </span>
                        <div class="more-menu">
                            <button onclick="window.appConfig.toggleGroupMenu('${group.id}')" class="more-btn-small">⋮</button>
                            <div id="groupMenu_${group.id}" class="more-dropdown more-dropdown-small">
                                <button onclick="window.appConfig.toggleGroupStatus('${group.id}')" class="more-dropdown-item">
                                    ${group.enabled !== false ? '禁用' : '启用'}
                                </button>
                                <button onclick="window.appConfig.renameGroup('${group.id}')" class="more-dropdown-item">重命名</button>
                                <button onclick="window.appConfig.deleteEmailGroup('${group.id}')" class="more-dropdown-item danger">删除</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="group-email">
                    <label>邮箱地址:</label>
                    <input type="email"
                           value="${group.email || ''}"
                           onchange="window.appConfig.updateGroupEmail('${group.id}', this.value)"
                           placeholder="输入邮箱地址（如：user@qq.com）">
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
                                <option value="OKX">OKX</option>
                                <option value="Binance">Binance</option>
                                <option value="Bybit">Bybit</option>
                            </select>
                            <input type="text" id="newCoinSymbol_${group.id}" placeholder="币种代码 (如: BTC, USDT)">
                            <select id="newCoinTimeframe_${group.id}">
                                <option value="1h">1小时</option>
                                <option value="24h">24小时</option>
                            </select>
                            <input type="number" id="newCoinThreshold_${group.id}" placeholder="利率阈值 (%)" step="0.1" min="0">
                            <button onclick="window.appConfig.addCoinToGroup('${group.id}')">添加</button>
                            <button onclick="window.appConfig.toggleAddCoinForm('${group.id}')" class="btn-secondary">取消</button>
                        </div>
                    ` : `
                        <div class="add-coin-form">
                            <select id="newCoinExchange_${group.id}">
                                <option value="OKX">OKX</option>
                                <option value="Binance">Binance</option>
                                <option value="Bybit">Bybit</option>
                            </select>
                            <input type="text" id="newCoinSymbol_${group.id}" placeholder="币种代码 (如: BTC, USDT)">
                            <select id="newCoinTimeframe_${group.id}">
                                <option value="1h">1小时</option>
                                <option value="24h">24小时</option>
                            </select>
                            <input type="number" id="newCoinThreshold_${group.id}" placeholder="利率阈值 (%)" step="0.1" min="0">
                            <button onclick="window.appConfig.addCoinToGroup('${group.id}')">添加</button>
                        </div>
                    `}

                    <div class="coins-list" style="margin-top: 12px;">
                        ${group.coins.slice().reverse().map((coin, index) => {
                            const actualIndex = group.coins.length - 1 - index;

                            // 获取币种状态（统一使用小写交易所名称进行匹配）
                            const coinKey = `${coin.symbol}_${coin.exchange.toLowerCase()}_${coin.timeframe}`;
                            const coinState = monitoringStatus?.[coinKey] || { status: 'normal' };

                            // 新的冷却期显示逻辑 - 只在冷却时显示
                            const getCooldownDisplay = (coinState) => {
                                if (coinState.status === 'alert' && coinState.next_notification) {
                                    const now = new Date();
                                    const nextTime = new Date(coinState.next_notification);

                                    if (nextTime > now) {
                                        // 还在冷却期
                                        const diffMs = nextTime - now;
                                        const diffMins = Math.ceil(diffMs / (1000 * 60));

                                        if (diffMins < 60) {
                                            return `冷却中 [${diffMins}分钟后解除]`;
                                        } else {
                                            const diffHours = Math.ceil(diffMins / 60);
                                            return `冷却中 [${diffHours}小时后解除]`;
                                        }
                                    }
                                }
                                // 正常状态或可以立即通知时，不显示任何内容
                                return '';
                            };

                            // 新的利率栏显示逻辑 - 包含警报信息
                            const getRateDisplay = (coinState, coin) => {
                                const currentRate = coinState.last_rate || '--';

                                if (coinState.status === 'alert' && coinState.last_notification) {
                                    // 警报状态：显示发现时间和利率
                                    const alertTime = new Date(coinState.last_notification);
                                    const timeStr = `${alertTime.getHours().toString().padStart(2, '0')}:${alertTime.getMinutes().toString().padStart(2, '0')}`;
                                    return `🚨 ${timeStr}：${currentRate}%`;
                                } else {
                                    // 正常状态：只显示利率
                                    return `${currentRate}%`;
                                }
                            };

                            const cooldownDisplay = getCooldownDisplay(coinState);

                            // 判断是否显示冷却期重置选项
                            const isInCooldown = coinState.status === 'alert' && coinState.next_notification && new Date(coinState.next_notification) > new Date();
                            const showCooldownOption = isInCooldown;

                            const rateDisplay = getRateDisplay(coinState, coin);

                            return `
                            <div class="coin-item-simple">
                                <span class="coin-text">
                                    <strong>${coin.exchange} - ${coin.symbol}</strong>
                                    ${cooldownDisplay ? `<span style="color: #718096; font-size: 0.9em; margin-left: 8px;">${cooldownDisplay}</span>` : ''}
                                    <br>
                                    <span style="color: #718096; font-size: 0.9em;">
                                        ${coinState.last_rate !== null && coinState.last_rate !== undefined ? `${rateDisplay} > ` : ''}
                                        阈值: ${coin.threshold}% | 颗粒度: ${coin.timeframe === '24h' ? '24小时' : '每小时'}
                                    </span>
                                </span>
                                <div class="coin-actions">
                                    <div class="more-menu">
                                        <button onclick="window.appMonitorUI.toggleMoreMenu('group_${group.id}_${actualIndex}')" class="more-btn-small">⋮</button>
                                        <div id="moreMenu_group_${group.id}_${actualIndex}" class="more-dropdown more-dropdown-small">
                                            ${showCooldownOption ?
                                                `<button onclick="window.appMonitorUI.togglePause('${coin.symbol}', '${group.id}', '${coin.exchange}', '${coin.timeframe}')" class="more-dropdown-item">重置冷却期</button>` : ''
                                            }
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
            await this.renderEmailGroups();
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
                await this.renderEmailGroups();
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
            await this.renderEmailGroups();

            try {
                // 保存到后端
                await this.saveConfig();
                window.appUtils?.showAlert?.(`已删除 ${groupName}`, 'success');
            } catch (error) {
                console.error('删除邮件分组失败:', error);
                window.appUtils?.showAlert?.('删除失败，请重试', 'error');

                // 如果删除失败，回滚本地状态
                window.appState.currentConfig.email_groups.splice(groupIndex, 0, deletedGroup);
                await this.renderEmailGroups();
            }
        }
    }

    // 更新分组邮箱
    async updateGroupEmail(groupId, newEmail) {
        const groups = window.appState.currentConfig?.email_groups || [];
        const group = groups.find(g => g.id === groupId);

        if (!group) {
            return;
        }

        const oldEmail = group.email;
        const trimmedEmail = newEmail.trim();

        // 检查邮箱是否真的发生了变化
        if (oldEmail === trimmedEmail) {
            console.log(`🔄 邮箱地址未发生变化，跳过更新: ${trimmedEmail}`);
            return;
        }

        console.log(`📧 更新邮箱地址: ${oldEmail} -> ${trimmedEmail}`);
        group.email = trimmedEmail;

        // 邮箱验证 - 仅标记状态，不修改内容
        const emailValid = this.validateEmailFormat(trimmedEmail);
        const hasValidCoins = group.coins && group.coins.length > 0;

        // 更新启用状态
        group.enabled = emailValid && hasValidCoins;

        // 添加/移除错误样式
        const inputElement = document.querySelector(`input[onchange*="updateGroupEmail('${groupId}'"]`);
        if (inputElement) {
            if (trimmedEmail && !emailValid) {
                inputElement.classList.add('email-input-error');
            } else {
                inputElement.classList.remove('email-input-error');
            }
        }

        try {
            await this.saveConfig();
            // 只更新邮箱相关的UI，避免重新渲染整个表单导致状态丢失
            this.updateGroupEmailUI(groupId, trimmedEmail, emailValid, group.enabled);

            // 保留原有提示，但不清空输入
            if (trimmedEmail && !emailValid) {
                window.appUtils?.showAlert?.('邮箱格式不正确，分组已禁用', 'error');
            } else if (oldEmail !== trimmedEmail) {
                window.appUtils?.showAlert?.('邮箱地址已更新', 'success');
            }
        } catch (error) {
            // 回滚邮箱地址
            group.email = oldEmail;
            window.appUtils?.showAlert?.('更新失败', 'error');
            throw error;
        }
    }

    // 实时邮箱输入验证已移除 - 使用全局统一提示方案
    // validateEmailInput 方法不再需要，保持界面简洁

    // 提供邮箱格式修复指导 - 简化版本，使用全局统一提示
    showEmailFormatGuidance(invalidEmail) {
        // 使用全局统一的提示方案，不在此处显示具体指导
        // 详细错误信息通过 updateGroupEmail 方法中的全局提示提供
        console.warn(`邮箱格式无效: ${invalidEmail}`);
    }

    // 验证邮箱格式
    validateEmailFormat(email) {
        if (!email || typeof email !== 'string') {
            return false;
        }

        // 去除首尾空格
        email = email.trim();

        // 基础邮箱格式验证
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return false;
        }

        // 更严格的验证：检查域名是否有效
        const [localPart, domain] = email.split('@');

        // 本地部分验证
        if (localPart.length < 1 || localPart.length > 64) {
            return false;
        }

        // 域名部分验证
        if (domain.length < 4 || domain.length > 253) {
            return false;
        }

        // 域名必须包含点且点不能在开头或结尾
        if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
            return false;
        }

        // 检查常见邮箱域名
        const commonDomains = ['qq.com', 'gmail.com', '163.com', '126.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'sina.com', 'foxmail.com'];
        const domainParts = domain.toLowerCase().split('.');

        // 检查是否有有效的顶级域名
        const tld = domainParts[domainParts.length - 1];
        if (tld.length < 2) {
            return false;
        }

        return true;
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

        // 验证币种格式（允许字母和数字，通常2-20个字符，支持常见币种代码）
        if (!/^[A-Z0-9]{2,20}$/.test(symbol)) {
            window.appUtils?.showAlert?.('币种格式无效，请使用2-20位大写字母或数字（如：BTC, USDT, ETH, SHIB）');
            // 恢复到空值
            document.getElementById(`newCoinSymbol_${groupId}`).value = '';
            return;
        }

        // 验证利率阈值（百分比，通常0.1%-100%，但高收益币种可能更高）
        if (!threshold || threshold <= 0 || threshold > 1000) {
            window.appUtils?.showAlert?.('利率阈值必须是大于0%且不超过1000%的数字（如：5.0 表示5%）');
            // 恢复到默认值
            document.getElementById(`newCoinThreshold_${groupId}`).value = '5.0';
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
                await this.renderEmailGroups();
            } catch (error) {
                console.error('添加币种失败:', error);
                window.appUtils?.showAlert?.('添加失败，请重试', 'error');

                // 回滚：移除刚添加的币种
                const coinIndex = group.coins.findIndex(c =>
                    c.symbol === symbol && c.exchange === exchange && c.timeframe === timeframe
                );
                if (coinIndex !== -1) {
                    group.coins.splice(coinIndex, 1);
                    await this.renderEmailGroups();
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
                            <option value="OKX" ${coin.exchange === 'OKX' ? 'selected' : ''}>OKX</option>
                            <option value="Binance" ${coin.exchange === 'Binance' ? 'selected' : ''}>Binance</option>
                            <option value="Bybit" ${coin.exchange === 'Bybit' ? 'selected' : ''}>Bybit</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>币种:</label>
                        <input type="text" id="editSymbol" value="${coin.symbol}" placeholder="币种代码 (如: BTC, USDT)">
                    </div>
                    <div class="form-group">
                        <label>颗粒度:</label>
                        <select id="editTimeframe">
                            <option value="1h" ${coin.timeframe === '1h' ? 'selected' : ''}>1小时</option>
                            <option value="24h" ${coin.timeframe === '24h' ? 'selected' : ''}>24小时</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>利率阈值(%):</label>
                        <input type="number" id="editThreshold" value="${coin.threshold}" step="0.1" min="0" placeholder="利率阈值">
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
        const symbol = document.getElementById('editSymbol').value.trim().toUpperCase();
        const timeframe = document.getElementById('editTimeframe').value;
        const threshold = parseFloat(document.getElementById('editThreshold').value);

        // 验证
        if (!symbol) {
            window.appUtils?.showAlert?.('请输入币种符号', 'error');
            return;
        }

        // 验证币种格式（加密货币代码格式）
        if (!/^[A-Z0-9]{2,20}$/.test(symbol)) {
            window.appUtils?.showAlert?.('币种格式无效，请使用2-20位大写字母或数字（如：BTC, USDT, ETH, SHIB）', 'error');
            return;
        }

        if (isNaN(threshold) || threshold <= 0 || threshold > 1000) {
            window.appUtils?.showAlert?.('利率阈值必须是大于0%且不超过1000%的数字（如：5.0 表示5%）', 'error');
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
            await this.renderEmailGroups();
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
                await this.renderEmailGroups();

                try {
                    // 保存配置
                    await this.saveConfig();
                    window.appUtils?.showAlert?.(`已移除 ${symbol}`, 'success');
                } catch (error) {
                    console.error('移除币种失败:', error);
                    window.appUtils?.showAlert?.('移除失败，请重试', 'error');

                    // 回滚：恢复币种
                    group.coins.splice(coinIndex, 0, removedCoin);
                    await this.renderEmailGroups();
                }
            }
        }
    }
}

// 创建全局实例并导出
window.appConfig = new ConfigManager();

// 初始化邮箱建议管理器
window.emailSuggestionManager = new EmailSuggestionManager();