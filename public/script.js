        // Web界面逻辑 - 恢复原始实现
        const API_BASE = window.location.origin;
        let currentConfig = null;

        // 从环境变量加载前端配置（通过全局变量注入）
        const frontendConfig = {
          updateInterval: parseInt(window.FRONTEND_UPDATE_INTERVAL) || 30000,
          apiRequestTimeout: parseInt(window.FRONTEND_API_REQUEST_TIMEOUT) || 10000,
          logRefreshInterval: parseInt(window.FRONTEND_LOG_REFRESH_INTERVAL) || 1000
        };

        // 页面加载时初始化
        document.addEventListener('DOMContentLoaded', function() {
            // 先加载配置，然后加载状态
            loadConfig().then(() => {
                loadStatus();
            }).catch(() => {
                // 如果配置加载失败，仍然尝试加载状态
                loadStatus();
            });

            // 按配置间隔更新状态，保持触发按钮状态
            setInterval(() => loadStatus(true), frontendConfig.updateInterval);
        });

        // 添加监控
        function addMonitor() {
            const exchange = document.getElementById('quickExchange').value;
            const coin = document.getElementById('quickCoin').value.trim().toUpperCase();
            const timeframe = document.getElementById('quickTimeframe').value;
            const threshold = parseFloat(document.getElementById('quickThreshold').value);

            // 验证输入
            if (!coin) {
                showAlert('请输入币种');
                return;
            }

            if (!threshold || threshold <= 0) {
                showAlert('请输入有效的阈值');
                return;
            }

            // 获取当前配置
            const config = currentConfig || {};
            if (!config.coins) config.coins = [];

            // 检查是否已存在相同的监控
            const exists = config.coins.some(c =>
                c.symbol === coin && c.exchange === exchange && c.timeframe === timeframe
            );

            if (exists) {
                showAlert('该监控已存在');
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
            saveConfig(config);

            // 清空输入
            document.getElementById('quickCoin').value = '';
            document.getElementById('quickThreshold').value = '';

            // 检查是否需要询问启用监控
            checkAndAskToEnableMonitoring();

            loadStatus();
            // 更新监控开关状态
            updateMonitoringToggle();
        }

        // 显示提示信息
        function showAlert(message, type = 'error') {
            const alert = document.createElement('div');
            alert.className = `alert ${type}`;
            alert.textContent = message;

            // 计算垂直位置，让通知垂直排列
            const existingAlerts = document.querySelectorAll('.alert');
            const topOffset = 20 + (existingAlerts.length * 60); // 每个通知间隔60px
            alert.style.top = `${topOffset}px`;

            document.body.appendChild(alert);

            setTimeout(() => {
                alert.style.animation = 'slideIn 0.3s ease-out reverse';
                setTimeout(() => {
                    alert.remove();
                    // 重新排列剩余的通知
                    rearrangeAlerts();
                }, 300);
            }, 5000);
        }

        // 重新排列通知位置
        function rearrangeAlerts() {
            const alerts = document.querySelectorAll('.alert');
            alerts.forEach((alert, index) => {
                const topOffset = 20 + (index * 60);
                alert.style.top = `${topOffset}px`;
            });
        }

        // 加载配置
        async function loadConfig() {
            try {
                const response = await fetch(`${API_BASE}/api/config`);
                const config = await response.json();

                if (config && Object.keys(config).length > 0) {
                    currentConfig = config;
                    populateForm(config);
                    showAlert('配置加载成功', 'success');
                    return config;
                }
                return null;
            } catch (error) {
                console.error('加载配置失败:', error);
                showAlert('加载配置失败，请重试');
                return null;
            }
        }

        // 填充表单
        function populateForm(config) {
            document.getElementById('email').value = config.email || '';
            document.getElementById('repeatInterval').value = config.repeat_interval || 180;
            document.getElementById('mainToggle').checked = config.monitoring_enabled || false;

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
                toggleTimeInputs();
            }

            // 更新监控开关状态
            updateMonitoringToggle();
        }

        // 保存配置
        async function saveConfig(inputConfig = null) {
            // 验证时间配置
            if (!validateTimeConfig()) {
                return; // 验证失败时中止保存
            }

            const timeControl = document.getElementById('timeControl');
            const startTime = document.getElementById('startTime').value;
            const endTime = document.getElementById('endTime').value;

            const config = inputConfig || {
                email: document.getElementById('email').value,
                repeat_interval: parseInt(document.getElementById('repeatInterval').value),
                monitoring_enabled: document.getElementById('mainToggle').checked,
                trigger_settings: {
                    hourly_minute: parseInt(document.getElementById('hourlyMinute').value) || 5,
                    daily_time: document.getElementById('dailyTime').value || '09:05'
                },
                notification_hours: {
                    enabled: timeControl.checked,
                    start: startTime,
                    end: endTime
                },
                coins: currentConfig?.coins || [] // 保持现有的监控配置
            };

            try {
                const response = await fetch(`${API_BASE}/api/config`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(config)
                });

                if (response.ok) {
                    if (!inputConfig) {
                        showAlert('配置保存成功！', 'success');
                    }
                    currentConfig = config;
                } else {
                    throw new Error('保存失败');
                }
            } catch (error) {
                console.error('保存配置失败:', error);
                if (!inputConfig) {
                    showAlert('保存配置失败，请重试');
                }
            }
        }

        // 加载状态
        async function loadStatus(preserveTriggerState = false) {
            try {
                const response = await fetch(`${API_BASE}/api/status`);
                const data = await response.json();

                updateSystemStatus(true);
                displayStatus(data, preserveTriggerState);
            } catch (error) {
                console.error('加载状态失败:', error);
                updateSystemStatus(false);
                document.getElementById('monitorList').innerHTML =
                    '<p style="text-align: center; color: #ef4444;">状态加载失败</p>';
            }
        }

        // 更新系统状态（简化版）
        function updateSystemStatus(isOnline) {
            // 移除了状态指示器，功能保留但简化
        }

        // 显示监控列表
        function displayStatus(data, preserveTriggerState = false) {
            const container = document.getElementById('monitorList');
            const config = currentConfig || {};

            // 如果配置还未加载，显示加载状态
            if (!currentConfig) {
                container.innerHTML = '<p style="text-align: center; color: #3b82f6;">正在加载配置...</p>';
                return;
            }

            if (!config.coins || config.coins.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: #6b7280;">暂无监控项目</p>';
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

            config.coins.forEach((coin, index) => {
                const state = data.monitoring_status && data.monitoring_status.coins_state && data.monitoring_status.coins_state[coin.symbol] ? data.monitoring_status.coins_state[coin.symbol] : { status: 'normal' };
                const statusClass = state.status === 'alert' ? '#ef4444' :
                                   state.status === 'normal' ? '#10b981' : '#f59e0b';
                const statusText = state.status === 'alert' ? '警报' :
                                  state.status === 'normal' ? '正常' : '冷却中';

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
                                '<button onclick="toggleMoreMenu(' + index + ')" class="more-btn">⋮</button>' +
                                '<div id="moreMenu_' + index + '" class="more-dropdown">' +
                                    (showCooldownOption ?
                                        '<button onclick="togglePause(\'' + coin.symbol + '\', ' + index + ')" class="more-dropdown-item">重置冷却期</button>' : ''
                                    ) +
                                    '<button onclick="editMonitor(' + index + ')" class="more-dropdown-item">编辑</button>' +
                                    '<button onclick="removeMonitor(' + index + ')" class="more-dropdown-item danger">删除</button>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
            });

            container.innerHTML = html;

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
        function editMonitor(index) {
            // 关闭菜单
            closeAllMoreMenus();

            const config = currentConfig || {};
            if (config.coins && config.coins[index]) {
                const coin = config.coins[index];
                const currentThreshold = coin.threshold;
                const newThreshold = prompt(`编辑 ${coin.exchange} - ${coin.symbol} 的阈值:`, currentThreshold);

                if (newThreshold !== null) {
                    const parsedThreshold = parseFloat(newThreshold);
                    if (!isNaN(parsedThreshold) && parsedThreshold > 0) {
                        config.coins[index].threshold = parsedThreshold;
                        saveConfig(config);
                        showAlert('阈值已更新', 'success');
                        loadStatus();
                    } else {
                        showAlert('请输入有效的阈值数值', 'error');
                    }
                }
            }
        }

        // 删除监控
        function removeMonitor(index) {
            // 关闭菜单
            closeAllMoreMenus();

            const config = currentConfig || {};
            if (config.coins && config.coins[index]) {
                const coin = config.coins[index];
                if (confirm('确定要删除监控 ' + coin.exchange + ' - ' + coin.symbol + ' 吗？')) {
                    config.coins.splice(index, 1);
                    saveConfig(config);
                    showAlert('监控已删除', 'success');
                    loadStatus();
                    // 更新监控开关状态
                    updateMonitoringToggle();
                }
            }
        }

        // 切换更多菜单
        function toggleMoreMenu(index) {
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
        function closeAllMoreMenus() {
            const allMenus = document.querySelectorAll('.more-dropdown');
            allMenus.forEach(menu => {
                menu.classList.remove('show');
            });
        }

        // 暂停/继续通知
        async function togglePause(coinSymbol, menuIndex) {
            // 关闭菜单
            closeAllMoreMenus();
            try {
                const response = await fetch(`${API_BASE}/api/status/cooldown/reset`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ coinSymbol })
                });

                const result = await response.json();

                if (result.success) {
                    // 刷新状态显示，不显示提示
                    loadStatus();
                } else {
                    // 静默失败，不显示错误
                    console.log('暂停/继续操作失败:', result.message);
                }
            } catch (error) {
                // 静默失败
                console.error('暂停/继续操作失败:', error);
            }
        }

        // 切换时间输入显示
        function toggleTimeInputs() {
            const timeControl = document.getElementById('timeControl');
            const timeInputs = document.getElementById('timeInputs');

            if (timeControl.checked) {
                timeInputs.style.display = 'block';
            } else {
                timeInputs.style.display = 'none';
            }
        }

        // 验证时间字符串格式
        function validateTimeFormat(timeStr) {
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
        function validateTimeConfig() {
            const timeControl = document.getElementById('timeControl');
            const startTime = document.getElementById('startTime').value;
            const endTime = document.getElementById('endTime').value;

            // 如果未启用时间限制，无需验证
            if (!timeControl.checked) {
                return true;
            }

            const startValid = validateTimeFormat(startTime);
            const endValid = validateTimeFormat(endTime);

            if (!startValid || !endValid) {
                // 时间格式无效，自动取消勾选
                timeControl.checked = false;
                toggleTimeInputs();
                showAlert('时间格式无效，已自动取消时间限制', 'warning');
                return false;
            }

            return true;
        }

        // 时间输入变化时的实时验证
        function onTimeInputChange() {
            const timeControl = document.getElementById('timeControl');

            // 如果未启用，无需验证
            if (!timeControl.checked) {
                return;
            }

            const startTime = document.getElementById('startTime').value;
            const endTime = document.getElementById('endTime').value;
            const startValid = validateTimeFormat(startTime);
            const endValid = validateTimeFormat(endTime);

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

        // 检查监控状态是否可以开启
        function canEnableMonitoring() {
            const email = document.getElementById('email').value.trim();
            const config = currentConfig || {};
            const hasCoins = config.coins && config.coins.length > 0;

            // 检查邮箱格式是否有效
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const isValidEmail = !email || emailRegex.test(email);

            return isValidEmail && hasCoins;
        }

        // 处理主监控开关点击
        function handleMainToggleChange() {
            const mainToggle = document.getElementById('mainToggle');
            const canEnable = canEnableMonitoring();

            if (mainToggle.checked && !canEnable) {
                // 阻止开启监控
                mainToggle.checked = false;
                showEnableMonitoringError();
                return;
            }

            // 如果可以开启，则保存配置
            autoSaveConfig();
        }

        // 检查并询问启用监控
        function checkAndAskToEnableMonitoring() {
            const email = document.getElementById('email').value.trim();
            const mainToggle = document.getElementById('mainToggle');
            const config = currentConfig || {};
            const coinCount = config.coins ? config.coins.length : 0;

            // 如果邮箱已填写，监控未开启，且这是第一条监控
            if (email && !mainToggle.checked && coinCount === 1) {
                setTimeout(() => {
                    if (confirm('监控添加成功！是否立即开启监控？')) {
                        mainToggle.checked = true;
                        autoSaveConfig();
                        showAlert('监控已启用，系统将按配置执行检查', 'success');
                    } else {
                        showAlert('监控添加成功！请记得开启监控开关以开始监控', 'success');
                    }
                }, 500);
            } else {
                // 其他情况显示常规提示
                showAlert('监控添加成功！' + getMonitoringEnabledTip(), 'success');
            }
        }

        // 获取监控启用提示信息
        function getMonitoringEnabledTip() {
            const email = document.getElementById('email').value.trim();
            const mainToggle = document.getElementById('mainToggle');
            const isEnabled = mainToggle.checked;

            if (!email && !isEnabled) {
                return ' 请填写通知邮箱并开启监控开关以开始监控';
            } else if (!email) {
                return ' 请填写通知邮箱以接收监控通知';
            } else if (!isEnabled) {
                return ' 请开启监控开关以开始监控';
            } else {
                return ' 监控已启用，系统将按配置执行检查';
            }
        }

        // 显示具体的启用错误提示
        function showEnableMonitoringError() {
            const email = document.getElementById('email').value.trim();
            const config = currentConfig || {};
            const hasCoins = config.coins && config.coins.length > 0;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const isValidEmail = !email || emailRegex.test(email);

            if (!isValidEmail && !hasCoins) {
                if (!email) {
                    showAlert('请先填写通知邮箱并添加监控项目', 'error');
                } else {
                    showAlert('请填写有效的通知邮箱并添加监控项目', 'error');
                }
            } else if (!isValidEmail) {
                if (!email) {
                    showAlert('请先填写通知邮箱', 'error');
                } else {
                    showAlert('请填写有效的通知邮箱', 'error');
                }
            } else if (!hasCoins) {
                showAlert('请先添加监控项目', 'error');
            }
        }

        // 更新监控开关状态
        function updateMonitoringToggle() {
            const mainToggle = document.getElementById('mainToggle');
            const container = document.getElementById('mainToggleContainer');
            const title = document.getElementById('monitorStatusTitle');
            const canEnable = canEnableMonitoring();

            if (!canEnable && mainToggle.checked) {
                // 如果当前开启但不满足条件，自动关闭
                mainToggle.checked = false;
                showAlert('监控已自动关闭：需要配置通知邮箱和监控项目', 'error');
                // 保存配置
                autoSaveConfig();
            }

            // 不禁用开关，但改变样式来提示用户
            if (!canEnable) {
                mainToggle.style.opacity = '0.5';
                // 不设置disabled，保持可点击
            } else {
                mainToggle.style.opacity = '1';
            }

            // 更新监控激活状态的视觉反馈
            if (mainToggle.checked && canEnable) {
                container.classList.add('monitoring-active');
                title.textContent = '利率变化监控中...';
            } else {
                container.classList.remove('monitoring-active');
                title.textContent = '监控状态：未开启';
            }
        }

        // 自动保存配置
        async function autoSaveConfig() {
            // 验证时间配置
            if (!validateTimeConfig()) {
                return; // 验证失败时中止保存
            }

            const timeControl = document.getElementById('timeControl');
            const startTime = document.getElementById('startTime').value;
            const endTime = document.getElementById('endTime').value;

            const config = {
                email: document.getElementById('email').value,
                repeat_interval: parseInt(document.getElementById('repeatInterval').value),
                monitoring_enabled: document.getElementById('mainToggle').checked,
                trigger_settings: {
                    hourly_minute: parseInt(document.getElementById('hourlyMinute').value) || 5,
                    daily_time: document.getElementById('dailyTime').value || '09:05'
                },
                notification_hours: {
                    enabled: timeControl.checked,
                    start: startTime,
                    end: endTime
                },
                coins: currentConfig?.coins || []
            };

            // 检查监控状态规则
            const canEnable = canEnableMonitoring();
            if (config.monitoring_enabled && !canEnable) {
                config.monitoring_enabled = false;
                document.getElementById('mainToggle').checked = false;
                showAlert('监控开启失败：需要配置通知邮箱和监控项目', 'error');
            }

            try {
                const response = await fetch(`${API_BASE}/api/config`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(config)
                });

                if (response.ok) {
                    currentConfig = config;
                    showAlert('配置保存成功', 'success');
                    // 更新监控开关状态
                    updateMonitoringToggle();
                } else {
                    throw new Error('保存失败');
                }
            } catch (error) {
                console.error('自动保存配置失败:', error);
                showAlert('配置保存失败，请重试');
            }
        }

        // 立即触发监控
        async function triggerMonitoring() {
            const triggerBtn = document.getElementById('triggerBtn');
            const triggerStatus = document.getElementById('triggerStatus');

            // 检查按钮是否已经在执行中
            if (triggerBtn.disabled) {
                return;
            }

            try {
                // 禁用按钮并显示初始进度
                triggerBtn.disabled = true;
                triggerBtn.style.opacity = '0.5';
                triggerBtn.textContent = '⏳';
                triggerStatus.style.display = 'inline';
                triggerStatus.textContent = '正在初始化...';

                showAlert('正在触发监控检查...', 'info');

                // 开始状态轮询获取实时进度（在发起请求前就开始）
                let pollInterval = null;
                let pollCount = 0;
                const maxPolls = 150; // 最多轮询5分钟 (150 * 2秒)
                let scrapeCompleted = false;

                // 立即开始轮询
                pollInterval = setInterval(async () => {
                    pollCount++;

                    try {
                        const statusResponse = await fetch(`${API_BASE}/api/scrape/status`);
                        const statusData = await statusResponse.json();

                        if (statusData.success && statusData.status) {
                            updateTriggerUI(statusData.status);

                            // 检查是否已完成或失败
                            if (!statusData.status.isRunning || pollCount >= maxPolls) {
                                clearInterval(pollInterval);

                                // 如果抓取还没完成，等待抓取完成
                                if (!scrapeCompleted) {
                                    // 等待一下让主请求完成
                                    setTimeout(async () => {
                                        try {
                                            // 最后再尝试获取一次完整结果
                                            const finalResponse = await fetch(`${API_BASE}/api/scrape/coinglass`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({})
                                            });

                                            if (finalResponse.ok) {
                                                const finalData = await finalResponse.json();
                                                handleScrapeComplete(finalData, statusData.status);
                                            } else {
                                                handleScrapeComplete({}, statusData.status);
                                            }
                                        } catch (finalError) {
                                            console.error('获取最终结果失败:', finalError);
                                            handleScrapeComplete({}, statusData.status);
                                        }
                                    }, 1000);
                                } else {
                                    handleScrapeComplete({}, statusData.status);
                                }
                            }
                        }
                    } catch (statusError) {
                        console.error('状态查询失败:', statusError);
                        // 状态查询失败不影响主流程，继续轮询
                    }
                }, 2000); // 每2秒查询一次

                // 同时发起抓取请求（不等待完成）
                fetch(`${API_BASE}/api/scrape/coinglass`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({})
                }).then(async (response) => {
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
                    }
                    scrapeCompleted = true;
                }).catch(error => {
                    console.error('触发监控失败:', error);
                    scrapeCompleted = true;
                    handleScrapeError(error);
                });

            } catch (error) {
                console.error('触发监控失败:', error);
                handleScrapeError(error);
            }
        }

        // 恢复触发按钮状态的函数
        function resetTriggerButton() {
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

        // 更新触发UI显示详细进度
        function updateTriggerUI(status) {
            const triggerStatus = document.getElementById('triggerStatus');
            if (!triggerStatus) return;

            let statusText = status.message || '正在处理...';

            // 添加币种进度信息
            if (status.totalCoins > 0) {
                const completed = status.completedCoins || 0;
                const failed = status.failedCoins || 0;

                // 在币种处理阶段，显示过程细节而不是币种信息
                if (status.scrapingStep) {
                    // 使用状态消息作为主要显示内容（已经包含过程细节）
                    statusText = status.message || statusText;

                    // 添加简化的进度信息
                    statusText += ` (${completed + failed}/${status.totalCoins})`;

                    // 显示失败信息
                    if (failed > 0) {
                        statusText += ` [${failed} 失败]`;
                    }
                } else {
                    // 非币种处理阶段，显示常规进度
                    const current = status.currentCoin;
                    if (current) {
                        statusText = `第 ${completed + failed + 1}/${status.totalCoins} 个: ${current.symbol} (${current.exchange}/${current.timeframe})`;
                    } else {
                        statusText = `进度: ${completed + failed}/${status.totalCoins} 个币种`;
                    }

                    // 显示失败信息
                    if (failed > 0) {
                        statusText += ` (${failed} 个失败)`;
                    }
                }
            }

            // 添加时间估算
            if (status.estimatedRemainingTime && status.estimatedRemainingTime > 0) {
                const remainingSeconds = Math.round(status.estimatedRemainingTime / 1000);
                const remainingMinutes = Math.ceil(remainingSeconds / 60);
                if (remainingMinutes > 1) {
                    statusText += ` - 预计剩余 ${remainingMinutes} 分钟`;
                } else {
                    statusText += ` - 预计剩余 ${remainingSeconds} 秒`;
                }
            }

            // 添加进度百分比
            if (status.progress !== undefined) {
                statusText = `${status.progress}% - ${statusText}`;
            }

            triggerStatus.textContent = statusText;
        }

        // 处理抓取完成
        function handleScrapeComplete(scrapeData, statusData) {
            const triggerBtn = document.getElementById('triggerBtn');
            const triggerStatus = document.getElementById('triggerStatus');

            // 显示成功状态
            triggerStatus.textContent = '完成！';
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
                } else {
                    successMessage = '监控检查完成，但没有检查到有效数据';
                }
            }

            // 显示详细的完成信息
            if (statusData.completedCoins > 0 || statusData.failedCoins > 0) {
                const totalProcessed = statusData.completedCoins + statusData.failedCoins;
                const duration = statusData.duration || 0;
                const durationSeconds = Math.round(duration / 1000);

                successMessage += ` (处理 ${totalProcessed} 个币种，耗时 ${durationSeconds} 秒`;
                if (statusData.failedCoins > 0) {
                    successMessage += `，${statusData.failedCoins} 个失败`;
                }
                successMessage += ')';
            }

            showAlert(successMessage, 'success');

            // 触发后刷新状态
            setTimeout(() => {
                loadStatus();
            }, 2000);

            // 3秒后恢复按钮状态
            setTimeout(() => {
                resetTriggerButton();
            }, 3000);
        }

        // 处理抓取错误
        function handleScrapeError(error) {
            const triggerBtn = document.getElementById('triggerBtn');
            const triggerStatus = document.getElementById('triggerStatus');

            // 显示错误状态
            triggerStatus.textContent = '失败';
            triggerBtn.textContent = '✗';
            triggerBtn.style.color = '#ef4444';

            showAlert(`触发监控失败: ${error.message}`, 'error');

            // 3秒后恢复按钮状态
            setTimeout(() => {
                resetTriggerButton();
            }, 3000);
        }

        // 日志功能相关变量和函数
        let logUpdateInterval = null;
        let lastLogCount = 0;

        // 颜色映射函数 - 根据日志内容设置颜色
        function getLogColor(logLine) {
            if (logLine.includes('✅') || logLine.includes('成功')) return '#10b981'; // 绿色
            if (logLine.includes('❌') || logLine.includes('失败') || logLine.includes('错误')) return '#ef4444'; // 红色
            if (logLine.includes('⚠️') || logLine.includes('警告') || logLine.includes('跳过')) return '#f59e0b'; // 黄色
            if (logLine.includes('🚨') || logLine.includes('警报')) return '#dc2626'; // 深红色
            if (logLine.includes('📊') || logLine.includes('📋') || logLine.includes('🔍')) return '#3b82f6'; // 蓝色
            if (logLine.includes('🕷️') || logLine.includes('🌐') || logLine.includes('🔄')) return '#8b5cf6'; // 紫色
            if (logLine.includes('📧') || logLine.includes('💾')) return '#06b6d4'; // 青色
            return '#e5e7eb'; // 默认灰色
        }

        // 获取服务器日志
        async function fetchServerLogs() {
            try {
                // 这里我们通过调用状态API来模拟日志获取
                // 实际项目中可以创建专门的日志API
                const response = await fetch(`${API_BASE}/api/status/logs`);
                if (response.ok) {
                    const logs = await response.text();
                    return logs;
                } else {
                    // 如果没有专门的日志API，使用状态信息生成模拟日志
                    return generateMockLogs();
                }
            } catch (error) {
                console.error('获取日志失败:', error);
                return generateMockLogs();
            }
        }

        // 生成模拟日志（基于当前状态）
        function generateMockLogs() {
            const timestamp = new Date().toLocaleString('zh-CN');
            const logs = [
                `[${timestamp}] 📊 系统运行正常`,
                `[${timestamp}] 🔄 监控服务已启动`,
                `[${timestamp}] ✅ 配置加载成功`,
                `[${timestamp}] 📋 监控项目: ${currentConfig?.coins?.length || 0} 个`,
                `[${timestamp}] 🔍 状态检查完成`
            ];
            return logs.join('\n');
        }

        // 更新日志显示
        async function updateLogs() {
            const logContainer = document.getElementById('logContainer');
            const logs = await fetchServerLogs();

            if (logs) {
                const logLines = logs.split('\n').filter(line => line.trim());
                let html = '';

                // 反转日志数组，让最新的在上面
                logLines.reverse().forEach(line => {
                    const color = getLogColor(line);
                    html += `<div style="color: ${color}; margin-bottom: 2px;">${line}</div>`;
                });

                logContainer.innerHTML = html;
            }
        }

        // 复制日志
        async function copyLogs() {
            const logContainer = document.getElementById('logContainer');
            const logs = await fetchServerLogs();

            if (logs) {
                try {
                    await navigator.clipboard.writeText(logs);
                    showAlert('日志已复制到剪贴板', 'success');
                } catch (error) {
                    // 如果剪贴板API不可用，使用传统方法
                    const textArea = document.createElement('textarea');
                    textArea.value = logs;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    showAlert('日志已复制到剪贴板', 'success');
                }
            } else {
                showAlert('没有可复制的日志', 'error');
            }
        }

        // 清空日志
        async function clearLogs() {
            try {
                const response = await fetch(`${API_BASE}/api/status/logs/clear`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    const result = await response.json();
                    showAlert('系统日志已清空', 'success');

                    // 清空显示
                    const logContainer = document.getElementById('logContainer');
                    logContainer.innerHTML = '<div style="color: #9ca3af; text-align: center;">日志已清空</div>';
                } else {
                    const error = await response.json();
                    showAlert(`清空日志失败: ${error.message || error.error}`, 'error');
                }
            } catch (error) {
                showAlert(`清空日志失败: ${error.message}`, 'error');
                // 即使服务端失败，也清空前端显示
                const logContainer = document.getElementById('logContainer');
                logContainer.innerHTML = '<div style="color: #9ca3af; text-align: center;">日志已清空（仅前端）</div>';
            }
        }

    
        // 开始日志轮询（改为手动刷新）
        function startLogPolling() {
            updateLogs(); // 只更新一次，不自动轮询
        }

        // 停止日志轮询
        function stopLogPolling() {
            if (logUpdateInterval) {
                clearInterval(logUpdateInterval);
                logUpdateInterval = null;
            }
        }

        // 修改triggerMonitoring函数，在手动触发时增加日志获取频率
        const originalTriggerMonitoring = triggerMonitoring;
        triggerMonitoring = async function() {
            // 增加日志更新频率
            stopLogPolling();
            const fastPollInterval = setInterval(updateLogs, frontendConfig.logRefreshInterval);

            try {
                await originalTriggerMonitoring();
            } finally {
                // 3秒后恢复正常轮询频率
                setTimeout(() => {
                    clearInterval(fastPollInterval);
                    // 不再恢复自动轮询
                }, 3000);
            }
        };

        // 页面加载完成后启动日志轮询
        document.addEventListener('DOMContentLoaded', function() {
            startLogPolling();

            // 点击页面其他地方关闭更多菜单
            document.addEventListener('click', function(event) {
                const isClickInsideMenu = event.target.closest('.more-menu');
                if (!isClickInsideMenu) {
                    closeAllMoreMenus();
                }
            });
        });

        // 页面卸载时清理
        window.addEventListener('beforeunload', function() {
            stopLogPolling();
        });

        // 更新日志功能相关变量和函数
        let changelogLoaded = false;
        let changelogData = null;

        // 切换更新日志显示
        async function toggleChangelog() {
            const container = document.getElementById('changelogContainer');
            const toggle = document.getElementById('changelogToggle');

            if (container.classList.contains('expanded')) {
                // 收起日志
                container.classList.remove('expanded');
                toggle.textContent = '📋 更新日志';
            } else {
                // 展开日志
                container.classList.add('expanded');
                toggle.textContent = '📋 收起日志';

                // 首次展开时加载数据
                if (!changelogLoaded) {
                    await loadChangelog();
                }
            }
        }

        // 加载更新日志数据
        async function loadChangelog() {
            const content = document.getElementById('changelogContent');

            try {
                // 从CHANGELOG.md文件读取数据
                const response = await fetch('/CHANGELOG.md');
                if (!response.ok) {
                    throw new Error('无法读取更新日志文件');
                }

                const changelogText = await response.text();

                // 尝试解析JSON格式的更新日志
                try {
                    changelogData = JSON.parse(changelogText);
                    renderChangelog();
                } catch (parseError) {
                    // 如果JSON解析失败，尝试解析Markdown格式
                    changelogData = parseMarkdownChangelog(changelogText);
                    renderChangelog();
                }

                changelogLoaded = true;
            } catch (error) {
                console.error('加载更新日志失败:', error);
                content.innerHTML = `
                    <div class="changelog-item">
                        <div class="changelog-description">
                            无法加载更新日志，请稍后重试
                        </div>
                    </div>
                `;
            }
        }

        // 解析Markdown格式的更新日志
        function parseMarkdownChangelog(markdown) {
            const lines = markdown.split('\n');
            const changelog = [];
            let currentItem = null;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                // 匹配版本标题格式 ## [version] - date
                const versionMatch = line.match(/^##\s*\[?([v\d\.]+)\]?\s*(?:-\s*(\d{4}-\d{2}-\d{2}))?/);
                if (versionMatch) {
                    // 保存上一个项目
                    if (currentItem) {
                        changelog.push(currentItem);
                    }

                    // 开始新项目
                    currentItem = {
                        version: versionMatch[1],
                        date: versionMatch[2] || '未知日期',
                        description: '',
                        changes: []
                    };
                    continue;
                }

                // 匹配描述行
                if (currentItem && line && !line.startsWith('#') && !line.startsWith('*') && !line.startsWith('-')) {
                    if (currentItem.description) {
                        currentItem.description += ' ' + line;
                    } else {
                        currentItem.description = line;
                    }
                    continue;
                }

                // 匹配变化列表项
                if (currentItem && (line.startsWith('*') || line.startsWith('-'))) {
                    const change = line.replace(/^[\*\-\s]+/, '').trim();
                    if (change) {
                        currentItem.changes.push(change);
                    }
                }
            }

            // 添加最后一个项目
            if (currentItem) {
                changelog.push(currentItem);
            }

            return changelog;
        }

        // 格式化日期显示（今天、昨天、具体日期）
        function formatDateForDisplay(dateStr) {
            const date = new Date(dateStr);
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            // 重置时间部分为0点，只比较日期
            date.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);
            yesterday.setHours(0, 0, 0, 0);

            if (date.getTime() === today.getTime()) {
                return '今天';
            } else if (date.getTime() === yesterday.getTime()) {
                return '昨天';
            } else {
                // 返回 yyyy-MM-dd 格式
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            }
        }

        // 渲染更新日志
        function renderChangelog() {
            const content = document.getElementById('changelogContent');

            if (!changelogData || changelogData.length === 0) {
                content.innerHTML = `
                    <div class="changelog-group">
                        <div class="changelog-item">
                            <div class="changelog-description">
                                暂无更新日志
                            </div>
                        </div>
                    </div>
                `;
                return;
            }

            let html = '';
            let currentDate = null;

            // 按日期分组
            changelogData.forEach(item => {
                const itemDate = item.date;

                // 如果是新的一天，添加日期分割线
                if (itemDate !== currentDate) {
                    currentDate = itemDate;

                    // 如果不是第一个日期，关闭上一个组
                    if (html !== '') {
                        html += '</div>';
                    }

                    // 添加新的日期分割线和组
                    html += `
                        <div class="changelog-date-divider">
                            <span class="changelog-date-text">${formatDateForDisplay(itemDate)}</span>
                        </div>
                        <div class="changelog-group">
                    `;
                }

                // 添加更新项，不包含日期
                html += `
                    <div class="changelog-item">
                        <div class="changelog-version">
                            <span class="changelog-version-number">${item.version}</span>
                        </div>
                        <div class="changelog-description">${item.description}</div>
                        ${item.changes && item.changes.length > 0 ? `
                            <ul class="changelog-changes">
                                ${item.changes.map(change => `<li>${change}</li>`).join('')}
                            </ul>
                        ` : ''}
                    </div>
                `;
            });

            // 关闭最后一个组
            if (html !== '') {
                html += '</div>';
            }

            content.innerHTML = html;
        }

        // 点击页面其他地方关闭更新日志（可选功能）
        document.addEventListener('click', function(event) {
            const changelogContainer = document.getElementById('changelogContainer');
            const versionInfo = document.querySelector('.version-info');

            if (changelogContainer.classList.contains('expanded') &&
                !changelogContainer.contains(event.target) &&
                !versionInfo.contains(event.target)) {

                // 如果需要点击其他地方自动关闭，取消下面这行的注释
                // toggleChangelog();
            }
        });
