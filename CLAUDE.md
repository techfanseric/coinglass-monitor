# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

这是一个基于 Cloudflare Workers 和 EmailJS 通知的 CoinGlass 利率监控系统。它监控加密货币借贷利率并在超过阈值时发送警报。

This is a CoinGlass interest rate monitoring system based on Cloudflare Workers and EmailJS notifications. It monitors cryptocurrency lending rates and sends alerts when thresholds are exceeded.

## Architecture

### Core Structure
- **src/index.js** - 主要 Worker 入口点，包含路由和定时任务处理，内嵌Web界面
- **src/modules/** - 核心业务逻辑模块：
  - `monitor.js` - 主要监控逻辑和阈值检查
  - `scraper.js` - CoinGlass 数据抓取和解析
  - `email.js` - EmailJS 集成用于通知
- **src/utils/** - 工具模块：
  - `config.js` - KV 存储操作和配置管理
  - `parser.js` - HTML 解析工具
- **tests/** - 测试文件：
  - `unit/` - 单元测试
  - `integration/` - 集成测试
  - `fixtures/` - 测试数据和mock对象
  - `setup.js` - 测试环境配置

### Key Components
- **多币种邮件模板**：使用EmailJS官方规范的多币种通知模板，支持条件渲染和数组循环
- **Hysteresis 通知系统**：通过智能冷却期防止垃圾邮件
- **两栏界面**：左侧栏用于监控管理，右侧栏用于通知设置（内嵌在 src/index.js 中）
- **动态 KV 存储**：使用两个 KV 命名空间（CONFIG_KV 用于用户设置， STATE_KV 用于监控状态）
- **多交易所支持**：可配置支持 Binance、OKX、Bybit 交易所
- **完整测试覆盖**：包含单元测试、集成测试和真实API测试
- **EmailJS 集成**：支持真实邮件发送，符合EmailJS官方规范

- **Multi-Coin Email Template**: EmailJS compliant multi-coin notification template with conditional rendering and array loops
- **Hysteresis Notification System**: Prevents spam through intelligent cooling periods
- **Two-column Interface**: Left column for monitoring management, right column for notification settings (embedded in src/index.js)
- **Dynamic KV Storage**: Uses two KV namespaces (CONFIG_KV for user settings, STATE_KV for monitoring state)
- **Multi-exchange Support**: Configurable support for Binance, OKX, Bybit exchanges
- **Complete Test Coverage**: Includes unit tests, integration tests, and real API testing
- **EmailJS Integration**: Real email sending with EmailJS official specification compliance

## Development Commands

### Local Development
```bash
npm run dev          # Start local development server (http://localhost:58477)
npm run tail         # View real-time Worker logs
wrangler tail        # Alternative method to view logs
```

### Testing
```bash
npm test             # Run all unit tests
npm run test:ui      # Run tests with UI interface
npm run test:coverage # Generate test coverage report
npm run test:watch   # Run tests in watch mode
node send-test-email.js  # Send test email to configured address
```

### Test Pages Access
```bash
http://localhost:58477         # Main monitoring interface with email testing functionality
```

### Deployment
```bash
npm run deploy           # Deploy to production environment
npm run deploy:dev       # Deploy to development environment
npm run deploy:preview    # Deploy to preview environment
./deploy-with-env.sh     # Deploy using environment variables
```

### KV Management
```bash
wrangler kv:namespace create "CONFIG_KV"      # Create configuration namespace
wrangler kv:namespace create "STATE_KV"       # Create state namespace
wrangler kv:key list --namespace-id=<id>      # List KV keys
wrangler kv:key get "user_settings" --namespace-id=<CONFIG_KV_ID>
wrangler kv:key put "user_settings" '{"test": "data"}' --namespace-id=<CONFIG_KV_ID>
```

## Important Implementation Details

### Environment Variables
The project uses environment variables for sensitive configuration:
- Copy `.env.example` to `.env` and fill in your EmailJS credentials
- Use `wrangler secret put` to set secrets for production (EMAILJS_PRIVATE_KEY, EMAILJS_PUBLIC_KEY, etc.)
- Never commit actual API keys to the repository

### Data Flow
1. **Scheduled Tasks**: Runs hourly via cron trigger, but monitoring logic checks trigger time conditions
2. **Trigger Check**: Checks if current time meets user-configured trigger conditions (hourly or daily trigger time)
3. **Configuration Retrieval**: Gets user settings from CONFIG_KV
4. **Data Scraping**: Scrapes CoinGlass data based on configured filters (exchange, coin, time range)
5. **Threshold Check**: Compares current rates with user-defined thresholds
6. **State Management**: Tracks monitoring state in STATE_KV to implement hysteresis
7. **Notification**: Sends emails via EmailJS when thresholds are triggered

### Notification Logic
- **First Trigger**: Rate > threshold → Immediate notification
- **Continuous Alert**: Repeat every 3-6 hours
- **Recovery Notification**: Rate ≤ threshold → Immediate recovery notification
- **Time Control**: Optional notification time window

### Web Interface Features
- **Add Monitoring**: Single-line form to create new monitoring rules, supports setting data granularity (hourly/24-hourly)
- **Monitoring List**: Displays active monitoring items, supports toggle and delete functions
- **Notification Settings**: Email configuration, repeat notification interval, trigger time settings and time control
- **Real-time Status**: Shows current status and latest rate data

## Configuration Structure

User configuration stored in KV:
```json
{
  "email": "user@example.com",
  "monitoring_enabled": true,
  "filters": {
    "exchange": "binance",
    "coin": "USDT",
    "timeframe": "1h"
  },
  "coins": [
    {
      "symbol": "USDT",
      "exchange": "binance",
      "timeframe": "1h",
      "threshold": 5.0,
      "enabled": true
    }
  ],
  "trigger_settings": {
    "hourly_minute": 0,
    "daily_hour": 9,
    "daily_minute": 0
  },
  "notification_hours": {
    "enabled": true,
    "start": "09:00",
    "end": "24:00"
  },
  "repeat_interval": 3
}
```

### Trigger Time Settings
- **Hourly Trigger Time**: 0-59, indicates which minute of each hour to trigger monitoring
- **24-hourly Trigger Time**: Format H:MM, indicates specific time each day to trigger monitoring
- System checks both trigger conditions simultaneously, triggers monitoring if either condition is met
- Cloudflare Workers scheduled task set to run hourly, trigger logic controlled in code

## API Endpoints
- `GET /api/config` - Get user configuration
- `POST /api/config` - Save user configuration
- `GET /api/status` - Get current monitoring status
- `GET /api/history` - Get email history

## Deployment Notes

### KV Namespace Setup
Project needs to create and configure two KV namespaces in `wrangler.toml`:
- **CONFIG_KV**: Stores user configuration and settings
- **STATE_KV**: Stores monitoring status and notification history

### EmailJS Integration
- Configure EmailJS service and template
- Set up public/private key authentication
- Template variables include current rate, threshold, historical data and all coin status

### Monitoring Schedule
- Default: Runs once per hour at 0 minutes (0 * * * *)
- Actual trigger time controlled by user's `trigger_settings`
- Supports both hourly and 24-hourly trigger modes
- Can modify base execution frequency in `[triggers]` section of `wrangler.toml`

### EmailJS Configuration
- **Service ID**: `service_njwa17p`
- **Template ID**: `template_2a6ntkh` (Multi-coin notification template)
- **Public Key**: `R2I8depNfmvcV7eTz` (used for both testing and production)
- **Template Features**:
  - Multi-coin support with array loops
  - Conditional rendering for status display
  - Historical data tables
  - Real-time status monitoring
- **EmailJS Compliance**: Follows official EmailJS specification with proper Handlebars syntax
- **Test interface**: `http://localhost:58477` provides EmailJS testing functionality

### Testing Architecture
- **Unit Testing**: Uses Vitest framework, coverage target 85%
- **Test Directory Structure**:
  - `tests/integration/` - Integration tests for email functionality
  - `tests/fixtures/` - Test data and mock objects
  - `tests/setup.js` - Test environment configuration
- **Mock Strategy**: KV storage simulation, EmailJS API mocking
- **Test Status**: All tests passing, email functionality 100% coverage