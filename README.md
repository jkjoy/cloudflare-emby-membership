# Emby 会员管理系统

一个部署在 Cloudflare Workers 上的 Emby 会员自助管理系统。系统提供用户注册登录、卡密兑换、会员有效期管理、Emby 账号自动激活、管理后台和到期自动禁用等能力。

## 功能特性

- **用户系统：** 支持注册、登录、退出和 Cookie Session 会话。
- **会员卡密：** 管理员可批量生成卡密，用户兑换后自动获得会员天数。
- **Emby 自动激活：** 用户开通会员后点击「激活账号」，系统通过 Emby API 自动创建账号、设置密码并绑定当前会员。
- **服务器线路展示：** 管理后台可配置多条 Emby 登录线路，用户激活后可直接查看。
- **管理后台：** 支持卡密管理、用户管理、手动加天、Emby 连接配置等。
- **到期处理：** Cloudflare Cron 定时检查过期会员，并通过 Emby API 禁用对应账号。
- **Telegram 私聊机器人：** 用户可通过 Bot 绑定账号、查询会员、兑换卡密、激活 Emby、查看线路和重置 Emby 密码。
- **单 Worker 部署：** 前端静态资源与 API 由同一个 Cloudflare Worker 提供服务。

## 技术栈

| 模块 | 技术 |
|------|------|
| 运行环境 | Cloudflare Workers |
| 数据库 | Cloudflare D1 |
| Session 存储 | Cloudflare KV |
| 前端 | 原生 HTML / CSS / JavaScript |
| 测试 | Vitest |
| 部署工具 | Wrangler |

## 项目结构

```text
.
├── frontend/                # 前端页面与静态资源
│   ├── admin.html           # 管理后台
│   ├── dashboard.html       # 会员中心
│   ├── login.html           # 登录/注册页
│   └── assets/app.js        # 通用前端 API 工具
├── migrations/              # D1 数据库迁移
│   └── 001_init.sql
├── src/                     # Worker 后端代码
│   ├── admin.js             # 管理后台 API
│   ├── auth.js              # 登录、注册、用户信息
│   ├── card.js              # 卡密生成、兑换、列表
│   ├── cron.js              # 到期会员定时任务
│   ├── db.js                # D1 数据库访问封装
│   ├── emby.js              # Emby API 集成
│   ├── index.js             # Worker 入口和路由
│   ├── middleware.js        # 鉴权和 Session 中间件
│   └── utils.js             # 通用工具
├── test/                    # Vitest 测试
├── package.json
└── wrangler.toml
```

## 环境要求

- Node.js 20 或更高版本
- npm
- Cloudflare 账号
- Wrangler CLI
- 一个可访问的 Emby 服务端
- Emby API Key

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 Cloudflare 资源

创建 D1 数据库：

```bash
npm run migrate:create
```

创建 KV Namespace：

```bash
npx wrangler kv namespace create SESSION_KV
```

然后把生成的 `database_id` 和 KV `id` 填入 `wrangler.toml`。

### 3. 应用数据库迁移

本地开发时：

```bash
npx wrangler d1 migrations apply emby-membership-db --local
```

生产环境：

```bash
npm run migrate:apply
```

### 4. 配置 Telegram Bot Secret（可选）

如果启用 Telegram 机器人，需要设置以下密钥：

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

部署后设置 Telegram Webhook：

```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://你的域名/api/telegram/webhook",
    "secret_token": "你的 TELEGRAM_WEBHOOK_SECRET",
    "allowed_updates": ["message", "callback_query"]
  }'
```

> Bot 设计为**仅私聊使用**，群组/频道消息会被拒绝，以避免泄露账号信息。

### 5. 启动本地开发服务

```bash
npm run dev
```

默认会启动 Wrangler 本地开发服务。打开终端输出中的本地地址即可访问。

### 6. 部署到 Cloudflare Workers

```bash
npm run deploy
```

部署后，Wrangler 会输出线上访问地址。

## 系统配置

