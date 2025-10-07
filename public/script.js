/**
 * 主入口文件 - 重构后的模块化架构
 * 负责应用初始化、全局状态管理和模块协调
 */

// 初始化全局状态
window.appState = {
    currentConfig: null,
    frontendConfig: {}
};

// Web界面逻辑 - 重构后的主入口
const API_BASE = window.location.origin;

// 从环境变量加载前端配置（通过全局变量注入）
window.appState.frontendConfig = {
    updateInterval: parseInt(window.FRONTEND_UPDATE_INTERVAL) || 30000,
    apiRequestTimeout: parseInt(window.FRONTEND_API_REQUEST_TIMEOUT) || 10000,
    logRefreshInterval: parseInt(window.FRONTEND_LOG_REFRESH_INTERVAL) || 1000
};

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    // 初始化模块
    initializeModules();

    // 加载版本信息
    if (window.appSystem) {
        window.appSystem.loadVersionInfo().catch(error => {
            console.error('版本加载失败:', error);
        });
    }

    // 先加载配置，然后加载状态
    window.appConfig.loadConfig().then(() => {
        window.appMonitorUI.loadStatus();
    }).catch(() => {
        // 如果配置加载失败，仍然尝试加载状态
        window.appMonitorUI.loadStatus();
    });

    // 按配置间隔更新状态，保持触发按钮状态
    setInterval(() => window.appMonitorUI.loadStatus(true), window.appState.frontendConfig.updateInterval);

    // 设置增强日志功能
    window.appSystem.setupEnhancedLogging();
});

// 退出登录功能
async function logout() {
    if (confirm('确定要退出登录吗？')) {
        try {
            // 调用退出API
            const response = await fetch('/api/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                // 退出成功，重定向到登录页面
                window.location.href = '/login';
            } else {
                // 即使API失败，也重定向到登录页面
                window.location.href = '/login';
            }
        } catch (error) {
            console.error('退出失败:', error);
            // 即使网络错误，也重定向到登录页面
            window.location.href = '/login';
        }
    }
}

// 初始化所有模块
function initializeModules() {
    // 等待所有模块加载完成
    if (window.appConfig && window.appMonitorUI && window.appSystem) {
        // 模块加载完成
    } else {
        console.error('模块加载失败');
    }
}

// ============ 全局函数兼容性接口 ============
// 为了保持与原有 HTML onclick 调用的兼容性，提供全局函数接口

// 监控相关
function addMonitor() {
    return window.appMonitorUI.addMonitor();
}

function triggerMonitoring() {
    return window.appMonitorUI.triggerMonitoring();
}

function editMonitor(index) {
    return window.appMonitorUI.editMonitor(index);
}

function removeMonitor(index) {
    return window.appMonitorUI.removeMonitor(index);
}

function toggleMoreMenu(index) {
    return window.appMonitorUI.toggleMoreMenu(index);
}

function togglePause(coinSymbol, menuIndex) {
    return window.appMonitorUI.togglePause(coinSymbol, menuIndex);
}

// 配置管理相关
function addEmailGroup() {
    return window.appConfig.addEmailGroup();
}

function toggleTimeInputs() {
    return window.appConfig.toggleTimeInputs();
}

function onTimeInputChange() {
    return window.appConfig.onTimeInputChange();
}

function autoSaveConfig() {
    return window.appConfig.autoSaveConfig();
}

// 日志相关
function copyLogs() {
    return window.appSystem.copyLogs();
}

function clearLogs() {
    return window.appSystem.clearLogs();
}

// 更新日志相关
function toggleChangelog() {
    return window.appSystem.toggleChangelog();
}

// 邮件分组相关 - 通过 appConfig 调用
function deleteEmailGroup(groupId) {
    return window.appConfig.deleteEmailGroup(groupId);
}

function toggleAddCoinForm(groupId) {
    return window.appConfig.toggleAddCoinForm(groupId);
}

function addCoinToGroup(groupId) {
    return window.appConfig.addCoinToGroup(groupId);
}

function editCoinInGroup(groupId, coinIndex) {
    return window.appConfig.editCoinInGroup(groupId, coinIndex);
}

function saveEditedCoin(groupId, coinIndex) {
    return window.appConfig.saveEditedCoin(groupId, coinIndex);
}

function removeCoinFromGroup(groupId, coinKey) {
    return window.appConfig.removeCoinFromGroup(groupId, coinKey);
}

function closeDialog() {
    return window.appConfig.closeDialog();
}

function handleGroupToggleChange(groupId, isEnabled) {
    return window.appConfig.handleGroupToggleChange(groupId, isEnabled);
}

