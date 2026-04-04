# Temporal Orchestrator 实施计划

> 基于 [Temporal Orchestrator 持久化流程编排设计](2026-04-04-temporal-orchestrator-durable-workflow-design.md)，制定一版分阶段、可灰度、可回退的实施计划。目标不是一次性把 11 个 Workflow 全做完，而是先让基础设施跑通，再把收益最大的链路优先落地。

**Date**: 2026-04-04
**Status**: Draft
**Positioning**: Implementation Plan

**Related Design**:
- [Temporal Orchestrator 持久化流程编排设计](2026-04-04-temporal-orchestrator-durable-workflow-design.md)
- [四 Agent 最小实施计划](2026-04-03-four-agent-minimal-implementation-plan.md)
- [人工工作台与恢复协议](2026-04-03-human-support-agent-workstation-and-resume-protocol.md)

**Related Current Code**:
- `backend/src/chat/outbound.ts` — 外呼 WS 入口（L188 建链, L248 triggerHandoff）
- `outbound_service/src/routes/tasks.ts` — 外呼任务 CRUD + callback 创建（L43）
- `outbound_service/src/routes/results.ts` — 结果落表（L9 call-results, L88 handoff-cases）
- `outbound_service/src/routes/index.ts` — 路由注册（campaigns/tasks/results/test-personas）
- `work_order_service/src/services/appointment-service.ts` — 预约服务
- `backend/src/services/work-order-client.ts` — 工单 HTTP 客户端（L33-166）
- `backend/src/services/km-client.ts` — KM HTTP 客户端
- `km_service/src/routes/documents.ts` — 文档解析入口（L174 POST /versions/:vid/parse）
- `km_service/src/routes/tasks.ts` — 治理任务 CRUD（L13 GET, L30 POST, L47 PUT）
- `wfm_service/src/routes/plans.ts` — 排班计划（L81 generate, L195 validate, L224 publish）
- `wfm_service/src/services/scheduler.ts` — 排班算法（L62 generateSchedule）
- `packages/shared-db/src/schema/outbound.ts` — ob_callback_tasks（L112）
- `packages/shared-db/src/schema/km.ts` — km_pipeline_jobs（L51）、km_governance_tasks（L187）、km_regression_windows（L204）
- `start.sh` — 服务启动脚本（L369-443）
- `package.json` — 根 workspaces 配置（L4-19）

---

## 1. 结论先行

> 先跑通基础设施，再按"回访/人工 → 外呼 → 知识 → 排班 → 热点挖掘"的顺序上。

6 个阶段：

| 阶段 | 内容 | 核心收益 |
|------|------|---------|
| `P0` | 基础设施：workspace + Temporal Server + Worker + API 骨架 | 能跑 |
| `P1` | CallbackWorkflow + HumanHandoffWorkflow | 回拨精确唤醒，人工介入有正式状态机 |
| `P2` | OutboundTaskWorkflow | 外呼重试/时段/DND/转人工全收口 |
| `P3` | KmRefreshWorkflow + KmDocumentPipelineWorkflow + PolicyExpiryReminderWorkflow | 知识治理从"扫表"变"有状态流水线" |
| `P4` | DailyScheduleWorkflow + SchedulePublishWorkflow | 排班自动生成/校验/发布/通知 |
| `P5` | HotIssueMiningWorkflow + QaFlowSuggestionWorkflow + AutoTestRegressionWorkflow | 治理飞轮闭环 |

---

## 2. 实施原则

### 2.1 先控制面，不先拆服务

Temporal 是"外层长流程编排器"，现有 Bun 服务继续做事实层。不替代 `outbound_service / km_service / work_order_service / wfm_service` 的业务写模型。

### 2.2 每阶段可灰度、可回退

- P0-P2 期间，现有链路不受影响
- Temporal API 调用失败时，现有服务可降级为"不发 Signal，仅落表"
- 每个 Workflow 上线前先 shadow 运行，不控制实际业务动作

### 2.3 Activity 全走 HTTP

Workflow 不直接碰业务库。Activity 通过 HTTP 调现有服务的 API，保持事实源不变。

### 2.4 Workflow ID = 业务 ID

外部系统可直接拿业务 ID 做 `signalWithStart` 或 `getHandle`，不用查映射。

### 2.5 Workflow 变更必须向后兼容

修改已上线 Workflow 的控制流时，必须使用 Temporal `patched()` API 做版本控制。直接改 Workflow 逻辑会导致正在运行的 Workflow replay 失败（non-determinism error）。

```typescript
// 示例：OutboundTaskWorkflow 新增一个结果分支
import { patched } from '@temporalio/workflow';

if (patched('add-voicemail-branch')) {
  // 新逻辑：voicemail 走独立处理
} else {
  // 旧逻辑：voicemail 和 no_answer 走同一分支
}
```

如果变更过大无法 patch，用新 Workflow type（如 `outboundTaskWorkflowV2`）+ 新旧并行 + 逐步切换。旧 Workflow 自然结束后再下线旧版本。

### 2.6 按业务域隔离 Task Queue

不要所有 Workflow 共用一个 Task Queue。按业务域拆分，使不同类型的 Workflow 可以独立扩缩容：

| Task Queue | Workflow | 特征 |
|-----------|----------|------|
| `outbound` | OutboundTaskWorkflow, CallbackWorkflow, HumanHandoffWorkflow | 白天高峰，需独立扩 Worker |
| `km` | KmRefreshWorkflow, KmDocumentPipelineWorkflow, PolicyExpiryReminderWorkflow | 夜间批量，不争白天资源 |
| `wfm` | DailyScheduleWorkflow, SchedulePublishWorkflow | 每天一次，轻量 |
| `analytics` | HotIssueMiningWorkflow, QaFlowSuggestionWorkflow, AutoTestRegressionWorkflow | 计算密集，可独立扩 |

P0 阶段先用一个 Worker 进程注册所有 queue（对每个 queue 创建一个 `Worker` 实例，在 `main.ts` 中并行 `run()`）。后续需要时才拆成独立进程/机器。

### 2.7 Activity 目标端点必须幂等

Temporal 会重试 Activity，所以 Activity 调用的**每一个写操作 API 都必须幂等**。两种方案：

- **方案 A（推荐）**：请求带 `idempotencyKey` 参数，服务端用 unique 约束去重。已存在时返回 200 + 已有记录，而非 400 或重复创建。
- **方案 B**：业务语义幂等——插入前检查是否已存在同业务键的记录。

需要改造的端点（P1 前必须完成）：

| 服务 | 端点 | 当前问题 | 改造方式 |
|------|------|---------|---------|
| `outbound_service` | `POST /tasks/callbacks` (L43) | `task_id` 用 `Date.now()` 生成，重复调用创建多条 | 接受外部传入 `task_id`，加 UNIQUE 约束，已存在返回 200 |
| `outbound_service` | `POST /results/call-results` (L9) | 无去重 | 加 `(task_id, call_attempt)` 唯一约束 |
| `outbound_service` | `POST /results/handoff-cases` (L88) | 无去重 | 加 `(task_id, session_id)` 或 `idempotencyKey` 唯一约束 |
| `km_service` | `POST /versions/:vid/parse` (L174) | 重复调用创建多组 jobs | 检查是否已有 pending/running jobs，有则返回已有 |
| `wfm_service` | `POST /plans/:id/generate` (L81) | 重复调用可产生重复条目 | 检查 `plan.status`，已 generated/published 则返回 200 + 现有结果 |
| `wfm_service` | `POST /plans/:id/publish` (L224) | 已发布返回 400 | 改为返回 200 + 当前版本（透明幂等） |

### 2.8 Scope 排除

P1-P5 期间以下服务**不在 Temporal 改造范围内**：

| 服务 | 理由 | 未来扩展点 |
|------|------|-----------|
| `interaction_platform` | HumanHandoffWorkflow P1 只覆盖外呼渠道，不走队列路由 | 多渠道 handoff 上线后，坐席分配需走 `/api/routing` |
| `channel_host` | 外呼通过 backend WS 发起，短信通过 notify Activity mock | 正式短信/外呼通道可能需走 `/api/outbound/send` |
| `cdp_service` | 当前无 Workflow 需要客户画像数据 | 未来外呼前查客户画像可走 CDP |

---

## 3. `P0`：基础设施

### 目标

让 `temporal_orchestrator` 能启动 Worker、连接 Temporal Server、暴露 API，并注册到 `start.sh`。

### 3.1 新建 workspace

**新建文件**：

