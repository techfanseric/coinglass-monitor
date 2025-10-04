# Cloudflare Dashboard 设置指南

## 📋 前置信息
- **账号 ID**: `acaba0e593f76d3a1962b9169dfc51fc`
- **项目名称**: `coinglass-monitor`

## 🎯 创建 KV 命名空间

### 步骤 1: 进入 Workers & Pages
1. 在 Cloudflare Dashboard 左侧菜单中
2. 点击 **Workers & Pages**

### 步骤 2: 创建第一个 KV 命名空间
1. 点击 **KV** 标签
2. 点击 **Create a namespace**
3. 填写信息：
   - **Variable name**: `CONFIG_KV`
   - **Description**: `配置存储`
4. 点击 **Add**

### 步骤 3: 创建第二个 KV 命名空间
1. 再次点击 **Create a namespace**
2. 填写信息：
   - **Variable name**: `STATE_KV`
   - **Description**: `状态存储`
3. 点击 **Add**

### 步骤 4: 复制 KV ID
创建完成后，你会看到类似这样的 ID：
```
CONFIG_KV ID: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
STATE_KV ID: b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7
```
把这些 ID 复制下来，等下要用到。

## 🚀 创建 Worker

### 步骤 1: 创建 Worker
1. 在 Workers & Pages 页面
2. 点击 **Create Application**
3. 选择 **Workers**
4. 点击 **Deploy**

### 步骤 2: 配置 Worker
1. 点击 **Edit code**
2. 复制 `src/index.js` 的内容粘贴进去
3. 点击 **Save and Deploy**

### 步骤 3: 绑定 KV 命名空间
1. 在 Worker 页面，点击 **Settings**
2. 点击 **Variables**
3. 在 **KV namespace bindings** 部分：
   - **Variable name**: `CONFIG_KV`
   - **KV namespace**: 选择你创建的 CONFIG_KV
   - 点击 **Add binding**

4. 再次添加：
   - **Variable name**: `STATE_KV`
   - **KV namespace**: 选择你创建的 STATE_KV
   - 点击 **Add binding**

### 步骤 4: 设置定时任务
1. 在 **Settings** 页面，点击 **Triggers**
2. 在 **Cron Triggers** 部分：
   - **Cron**: `0 * * * *`
   - **Expression**: `0 * * * *` (每小时执行)
   - 点击 **Add trigger**

## ⚙️ 配置环境变量
在 **Settings** → **Variables** → **Environment variables** 中添加：

| Variable | Value |
|----------|-------|
| `ENVIRONMENT` | `production` |

## 📧 测试配置

### 添加测试配置
1. 点击 **KV** 标签
2. 点击 **CONFIG_KV**
3. 点击 **Add key**
4. **Key**: `user_settings`
5. **Value**: 复制以下内容：
```json
{
  "email": "your-email@example.com",
  "exchange": "binance",
  "coins": [
    {
      "symbol": "USDT",
      "threshold": 8.0,
      "enabled": true
    },
    {
      "symbol": "CFX",
      "threshold": 5.0,
      "enabled": true
    }
  ],
  "repeat_interval": 3,
  "notification_hours": {
    "start": "09:00",
    "end": "24:00",
    "enabled": true
  },
  "monitoring_enabled": true
}
```
6. 点击 **Add**

## 🧪 测试 Worker
1. 回到 Worker 页面
2. 点击 **Quick edit**
3. 在代码中添加测试函数，点击 **Save and Deploy**
4. 点击 **Trigger** → **Cron** 测试定时任务
5. 查看 **Logs** 确认运行正常

## ✅ 完成检查清单

- [ ] 创建了 CONFIG_KV 命名空间
- [ ] 创建了 STATE_KV 命名空间
- [ ] 创建了 Worker 并上传代码
- [ ] 绑定了 KV 命名空间到 Worker
- [ ] 设置了定时任务 (0 * * * *)
- [ ] 添加了环境变量
- [ ] 添加了测试配置
- [ ] 测试了 Worker 运行

## 🔍 访问你的 API
Worker 部署后，你可以通过以下 URL 访问：
```
https://coinglass-monitor.你的子域名.workers.dev/api/status
https://coinglass-monitor.你的子域名.workers.dev/api/config
```

## 📞 需要帮助？
如果遇到任何问题，请告诉我具体的错误信息或截图！