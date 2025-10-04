# CoinGlass 利率监控提醒系统需求文档

## 项目概述
基于 CoinGlass 平台数据，开发一个自动化的币种借贷利率监控系统，当利率超过用户设定阈值时发送邮件通知。

## 核心功能需求

### 1. 数据获取功能
- **数据源**: CoinGlass 网站的借贷利率数据
- **目标页面**: https://www.coinglass.com/zh/pro/i/MarginFeeChart
- **数据内容**:
  - 交易所: Binance (可扩展)
  - 币种: USDT, CFX, IOST 等多种币种
  - 利率类型: 年利率、日利率、小时利率
  - 历史数据: 最近N次利率记录

### 2. 监控规则 (Hysteresis Notification)
- **触发条件**: 利率 > 用户设定阈值
- **通知策略**:
  ```
  首次触发 → 立即通知
  持续超阈值 → 3小时或6小时后重复通知
  利率回落 → 立即发送回落通知
  ```
- **状态管理**: NORMAL → ALERT → COOLDOWN 循环

### 3. 邮件通知功能
- **邮件服务**: EmailJS (service_45oyrnq, template_6udnzxt)
- **邮件标题格式**: "14点 | CFX-5%, IOST-8%"
- **邮件内容**:
  - 触发币种的当前状态
  - 每个币种最近5次历史数据表格
  - 所有监控币种的完整状态对比
  - 监控设置信息和下次检查时间

## 技术架构需求

### 1. 部署平台
- **主平台**: Cloudflare Workers (免费额度)
- **前端**: Cloudflare Pages (配置界面)
- **存储**: Cloudflare KV (配置和数据)
- **定时**: Cloudflare Cron Triggers

### 2. 系统组件
```
Cloudflare Pages (前端配置界面)
    ↓ (用户配置存储)
Cloudflare KV (配置数据)
    ↓ (定时触发)
Cloudflare Workers (监控逻辑)
    ├── 网页抓取 (CoinGlass)
    ├── DOM解析 (提取利率数据)
    ├── 阈值检查 (Hysteresis逻辑)
    └── 邮件发送 (EmailJS API)
```

### 3. 前端配置界面
- **配置项**:
  - 监控币种选择 (多选)
  - 阈值设置 (每个币种独立)
  - 重复通知间隔 (3小时/6小时)
  - 邮件接收地址
  - 监控开关

## 数据结构设计

### 1. 用户配置 (KV存储)
```json
{
  "user_settings": {
    "email": "user@example.com",
    "exchange": "binance",
    "coins": [
      {
        "symbol": "CFX",
        "threshold": 5.0,
        "enabled": true
      },
      {
        "symbol": "IOST",
        "threshold": 6.0,
        "enabled": true
      }
    ],
    "repeat_interval": 3, // 小时
    "monitoring_enabled": true
  }
}
```

### 2. 监控状态 (KV存储)
```json
{
  "coin_states": {
    "CFX": {
      "status": "alert", // normal/alert/cooldown
      "last_notification": "2025-10-04T14:00:00Z",
      "next_notification": "2025-10-04T17:00:00Z",
      "last_rate": 5.2
    }
  }
}
```

## 邮件模板需求

### 1. 触发通知邮件
- **标题**: "时间 | 币种1-利率1%, 币种2-利率2%"
- **内容模块**:
  - 警告头部信息
  - 触发币种详细列表 (含历史数据表格)
  - 所有币种状态对比表
  - 监控配置信息

### 2. 回落通知邮件
- **标题**: "时间 | 币种1-回落通知"
- **内容**: 币种利率已回落到阈值以下的信息

## 开发实施计划

### Phase 1: MVP版本 ⏳
- [ ] **1.1 基础环境搭建**
  - [ ] 创建 Cloudflare 账号和项目
  - [ ] 配置 KV 命名空间
  - [ ] 设置基础 Workers 脚本
  - [ ] 配置定时触发器 (每小时)

- [ ] **1.2 数据抓取模块**
  - [ ] 实现 CoinGlass 网页抓取逻辑
  - [ ] DOM 解析和数据提取
  - [ ] 数据格式化和验证
  - [ ] 错误处理和重试机制

- [ ] **1.3 核心监控逻辑**
  - [ ] 实现阈值检查算法
  - [ ] Hysteresis 状态机
  - [ ] 状态持久化 (KV存储)
  - [ ] 重复通知时间计算

- [ ] **1.4 邮件发送功能**
  - [ ] 集成 EmailJS SDK
  - [ ] 邮件模板参数映射
  - [ ] 发送失败处理
  - [ ] 基础邮件内容

- [ ] **1.5 测试和部署**
  - [ ] 本地测试环境
  - [ ] Cloudflare Workers 部署
  - [ ] 端到端测试
  - [ ] 监控和日志配置

### Phase 2: 完整版本 📋
- [ ] **2.1 前端配置界面**
  - [ ] Cloudflare Pages 项目创建
  - [ ] 响应式设计界面
  - [ ] 配置表单和验证
  - [ ] 用户体验优化

- [ ] **2.2 API 接口开发**
  - [ ] 配置管理 API (GET/POST)
  - [ ] 状态查询 API
  - [ ] 历史数据 API
  - [ ] API 认证和安全