| 文件 | 说明 |
|------|------|
| `temporal_orchestrator/package.json` | Node.js 项目，依赖 `@temporalio/client` + `@temporalio/worker` + `@temporalio/workflow` + `@temporalio/testing` + `hono` + `@hono/node-server` + `vitest` |
| `temporal_orchestrator/tsconfig.json` | extends `../tsconfig.base.json`，`module: NodeNext`，不用 Bun 配置 |
| `temporal_orchestrator/src/client.ts` | Temporal Client 工厂，连接 `localhost:7233` |
| `temporal_orchestrator/src/worker.ts` | Temporal Worker 工厂，按 Task Queue 创建多个 Worker 实例 |
| `temporal_orchestrator/src/main.ts` | 单入口：启动 Workers + 挂载路由 + 注册 Schedules |
| `temporal_orchestrator/src/config.ts` | 集中管理所有服务 URL 和 Temporal 连接配置 |
| `temporal_orchestrator/src/types.ts` | 所有 Workflow Input/Output/Signal 类型定义（spec §4 + §9 扩展类型） |
| `temporal_orchestrator/src/routes/index.ts` | 路由注册入口，各阶段在此挂载子路由 |
| `temporal_orchestrator/src/schedules/register.ts` | 幂等注册所有 Temporal Schedule |
| `packages/shared-temporal/package.json` | `@ai-bot/shared-temporal` — 跨服务共享的 Temporal API wrapper |
| `packages/shared-temporal/src/client.ts` | `signalTemporal` / `queryTemporal` 降级 wrapper |

**修改文件**：

| 文件 | 改动 |
|------|------|
| `package.json`（根） | `workspaces` 数组加入 `"temporal_orchestrator"` |
| `start.sh` | 在 outbound seed（L428）之后、backend（L440）之前，加入 `start_service "temporal_orchestrator" 18040 "node --import tsx/esm src/main.ts"` |

### 3.2 本地 Temporal Server

```bash
# 开发环境用 temporal CLI 内嵌 server
brew install temporal
temporal server start-dev --namespace default
```

不要在 `start.sh` 里启动 Temporal Server——它是外部基础设施，和 MySQL/Redis 一样由运维管理。

### 3.3 `src/client.ts` 骨架

```typescript
import { Client, Connection } from '@temporalio/client';

let client: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (client) return client;
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  });
  client = new Client({ connection, namespace: process.env.TEMPORAL_NAMESPACE ?? 'default' });
  return client;
}
```

### 3.4 `src/config.ts` — 集中配置

```typescript
// src/config.ts
export const TEMPORAL = {
  address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
} as const;

export const SERVICE_URLS = {
  backend: process.env.BACKEND_URL ?? 'http://127.0.0.1:18001',
  outbound: process.env.OUTBOUND_SERVICE_URL ?? 'http://127.0.0.1:18008',
  workOrder: process.env.WORK_ORDER_SERVICE_URL ?? 'http://127.0.0.1:18009',
  km: process.env.KM_SERVICE_URL ?? 'http://127.0.0.1:18006',
  wfm: process.env.WFM_SERVICE_URL ?? 'http://127.0.0.1:18023',
} as const;

export const TASK_QUEUES = {
  outbound: 'outbound',
  km: 'km',
  wfm: 'wfm',
  analytics: 'analytics',
} as const;
```

所有 Activity 从 `SERVICE_URLS` 读目标地址，不硬编码。所有 Workflow 启动时用 `TASK_QUEUES` 常量指定 queue。

### 3.5 `src/worker.ts` — 按 Task Queue 创建 Worker

> **注意**：Temporal TS SDK 要求 workflow 代码在 V8 isolate 中运行。项目用 `tsx`（非标准 loader），所以必须先用 `bundleWorkflowCode()` 预编译 workflow bundle，再传给 Worker。

```typescript
import { Worker, bundleWorkflowCode } from '@temporalio/worker';
import { TASK_QUEUES } from './config.js';

export async function createWorkers() {
  // 预编译 workflow bundle（一次编译，所有 Worker 共享）
  const workflowBundle = await bundleWorkflowCode({
    workflowsPath: new URL('./workflows/index.ts', import.meta.url).pathname,
  });

  const activities = await import('./activities/index.js');

  // 为每个 Task Queue 创建一个 Worker 实例
  const workers = await Promise.all(
    Object.values(TASK_QUEUES).map((queue) =>
      Worker.create({ workflowBundle, activities, taskQueue: queue })
    )
  );

  return workers;
}
```

需要新建 `src/workflows/index.ts` 统一导出所有 workflow：

```typescript
// src/workflows/index.ts
export { callbackWorkflow } from './callback.js';
export { humanHandoffWorkflow } from './human-handoff.js';
// 后续阶段逐步加入
```

### 3.6 `src/routes/index.ts` — 路由模块化

> **设计决策**：路由按业务域拆成独立模块，避免 `main.ts` 膨胀。每个阶段只需新建对应的路由文件并在此挂载。

```typescript
// src/routes/index.ts
import { Hono } from 'hono';
// P1 加入:
// import { callbackRoutes } from './callbacks.js';
// import { handoffRoutes } from './handoffs.js';
// P2 加入:
// import { outboundRoutes } from './outbound.js';
// ...

const api = new Hono();

api.get('/health', (c) => c.json({ status: 'ok' }));

// 各阶段在此挂载子路由
// api.route('/callbacks', callbackRoutes);
// api.route('/handoffs', handoffRoutes);
// api.route('/outbound', outboundRoutes);

export { api };
```

每个路由文件结构一致：

```typescript
// src/routes/callbacks.ts（P1 新建）
import { Hono } from 'hono';
import { getTemporalClient } from '../client.js';

const callbackRoutes = new Hono();

callbackRoutes.post('/:callbackTaskId/start', async (c) => { ... });
callbackRoutes.post('/:callbackTaskId/complete', async (c) => { ... });
callbackRoutes.post('/:callbackTaskId/reschedule', async (c) => { ... });
callbackRoutes.post('/:callbackTaskId/cancel', async (c) => { ... });

export { callbackRoutes };
```

### 3.7 `src/schedules/register.ts` — 幂等注册

```typescript
// src/schedules/register.ts
import { type Client, type ScheduleOptions } from '@temporalio/client';

async function ensureSchedule(client: Client, config: ScheduleOptions & { scheduleId: string }) {
  try {
    const handle = client.schedule.getHandle(config.scheduleId);
    await handle.update((prev) => ({ ...prev, spec: config.spec, action: config.action }));
    console.log(`Schedule ${config.scheduleId} updated`);
  } catch {
    await client.schedule.create(config);
    console.log(`Schedule ${config.scheduleId} created`);
  }
}

export async function registerSchedules(client: Client) {
  // P3 加入:
  // await ensureSchedule(client, { scheduleId: 'km-refresh-daily', ... });
  // P4 加入:
  // await ensureSchedule(client, { scheduleId: 'daily-schedule', ... });
  // P5 加入:
  // await ensureSchedule(client, { scheduleId: 'hot-issue-mining-weekly', ... });
}
```

### 3.8 `src/main.ts` — 单入口

> **设计决策**：Worker 和 API 合并成一个进程。原因：
> 1. `start.sh` 按"一个服务一个进程"设计
> 2. Worker 和 API 共享 Temporal Client 实例
> 3. 开发环境只管一个进程

```typescript
import { serve } from '@hono/node-server';
import { createWorkers } from './worker.js';
import { getTemporalClient } from './client.js';
import { registerSchedules } from './schedules/register.js';
import { api } from './routes/index.js';

async function main() {
  // 启动所有 Task Queue 的 Worker
  const workers = await createWorkers();
  const workerPromises = workers.map((w) => w.run());
  console.log(`Temporal Workers started on ${workers.length} task queues`);

  // 注册 Schedules（幂等）
  const client = await getTemporalClient();
  await registerSchedules(client);

  // 启动 HTTP API
  serve({ fetch: api.fetch, port: 18040 });
  console.log('Temporal API listening on :18040');

  // 任一 Worker 异常退出时整个进程退出
  await Promise.race(workerPromises);
}

main().catch((err) => { console.error(err); process.exit(1); });
```

### 3.9 `packages/shared-temporal` — 跨服务共享 wrapper

> **设计决策**：`signalTemporal` / `queryTemporal` 放在 `packages/shared-temporal` 中统一维护，而不是在各服务里各放一份。各服务 `import { signalTemporal } from '@ai-bot/shared-temporal'`。

