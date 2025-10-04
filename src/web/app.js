/**
 * Web界面JavaScript逻辑模块
 */

const API_BASE = window.location.origin;
let currentConfig = null;

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    loadConfig();
    loadStatus();

    // 每30秒更新一次状态
    setInterval(loadStatus, 30000);
});

// 添加监控
export function addMonitor() {
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

    showAlert('监控添加成功', 'success');
    loadStatus();
}

// 显示提示信息
export function showAlert(message, type = 'error') {
    const alertsContainer = document.getElementById('alerts');
    const alert = document.createElement('div');
    alert.className = `alert ${type}`;
    alert.textContent = message;
    alertsContainer.appendChild(alert);

    setTimeout(() => {
        alert.remove();
    }, 5000);
}

// 加载配置
export async function loadConfig() {
    try {
        const response = await fetch(`${API_BASE}/api/config`);
        const config = await response.json();

        if (config && Object.keys(config).length > 0) {
            currentConfig = config;
            populateForm(config);
            showAlert('配置加载成功', 'success');
        }
    } catch (error) {
        console.error('加载配置失败:', error);
        showAlert('加载配置失败，请重试');
    }
}

// 填充表单
export function populateForm(config) {
    document.getElementById('email').value = config.email || '';
    document.getElementById('repeatInterval').value = config.repeat_interval || 3;
    document.getElementById('mainToggle').checked = config.monitoring_enabled || false;

    if (config.notification_hours) {
        document.getElementById('timeControl').checked = config.notification_hours.enabled || false;
        document.getElementById('startTime').value = config.notification_hours.start || '09:00';
        document.getElementById('endTime').value = config.notification_hours.end || '24:00';
    }
}

// 保存配置
export async function saveConfig(inputConfig = null) {
    const config = inputConfig || {
        email: document.getElementById('email').value,
        repeat_interval: parseInt(document.getElementById('repeatInterval').value),
        monitoring_enabled: document.getElementById('mainToggle').checked,
        notification_hours: {
            enabled: document.getElementById('timeControl').checked,
            start: document.getElementById('startTime').value,
            end: document.getElementById('endTime').value
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
export async function loadStatus() {
    try {
        const response = await fetch(`${API_BASE}/api/status`);
        const data = await response.json();

        updateSystemStatus(true);
        displayStatus(data);
    } catch (error) {
        console.error('加载状态失败:', error);
        updateSystemStatus(false);
        document.getElementById('monitorList').innerHTML =
            '<p style="text-align: center; color: #ef4444;">状态加载失败</p>';
    }
}

// 更新系统状态（简化版）
export function updateSystemStatus(isOnline) {
    // 移除了状态指示器，功能保留但简化
}

// 显示监控列表
export function displayStatus(data) {
    const container = document.getElementById('monitorList');
    const config = currentConfig || {};

    if (!config.coins || config.coins.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #6b7280;">暂无监控项目</p>';
        return;
    }

    let html = '';

    config.coins.forEach((coin, index) => {
        const state = data.states && data.states[coin.symbol] ? data.states[coin.symbol] : { status: 'normal' };
        const statusClass = state.status === 'alert' ? '#ef4444' :
                           state.status === 'normal' ? '#10b981' : '#f59e0b';
        const statusText = state.status === 'alert' ? '警报' :
                          state.status === 'normal' ? '正常' : '冷却中';

        html += '<div class="monitor-item">' +
                '<div class="monitor-info">' +
                    '<strong>' + coin.exchange + ' - ' + coin.symbol + '</strong> ' +
                    '<span class="timeframe">(' + coin.timeframe + ')</span>' +
                    '<br>' +
                    '<small>阈值: ' + coin.threshold + '% | 状态: </small>' +
                    '<span style="color: ' + statusClass + '; font-weight: bold;">' + statusText + '</span>' +
                    (state.last_rate ? ' | 当前: ' + state.last_rate + '%' : '') +
                '</div>' +
                '<div class="monitor-actions">' +
                    '<label class="toggle-switch">' +
                        '<input type="checkbox" ' + (coin.enabled ? 'checked' : '') +
                        ' onchange="toggleMonitor(' + index + ')">' +
                        '<span class="slider"></span>' +
                    '</label>' +
                    '<button onclick="removeMonitor(' + index + ')" class="remove-btn">删除</button>' +
                '</div>' +
            '</div>';
    });

    container.innerHTML = html;
}

// 切换监控开关
export function toggleMonitor(index) {
    const config = currentConfig || {};
    if (config.coins && config.coins[index]) {
        config.coins[index].enabled = !config.coins[index].enabled;
        saveConfig(config);
        showAlert(config.coins[index].enabled ? '监控已启用' : '监控已禁用', 'success');
    }
}

// 删除监控
export function removeMonitor(index) {
    const config = currentConfig || {};
    if (config.coins && config.coins[index]) {
        const coin = config.coins[index];
        if (confirm('确定要删除监控 ' + coin.exchange + ' - ' + coin.symbol + ' 吗？')) {
            config.coins.splice(index, 1);
            saveConfig(config);
            showAlert('监控已删除', 'success');
            loadStatus();
        }
    }
}

// 将函数绑定到全局作用域，供HTML调用
window.addMonitor = addMonitor;
window.saveConfig = saveConfig;
window.loadConfig = loadConfig;
window.toggleMonitor = toggleMonitor;
window.removeMonitor = removeMonitor;
window.displayStatus = displayStatus;