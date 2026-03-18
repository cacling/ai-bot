# 06 - 部署指南

## 0. 快速上手

适合有经验的开发者，5 步跑起来：

1. 安装 **Bun ≥ 1.1** + **Node.js ≥ 18**
2. 在 [https://cloud.siliconflow.cn](https://cloud.siliconflow.cn) 注册并获取 API Key（免费）
3. 创建 `backend/.env`，最简配置如下：

```bash
SILICONFLOW_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
SQLITE_PATH=./data/telecom.db

# 如需使用语音客服，还需要：
ZHIPU_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx
```

4. 在项目根目录执行：

```bash
# Windows
./win-start.sh
```

5. 浏览器访问 `http://localhost:5173`

---

## 1. 前置依赖

| 工具 | 用途 | 安装方式 |
|------|------|---------|
| **Bun** ≥ 1.1 | 后端运行时 | `curl -fsSL https://bun.sh/install \| bash` |
| **Node.js** ≥ 18 + **npm** | MCP Server、前端构建 | https://nodejs.org |
| **SiliconFlow 账号** | 获取 LLM API Key | https://cloud.siliconflow.cn |

验证安装：

```bash
bun --version
node --version
```

---

## 2. 环境变量配置

在 `backend/` 目录下创建 `.env` 文件：

```bash
# 数据库（SQLite，文件自动创建，无需手动初始化）
SQLITE_PATH=./data/telecom.db

# SiliconFlow LLM
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
SILICONFLOW_CHAT_MODEL=stepfun-ai/Step-3.5-Flash

# MCP Server 端点（有默认值，可选。5 个 MCP Server 端口 18003-18007）
# 端口分配由 start.sh 自动管理，无需手动配置

# Skills 目录（相对 backend/，有默认值）
SKILLS_DIR=./skills

# 服务端口（有默认值）
PORT=18472

# ── 语音客服（GLM-Realtime）──────────────────────────────────────
# 智谱 AI API Key（https://open.bigmodel.cn）
ZHIPU_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx

# GLM-Realtime 模型（可选，有默认值）
GLM_REALTIME_MODEL=glm-realtime-air
# GLM_REALTIME_URL=wss://open.bigmodel.cn/api/paas/v4/realtime

# 绕过系统代理（使用 Clash、Charles 等代理时必须加）
NO_PROXY=localhost,127.0.0.1,api.siliconflow.cn,open.bigmodel.cn
no_proxy=localhost,127.0.0.1,api.siliconflow.cn,open.bigmodel.cn
```

> `.env` 文件放在 `backend/` 目录下，与 `src/index.ts` 同级。
> 数据库文件（`data/telecom.db`）会在首次启动时自动创建，**无需手动初始化**。
> API Key 在 [https://cloud.siliconflow.cn](https://cloud.siliconflow.cn) 注册后免费获取。

---

## 3. 一键启动（推荐）

项目根目录提供 `start.sh` 一键完成所有初始化和启动：

```bash
cd /path/to/ai-bot

# 正常启动（保留用户数据）
./start.sh

# 重置启动（删除 DB + 清理旧版本快照 + 重新 seed）
./start.sh --reset
```

**`--reset` 模式：** 删除数据库文件 + 清理旧版本快照（仅保留最新 2 个） + 重新执行 seed。Seed 操作是幂等的：MCP 服务器使用 `onConflictDoNothing`，mock 规则自动补齐。

**start.sh 执行流程：**

```
1. 清理日志文件和残留端口进程
2. 检查 bun / node / npm 是否可用
3. [若 --reset] 删除 DB + 清理旧版本快照（保留最新 2 个）+ 重新 seed
4. 安装依赖
   ├── backend:         bun install --frozen-lockfile
   ├── mcp_servers/ts:  npm install
   └── frontend:        npm install
5. 初始化 SQLite 数据库 Schema（bunx drizzle-kit push）
6. 若数据库为空，自动写入初始数据（seed，幂等）
7. 启动服务（后台运行，日志写入 logs/）
   ├── 5 个 MCP Server（端口 18003-18007）
   ├── backend:     bun run --watch src/index.ts              →  :18472
   └── frontend:    npm run dev                               →  :5173
8. 健康检查 (curl http://localhost:18472/health)
9. 等待 Ctrl+C 停止所有服务
```

> **注意（macOS Homebrew / 非标准安装）**
> `start.sh` 默认寻找 `~/.bun/bin/bun` 和 `/opt/homebrew/opt/node@22/bin/node`。
> 如果你的 Node.js 不是通过 Homebrew 安装，请在运行前编辑 `start.sh` 开头的 `NODE=` 和 `NPM=` 变量，
> 或者直接用 `which node` / `which npm` 查出路径后替换。

**停止所有服务：**

```bash
./stop.sh
# 或直接 Ctrl+C（start.sh 会捕获信号并清理）
```

**端口说明：**

| 服务 | 端口 | 日志文件 | 说明 |
|------|------|---------|------|
| 后端 API + WS | `:18472` | `logs/backend.log` | HTTP REST + WS /ws/chat + /ws/agent + /ws/voice |
| user-info-service | `:18003` | `logs/mcp-user-info.log` | query_subscriber, query_bill, query_plans |
| business-service | `:18004` | `logs/mcp-business.log` | cancel_service, issue_invoice |
| diagnosis-service | `:18005` | `logs/mcp-diagnosis.log` | diagnose_network, diagnose_app |
| outbound-service | `:18006` | `logs/mcp-outbound.log` | record_call_result, send_followup_sms, create_callback_task, record_marketing_result |
| account-service | `:18007` | `logs/mcp-account.log` | verify_identity, check_account_balance, check_contracts, apply_service_suspension |
| 前端 Vite | `:5173` | `logs/frontend.log` | React UI（/chat 客户端 + /agent 坐席端） |

启动成功后浏览器访问 `http://localhost:5173/` 开始对话。

---

## 4. 手动分步启动

如需单独控制各服务，按以下顺序启动：

### 步骤一：初始化数据库

```bash
cd backend
bunx drizzle-kit push
```

首次运行自动创建 `sessions` 和 `messages` 表。若需写入初始数据：

```bash
bun run db:seed
```

### 步骤二：启动 5 个 MCP Server（终端 1-5 或后台）

```bash
cd backend/mcp_servers/ts
npm install          # 首次

# 分别启动 5 个 MCP Server（可在独立终端或后台运行）
node --import tsx/esm user-info-service.ts     # → :18003
node --import tsx/esm business-service.ts      # → :18004
node --import tsx/esm diagnosis-service.ts     # → :18005
node --import tsx/esm outbound-service.ts      # → :18006
node --import tsx/esm account-service.ts       # → :18007
```

### 步骤三：启动后端 API（终端 2）

```bash
cd backend
bun run --watch src/index.ts
# 输出：[INFO] [server] starting port=18472
```

### 步骤四：启动前端（终端 3）

```bash
cd frontend
npm install          # 首次
npm run dev
# 输出：Local: http://localhost:5173/
```

---

## 5. 目录结构与路径约定

```
ai-bot/
├── backend/
│   ├── .env                          # 环境变量（需手动创建）
│   ├── data/                         # SQLite 数据库文件（自动创建）
│   ├── src/
│   │   ├── index.ts                  # Hono 服务入口 → :18472
│   │   ├── engine/                   # LLM Agent 引擎
│   │   │   ├── runner.ts             # Agent 编排、工具调用
│   │   │   ├── llm.ts               # LLM 客户端配置
│   │   │   ├── skills.ts            # 工具定义、技能注册
│   │   │   └── *-system-prompt.md   # 系统提示词模板（5 个）
│   │   ├── chat/                    # 客户侧路由
│   │   │   ├── chat-ws.ts           # WS /ws/chat（客户侧持久连接）
│   │   │   ├── voice.ts             # WS /ws/voice（语音代理）
│   │   │   └── outbound.ts          # WS /ws/outbound（外呼语音）
│   │   ├── agent/                   # 坐席工作台
│   │   │   ├── chat/agent-ws.ts     # WS /ws/agent（坐席侧持久连接）
│   │   │   ├── card/                # 情感分析、转人工分析、合规
│   │   │   └── km/                  # 知识管理 + 技能管理
│   │   └── services/                # 共享服务
│   │       ├── session-bus.ts       # 会话事件总线（内存 pub/sub）
│   │       ├── logger.ts            # 统一日志
│   │       └── keyword-filter.ts    # 合规关键词过滤
│   ├── mcp_servers/ts/
│   │   └── telecom_service.ts        # Telecom MCP Server → :8003
│   └── skills/                       # SKILLS_DIR 指向此目录
│       ├── biz-skills/               # 业务技能
│       └── tech-skills/              # 技术技能
├── frontend/
│   └── src/
│       ├── chat/                     # 客户侧（VoiceChatPage 等）
│       ├── agent/                    # 坐席工作台（AgentWorkstationPage + cards/）
│       ├── km/                       # 知识 + 技能管理
│       └── shared/                   # 共享工具
├── tests/                            # 测试目录
│   ├── scripts/                      # 测试启动/停止/种子脚本
│   ├── e2e/                          # Playwright E2E 测试
│   └── unittest/                     # Bun 单元测试
├── logs/                             # 运行日志（start.sh 自动创建）
├── start.sh                          # 一键启动
└── stop.sh                           # 一键停止
```

---

## 6. 生产环境部署建议

| 项目 | 当前（原型） | 生产建议 |
|------|------------|---------|
| 数据库 | SQLite 本地文件 | 托管 PostgreSQL（RDS / Supabase） |
| MCP Server 数据 | 内存模拟 | 接入真实电信业务系统 |
| 通信加密 | HTTP 明文（localhost） | HTTPS + TLS，Nginx 反向代理 |
| MCP 认证 | 无 | 端点加 Bearer Token 校验 |
| 进程管理 | Shell 脚本 | PM2 / Docker Compose / Kubernetes |
| 模型服务 | SiliconFlow 单点 | 多模型降级 + 超时重试 |
| 日志 | 本地文件 | 集中日志平台（ELK / CloudWatch） |
| 监控 | 无 | Prometheus + Grafana，/health 端点 |

### Skills 热更新

Skills 文件为静态 Markdown，修改后**无需重启任何服务**，Agent 下次处理请求时自动加载最新版本：

1. 通过前端 Editor 页面在线编辑（`PUT /api/files/content`）
2. 或直接修改 `backend/skills/` 目录下的文件

---

## 7. 常见问题

### 7.1 MCP 请求返回错误 / 连接失败

**现象：** 后端日志显示 MCP 连接异常

**原因 1：** MCP Server 未启动
**解决：** 检查 5 个 MCP 端口是否在监听：`curl http://localhost:18003/mcp`（18003-18007）

**原因 2：** 系统代理拦截 localhost 请求
**解决：** 在 `.env` 中添加：
```bash
NO_PROXY=localhost,127.0.0.1,api.siliconflow.cn
no_proxy=localhost,127.0.0.1,api.siliconflow.cn
```

---

### 7.2 数据库连接失败

**现象：** 启动时报 `SQLITE_ERROR` 或 `no such table`

**解决：**
```bash
# 重新应用 Schema
cd backend && bunx drizzle-kit push

# 重新写入初始数据
bun run db:seed
```

---

### 7.3 前端请求 /api 返回 404

**现象：** 浏览器 Network 面板显示 `/api/chat` 404

**原因：** 后端服务未启动，Vite 代理无法转发
**解决：** 确认后端 `:18472` 正常运行：`curl http://localhost:8000/health`

---

### 7.4 LLM 响应超慢（>10s）

**原因：** 模型选择不当（如 `Pro/zai-org/GLM-5` TTFB ~7s）
**解决：** 换用更快的模型，推荐 `stepfun-ai/Step-3.5-Flash`（TTFB ~0.5s）：

```bash
# backend/.env
SILICONFLOW_CHAT_MODEL=stepfun-ai/Step-3.5-Flash
```

修改后重启后端服务即可生效。
