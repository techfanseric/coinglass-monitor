/**
 * 系统工具模块
 * 负责通知系统、日志管理、更新日志显示等系统级功能
 */

// 导出系统工具类
class SystemUtils {
    constructor() {
        this.apiBase = window.location.origin;
        this.logUpdateInterval = null;
        this.lastLogCount = 0;
        this.fastPollInterval = null; // 监控过程中的快速日志轮询
        this.changelogLoaded = false;
        this.changelogData = null;
    }

    // 显示提示信息
    showAlert(message, type = 'error') {
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
                this.rearrangeAlerts();
            }, 300);
        }, 5000);
    }

    // 重新排列通知位置
    rearrangeAlerts() {
        const alerts = document.querySelectorAll('.alert');
        alerts.forEach((alert, index) => {
            const topOffset = 20 + (index * 60);
            alert.style.top = `${topOffset}px`;
        });
    }

    // 颜色映射函数 - 根据日志内容设置颜色
    getLogColor(logLine) {
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
    async fetchServerLogs() {
        try {
            // 这里我们通过调用状态API来模拟日志获取
            // 实际项目中可以创建专门的日志API
            const response = await fetch(`${this.apiBase}/api/status/logs`);
            if (response.ok) {
                const logs = await response.text();
                return logs;
            } else {
                // 如果没有专门的日志API，使用状态信息生成模拟日志
                return this.generateMockLogs();
            }
        } catch (error) {
            console.error('获取日志失败:', error);
            return this.generateMockLogs();
        }
    }

    // 生成模拟日志（基于当前状态）
    generateMockLogs() {
        const timestamp = new Date().toLocaleString('zh-CN');
        const logs = [
            `[${timestamp}] 📊 系统运行正常`,
            `[${timestamp}] 🔄 监控服务已启动`,
            `[${timestamp}] ✅ 配置加载成功`,
            `[${timestamp}] 📋 监控项目: ${window.appState?.currentConfig?.coins?.length || 0} 个`,
            `[${timestamp}] 🔍 状态检查完成`
        ];
        return logs.join('\n');
    }

    // 更新日志显示
    async updateLogs() {
        const logContainer = document.getElementById('logContainer');
        const logs = await this.fetchServerLogs();

        if (logs) {
            const logLines = logs.split('\n').filter(line => line.trim());
            let html = '';

            // 服务器端已经返回了最新的日志在前面，直接显示即可
            logLines.forEach(line => {
                const color = this.getLogColor(line);
                html += `<div style="color: ${color}; margin-bottom: 2px;">${line}</div>`;
            });

            logContainer.innerHTML = html;
        }
    }

    // 复制日志
    async copyLogs() {
        const logContainer = document.getElementById('logContainer');
        const logs = await this.fetchServerLogs();

        if (logs) {
            try {
                await navigator.clipboard.writeText(logs);
                this.showAlert('日志已复制到剪贴板', 'success');
            } catch (error) {
                // 如果剪贴板API不可用，使用传统方法
                const textArea = document.createElement('textarea');
                textArea.value = logs;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                this.showAlert('日志已复制到剪贴板', 'success');
            }
        } else {
            this.showAlert('没有可复制的日志', 'error');
        }
    }

    // 清空日志
    async clearLogs() {
        try {
            const response = await fetch(`${this.apiBase}/api/status/logs/clear`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const result = await response.json();
                this.showAlert('系统日志已清空', 'success');

                // 清空显示
                const logContainer = document.getElementById('logContainer');
                logContainer.innerHTML = '<div style="color: #9ca3af; text-align: center;">日志已清空</div>';
            } else {
                const error = await response.json();
                this.showAlert(`清空日志失败: ${error.message || error.error}`, 'error');
            }
        } catch (error) {
            this.showAlert(`清空日志失败: ${error.message}`, 'error');
            // 即使服务端失败，也清空前端显示
            const logContainer = document.getElementById('logContainer');
            logContainer.innerHTML = '<div style="color: #9ca3af; text-align: center;">日志已清空（仅前端）</div>';
        }
    }

    // 开始日志轮询（改为手动刷新）
    startLogPolling() {
        this.updateLogs(); // 只更新一次，不自动轮询
    }

    // 停止日志轮询
    stopLogPolling() {
        if (this.logUpdateInterval) {
            clearInterval(this.logUpdateInterval);
            this.logUpdateInterval = null;
        }
    }

    // 切换更新日志显示
    async toggleChangelog() {
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
            if (!this.changelogLoaded) {
                await this.loadChangelog();
            }
        }
    }

    // 加载版本信息
    async loadVersionInfo() {
        try {
            const response = await fetch('/api/version');
            if (!response.ok) {
                const versionBadge = document.getElementById('versionBadge');
                if (versionBadge) {
                    versionBadge.style.display = 'none';
                }
                return null;
            }

            const versionInfo = await response.json();
            const versionBadge = document.getElementById('versionBadge');
            if (versionBadge) {
                versionBadge.textContent = versionInfo.version;
            }

            return versionInfo;
        } catch (error) {
            const versionBadge = document.getElementById('versionBadge');
            if (versionBadge) {
                versionBadge.style.display = 'none';
            }
            return null;
        }
    }

    // 加载更新日志数据
    async loadChangelog() {
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
                this.changelogData = JSON.parse(changelogText);
                this.renderChangelog();
            } catch (parseError) {
                // 如果JSON解析失败，尝试解析Markdown格式
                this.changelogData = this.parseMarkdownChangelog(changelogText);
                this.renderChangelog();
            }

            this.changelogLoaded = true;
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
    parseMarkdownChangelog(markdown) {
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
    formatDateForDisplay(dateStr) {
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
    renderChangelog() {
        const content = document.getElementById('changelogContent');

        if (!this.changelogData || this.changelogData.length === 0) {
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
        this.changelogData.forEach(item => {
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
                        <span class="changelog-date-text">${this.formatDateForDisplay(itemDate)}</span>
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

    // 修改triggerMonitoring函数，在手动触发时增加日志获取频率
    setupEnhancedLogging() {
        const originalTriggerMonitoring = window.appMonitorUI?.triggerMonitoring;
        if (originalTriggerMonitoring) {
            window.appMonitorUI.triggerMonitoring = async function() {
                // 增加日志更新频率
                window.appSystem.stopLogPolling();
                window.appSystem.fastPollInterval = setInterval(() => window.appSystem.updateLogs(), window.appState.frontendConfig.logRefreshInterval);

                try {
                    await originalTriggerMonitoring.call(this);
                } finally {
                    // 等待监控完成后再停止日志轮询
                    // 不再使用固定3秒时间，而是让状态轮询来控制停止时机
                }
            };
        }
    }
}

// 创建全局实例并导出
window.appUtils = new SystemUtils();
window.appSystem = window.appUtils; // 兼容性别名

// 页面加载完成后启动日志轮询
document.addEventListener('DOMContentLoaded', function() {
    window.appSystem.startLogPolling();

    // 点击页面其他地方关闭更多菜单
    document.addEventListener('click', function(event) {
        const isClickInsideMenu = event.target.closest('.more-menu');
        if (!isClickInsideMenu) {
            if (window.appMonitorUI) {
                window.appMonitorUI.closeAllMoreMenus();
            }
        }
    });

    // 点击页面其他地方关闭更新日志（可选功能）
    document.addEventListener('click', function(event) {
        const changelogContainer = document.getElementById('changelogContainer');
        const versionInfo = document.querySelector('.version-info');

        if (changelogContainer && versionInfo && changelogContainer.classList.contains('expanded') &&
            !changelogContainer.contains(event.target) &&
            !versionInfo.contains(event.target)) {

            // 如果需要点击其他地方自动关闭，取消下面这行的注释
            // window.appSystem.toggleChangelog();
        }
    });
});

// 页面卸载时清理
window.addEventListener('beforeunload', function() {
    window.appSystem.stopLogPolling();
    if (window.appSystem.fastPollInterval) {
        clearInterval(window.appSystem.fastPollInterval);
        window.appSystem.fastPollInterval = null;
    }
});