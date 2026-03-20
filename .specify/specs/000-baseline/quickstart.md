# 部署与开发指南

**功能**: 000-baseline | **日期**: 2026-03-19

> 本文档面向开发者，涵盖环境搭建、启动、调试、测试、验证和常见问题。
> 架构背景见 [plan.md](plan.md)，源码文件树见 [codebase-map.md](codebase-map.md)。

---

## 0. 快速上手

5 步跑起来：

1. 安装 **Bun ≥ 1.1** + **Node.js ≥ 18**
2. 在 [https://cloud.siliconflow.cn](https://cloud.siliconflow.cn) 注册并获取 API Key（免费）
3. 创建 `backend/.env`，最简配置：

```bash
SILICONFLOW_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
SQLITE_PATH=./data/telecom.db

# 如需使用语音客服：
ZHIPU_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx
```

4. 在项目根目录执行：

```bash
# macOS/Linux
./start.sh

# Windows
./win-start.sh
```

5. 浏览器访问 `http://localhost:5173`

---

## 1. 环境准备清单

> 逐项确认，全部打勾后即可启动。

- [ ] **Bun** ≥ 1.1 已安装 — `bun --version`
- [ ] **Node.js** ≥ 18 + npm 已安装 — `node --version && npm --version`
- [ ] **SiliconFlow 账号**已注册，API Key 已获取 — [https://cloud.siliconflow.cn](https://cloud.siliconflow.cn)
- [ ] （可选）**智谱 AI 账号**已注册，API Key 已获取（仅语音客服需要）— [https://open.bigmodel.cn](https://open.bigmodel.cn)
- [ ] `backend/.env` 文件已创建，至少包含 `SILICONFLOW_API_KEY` 和 `SQLITE_PATH`
- [ ] 端口 5173、18003-18007、18472 均未被占用 — `lsof -i :18472`
- [ ] （若使用代理）`.env` 中已添加 `NO_PROXY=localhost,127.0.0.1,api.siliconflow.cn,open.bigmodel.cn`

**中间件依赖：** 本项目**不依赖**任何外部中间件（无 Redis、无 MQ、无对象存储、无搜索引擎）。SQLite 为嵌入式数据库，DB 文件自动创建。

---

## 2. 环境变量配置

在 `backend/` 目录下创建 `.env` 文件：

```bash
# 数据库（SQLite，文件自动创建）
SQLITE_PATH=./data/telecom.db

# SiliconFlow LLM
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
SILICONFLOW_CHAT_MODEL=stepfun-ai/Step-3.5-Flash

# 服务端口（有默认值）
PORT=18472

# 语音客服（GLM-Realtime）
ZHIPU_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx
GLM_REALTIME_MODEL=glm-realtime-air

# 绕过系统代理（使用 Clash 等代理时必须加）
NO_PROXY=localhost,127.0.0.1,api.siliconflow.cn,open.bigmodel.cn
no_proxy=localhost,127.0.0.1,api.siliconflow.cn,open.bigmodel.cn
```

### 当前基线说明

- **认证**：当前仓库默认用于本地开发/演示。管理端 API 使用 `X-User-Id` 做轻量 RBAC；客户侧聊天和语音接口未接入正式生产认证
- **数据库**：`drizzle-kit push` 仅用于本地/演示环境快速同步 schema；生产环境应切换为 PostgreSQL + 版本化 migration
- **浏览器**：文字客服、坐席工作台、知识管理建议使用最新桌面版 Chromium；语音/外呼仅正式支持桌面版 Chromium 最近两个稳定版本
- **覆盖率目标**：团队目标为文件覆盖率 ≥ 90%，但当前仓库尚未在 CI 中强制设置覆盖率阈值

---

## 3. 一键启动（推荐）

```bash
cd /path/to/ai-bot

# 正常启动（保留用户数据）
./start.sh

# 重置启动（删除 DB + 清理旧版本快照 + 重新 seed）
./start.sh --reset
```

### 启动顺序

```
start.sh 执行流程：
  1. 清理日志文件和残留端口进程
  2. 检查 bun / node / npm 是否可用
  3. [若 --reset] 删除 DB + 清理旧版本快照 + 重新 seed
  4. 安装依赖
     ├── backend:       bun install --frozen-lockfile
     ├── mcp_servers:   npm install
     └── frontend:      npm install
  5. 初始化 SQLite Schema（本地开发使用 `bunx drizzle-kit push`）
  6. 若数据库为空，自动 seed
  7. 启动服务（依赖顺序：MCP → 后端 → 前端）
     ├── 5 个 MCP Server（:18003-18007）  ← 必须先启动，后端依赖
     ├── backend（:18472）                ← 启动后等待 MCP 可用，执行 warmup
     └── frontend（:5173）                ← 最后启动，代理 /api → :18472
  8. 健康检查（curl :18472/health）
  9. 等待 Ctrl+C → 清理所有子进程
```

**停止所有服务：**

```bash
./stop.sh
# 或直接 Ctrl+C（start.sh 会捕获信号并清理）
```

---

## 4. 端口说明

| 服务 | 端口 | 日志文件 | 运行时 |
|------|------|---------|--------|
| 后端 API + WS | :18472 | logs/backend.log | Bun |
| user-info-service | :18003 | logs/mcp-user-info.log | Node.js |
| business-service | :18004 | logs/mcp-business.log | Node.js |
| diagnosis-service | :18005 | logs/mcp-diagnosis.log | Node.js |
| outbound-service | :18006 | logs/mcp-outbound.log | Node.js |
| account-service | :18007 | logs/mcp-account.log | Node.js |
| 前端 Vite | :5173 | logs/frontend.log | Node.js |

---

## 5. 手动分步启动

```bash
# 步骤一：初始化数据库（仅本地/演示环境）
cd backend && bunx drizzle-kit push && bun run db:seed

# 步骤二：启动 5 个 MCP Server（各开一个终端或后台运行）
cd backend/mcp_servers/ts && npm install
node --import tsx/esm user_info_service.ts     # → :18003
node --import tsx/esm business_service.ts      # → :18004
node --import tsx/esm diagnosis_service.ts     # → :18005
node --import tsx/esm outbound_service.ts      # → :18006
node --import tsx/esm account_service.ts       # → :18007

# 步骤三：启动后端（等待 MCP 就绪后自动 warmup）
cd backend && bun run --watch src/index.ts

# 步骤四：启动前端
cd frontend && npm install && npm run dev
```

---

## 6. 本地调试

### 后端断点调试（Bun + VSCode）

```bash
# 以 debug 模式启动后端
cd backend && bun --inspect run src/index.ts
```

VSCode `launch.json` 配置：

```json
{
  "type": "bun",
  "request": "attach",
  "name": "Attach to Bun",
  "url": "ws://localhost:6499/",
  "stopOnEntry": false
}
```

> `bun run --watch` 模式也支持 `--inspect`，文件修改后自动重启并重新 attach。

### 前端调试

直接使用浏览器 DevTools。Vite 自动配置了 Source Map。

#### 通过 Playwright 自动捕获前端 console 日志

当无法手动打开浏览器 DevTools 时（如 CLI 环境、自动化排查），可以用项目已安装的 Playwright（Chromium 146）程序化捕获 console 日志：

```bash
# 在项目根目录执行
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 捕获所有 console 日志
  page.on('console', msg => console.log('[CONSOLE]', msg.type(), msg.text()));

  // 打开坐席工作台（/agent 路径）
  await page.goto('http://localhost:5173/agent', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // 导航到目标页面（示例：MCP 管理 → 点击工具 → 执行配置 Tab）
  await page.click('button:has-text(\"知识库\")');
  await page.waitForTimeout(500);
  await page.click('button:has-text(\"MCP管理\")');
  await page.waitForTimeout(1000);
  await page.locator('table tbody tr').first().click();
  await page.waitForTimeout(1000);
  await page.click('button:has-text(\"执行配置\")');
  await page.waitForTimeout(1000);

  // 截图保存
  await page.screenshot({ path: '/tmp/debug-screenshot.png' });
  console.log('Screenshot: /tmp/debug-screenshot.png');

  await browser.close();
})();
"
```

**使用场景**：
- 排查前端组件状态渲染异常（如 RadioGroup 受控值不生效）
- 验证 API 返回数据在前端的解析结果
- CI 环境中自动化前端回归检测

**技巧**：
- 在前端代码中临时加 `console.log('DEBUG', ...)` → Playwright 的 `page.on('console')` 自动捕获
- `page.screenshot()` 可以看到当前渲染状态，快速定位 UI 问题
- 客户端页面路径为 `/`，坐席工作台为 `/agent`
- Playwright 的 Chromium 版本与 Chrome 146 兼容，渲染行为一致

### WebSocket 调试

- 浏览器 DevTools → Network → WS 标签页可查看 /ws/chat、/ws/agent 的消息流
- 语音 WS（/ws/voice）的音频帧较多，建议用 `type` 字段过滤

### 日志查看

```bash
# 实时查看后端日志（JSON 格式）
tail -f logs/backend.log | jq .

# 过滤特定模块
tail -f logs/backend.log | jq 'select(.mod == "agent")'

# 查看 MCP Server 日志
tail -f logs/mcp-user-info.log

# 查看请求耗时
tail -f logs/backend.log | jq 'select(.msg == "generate_done") | {steps, llm_ms, total_ms}'
```

### 数据库查看

```bash
# Drizzle Studio（Web UI 查看/编辑数据）
cd backend && bunx drizzle-kit studio
# 浏览器打开 https://local.drizzle.studio
```

---

## 7. 测试数据

### 测试用户

seed 自动写入 3 个测试用户：

| 手机号 | 姓名 | 套餐 | 状态 | 用途 |
|--------|------|------|------|------|
| `13800000001` | 张三 | 畅享 50G（¥50/月） | active | 标准测试用户 |
| `13800000002` | 李四 | 无限流量（¥128/月） | active | 高套餐用户 |
| `13800000003` | 王五 | 基础 10G（¥19/月） | suspended（欠费） | 异常状态测试 |

### 外呼任务

6 个外呼任务（3 催收 + 3 营销），ID 为 C001-C003、M001-M003。

### 重置测试数据

```bash
# 方式一：一键重置
./start.sh --reset

# 方式二：手动重置（仅本地/演示环境）
cd backend && rm -f data/telecom.db && bunx drizzle-kit push && bun run db:seed

# 方式三：测试专用（保留服务运行）
bash tests/scripts/seed.sh
```

### 运行测试

```bash
# 后端单元测试（<1s）
cd backend && bun test ../tests/unittest/backend/

# 前端单元测试（~15s）
cd tests/unittest/frontend && npx vitest run

# 前端覆盖率报告（当前生成报告，但未在 CI 强制阈值）
cd tests/unittest/frontend && npx vitest run --coverage

# E2E 测试（需先启动服务，耗时较长）
bash tests/scripts/start.sh
cd tests/e2e && npx playwright test
bash tests/scripts/stop.sh

# E2E 有头模式（调试）
cd tests/e2e && npx playwright test --headed

# 查看 E2E HTML 报告
cd tests/e2e && npx playwright show-report
```

---

## 8. 快速验证清单

> 启动成功后，按以下顺序验证各功能是否正常。

| # | 验证项 | 方法 | 预期结果 |
|---|--------|------|---------|
| 1 | 健康检查 | `curl http://localhost:18472/health` | `{"status":"ok"}` |
| 2 | MCP 可用 | `curl http://localhost:18003/mcp` | HTTP 405（正常，不支持 GET） |
| 3 | 文字客服 | 浏览器 `http://localhost:5173`，发送"查话费" | 返回账单卡片 |
| 4 | 流程图 | 发送"网速很慢"，观察右侧 | 出现 Mermaid 流程图 + 黄/绿高亮 |
| 5 | 退订确认 | 发送"退订视频会员" | Agent 先确认再执行 |
| 6 | 坐席同步 | 新标签页打开 `/agent`，在 `/chat` 发消息 | 坐席实时收到 + 情感分析卡片 |
| 7 | 语音客服 | 打开 `/voice`，点击连接，说"查话费" | 语音回复账单信息 |
| 8 | 外呼 | 打开 `/outbound`，选择催收任务，点击连接 | 机器人自动说开场白 |
| 9 | 技能编辑 | 打开 `/km`，进入 bill-inquiry 编辑器 | 显示 SKILL.md 内容 + 文件树 |
| 10 | 版本管理 | 在编辑器中创建新版本 → 编辑 → 测试 | 沙箱测试返回结果 |

---

## 9. 生产环境部署建议

| 项目 | 当前（原型） | 生产建议 |
|------|------------|---------|
| 数据库 | SQLite 本地文件 | 托管 PostgreSQL |
| Schema 变更 | `drizzle-kit push` | 版本化 migration + rollback |
| MCP Server 数据 | 内存模拟 | 接入真实业务系统 |
| 通信加密 | HTTP 明文 | HTTPS + TLS |
| 认证 | `X-User-Id`（仅管理端/开发） | 统一认证网关 + Bearer Token/JWT |
| 进程管理 | Shell 脚本 | PM2 / Docker Compose / K8s |
| 日志 | 本地文件 | ELK / CloudWatch |

---

## 10. 常见问题（FAQ）

### MCP 连接失败

**现象：** 后端日志显示 `MCP connection failed` 或工具调用返回 500

**排查：**
```bash
# 检查 5 个 MCP 端口
for port in 18003 18004 18005 18006 18007; do
  curl -s -o /dev/null -w ":%{http_code}" http://localhost:$port/mcp
  echo " → :$port"
done
```

**原因 1：** MCP Server 未启动 → 先启动 MCP，再启动后端

**原因 2：** 系统代理拦截 localhost → `.env` 添加 `NO_PROXY=localhost,127.0.0.1`

### 端口冲突

**现象：** 启动时报 `EADDRINUSE`

```bash
# 查看占用端口的进程
lsof -i :18472
# 强制释放（谨慎）
./stop.sh
```

### 数据库错误

**现象：** `SQLITE_ERROR` 或 `no such table`

```bash
cd backend && bunx drizzle-kit push && bun run db:seed
```

**现象：** `database is locked`

SQLite WAL 模式下偶现。重启后端即可恢复。若频繁出现，检查是否有多个后端进程同时写入。

### LLM 响应超慢（>10s）

**原因：** 模型选择不当或 SiliconFlow 服务波动

```bash
# 切换更快的模型
# backend/.env
SILICONFLOW_CHAT_MODEL=stepfun-ai/Step-3.5-Flash
```

### GLM-Realtime 连接失败

**现象：** 语音页面连接后立即断开

**排查：**
- 检查 `ZHIPU_API_KEY` 是否正确
- 检查网络是否能访问 `wss://open.bigmodel.cn`
- 检查代理设置：`NO_PROXY` 需包含 `open.bigmodel.cn`

### 前端请求 /api 返回 404

**现象：** 浏览器 Network 面板显示 `/api/chat` 404

**原因：** 后端未启动，Vite 代理无法转发

```bash
# 确认后端运行
curl http://localhost:18472/health
```

### 权限不足（macOS）

**现象：** `start.sh: Permission denied`

```bash
chmod +x start.sh stop.sh win-start.sh win-stop.sh
```

### Bun/Node 路径不对

**现象：** `start.sh` 找不到 bun 或 node

`start.sh` 默认查找 `~/.bun/bin/bun` 和 `/opt/homebrew/opt/node@22/bin/node`。若安装路径不同：

```bash
# 查看实际路径
which bun && which node

# 编辑 start.sh 开头的 BUN= 和 NODE= 变量
```

### 前端热更新不生效

**现象：** 修改前端代码后浏览器不刷新

检查 `frontend/vite.config.ts` 中的 HMR 配置。某些 WSL/Docker 环境需要设置 `server.watch.usePolling: true`。