登录管理员账号后，进入 **系统配置**，填写以下内容：

| 配置项 | 说明 | 示例 |
|--------|------|------|
| Emby 服务器地址 | Emby 服务端基础地址 | `https://emby.example.com` |
| API Key | Emby API Key | 在 Emby 后台生成 |
| 服务器线路 | 展示给用户的登录线路，每行一条 | `主线路|https://emby.example.com` |

服务器线路格式：

```text
主线路|https://emby.example.com
备用线路|https://backup.example.com
```

## 使用流程

### 用户流程

1. 用户注册并登录会员中心。
2. 输入管理员发放的卡密并兑换。
3. 兑换成功后获得会员有效期。
4. 点击「激活账号」。
5. 系统自动创建 Emby 账号并显示用户名、密码和服务器线路。
6. 用户保存登录信息后即可登录 Emby。

### Telegram Bot 流程

1. 用户登录网页会员中心。
2. 点击「生成 Telegram 绑定码」。
3. 在 Telegram 私聊机器人中发送绑定码，例如 `TG-ABC123`。
4. 绑定成功后可通过按钮执行：查询会员、兑换卡密、激活 Emby、查看线路、重置 Emby 密码。
5. 兑换卡密流程支持 `/cancel` 或「取消」按钮退出。

### 管理员流程

1. 登录管理员账号。
2. 进入管理后台。
3. 配置 Emby 服务器地址、API Key 和服务器线路。
4. 批量生成卡密并发放给用户。
5. 查看卡密使用状态、使用人和创建时间。
6. 必要时为用户手动增加会员天数。

## API 概览

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/auth/register` | POST | 注册用户 |
| `/api/auth/login` | POST | 登录用户 |
| `/api/auth/logout` | POST | 退出登录 |
| `/api/user/info` | GET | 获取当前用户信息 |
| `/api/member/status` | GET | 获取会员状态和历史记录 |
| `/api/card/redeem` | POST | 兑换卡密 |
| `/api/emby/create-account` | POST | 自动创建并绑定 Emby 账号 |
| `/api/emby/check-connection` | GET / POST | 检查 Emby 连接 |
| `/api/telegram/bind-code` | POST | 登录用户生成 Telegram 绑定码 |
| `/api/telegram/webhook` | POST | Telegram Bot Webhook |
| `/api/admin/card/generate` | POST | 管理员生成卡密 |
| `/api/admin/card/list` | GET | 管理员查看卡密列表 |
| `/api/admin/user/list` | GET | 管理员查看用户列表 |
| `/api/admin/user/grant` | POST | 管理员手动加天 |
| `/api/admin/config` | GET / POST | 获取或保存系统配置 |

## 测试

运行完整测试：

```bash
npm test
```

当前测试覆盖：

- 项目初始化和文件完整性
- 通用工具函数
- Emby 自动激活流程
- 管理后台卡密列表字段
- 管理员前后台跳转逻辑
- 前端激活账号页面行为

## 定时任务

`wrangler.toml` 中配置了 Cron：

```toml
[triggers]
crons = ["0 2 * * *"]
```

系统每天执行一次过期检查：

1. 查询已过期且绑定了 Emby 账号的会员。
2. 调用 Emby API 禁用对应用户。
3. 写入 `cron_last_run` 配置项记录执行时间。

## 注意事项

- Emby 密码只在激活成功后显示一次，请提醒用户立即保存。
- Emby API Key 拥有较高权限，请不要公开提交到仓库。
- 如果管理员从后台点击「返回前台」，系统会停留在会员中心，不会自动跳回后台。
- 如果用户会员到期，定时任务会自动禁用对应 Emby 账号。

## 常用命令

```bash
# 安装依赖
npm install

# 本地开发
npm run dev

# 运行测试
npm test

# 创建 D1 数据库
npm run migrate:create

# 应用 D1 迁移
npm run migrate:apply

# 部署 Worker
npm run deploy
```

## 许可证

本项目基于 [MIT License](./LICENSE) 开源。