- [ ] **2.3 多币种支持**
  - [ ] 动态币种配置
  - [ ] 批量数据处理
  - [ ] 币种状态独立管理
  - [ ] 配置导入/导出

- [ ] **2.4 高级功能**
  - [ ] 监控统计面板
  - [ ] 邮件发送历史
  - [ ] 系统健康检查
  - [ ] 配置备份和恢复

### Phase 3: 增强版本 🔮
- [ ] **3.1 数据分析功能**
  - [ ] 利率趋势分析
  - [ ] 历史数据图表
  - [ ] 统计报告生成
  - [ ] 数据导出功能

- [ ] **3.2 高级监控特性**
  - [ ] 多交易所支持
  - [ ] 智能阈值建议
  - [ ] 异常检测算法
  - [ ] 自定义通知规则

- [ ] **3.3 系统优化**
  - [ ] 性能优化
  - [ ] 错误恢复机制
  - [ ] 详细日志记录
  - [ ] 监控告警系统

- [ ] **3.4 用户体验**
  - [ ] 移动端适配
  - [ ] 推送通知支持
  - [ ] 多语言支持
  - [ ] 帮助文档

## 技术实现细节

### 1. Cloudflare Workers 核心代码结构
```javascript
// main.js
export default {
  async scheduled(event, env, ctx) {
    // 定时任务入口
    await runMonitoring(env);
  },

  async fetch(request, env, ctx) {
    // API 请求处理
    return handleAPI(request, env);
  }
};
```

### 2. 邮件模板变量
```javascript
const emailTemplateVars = {
  // 触发通知
  alert_email: {
    title: "{{time}} | {{triggered_coins}}",
    content: {
      exchange_name: "Binance",
      detection_time: "2025-10-04 14:00",
      triggered_coins: [
        {
          symbol: "CFX",
          current_rate: "5.0%",
          threshold: "4.0%",
          history: [/* 最近5次数据 */]
        }
      ]
    }
  },

  // 回落通知
  recovery_email: {
    title: "{{time}} | {{coin_symbol}}-回落通知",
    content: {
      coin_symbol: "CFX",
      recovery_time: "2025-10-04 16:30",
      current_rate: "3.8%",
      threshold: "4.0%"
    }
  }
};
```

### 3. 状态机实现
```javascript
const NotificationStateMachine = {
  NORMAL: {
    onRateAboveThreshold: (coin, rate) => {
      sendAlert(coin, rate);
      updateCoinState(coin, 'ALERT', {
        last_notification: now(),
        next_notification: now() + 3h,
        last_rate: rate
      });
    }
  },

  ALERT: {
    onRateAboveThreshold: (coin, rate) => {
      updateCoinState(coin, 'COOLDOWN', {
        next_notification: now() + 3h
      });
    },

    onRateBelowThreshold: (coin, rate) => {
      sendRecovery(coin, rate);
      updateCoinState(coin, 'NORMAL', { last_rate: rate });
    }
  },

  COOLDOWN: {
    onCooldownEnd: (coin, rate) => {
      if (rate > threshold) {
        sendRepeatAlert(coin, rate);
        updateCoinState(coin, 'ALERT', {
          last_notification: now(),
          next_notification: now() + 3h,
          last_rate: rate
        });
      }
    }
  }
};
```

## 成本评估

### 月度成本估算
- **Cloudflare Workers**: 免费 (100,000 请求/天)
- **Cloudflare KV**: 免费 (100,000 读取/天, 1,000 写入/天)
- **Cloudflare Pages**: 免费 (无限带宽)
- **EmailJS**:
  - 免费版: 200份/月
  - 付费版: $9/月 (无限制)
- **总计**: $0-9/月

## 风险与限制

### 技术风险
1. **数据源稳定性**: CoinGlass 网站结构变化
2. **反爬虫机制**: IP限制或验证码
3. **邮件服务依赖**: EmailJS 服务可用性
4. **定时精度**: Cloudflare Workers 执行时间限制

### 业务风险
1. **数据准确性**: 网站数据延迟或错误
2. **通知延迟**: 网络或处理延迟
3. **用户配置**: 错误配置导致漏报或误报
4. **服务成本**: 超出免费额度

### 缓解措施
1. **多重数据源**: 备用数据获取方案
2. **错误监控**: 完善的日志和告警
3. **配置验证**: 前端和后端双重验证
4. **成本监控**: 定期检查使用量

## 部署清单

### Cloudflare 配置
- [ ] Workers 脚本部署
- [ ] KV 命名空间创建
- [ ] Cron Triggers 配置
- [ ] 域名和路由设置
- [ ] 环境变量配置

### EmailJS 配置
- [ ] 服务 ID 配置
- [ ] 邮件模板设置
- [ ] 变量映射验证
- [ ] 测试邮件发送

### 监控和运维
- [ ] 日志收集配置
- [ ] 错误告警设置
- [ ] 性能监控
- [ ] 备份策略

---

**项目状态**: 📋 规划阶段
**下一步**: 开始 Phase 1 MVP 开发
**负责人**: 开发者