```json
// packages/shared-temporal/package.json
{
  "name": "@ai-bot/shared-temporal",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "src/client.ts",
  "dependencies": {}
}
```

```typescript
// packages/shared-temporal/src/client.ts
const TEMPORAL_API_URL = process.env.TEMPORAL_API_URL ?? '';

export async function signalTemporal(path: string, body: unknown): Promise<boolean> {
  if (!TEMPORAL_API_URL) return false;
  try {
    const resp = await fetch(`${TEMPORAL_API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    return resp.ok;
  } catch {
    console.warn(`[temporal] signal failed (degraded): ${path}`);
    return false;
  }
}

export async function queryTemporal<T>(path: string): Promise<T | null> {
  if (!TEMPORAL_API_URL) return null;
  try {
    const resp = await fetch(`${TEMPORAL_API_URL}${path}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return null;
    return await resp.json() as T;
  } catch {
    console.warn(`[temporal] query failed (degraded): ${path}`);
    return null;
  }
}
```

### 3.10 测试基础设施

> **设计决策**：P0 就建测试框架，每个 Workflow 上线前必须有测试。Temporal 的 `@temporalio/testing` 提供 `TestWorkflowEnvironment`，支持 time-skipping（跳过 `sleep`），对"等 3 天后提醒"这种 Workflow 是必须的。

```
temporal_orchestrator/
  tests/
    workflows/
      callback.test.ts           # P1
      human-handoff.test.ts      # P1
      outbound-task.test.ts      # P2
      km-document-pipeline.test.ts  # P3
      ...
    activities/
      outbound.test.ts           # mock HTTP，验证幂等性
      km.test.ts
      ...
    helpers/
      setup.ts                   # TestWorkflowEnvironment 创建/销毁
```

`package.json` 加入：

```json
{
  "devDependencies": {
    "@temporalio/testing": "^1.11.0",
    "vitest": "^3.2.0"
  },
  "scripts": {
    "test": "vitest run",
    "dev": "node --import tsx/esm src/main.ts",
    "check": "tsc -p tsconfig.json --noEmit"
  }
}
```

**测试要求**：从 P1 开始，每个 Workflow 至少有：
- 1 个 happy path 测试
- 1 个 Signal 交互测试
- 1 个超时/降级测试

每个 Activity 至少有：
- 1 个正常返回测试（mock HTTP）
- 1 个幂等性验证（重复调用同一参数，结果一致）

### 3.11 微服务配套改造（P0 同步完成）

> **设计决策**：以下改造是 Temporal 接入的前置条件，必须和 P0 基础设施同步完成。不改的话 Temporal Activity 重试会产生脏数据，或缺少必要的 API 端点。

#### 3.11.1 `outbound_service` — 幂等化 + 新增内部 API

**幂等化改造**（改现有端点）：

| 端点 | 改动 |
|------|------|
| `POST /tasks/callbacks` (L43) | 接受外部传入 `task_id`；加 `UNIQUE(task_id)` 约束；已存在返回 `200 + 已有记录` |
| `POST /results/call-results` (L9) | 加 `UNIQUE(task_id, call_attempt_no)` 约束（`call_attempt_no` 由调用方传入）；冲突返回 200 |
| `POST /results/handoff-cases` (L88) | 加 `idempotency_key` 参数 + `UNIQUE(idempotency_key)` 约束；冲突返回 200 |

**新建 `outbound_service/src/routes/internal.ts`**：

```typescript
// ─── callback 管理（供 Temporal Activity 调用） ───
GET  /api/outbound/internal/callbacks/:id           // callback 单条详情
PUT  /api/outbound/internal/callbacks/:id/status     // 更新 callback 状态
     // body: { status: 'in_progress' | 'completed' | 'cancelled' | 'rescheduled' }

// ─── 任务状态（供 Temporal Activity 调用） ───
PUT  /api/outbound/internal/tasks/:id/status         // 更新任务状态
     // body: { status: 'in_progress' | 'completed' | 'cancelled' | 'dnd_blocked' | 'max_retry_reached' }

// ─── handoff 状态（供 Temporal Activity 调用） ───
PUT  /api/outbound/internal/handoff-cases/:id/status  // 更新 handoff 状态
     // body: { status: 'accepted' | 'resolved' | 'resumed_ai' | 'escalated' }

// ─── 外呼门控（供 Temporal Activity 调用） ───
GET  /api/outbound/internal/check-allowed-hours      // 检查当前是否在合法外呼时段
     // query: ?task_type=collection
     // response: { allowed: boolean, next_window_at?: string, quiet_start: "21:00", quiet_end: "08:00" }
     // 注：把 mcp_servers/src/tools/outbound_tools.ts L34 的 isQuietHours() 逻辑下沉到此

GET  /api/outbound/internal/check-dnd                // 检查号码是否在 DND 名单
     // query: ?phone=13900000001
     // response: { is_dnd: boolean, reason?: string }
```

在 `outbound_service/src/routes/index.ts` 注册：

```typescript
import internalRoutes from './internal';
router.route('/internal', internalRoutes);
```

**新增公开端点**（在 `tasks.ts` 中追加）：

```typescript
GET  /api/outbound/tasks/callbacks/:id    // callback 单条详情（供工作台/前端用）
PUT  /api/outbound/tasks/callbacks/:id    // callback 状态更新（供工作台/前端用）
```

#### 3.11.2 `backend` — 内部 API 命名空间 + REST→WS 桥

**新建 internal 路由命名空间**：

当前 backend 没有 `/api/internal` 模式，需要建立基础设施。

新建 `backend/src/routes/internal/index.ts`：

```typescript
import { Hono } from 'hono';
import notifyRoutes from './notify';
import outboundRoutes from './outbound';

const internalRouter = new Hono();
internalRouter.route('/notify', notifyRoutes);
internalRouter.route('/outbound', outboundRoutes);

export default internalRouter;
```

在 `backend/src/index.ts` 注册：

```typescript
import internalRouter from './routes/internal/index';
app.route('/api/internal', internalRouter);
```

**新建 `backend/src/routes/internal/notify.ts`** — REST→WS 桥：

```typescript
POST /api/internal/notify/workbench
  // body: { handoff_id, phone, event_type, payload }
  // 实现：
  //   1. 根据 phone 在 agent-ws.ts 维护的连接 Map 中查找 WS 连接
  //   2. 向匹配的坐席 WS 连接推送事件
  //   3. 若无在线坐席，写入离线消息队列（或返回 { delivered: false }）
  // 需要重构：把 agent-ws.ts 的连接 Map 抽取为可导入的 AgentConnectionManager

POST /api/internal/notify/sms
  // body: { phone, sms_type, content }
  // P1 阶段 mock 实现（仅记录日志），后续接入 channel_host
```

**新建 `backend/src/routes/internal/outbound.ts`** — 服务端主动外呼：

```typescript
POST /api/internal/outbound/initiate
  // body: { task_id, phone, task_type, callback_task_id? }
  // 实现：
  //   1. 创建 outbound session（复用 outbound.ts L188-310 的会话创建逻辑）
  //   2. 启动 GlmRealtimeController
  //   3. 返回 { session_id, status: 'initiated' }
  // 需要重构：把 outbound.ts 的 onOpen handler 中"创建会话 + 启动 controller"
  // 的逻辑抽取到 OutboundSessionService，WS handler 和 REST handler 共用
```

> **重构说明**：`backend/src/chat/outbound.ts` 当前的外呼启动逻辑（L188-310）和 WS 生命周期紧耦合。需要拆分为：
> 1. `backend/src/services/outbound-session.ts` — 纯业务逻辑：创建会话、启动 controller、管理生命周期
> 2. `backend/src/chat/outbound.ts` — WS adapter：调用 OutboundSessionService
> 3. `backend/src/routes/internal/outbound.ts` — REST adapter：调用 OutboundSessionService
>
> 这是 P0 阶段工作量最大的一项，但不做就无法实现 `initiateOutboundCall` Activity。

**重构 `backend/src/agent/chat/agent-ws.ts`** — 抽取连接管理：

```typescript
// 新建 backend/src/services/agent-connection-manager.ts
// 把 agent-ws.ts 中维护 WS 连接的 Map 抽取为独立模块
// 暴露：
//   getConnectionByPhone(phone: string): WebSocket | null
//   broadcastToQueue(queueName: string, event: object): void
//   getOnlineAgents(): string[]
```

#### 3.11.3 `km_service` — 追加 internal 端点（不新建文件）

> **注意**：`km_service` 已有 `src/routes/internal.ts`（`server.ts` L19 注册），包含 skills registry、MCP servers 等端点。**不能新建同名文件**，必须在现有文件中追加。

在现有 `km_service/src/routes/internal.ts` 末尾追加：

```typescript
// ─── Temporal 配套端点（P0 新增） ───

// 扫描端点（供 KmRefreshWorkflow Activity 调用）
GET  /api/internal/assets/scan-expired
     // query: ?as_of_date=2026-04-04
     // response: { asset_ids: string[] }
     // 实现：SELECT id FROM km_assets WHERE next_review_date <= :as_of_date AND status = 'active'

GET  /api/internal/doc-versions/scan-pending
     // response: { doc_version_ids: string[] }
     // 实现：SELECT id FROM km_doc_versions WHERE status IN ('draft', 'pending') AND NOT EXISTS (SELECT 1 FROM km_pipeline_jobs WHERE doc_version_id = km_doc_versions.id AND status IN ('pending', 'running'))

GET  /api/internal/regression-windows/scan-expired
     // query: ?as_of_date=2026-04-04
     // response: { window_ids: string[] }
     // 实现：SELECT id FROM km_regression_windows WHERE observe_until <= :as_of_date AND concluded_at IS NULL

// 流水线执行端点（供 KmDocumentPipelineWorkflow Activity 调用）
POST /api/internal/pipeline/jobs
     // body: { doc_version_id, stages: ['parse','chunk','generate','validate'], idempotency_key }
     // 幂等：同 idempotency_key 返回 200 + 已有 jobs
     // response: { jobs: [{ id, stage, status }] }

PUT  /api/internal/pipeline/jobs/:id/status
     // body: { status: 'running' | 'completed' | 'failed', error_code?, error_message?, candidate_count? }

POST /api/internal/pipeline/jobs/:id/execute
     // 实际执行一个 pipeline stage（parse / chunk / generate / validate）
     // 这是最重要的新端点——当前 km_service 只创建 job 记录，没有执行器
     // 需要新建 km_service/src/services/pipeline-executor.ts
     // response: { status: 'completed' | 'failed', result?: any, error?: string }

// 治理端点（供 Workflow 创建治理任务和关闭回归窗口）
POST /api/internal/governance/tasks
     // body: { task_type, source_type, source_ref_id, issue_category, severity, priority }
     // 幂等：同 (source_type, source_ref_id, issue_category) 返回 200

PUT  /api/internal/regression-windows/:id/conclude
     // body: { verdict: 'pass' | 'fail' | 'inconclusive' }
```

> **新建文件**：`km_service/src/services/pipeline-executor.ts` — parse/chunk/generate/validate 的实际执行逻辑。当前这个逻辑在 km_service 里不存在，是 P3 的最大技术依赖。P0 阶段先建骨架（每个 stage 返回 mock 结果），P3 阶段补真实实现。

#### 3.11.4 `wfm_service` — 幂等化改造

**改现有端点**（无需新增端点）：

| 端点 | 改动 |
|------|------|
| `POST /plans/:id/generate` (L81) | 执行前检查 `plan.status`：若已是 `'generated'` 或 `'published'`，返回 `200 + 已有结果`（而非重新生成） |
| `POST /plans/:id/publish` (L224) | 已发布时返回 `200 + 当前版本`（而非 `400`），实现透明幂等 |

#### 3.11.5 改造验收信号

- `outbound_service`：`POST /tasks/callbacks` 连续调用两次同一 `task_id`，第二次返回 200 + 已有记录
- `outbound_service`：`GET /api/outbound/internal/check-allowed-hours` 返回正确的时段判断
- `backend`：`POST /api/internal/notify/workbench` 能向在线坐席 WS 连接推送事件
- `backend`：`POST /api/internal/outbound/initiate` 能创建外呼会话并返回 `session_id`
- `km_service`：`GET /api/internal/assets/scan-expired` 返回到期资产列表
- `km_service`：`POST /api/internal/pipeline/jobs` 连续调用两次同一 `idempotency_key`，第二次返回 200
- `wfm_service`：`POST /plans/:id/generate` 对已生成计划返回 200（不重新生成）

### 验收信号

- `npm run dev` 启动成功，4 个 Task Queue 的 Worker 均连接到 Temporal Server，API 监听 18040
- `GET http://localhost:18040/health` 返回 200
- `./start.sh` 能正常拉起 temporal_orchestrator
- `tsc --noEmit` 零错误
- `npm test` 通过（至少含 1 个 TestWorkflowEnvironment 冒烟测试）
- `@ai-bot/shared-temporal` 可被其他 workspace 正常 import
- 微服务配套改造验收（§3.11.5）全部通过

---

## 4. `P1`：CallbackWorkflow + HumanHandoffWorkflow

### 目标

回拨精确到点唤醒，人工介入有正式状态机和 Signal 驱动。这两个侵入最小（不改外呼主链路），收益最大（解决"扫表延迟"和"人工状态散落"）。

### 4.0 降级 wrapper 来源

所有调 Temporal API 的地方使用 `@ai-bot/shared-temporal`（P0 §3.9 已建好）：

```typescript
import { signalTemporal } from '@ai-bot/shared-temporal';
```

各服务不再各自维护 `temporal-client.ts`。`TEMPORAL_API_URL` 环境变量为空时自动降级（返回 `false` / `null`），不阻断业务主链路。

### 4.1 CallbackWorkflow 实现

**新建文件**：

| 文件 | 说明 |
|------|------|
| `temporal_orchestrator/src/workflows/callback.ts` | Workflow 实现 |
| `temporal_orchestrator/src/activities/outbound.ts` | `getCallbackTask`, `updateCallbackStatus`, `triggerOutboundCall`, `createHandoffCase` |
| `temporal_orchestrator/src/activities/notify.ts` | `notifySmsReminder`, `notifyWorkbench` |
| `temporal_orchestrator/src/activities/index.ts` | 统一 re-export 所有 Activity（见下文） |

**Workflow 逻辑**：

```
1. getCallbackTask(callbackTaskId)          → 读取 ob_callback_tasks
2. sleep(until preferredTime - 15min)       → durable timer
3. notifySmsReminder(phone, 'callback')     → 可选：发提醒短信
4. sleep(until preferredTime)               → 精确等待
5. triggerOutboundCall(callbackTaskId)       → 触发回拨
6. 等待 Signal：
   - callbackCompleted → updateCallbackStatus('completed'), return
   - callbackRescheduled(newTime) → 更新 preferredTime, Continue-As-New
   - callbackCancelled → updateCallbackStatus('cancelled'), return
```

**Temporal API 路由**（加入 `api.ts`）：

```
POST /api/temporal/callbacks/:callbackTaskId/start      → client.workflow.start(callbackWorkflow, ...)
POST /api/temporal/callbacks/:callbackTaskId/complete    → handle.signal('callbackCompleted')
POST /api/temporal/callbacks/:callbackTaskId/reschedule  → handle.signal('callbackRescheduled', { newTime })
POST /api/temporal/callbacks/:callbackTaskId/cancel      → handle.signal('callbackCancelled')
```

**`activities/index.ts` 结构**：

> 每个后续阶段（P2/P3/P4/P5）新增 Activity 时都必须更新此文件。

```typescript
// src/activities/index.ts — P1 初始版本
export {
  getCallbackTask,
  updateCallbackStatus,
  triggerOutboundCall,
  createHandoffCase,
  updateHandoffStatus,
} from './outbound.js';

export {
  notifyWorkbench,
  notifySmsReminder,
} from './notify.js';

export {
  createAppointment,
  startWorkflowRun,
} from './work-order.js';
```

### 4.2 HumanHandoffWorkflow 实现

**新建文件**：

| 文件 | 说明 |
|------|------|
| `temporal_orchestrator/src/workflows/human-handoff.ts` | Workflow 实现 |
| `temporal_orchestrator/src/activities/work-order.ts` | `createAppointment`, `startWorkflowRun` |

**P1 scope 说明**：

> P1 阶段 `HumanHandoffWorkflow` 只覆盖**外呼渠道**的转人工。在线/语音渠道的 handoff 接入计划在四 Agent P3 阶段（`human-support-agent` 正式上线后），届时需要：
> 1. `createHandoffCase` 改为调统一的 handoff API（可能在 backend 或 work_order_service）
> 2. Input 新增 `channel` 字段区分来源（`outbound` / `online` / `voice`）
> 3. 现有外呼 handoff 逻辑作为 `channel=outbound` 的特化

**Activity 归属说明**：

- `createHandoffCase(input)` → 在 `activities/outbound.ts` 中，调 `POST outbound_service/api/outbound/handoff-cases`（已有路由）。未来多渠道时改为调统一 API。
- `updateHandoffStatus(handoffId, status)` → 在 `activities/outbound.ts` 中，调 `POST outbound_service/api/outbound/internal/handoff-cases/:id/status`（**需新增**）
- `notifyWorkbench(handoffId)` → 在 `activities/notify.ts` 中，调 `POST backend/api/internal/notify/workbench`（**需新增**）

**Workflow 逻辑**：

```
1. createHandoffCase(input)                → 创建 ob_handoff_cases
2. notifyWorkbench(handoffId)              → 通知坐席工作台
3. 等待 Signal（无限期，有 SLA 超时 timer 兜底）：
   - accepted(assignee)   → 记录接单人
   - resolved(resolution) → updateHandoffStatus('resolved'), return
   - resumeAi(context)    → 生成 resume_context, return { finalStatus: 'resumed_ai' }
   - rejectResume(reason) → 继续等待
   - SLA timer 到期       → escalate, return { finalStatus: 'closed_without_resume' }
4. Query handler: getHandoffStatus() → 返回当前 status/assignee/resumeReady
```

**Temporal API 路由**：

```
POST /api/temporal/handoffs/:handoffId/start    → client.workflow.start(humanHandoffWorkflow, ...)
POST /api/temporal/handoffs/:handoffId/signal    → handle.signal(signalName, payload)
GET  /api/temporal/handoffs/:handoffId/status     → handle.query('getHandoffStatus')
```

### 4.3 现有服务改动

#### `outbound_service` 新增路由

在 `outbound_service/src/routes/tasks.ts` 中新增：

```typescript
// 在现有 GET /callbacks (L61) 之后加：
router.get('/callbacks/:id', async (c) => { ... });   // callback 单条详情
router.put('/callbacks/:id', async (c) => { ... });   // callback 状态更新
```

在 `outbound_service/src/routes/index.ts` 中新增内部路由：

```typescript
router.route('/internal', internalRoutes);
```

新建 `outbound_service/src/routes/internal.ts`：

```typescript
// POST /api/outbound/internal/callbacks/:id/status
// body: { status: 'in_progress' | 'completed' | 'cancelled' | 'rescheduled' }
```

#### `outbound_service` 接入 Temporal

在 `outbound_service/src/routes/tasks.ts` 的 `POST /callbacks`（L43-58）成功后，加一行：

```typescript
import { signalTemporal } from '@ai-bot/shared-temporal';

// 回拨任务创建成功后，启动 Temporal CallbackWorkflow（fire-and-forget，失败不阻断）
signalTemporal(`/api/temporal/callbacks/${taskId}/start`, {
  callbackTaskId: taskId, originalTaskId, phone, preferredTime, customerName, productName,
});
```

#### `backend` 新增通知路由

新建 `backend/src/routes/internal-notify.ts`：

```typescript
// POST /api/internal/notify/workbench  → 给坐席工作台发 WS 消息
// POST /api/internal/notify/sms        → 发送短信提醒（当前 mock）
```

### 4.4 上线策略

1. **先 shadow**：Temporal Workflow 启动后只记录日志，不实际触发外呼动作
2. **callback 先行**：先跑 CallbackWorkflow，验证 durable timer 和 Signal 通路
3. **再接 handoff**：CallbackWorkflow 稳定后，接入 HumanHandoffWorkflow
4. **降级方案**：`TEMPORAL_API_URL` 不可达时，`outbound_service` 降级为不发 Signal，回拨仍走现有扫表逻辑

### 验收信号

- 创建回拨任务后，CallbackWorkflow 在 Temporal UI 中可见
- 到达 `preferred_time` 时，Workflow 自动唤醒并触发回拨 Activity
- 发 `callbackRescheduled` Signal 后，Workflow 重新等待新时间
- HumanHandoffWorkflow 能等待数小时后接收 `accepted` Signal
- Temporal UI 中能通过 Query 看到 handoff 当前状态
- `npm test` 通过：CallbackWorkflow happy path + reschedule Signal + 超时降级；HumanHandoffWorkflow happy path + SLA 超时
- Activity 幂等性测试通过：重复调用 `updateCallbackStatus` 结果一致

---

## 5. `P2`：OutboundTaskWorkflow

### 目标

把"未接重试、allowed_hours 等待、DND 检查、转人工分支、回访衔接"收口到一个 Workflow 里，替代现在散落在 `outbound.ts` 各处的状态管理。

### 5.1 实现

**新建文件**：

| 文件 | 说明 |
|------|------|
| `temporal_orchestrator/src/workflows/outbound-task.ts` | Workflow 实现 |

**扩展 `activities/outbound.ts`**：

```typescript
export async function getOutboundTask(taskId: string) { ... }
export async function updateOutboundTaskStatus(taskId: string, status: string) { ... }
export async function checkAllowedHours(taskType: string): Promise<{ allowed: boolean; nextWindowAt?: string }> { ... }
export async function checkDnd(phone: string): Promise<boolean> { ... }
export async function initiateOutboundCall(taskId: string, sessionId?: string) { ... }
// ↑ 注意：initiateOutboundCall 不直接建立 WS 连接（Activity 是短生命周期的）。
//   它调 backend 的内部 API（POST /api/internal/outbound/initiate），
//   由 backend 负责创建 WS 会话和启动 GlmRealtimeController。
//   需新增 backend/src/routes/internal-outbound.ts 路由。
```

**Workflow 逻辑**：

```
1. getOutboundTask(taskId)
2. loop:
   a. checkAllowedHours(taskType)
      - 不在窗口 → sleep(until nextWindowAt)
   b. checkDnd(phone)
      - DND → updateTaskStatus('dnd_blocked'), return
   c. initiateOutboundCall(taskId, sessionId)
   d. 等待 Signal:
      - callResultRecorded(result):
        - no_answer/busy/voicemail → retryCount++
          - retryCount >= maxRetry → updateTaskStatus('max_retry_reached'), return
          - else → sleep(retryInterval), continue loop
        - callback_request → 启动 child CallbackWorkflow, return { finalStatus: 'callback_scheduled' }
        - transfer/vulnerable/dispute → 启动 child HumanHandoffWorkflow, return { finalStatus: 'handoff' }
        - ptp/converted → updateTaskStatus('completed'), return
      - handoffRequested → 启动 child HumanHandoffWorkflow, return
      - taskCancelled → updateTaskStatus('cancelled'), return
3. 跨天长链路 → Continue-As-New（保留 retryCount 和 lastResult）
```

**Temporal API 路由**：

```
POST /api/temporal/outbound/tasks/:taskId/start        → signalWithStart
POST /api/temporal/outbound/tasks/:taskId/call-result   → signal('callResultRecorded', result)
POST /api/temporal/outbound/tasks/:taskId/cancel        → signal('taskCancelled')
```

### 5.2 现有服务改动

#### `backend/src/chat/outbound.ts`

在 WS 建链成功后（L304-310 onOpen），加入：

```typescript
import { signalTemporal } from '@ai-bot/shared-temporal';

// signalWithStart：如果 workflow 已存在则发 signal，否则启动新 workflow（fire-and-forget）
signalTemporal(`/api/temporal/outbound/tasks/${taskId}/start`, {
  taskId, taskType, phone, sessionId, source: 'ws_connected',
});
```

需新建 `backend/src/services/temporal-client.ts`（§4.0 的 wrapper）。

#### `outbound_service/src/routes/results.ts`

在 `POST /call-results`（L9）写库成功后，加入：

```typescript
import { signalTemporal } from '@ai-bot/shared-temporal';

// fire-and-forget，失败不阻断结果落库
signalTemporal(`/api/temporal/outbound/tasks/${taskId}/call-result`, {
  result, remark, callbackTime, ptpDate,
});
```

#### `outbound_service` 新增内部路由

在 `outbound_service/src/routes/internal.ts` 加入：

```typescript
// POST /api/outbound/internal/tasks/:id/status
// body: { status: 'in_progress' | 'completed' | 'cancelled' | 'dnd_blocked' | 'max_retry_reached' }
```

### 5.3 CampaignWaveWorkflow（可选，批量外呼时）

不要一个 Workflow 管几万用户。建议：

- `CampaignWaveWorkflow(campaignId)` 只负责 fan-out
- 读取 campaign 下所有待呼任务
- 分批启动 child `OutboundTaskWorkflow`
- 用 Task Queue concurrency 控制并发

### 5.4 上线策略

1. **先 shadow**：Workflow 启动后只记录状态转换，不实际控制外呼动作
2. **再 dual-write**：Temporal 和现有逻辑同时跑，对比结果
3. **最后 cutover**：确认一致后，由 Temporal 控制重试和分支

### 验收信号

- 外呼建链时 Temporal UI 中出现 `outbound-task/{taskId}` Workflow
- 通话结果落库后，Workflow 收到 Signal 并正确分支
- 不在 allowed_hours 时，Workflow 自动 sleep 到下个窗口
- 转人工时，child HumanHandoffWorkflow 自动启动
- 回访请求时，child CallbackWorkflow 自动启动

---

## 6. `P3`：知识治理流水线

### 目标

知识更新从"扫表 + 手动触发"变成"有状态、可追踪、可补跑、可人工介入"的治理流程。

### 6.1 KmDocumentPipelineWorkflow

**新建文件**：

| 文件 | 说明 |
|------|------|
| `temporal_orchestrator/src/workflows/km-document-pipeline.ts` | Workflow 实现 |
| `temporal_orchestrator/src/activities/km.ts` | KM 相关 Activity |

**Activity 清单**：

```typescript
export async function enqueuePipelineJobs(docVersionId: string, stages: string[]) { ... }
export async function runPipelineStage(jobId: string, stage: string) { ... }
export async function markPipelineJobStatus(jobId: string, status: string, error?: string) { ... }
export async function createGovernanceTask(body: GovernanceTaskInput) { ... }
```

**Workflow 逻辑**：

```
1. enqueuePipelineJobs(docVersionId, stages)     → 创建 km_pipeline_jobs
2. for each stage in stages:
   a. runPipelineStage(jobId, stage)
   b. 成功 → markPipelineJobStatus(jobId, 'completed')
   c. 失败 → markPipelineJobStatus(jobId, 'failed', error)
            → createGovernanceTask({ source: docVersionId, issue: stage_failed })
            → return { finalStatus: 'governance_created' }
3. 全部成功 → return { finalStatus: 'completed' }
```

**Signal**：`retryFromStage(stage)` — 从指定阶段重跑
**Signal**：`cancelPipeline` — 取消流水线

### 6.2 KmRefreshWorkflow

**新建文件**：

| 文件 | 说明 |
|------|------|
| `temporal_orchestrator/src/workflows/km-refresh.ts` | 定时扫描 Workflow |

**Activity 扩展**（`activities/km.ts`）：

```typescript
export async function scanExpiredAssets(): Promise<string[]> { ... }
export async function scanPendingDocVersions(): Promise<string[]> { ... }
export async function scanExpiredRegressionWindows(): Promise<string[]> { ... }
export async function closeRegressionWindow(windowId: string, verdict: string) { ... }
```

**Workflow 逻辑**：

```
1. scanExpiredAssets()           → 找 next_review_date 到期的 km_assets
2. scanPendingDocVersions()     → 找新增/变更文档
3. scanExpiredRegressionWindows() → 找 observe_until 到期的回归窗口
4. 对每个 docVersionId → 启动 child KmDocumentPipelineWorkflow
5. 对每个到期窗口 → closeRegressionWindow 或升级治理任务
6. 对每个到期资产 → 启动 child PolicyExpiryReminderWorkflow
```

**触发方式**：Temporal `Schedule`，每晚 `02:00` 执行。在 `schedules/register.ts` 中用 `ensureSchedule`（§3.7）注册：

```typescript
await ensureSchedule(client, {
  scheduleId: 'km-refresh-daily',
  spec: { cronExpressions: ['0 2 * * *'] },
  action: {
    type: 'startWorkflow',
    workflowType: 'kmRefreshWorkflow',
    args: [{ scope: 'daily_refresh' }],
    taskQueue: TASK_QUEUES.km,
  },
});
```

### 6.3 PolicyExpiryReminderWorkflow

**新建文件**：

| 文件 | 说明 |
|------|------|
| `temporal_orchestrator/src/workflows/policy-expiry-reminder.ts` | 过期提醒 Workflow |

**Workflow 逻辑**：

```
1. 发送第一次提醒（notifyWorkbench + 可选邮件/IM）
2. sleep(3 days)
3. 检查是否已处理（ackReminder Signal 或 reviewCompleted Signal）
   - 已处理 → return
   - 未处理 → 发送第二次提醒，升级 severity
4. sleep(3 days)
5. 仍未处理 → createGovernanceTask(severity: 'high'), return
```

### 6.4 现有服务改动

#### `km_service` 新增内部路由

新建 `km_service/src/routes/internal.ts`：

```typescript
// POST /api/internal/pipeline/jobs
// POST /api/internal/pipeline/jobs/:id/status
// POST /api/internal/governance/tasks
// POST /api/internal/regression-windows/:id/conclude
```

在 `km_service/src/routes/index.ts` 注册 `/internal` 路由。

#### `km_service/src/routes/documents.ts` 改造

将 `POST /versions/:vid/parse`（L174）改为 dual-path：优先走 Temporal，降级时走原逻辑。

```typescript
import { signalTemporal } from '@ai-bot/shared-temporal';

// dual-path：优先走 Temporal 编排，降级时走原来的直接插 km_pipeline_jobs
const temporalOk = await signalTemporal(`/api/temporal/km/doc-versions/${vid}/start`, {
  docVersionId: vid, stages, trigger: 'manual',
});

if (!temporalOk) {
  // 降级：直接插 km_pipeline_jobs（原 L182-186 逻辑保留）
  const jobs = await db.insert(kmPipelineJobs).values(
    stages.map(stage => ({ doc_version_id: vid, stage, status: 'pending' }))
  ).returning();
  // ...
}
```

各服务使用 `@ai-bot/shared-temporal`（P0 §3.9），无需再建 `temporal-client.ts`。

> **上线路径**：初始 `TEMPORAL_API_URL` 为空，走原逻辑；接入后设置环境变量切换；稳定后可去掉降级分支。

### 6.5 上线策略

1. `KmDocumentPipelineWorkflow` 先做：手动触发文档解析走 Temporal
2. `KmRefreshWorkflow` 再做：先 dry-run（只扫描不启动子流程），确认扫描逻辑正确
3. `PolicyExpiryReminderWorkflow` 最后：先只发日志，不发实际通知

### 验收信号

- 手动触发文档解析后，Temporal UI 中出现 `km-doc/{vid}` Workflow
- 每阶段成功/失败正确回写 `km_pipeline_jobs`
- 失败时自动创建 `km_governance_tasks`
- 每晚 02:00 `km-refresh/daily` 自动启动
- 过期资产收到提醒，3 天未处理则升级

---

## 7. `P4`：每日排班编排

### 目标

排班从"人工点按钮"变成"每天自动生成/校验/发布/通知"。Temporal 做编排，排班算法不变。

### 7.1 DailyScheduleWorkflow

**新建文件**：

| 文件 | 说明 |
|------|------|
| `temporal_orchestrator/src/workflows/daily-schedule.ts` | 每日排班 Workflow |
| `temporal_orchestrator/src/activities/wfm.ts` | 排班相关 Activity |

**Activity 清单**：

```typescript
export async function createPlan(date: string, planName: string, groupId?: string) { ... }
export async function generateSchedule(planId: string) { ... }
export async function validatePublish(planId: string) { ... }
export async function publishPlan(planId: string) { ... }
export async function notifyAgents(planId: string) { ... }
```

**Workflow 逻辑**：

```
1. createPlan(date, planName)                → POST wfm /plans
2. generateSchedule(planId)                  → POST wfm /plans/:id/generate
3. validatePublish(planId)                   → POST wfm /plans/:id/publish/validate
4. 检查校验结果：
   a. 无错误 + autoPublish=true → publishPlan(planId)
   b. 有错误 or autoPublish=false → 启动 child SchedulePublishWorkflow, 等待审批
5. 发布成功后：
   a. notifyAgents=true → notifyAgents(planId)
```

### 7.2 SchedulePublishWorkflow

**Workflow 逻辑**：

```
1. 等待 Signal（超时 24h）：
   - manualApproved → publishPlan(planId), return { publishStatus: 'published' }
   - manualRejected(reason) → return { publishStatus: 'rejected' }
   - timeout → return { publishStatus: 'expired' }
2. Query handler: getPublishStatus() → 返回 blockingIssues + status
```

### 7.3 现有服务改动

**`wfm_service` 不需要改代码**。现有 API 已够用：

- `POST /plans` — 创建计划
- `POST /plans/:id/generate` — 生成排班（L81）
- `POST /plans/:id/publish/validate` — 校验（L195）
- `POST /plans/:id/publish` — 发布（L224）

只需新增一个通知端点（可选）：

```typescript
// POST /api/wfm/internal/notify-agents
// body: { planId, agentIds }
// 下发日程摘要到每个客服
```

### 7.4 上线策略

1. 先手动触发 `DailyScheduleWorkflow`，验证全流程
2. 再用 Temporal Schedule 每天 `06:00` 自动触发
3. 初始 `autoPublish=false`，强制人工审批
4. 稳定后可改成 `autoPublish=true`（校验零错误时自动发布）

### 验收信号

- 手动触发后，Temporal UI 中出现 `daily-schedule/{date}` Workflow
- 自动生成排班、校验、等待审批全链路通
- 审批后自动发布并通知客服
- Schedule 每天 06:00 自动触发

---

## 8. `P5`：热点挖掘 + 自动测试飞轮

### 目标

形成"发现问题 → 生成候选 → 提醒运营 → 自动跑回归"的治理飞轮。Temporal 保证飞轮持续运转，AI 质量由各环节的模型和评测保证。

### 8.1 HotIssueMiningWorkflow

**新建文件**：

| 文件 | 说明 |
|------|------|
| `temporal_orchestrator/src/workflows/hot-issue-mining.ts` | 热点问题挖掘 |
| `temporal_orchestrator/src/activities/analytics.ts` | 分析相关 Activity |

**Activity 清单**：

```typescript
export async function collectRecentData(windowStart: string, windowEnd: string, sources: string[]) { ... }
export async function clusterIssues(data: any[], minFrequency: number) { ... }
export async function createReviewPackages(clusters: any[]) { ... }
```

**Workflow 逻辑**：

```
1. collectRecentData(windowStart, windowEnd, sources)
   → 从工单、Copilot 提问、负反馈、检索 miss 收集数据
2. clusterIssues(data, minFrequency)
   → 聚类出热点问题
3. 对每个高频 cluster → 启动 child QaFlowSuggestionWorkflow
4. 汇总后创建 review packages
```

**触发方式**：Temporal Schedule，每周一 `03:00`

### 8.2 QaFlowSuggestionWorkflow

**Workflow 逻辑**：

```
1. 基于 cluster 生成 QA 候选 + 流程候选
2. 写入 km_action_drafts / km_review_packages
3. 通知运营审核（notifyWorkbench）
4. 等待 Signal：
   - acceptedForReview → 启动 child AutoTestRegressionWorkflow
   - rejectedForReview → return
```

### 8.3 AutoTestRegressionWorkflow

**Workflow 逻辑**：

```
1. 为目标生成测试用例（调 test-case 生成 API）
2. 执行测试（调 retrieval eval / assertion API）
3. 汇总结果：
   a. passRate >= threshold → return { 可上线 }
   b. passRate < threshold → createGovernanceTask, return { 需治理 }
4. Signal:
   - rerunFailed → 重跑失败用例
   - approveRelease → 标记可上线
   - blockRelease → 阻断并建治理任务
```

### 8.4 前置依赖

这 3 个 Workflow 依赖以下能力，需在 P5 之前或同步建设：

| 能力 | 当前状态 | 需要补 |
|------|---------|-------|
| FAQ 聚类器 | 不存在 | 新建 `km_service` 内部 API 或独立服务 |
| 自动流程生成器 | 不存在 | LLM 生成 + human review |
| 统一 testcase 执行 API | E2E test 框架已有基础 | 需要封装成 HTTP API 供 Activity 调用 |
| 负反馈/检索 miss 数据源 | 部分存在（feedback 表） | 需统一查询接口 |

### 8.5 上线策略

1. `HotIssueMiningWorkflow` 先做，验证聚类质量
2. `QaFlowSuggestionWorkflow` 生成候选后必须人工审核，不自动上线
3. `AutoTestRegressionWorkflow` 先只跑不阻断，积累 passRate 基线

### 验收信号

- 每周一自动产出热点问题报告
- 候选 QA/流程写入 review packages，运营能在 KM 后台看到
- 测试用例自动生成并运行，pass/fail 结果可查

---

## 9. 全局风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Temporal Server 不可用 | 所有 Workflow 暂停 | `@ai-bot/shared-temporal` 做降级：Temporal 不可达时，现有服务仍能独立运行（只是没有 durable timer 和 Signal） |
| Activity HTTP 调用超时 | Workflow 卡在等待 | Activity 配置合理的 `startToCloseTimeout` + `retryPolicy`，默认 30s 超时、3 次重试 |
| Workflow history 过长 | Temporal 性能下降 | 外呼跨天链路用 `Continue-As-New`，每 100 个事件续接 |
| Workflow 代码变更与运行中 Workflow 冲突 | non-determinism error，Workflow 挂死 | 变更控制流必须用 `patched()` API（§2.5）；大改用新 Workflow type + 并行切换 |
| 单 Task Queue 高峰互相挤占 | 外呼高峰拖慢知识刷新 | 按业务域拆 4 个 Task Queue（§2.6），可独立扩缩 Worker |
| Node.js 和 Bun 类型不共享 | 重复定义类型 | `types.ts` 中只用基础类型（string/number/boolean），不依赖 Bun 或 Node 特有类型 |
| SDK 版本升级 | 可能有 breaking changes | 锁定 `@temporalio/*` 版本，跟随官方 release notes |

---

## 10. 文件变更清单总览

### P0 新建

| 文件 | 说明 |
|------|------|
| `packages/shared-temporal/package.json` | `@ai-bot/shared-temporal` — 跨服务共享的 Temporal API wrapper |
| `packages/shared-temporal/src/client.ts` | `signalTemporal` / `queryTemporal` 降级 wrapper |
| `temporal_orchestrator/package.json` | Node.js 项目配置（含 `@temporalio/testing` + `vitest`） |
| `temporal_orchestrator/tsconfig.json` | TypeScript 配置 |
| `temporal_orchestrator/src/client.ts` | Temporal Client 工厂 |
| `temporal_orchestrator/src/config.ts` | 集中管理服务 URL、Task Queue 名、Temporal 连接配置 |
| `temporal_orchestrator/src/worker.ts` | Worker 工厂（按 Task Queue 创建多实例，`bundleWorkflowCode` 预编译） |
| `temporal_orchestrator/src/main.ts` | 单入口：启动 Workers + 挂载路由 + 注册 Schedules |
| `temporal_orchestrator/src/types.ts` | 全局类型 |
| `temporal_orchestrator/src/workflows/index.ts` | Workflow 统一导出（供 bundle 使用） |
| `temporal_orchestrator/src/routes/index.ts` | 路由注册入口 |
| `temporal_orchestrator/src/schedules/register.ts` | 幂等注册所有 Temporal Schedule |
| `temporal_orchestrator/tests/helpers/setup.ts` | TestWorkflowEnvironment 创建/销毁 |
| `outbound_service/src/routes/internal.ts` | 内部 API：callback/task/handoff 状态更新、allowed hours、DND 检查（§3.11.1） |
| `backend/src/routes/internal/index.ts` | 内部 API 命名空间入口（§3.11.2） |
| `backend/src/routes/internal/notify.ts` | REST→WS 桥：workbench 推送 + SMS mock（§3.11.2） |
| `backend/src/routes/internal/outbound.ts` | 服务端主动外呼入口（§3.11.2） |
| `backend/src/services/outbound-session.ts` | 从 `outbound.ts` 抽取的外呼会话纯业务逻辑（§3.11.2） |
| `backend/src/services/agent-connection-manager.ts` | 从 `agent-ws.ts` 抽取的坐席 WS 连接管理（§3.11.2） |
| `km_service/src/services/pipeline-executor.ts` | pipeline stage 执行器骨架（P0 mock，P3 补真实实现）（§3.11.3） |

### P0 修改

| 文件 | 改动 |
|------|------|
| `outbound_service/src/routes/tasks.ts` | 幂等化：`POST /callbacks` 接受外部 `task_id`，冲突返回 200（§3.11.1） |
| `outbound_service/src/routes/results.ts` | 幂等化：`POST /call-results` 加 `UNIQUE(task_id, call_attempt_no)`（§3.11.1） |
| `outbound_service/src/routes/index.ts` | 注册 internal 路由（§3.11.1） |
| `backend/src/index.ts` | 注册 `/api/internal` 路由命名空间（§3.11.2） |
| `backend/src/chat/outbound.ts` | 拆分：外呼启动逻辑抽取到 `OutboundSessionService`，WS handler 调用 service（§3.11.2） |
| `backend/src/agent/chat/agent-ws.ts` | 拆分：连接 Map 抽取到 `AgentConnectionManager`（§3.11.2） |
| `km_service/src/routes/internal.ts` | 追加 7 个 Temporal 配套端点（扫描 + 流水线 + 治理）（§3.11.3） |
| `wfm_service/src/routes/plans.ts` | 幂等化：`generate` 检查状态、`publish` 已发布返回 200（§3.11.4） |

### P1 新建

| 文件 | 说明 |
|------|------|
| `temporal_orchestrator/src/workflows/callback.ts` | CallbackWorkflow |
| `temporal_orchestrator/src/workflows/human-handoff.ts` | HumanHandoffWorkflow |
| `temporal_orchestrator/src/routes/callbacks.ts` | `/api/temporal/callbacks/*` 路由 |
| `temporal_orchestrator/src/routes/handoffs.ts` | `/api/temporal/handoffs/*` 路由 |
| `temporal_orchestrator/src/activities/outbound.ts` | `getCallbackTask`, `updateCallbackStatus`, `triggerOutboundCall`, `createHandoffCase`, `updateHandoffStatus` |
| `temporal_orchestrator/src/activities/notify.ts` | `notifyWorkbench`, `notifySmsReminder` |
| `temporal_orchestrator/src/activities/work-order.ts` | `createAppointment`, `startWorkflowRun` |
| `temporal_orchestrator/src/activities/index.ts` | 统一 re-export 所有 Activity |
| ~~`outbound_service/src/routes/internal.ts`~~ | 已移至 P0（§3.11.1） |
| ~~`backend/src/routes/internal-notify.ts`~~ | 已移至 P0 `backend/src/routes/internal/notify.ts`（§3.11.2） |
| `temporal_orchestrator/tests/workflows/callback.test.ts` | CallbackWorkflow 测试 |
| `temporal_orchestrator/tests/workflows/human-handoff.test.ts` | HumanHandoffWorkflow 测试 |
| `temporal_orchestrator/tests/activities/outbound.test.ts` | 外呼 Activity 测试（mock HTTP，验证幂等性） |

### P1 修改

| 文件 | 改动 |
|------|------|
| `package.json`（根） | workspaces 加 `"temporal_orchestrator"` |
| `start.sh` | 加入 temporal_orchestrator 启动（单进程 `src/main.ts`） |
| `outbound_service/package.json` | dependencies 加 `"@ai-bot/shared-temporal": "workspace:*"` |
| `outbound_service/src/routes/tasks.ts` | 新增 callback 详情/更新路由 + 用 `signalTemporal` 调 Temporal API |
| `outbound_service/src/routes/index.ts` | 注册 internal 路由 |
| `temporal_orchestrator/src/workflows/index.ts` | 加入 callback + human-handoff 导出 |
| `temporal_orchestrator/src/routes/index.ts` | 挂载 callbacks + handoffs 子路由 |

### P2 新建

| 文件 | 说明 |
|------|------|
| `temporal_orchestrator/src/workflows/outbound-task.ts` | OutboundTaskWorkflow |
| `temporal_orchestrator/src/routes/outbound.ts` | `/api/temporal/outbound/*` 路由 |
| ~~`backend/src/routes/internal-outbound.ts`~~ | 已移至 P0 `backend/src/routes/internal/outbound.ts`（§3.11.2） |
| `temporal_orchestrator/tests/workflows/outbound-task.test.ts` | OutboundTaskWorkflow 测试 |

### P2 修改

| 文件 | 改动 |
|------|------|
| `backend/package.json` | dependencies 加 `"@ai-bot/shared-temporal": "workspace:*"` |
| `backend/src/chat/outbound.ts` | onOpen 后用 `signalTemporal` 发 start Signal |
| `outbound_service/src/routes/results.ts` | 写库后用 `signalTemporal` 发 call-result Signal |
| `temporal_orchestrator/src/activities/outbound.ts` | 扩展 Activity（`getOutboundTask`, `checkAllowedHours`, `checkDnd`, `initiateOutboundCall`） |
| `temporal_orchestrator/src/routes/index.ts` | 挂载 outbound 子路由 |
| `temporal_orchestrator/src/activities/index.ts` | 加入新 Activity 导出 |
| `temporal_orchestrator/src/workflows/index.ts` | 加入 outbound-task 导出 |

### P3 新建

| 文件 | 说明 |
|------|------|
| `temporal_orchestrator/src/workflows/km-document-pipeline.ts` | KmDocumentPipelineWorkflow |
| `temporal_orchestrator/src/workflows/km-refresh.ts` | KmRefreshWorkflow |
| `temporal_orchestrator/src/workflows/policy-expiry-reminder.ts` | PolicyExpiryReminderWorkflow |
| `temporal_orchestrator/src/routes/km.ts` | `/api/temporal/km/*` 路由 |
| `temporal_orchestrator/src/activities/km.ts` | KM Activity |
| ~~`km_service/src/routes/internal.ts`~~ | 已移至 P0（§3.11.3，追加到现有文件） |
| `temporal_orchestrator/tests/workflows/km-document-pipeline.test.ts` | KmDocumentPipelineWorkflow 测试 |

### P3 修改

| 文件 | 改动 |
|------|------|
| `km_service/package.json` | dependencies 加 `"@ai-bot/shared-temporal": "workspace:*"` |
| `km_service/src/routes/documents.ts` | parse 入口改为 dual-path（优先 Temporal，降级走原逻辑） |
| `km_service/src/routes/index.ts` | 注册 internal 路由 |
| `temporal_orchestrator/src/routes/index.ts` | 挂载 km 子路由 |
| `temporal_orchestrator/src/schedules/register.ts` | 加入 `km-refresh-daily` Schedule |
| `temporal_orchestrator/src/activities/index.ts` | 加入 km Activity 导出 |
| `temporal_orchestrator/src/workflows/index.ts` | 加入 km 相关 workflow 导出 |

### P4 新建

| 文件 | 说明 |
|------|------|
| `temporal_orchestrator/src/workflows/daily-schedule.ts` | DailyScheduleWorkflow |
| `temporal_orchestrator/src/workflows/schedule-publish.ts` | SchedulePublishWorkflow |
| `temporal_orchestrator/src/routes/wfm.ts` | `/api/temporal/wfm/*` 路由 |
| `temporal_orchestrator/src/activities/wfm.ts` | 排班 Activity |
| `temporal_orchestrator/tests/workflows/daily-schedule.test.ts` | DailyScheduleWorkflow 测试 |

### P4 修改

| 文件 | 改动 |
|------|------|
| `temporal_orchestrator/src/routes/index.ts` | 挂载 wfm 子路由 |
| `temporal_orchestrator/src/schedules/register.ts` | 加入 `daily-schedule` Schedule |
| `temporal_orchestrator/src/activities/index.ts` | 加入 wfm Activity 导出 |
| `temporal_orchestrator/src/workflows/index.ts` | 加入排班 workflow 导出 |

### P5 新建

| 文件 | 说明 |
|------|------|
| `temporal_orchestrator/src/workflows/hot-issue-mining.ts` | HotIssueMiningWorkflow |
| `temporal_orchestrator/src/workflows/qa-flow-suggestion.ts` | QaFlowSuggestionWorkflow |
| `temporal_orchestrator/src/workflows/auto-test-regression.ts` | AutoTestRegressionWorkflow |
| `temporal_orchestrator/src/routes/analytics.ts` | `/api/temporal/analytics/*` 路由 |
| `temporal_orchestrator/src/activities/analytics.ts` | 分析 Activity |
| `temporal_orchestrator/tests/workflows/hot-issue-mining.test.ts` | HotIssueMiningWorkflow 测试 |

### P5 修改

| 文件 | 改动 |
|------|------|
| `temporal_orchestrator/src/routes/index.ts` | 挂载 analytics 子路由 |
| `temporal_orchestrator/src/schedules/register.ts` | 加入 `hot-issue-mining-weekly` Schedule |
| `temporal_orchestrator/src/activities/index.ts` | 加入 analytics Activity 导出 |
| `temporal_orchestrator/src/workflows/index.ts` | 加入 P5 workflow 导出 |
