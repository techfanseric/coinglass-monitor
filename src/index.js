/**
 * CoinGlass 利率监控 Worker - 重构版本
 * 主要功能：路由和调度
 */

// 导入模块
import { runMonitoring } from './modules/monitor.js';
import { getUserConfig, getCoinState } from './utils/config.js';

export default {
  // 定时任务入口
  async scheduled(event, env, ctx) {
    console.log('开始执行利率监控任务');

    try {
      await runMonitoring(env);
      console.log('监控任务完成');
    } catch (error) {
      console.error('监控任务失败:', error);
    }
  },

  // API 请求处理
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // 主页路由
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return getHomePage();
    }

    // API 路由
    if (url.pathname === '/api/config') {
      if (request.method === 'GET') {
        return getConfig(env);
      } else if (request.method === 'POST') {
        return saveConfig(request, env);
      }
    }

    if (url.pathname === '/api/status') {
      return getStatus(env);
    }

    if (url.pathname === '/api/history') {
      return getEmailHistory(env);
    }

    // 默认返回
    return new Response('Not Found', { status: 404 });
  },
};

/**
 * 获取主页
 */
async function getHomePage() {
  // 由于Cloudflare Workers不支持文件系统API，我们仍需要使用内联HTML
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CoinGlass 利率监控</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: system-ui, -apple-system, sans-serif;
            background: #fafbfc;
            padding: 12px;
            line-height: 1.5;
            color: #2d3748;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
        }

        .header {
            background: #f8fafc;
            color: #4a5568;
            padding: 16px 20px;
            text-align: center;
            border-bottom: 1px solid #e2e8f0;
        }

        .header h1 {
            font-size: 1.25em;
            font-weight: 600;
            margin-bottom: 2px;
        }

        .header p {
            font-size: 0.875em;
            color: #718096;
        }

        .content {
            padding: 20px;
        }

        .section {
            margin-bottom: 20px;
            padding-bottom: 16px;
        }

        .section:last-child {
            margin-bottom: 0;
            padding-bottom: 0;
        }

        .section h2 {
            color: #2d3748;
            margin-bottom: 12px;
            font-size: 1.1em;
            font-weight: 600;
        }

        .form-group {
            margin-bottom: 12px;
        }

        label {
            display: block;
            margin-bottom: 4px;
            color: #4a5568;
            font-size: 0.875em;
            font-weight: 500;
        }

        input, select {
            width: 100%;
            padding: 8px 10px;
            border: 1px solid #cbd5e0;
            border-radius: 4px;
            font-size: 0.9em;
            background: #ffffff;
            transition: border-color 0.15s ease;
        }

        select {
            -webkit-appearance: none;
            -moz-appearance: none;
            appearance: none;
            background-image: none;
        }

        input[type="time"] {
            -webkit-appearance: none;
            -moz-appearance: none;
            appearance: none;
        }

        input:focus, select:focus {
            outline: none;
            border-color: #718096;
            box-shadow: 0 0 0 1px #718096;
        }

        .toggle-switch {
            position: relative;
            width: 36px;
            height: 18px;
        }

        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #cbd5e0;
            transition: .15s ease;
            border-radius: 18px;
        }

        .slider:before {
            position: absolute;
            content: "";
            height: 14px;
            width: 14px;
            left: 2px;
            bottom: 2px;
            background-color: white;
            transition: .15s ease;
            border-radius: 50%;
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }

        input:checked + .slider {
            background-color: #718096;
        }

        input:checked + .slider:before {
            transform: translateX(18px);
        }

        .btn {
            background: #4a5568;
            color: white;
            border: none;
            padding: 8px 16px;
            font-size: 0.9em;
            cursor: pointer;
            width: 100%;
            border-radius: 4px;
            font-weight: 500;
            transition: background-color 0.15s ease;
        }

        .btn:hover {
            background: #2d3748;
        }

        .btn.secondary {
            background: #718096;
        }

        .btn.secondary:hover {
            background: #4a5568;
        }

        #alerts {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1000;
            max-width: 500px;
            width: 90%;
            pointer-events: none; /* 让点击穿透到关闭按钮 */
        }

        .alert {
            background: #fef5e7;
            border: 1px solid #f9e79f;
            padding: 12px 16px;
            margin-bottom: 8px;
            color: #7d6608;
            font-size: 0.9em;
            border-radius: 4px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            animation: slideDown 0.3s ease;
            position: relative;
            pointer-events: auto; /* 恢复点击事件 */
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
        }

        .alert.success {
            background: #eafaf1;
            border: 1px solid #a9dfbf;
            color: #239b56;
        }

        .alert-content {
            flex: 1;
            line-height: 1.4;
        }

        .alert-close {
            background: none;
            border: none;
            color: inherit;
            cursor: pointer;
            font-size: 1.2em;
            line-height: 1;
            padding: 0;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background-color 0.15s ease;
            flex-shrink: 0;
        }

        .alert-close:hover {
            background-color: rgba(0, 0, 0, 0.1);
        }

        @keyframes slideDown {
            from {
                opacity: 0;
                transform: translateY(-20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        @keyframes slideUp {
            from {
                opacity: 1;
                transform: translateY(0);
            }
            to {
                opacity: 0;
                transform: translateY(-20px);
            }
        }

        .alert.removing {
            animation: slideUp 0.3s ease forwards;
        }

        @media (max-width: 600px) {
            #alerts {
                top: 10px;
                width: 95%;
                max-width: none;
            }

            .alert {
                padding: 10px 12px;
                font-size: 0.85em;
            }
        }

        .loading {
            text-align: center;
            padding: 16px;
            color: #718096;
            font-size: 0.9em;
        }

        .main-toggle {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 12px 16px;
            margin-bottom: 16px;
        }

        .main-toggle h3 {
            color: #2d3748;
            font-size: 1em;
            font-weight: 600;
        }

        /* 监控列表样式 */
        .monitor-list {
            margin-top: 12px;
        }

        .monitor-item {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .monitor-info {
            flex: 1;
            font-size: 0.9em;
            line-height: 1.4;
        }

        .monitor-info strong {
            color: #2d3748;
        }

        .monitor-info .timeframe {
            color: #718096;
            font-weight: normal;
        }

        .monitor-info small {
            color: #718096;
        }

        .monitor-actions {
            display: flex;
            justify-content: flex-end;
        }

        .remove-btn {
            background: #e53e3e;
            color: white;
            border: none;
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.75em;
        }

        .remove-btn:hover {
            background: #c53030;
        }

        /* 快速添加监控样式 */
        .add-monitor-row {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .add-monitor-item {
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .add-monitor-item input,
        .add-monitor-item select {
            flex: 1;
            min-width: 80px;
            padding: 6px 8px;
            border: 1px solid #cbd5e0;
            border-radius: 4px;
            font-size: 0.85em;
        }

        .add-monitor-item select#quickCoin {
            flex: 1.2;
            min-width: 100px;
        }

        .add-monitor-item input[type="number"] {
            flex: 1;
        }

        .add-btn {
            background: #4a5568;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.85em;
            white-space: nowrap;
            width: auto;
            min-width: 80px;
        }

        .add-btn:hover {
            background: #2d3748;
        }

        /* 两栏布局样式 */
        .two-column-layout {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
        }

        .left-column, .right-column {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        @media (max-width: 900px) {
            .two-column-layout {
                grid-template-columns: 1fr;
                gap: 16px;
            }
        }

        @media (max-width: 600px) {
            .content {
                padding: 16px;
            }
            .add-monitor-row {
                flex-direction: column;
                gap: 8px;
            }
            .add-monitor-row input,
            .add-monitor-row select {
                min-width: auto;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>CoinGlass 利率监控</h1>
            <p>实时监控币种借贷利率</p>
        </div>

        <div class="content">
            <div id="alerts"></div>

            <!-- 主监控开关 -->
            <div class="section">
                <div class="main-toggle">
                    <h3>监控状态</h3>
                    <label class="toggle-switch">
                        <input type="checkbox" id="mainToggle">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>

            <!-- 两栏布局 -->
            <div class="two-column-layout">
                <!-- 左栏：监控项目管理 -->
                <div class="left-column">
                    <!-- 添加监控 -->
                    <div class="section">
                        <h2>添加监控</h2>

                        <div class="add-monitor-row">
                            <div class="add-monitor-item">
                                <label for="quickExchange" style="min-width: 60px; font-size: 0.875em;">交易所</label>
                                <select id="quickExchange">
                                    <option value="binance">Binance</option>
                                    <option value="okx">OKX</option>
                                    <option value="bybit">Bybit</option>
                                </select>
                            </div>

                            <div class="add-monitor-item">
                                <label for="quickCoin" style="min-width: 60px; font-size: 0.875em;">币种</label>
                                <select id="quickCoin">
                                    <option value="USDT">USDT</option>
                                    <option value="USDC">USDC</option>
                                    <option value="BUSD">BUSD</option>
                                    <option value="DAI">DAI</option>
                                    <option value="TUSD">TUSD</option>
                                    <option value="FDUSD">FDUSD</option>
                                    <option value="USDD">USDD</option>
                                    <option value="LUSD">LUSD</option>
                                    <option value="BTC">BTC</option>
                                    <option value="ETH">ETH</option>
                                    <option value="BNB">BNB</option>
                                    <option value="SOL">SOL</option>
                                    <option value="AVAX">AVAX</option>
                                    <option value="MATIC">MATIC</option>
                                    <option value="DOT">DOT</option>
                                    <option value="ATOM">ATOM</option>
                                    <option value="LINK">LINK</option>
                                    <option value="UNI">UNI</option>
                                    <option value="AAVE">AAVE</option>
                                    <option value="MKR">MKR</option>
                                    <option value="COMP">COMP</option>
                                    <option value="CFX">CFX</option>
                                    <option value="IOST">IOST</option>
                                    <option value="LTC">LTC</option>
                                    <option value="BCH">BCH</option>
                                    <option value="XRP">XRP</option>
                                    <option value="ADA">ADA</option>
                                    <option value="DOGE">DOGE</option>
                                    <option value="SHIB">SHIB</option>
                                    <option value="TRX">TRX</option>
                                    <option value="FTM">FTM</option>
                                    <option value="NEAR">NEAR</option>
                                    <option value="SAND">SAND</option>
                                    <option value="MANA">MANA</option>
                                    <option value="AXS">AXS</option>
                                    <option value="GALA">GALA</option>
                                    <option value="APE">APE</option>
                                    <option value="SUSHI">SUSHI</option>
                                    <option value="CRV">CRV</option>
                                    <option value="YFI">YFI</option>
                                    <option value="1INCH">1INCH</option>
                                </select>
                            </div>

                            <div class="add-monitor-item">
                                <label for="quickTimeframe" style="min-width: 60px; font-size: 0.875em;">时间</label>
                                <select id="quickTimeframe">
                                    <option value="1h">1小时</option>
                                    <option value="24h">24小时</option>
                                </select>
                            </div>

                            <div class="add-monitor-item">
                                <label for="quickThreshold" style="min-width: 60px; font-size: 0.875em;">阈值</label>
                                <input type="number" id="quickThreshold" placeholder="阈值%" step="0.1" min="0">
                            </div>

                            <div class="add-monitor-item">
                                <div style="min-width: 60px;"></div>
                                <button onclick="addMonitor()" class="add-btn">添加监控</button>
                            </div>
                        </div>
                    </div>

                    <!-- 监控列表 -->
                    <div class="section">
                        <h2>监控列表</h2>
                        <div id="monitorList" class="monitor-list">
                            <p style="text-align: center; color: #6b7280;">暂无监控项目</p>
                        </div>
                    </div>
                </div>

                <!-- 右栏：通知设置 -->
                <div class="right-column">
                    <!-- 基础设置 -->
                    <div class="section">
                        <h2>通知设置</h2>

                        <div class="form-group">
                            <label for="email">通知邮箱</label>
                            <input type="email" id="email" placeholder="your-email@example.com" autocomplete="off">
                        </div>

                        <div class="form-group">
                            <label for="repeatInterval">重复通知间隔</label>
                            <select id="repeatInterval">
                                <option value="3">3小时</option>
                                <option value="6">6小时</option>
                                <option value="12">12小时</option>
                                <option value="24">24小时</option>
                            </select>
                        </div>
                    </div>

                    <!-- 时间设置 -->
                    <div class="section">
                        <h2>通知时间段</h2>

                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="timeControl" style="width: auto; margin-right: 8px;">
                                启用时间限制
                            </label>
                        </div>

                        <div class="time-inputs" style="display: flex; flex-direction: column; gap: 12px;">
                            <div class="form-group">
                                <label for="startTime">开始时间</label>
                                <input type="time" id="startTime" value="09:00">
                            </div>
                            <div class="form-group">
                                <label for="endTime">结束时间</label>
                                <input type="time" id="endTime" value="24:00">
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 操作按钮 -->
            <div class="section">
                <button class="btn" onclick="saveConfig()">保存配置</button>
            </div>
        </div>
    </div>

    <script>
        // Web界面逻辑
        const API_BASE = window.location.origin;
        let currentConfig = null;

        // 页面加载时初始化
        document.addEventListener('DOMContentLoaded', function() {
            loadConfig();
            loadStatus();
            setInterval(loadStatus, 30000);

            // 添加主监控开关的事件监听器
            const mainToggle = document.getElementById('mainToggle');
            if (mainToggle) {
                mainToggle.addEventListener('change', function() {
                    // 检查是否满足启用监控的条件
                    if (this.checked) {
                        const email = document.getElementById('email').value.trim();
                        const config = currentConfig || {};
                        const hasMonitors = config.coins && config.coins.length > 0;

                        if (!email) {
                            showAlert('请先填写通知邮箱地址', 'error');
                            this.checked = false; // 重置开关状态
                            return;
                        }

                        if (!hasMonitors) {
                            showAlert('请先添加至少一个监控项目', 'error');
                            this.checked = false; // 重置开关状态
                            return;
                        }
                    }

                    saveConfig(); // 状态改变时自动保存配置
                    showAlert(this.checked ? '监控已开启' : '监控已关闭', 'success');
                });
            }
        });

        // 添加监控
        function addMonitor() {
            const exchange = document.getElementById('quickExchange').value;
            const coin = document.getElementById('quickCoin').value;
            const timeframe = document.getElementById('quickTimeframe').value;
            const threshold = parseFloat(document.getElementById('quickThreshold').value);

            if (!coin) {
                showAlert('请选择币种');
                return;
            }

            if (!threshold || threshold <= 0) {
                showAlert('请输入有效的阈值');
                return;
            }

            const config = currentConfig || {};
            if (!config.coins) config.coins = [];

            const exists = config.coins.some(c =>
                c.symbol === coin && c.exchange === exchange && c.timeframe === timeframe
            );

            if (exists) {
                showAlert('该监控已存在');
                return;
            }

            config.coins.push({
                symbol: coin,
                exchange: exchange,
                timeframe: timeframe,
                threshold: threshold,
                enabled: true
            });

            saveConfig(config);
            document.getElementById('quickThreshold').value = '';
            showAlert('监控添加成功', 'success');
            loadStatus();
        }

        function showAlert(message, type = 'error') {
            const alertsContainer = document.getElementById('alerts');
            const alert = document.createElement('div');
            alert.className = \`alert \${type}\`;

            // 创建内容容器
            const contentDiv = document.createElement('div');
            contentDiv.className = 'alert-content';
            contentDiv.textContent = message;

            // 创建关闭按钮
            const closeBtn = document.createElement('button');
            closeBtn.className = 'alert-close';
            closeBtn.innerHTML = '×';
            closeBtn.setAttribute('aria-label', '关闭提示');
            closeBtn.title = '关闭';

            // 添加关闭功能
            closeBtn.addEventListener('click', () => {
                removeAlert(alert);
            });

            // 组装元素
            alert.appendChild(contentDiv);
            alert.appendChild(closeBtn);
            alertsContainer.appendChild(alert);

            // 自动关闭（5秒后）
            const timeoutId = setTimeout(() => {
                removeAlert(alert);
            }, 5000);

            // 存储timeout ID以便清除
            alert.dataset.timeoutId = timeoutId;
        }

        function removeAlert(alert) {
            // 清除自动关闭的定时器
            if (alert.dataset.timeoutId) {
                clearTimeout(parseInt(alert.dataset.timeoutId));
            }

            // 添加移除动画
            alert.classList.add('removing');

            // 动画结束后移除元素
            setTimeout(() => {
                if (alert.parentNode) {
                    alert.remove();
                }
            }, 300);
        }

        async function loadConfig() {
            try {
                const response = await fetch(\`\${API_BASE}/api/config\`);
                const config = await response.json();
                if (config && Object.keys(config).length > 0) {
                    currentConfig = config;
                    populateForm(config);
                    // 配置加载成功不显示提示，避免高频提示
                }
            } catch (error) {
                console.error('加载配置失败:', error);
                showAlert('加载配置失败，请重试');
            }
        }

        function populateForm(config) {
            // 设置邮箱字段 - 如果有配置就显示实际值，没有就显示占位符
            const emailInput = document.getElementById('email');
            if (config.email && config.email.trim() !== '') {
                emailInput.value = config.email.trim();
            } else {
                emailInput.value = '';
            }

            // 设置其他字段
            document.getElementById('repeatInterval').value = config.repeat_interval || 3;
            document.getElementById('mainToggle').checked = config.monitoring_enabled || false;
            if (config.notification_hours) {
                document.getElementById('timeControl').checked = config.notification_hours.enabled || false;
                document.getElementById('startTime').value = config.notification_hours.start || '09:00';
                document.getElementById('endTime').value = config.notification_hours.end || '24:00';
            }
        }

        async function saveConfig(inputConfig = null) {
            const config = inputConfig || {
                email: document.getElementById('email').value.trim(),
                repeat_interval: parseInt(document.getElementById('repeatInterval').value),
                monitoring_enabled: document.getElementById('mainToggle').checked,
                notification_hours: {
                    enabled: document.getElementById('timeControl').checked,
                    start: document.getElementById('startTime').value,
                    end: document.getElementById('endTime').value
                },
                coins: currentConfig?.coins || []
            };
            try {
                const response = await fetch(\`\${API_BASE}/api/config\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                });
                if (response.ok) {
                    // 配置保存成功不显示提示，避免与其他操作提示重复
                    currentConfig = config;
                } else throw new Error('保存失败');
            } catch (error) {
                console.error('保存配置失败:', error);
                if (!inputConfig) showAlert('保存配置失败，请重试');
            }
        }

        async function loadStatus() {
            try {
                const response = await fetch(\`\${API_BASE}/api/status\`);
                const data = await response.json();
                displayStatus(data);
            } catch (error) {
                console.error('加载状态失败:', error);
                document.getElementById('monitorList').innerHTML =
                    '<p style="text-align: center; color: #ef4444;">状态加载失败</p>';
            }
        }

        function displayStatus(data) {
            const container = document.getElementById('monitorList');
            const config = currentConfig || {};
            if (!config.coins || config.coins.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: #6b7280;">暂无监控项目</p>';
                return;
            }
            let html = '';
            config.coins.forEach((coin, index) => {
                // 确保所有字段都有默认值
                const exchange = coin.exchange || 'Unknown';
                const symbol = coin.symbol || 'Unknown';
                const timeframe = coin.timeframe || '1h';
                const threshold = coin.threshold || 0;

                const state = data.states && data.states[symbol] ? data.states[symbol] : { status: 'normal' };
                const statusClass = state.status === 'alert' ? '#ef4444' : state.status === 'normal' ? '#10b981' : '#f59e0b';
                const statusText = state.status === 'alert' ? '警报' : state.status === 'normal' ? '正常' : '冷却中';
                html += '<div class="monitor-item">' +
                        '<div class="monitor-info">' +
                            '<strong>' + exchange + ' - ' + symbol + '</strong> ' +
                            '<span class="timeframe">(' + timeframe + ')</span>' +
                            '<br>' +
                            '<small>阈值: ' + threshold + '% | 状态: </small>' +
                            '<span style="color: ' + statusClass + '; font-weight: bold;">' + statusText + '</span>' +
                            (state.last_rate ? ' | 当前: ' + state.last_rate + '%' : '') +
                        '</div>' +
                        '<div class="monitor-actions">' +
                            '<button onclick="removeMonitor(' + index + ')" class="remove-btn">删除</button>' +
                        '</div>' +
                    '</div>';
            });
            container.innerHTML = html;
        }

        
        function removeMonitor(index) {
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
    </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600', // 缓存1小时
    },
  });
}

/**
 * API: 获取配置
 */
async function getConfig(env) {
  try {
    const config = await getUserConfig(env);
    return new Response(JSON.stringify(config || {}), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

/**
 * API: 保存配置
 */
async function saveConfig(request, env) {
  try {
    const config = await request.json();
    await env.CONFIG_KV.put('user_settings', JSON.stringify(config));

    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

/**
 * API: 获取状态
 */
async function getStatus(env) {
  try {
    const config = await getUserConfig(env);
    const states = {};

    if (config && config.coins) {
      for (const coin of config.coins) {
        states[coin.symbol] = await getCoinState(env, coin.symbol);
      }
    }

    return new Response(JSON.stringify({ states }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

/**
 * API: 获取邮件发送历史
 */
async function getEmailHistory(env) {
  try {
    const list = await env.STATE_KV.list({ prefix: 'email_history_' });
    const history = [];

    for (const key of list.keys.slice(-20)) { // 最近20条
      const record = await env.STATE_KV.get(key.name);
      if (record) {
        history.push(JSON.parse(record));
      }
    }

    return new Response(JSON.stringify({ history }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}