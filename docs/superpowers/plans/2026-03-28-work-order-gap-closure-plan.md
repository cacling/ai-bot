# Work Order 缺口补齐实施计划

> 面向当前 `work_order_service` 的补齐方案，重点覆盖四个缺口：
> 1. `Ticket`
> 2. `Task/Sub-ticket`
> 3. `Workflow`
> 4. `Appointment -> Parent Work Order` 驱动闭环

**Date**: 2026-03-28  
**Status**: Draft  
**Service**: `work_order_service`

**Current Baseline**:
- 已有：`work_items`、`work_orders`、`appointments`、`work_item_events`、`work_item_relations`、`work_item_templates`、`work_queues`
- 已有：`work-orders`、`work-items`、`appointments`、`templates` 路由
- 未完成：`tickets`、`tasks`、`workflow_definitions`、`workflow_runs`、`workflow_run_events`
- 半完成：`appointment-service` 已开始补“父工单状态驱动”，但 API、策略和闭环还没全接完

---

## 1. 目标

把当前服务从“Phase 1 底座”升级为“可承载主工单 + 子任务 + 预约 + 流程编排”的完整工单域服务。

阶段目标：

1. `Ticket` 可落库、可列表、可详情、可流转
2. `Task` 可落库、可挂父单、可完成、可阻塞父单
3. `Sub-ticket` 通过 `work_items.parent_id` 正式支持，且可按规则升级
4. `Workflow` 可驱动：
   - 自动建子工单
   - 自动建预约
   - 等外部信号
   - 关闭父单
5. `Appointment` 能稳定驱动父 `Work Order`

---

## 2. 具体实施方案

## 2.1 Ticket

### 2.1.1 Schema

在 [packages/shared-db/src/schema/workorder.ts](/Users/chenjun/Documents/obsidian/workspace/ai-bot/packages/shared-db/src/schema/workorder.ts) 增加：

```ts
export const tickets = sqliteTable('tickets', {
  item_id: text('item_id').primaryKey().references(() => workItems.id, { onDelete: 'cascade' }),
  ticket_category: text('ticket_category').notNull(), // 'inquiry' | 'complaint' | 'incident' | 'request'
  issue_type: text('issue_type'),
  intent_code: text('intent_code'),
  customer_visible_status: text('customer_visible_status'),
  resolution_summary: text('resolution_summary'),
  resolution_code: text('resolution_code'),
  satisfaction_status: text('satisfaction_status'),
  can_reopen_until: text('can_reopen_until'),
  metadata_json: text('metadata_json'),
});
```

### 2.1.2 Service

新增：

- `work_order_service/src/services/ticket-service.ts`

职责：

- 创建 ticket
- 查询 ticket 列表
- ticket 流转
- 创建 `ticket -> sub-ticket`
- 创建 `ticket -> task`

### 2.1.3 Route

新增：

- `work_order_service/src/routes/tickets.ts`

接口：

- `GET /api/tickets`
- `POST /api/tickets`
- `GET /api/tickets/:id`
- `POST /api/tickets/:id/transition`
- `POST /api/tickets/:id/children`
- `POST /api/tickets/:id/tasks`

### 2.1.4 聚合详情支持

在 [work_order_service/src/services/item-service.ts](/Users/chenjun/Documents/obsidian/workspace/ai-bot/work_order_service/src/services/item-service.ts) 的 `getWorkItemDetail()` 中补：

- `ticket` -> join `tickets`

并返回：

- `child_work_orders`
- `child_tasks`
- `child_appointments`

而不是只有笼统的 `children`

---

## 2.2 Task / Sub-ticket

### 2.2.1 Schema

在 [packages/shared-db/src/schema/workorder.ts](/Users/chenjun/Documents/obsidian/workspace/ai-bot/packages/shared-db/src/schema/workorder.ts) 增加：

```ts
export const tasks = sqliteTable('tasks', {
  item_id: text('item_id').primaryKey().references(() => workItems.id, { onDelete: 'cascade' }),
  task_type: text('task_type').notNull(),
  checklist_json: text('checklist_json'),
  depends_on_item_id: text('depends_on_item_id'),
  auto_complete_on_event: text('auto_complete_on_event'),
  completed_by: text('completed_by'),
  completed_at: text('completed_at'),
  metadata_json: text('metadata_json'),
});
```

### 2.2.2 Sub-ticket 建模原则

不新增独立表。

`Sub-ticket` 直接使用：

- `work_items.type = 'work_order'`
- `parent_id = parent item`
- `root_id = same root`

同时新增一个派生关系事件：

- 父单写 `child_created`
- 子单写 relation：`derived_from`

### 2.2.3 Service

新增：

- `work_order_service/src/services/task-service.ts`

能力：

- 创建 task
- 完成 task
- 阻塞/解除阻塞
- 根据 `depends_on_item_id` 判断是否可开始

### 2.2.4 Route

新增：

- `work_order_service/src/routes/tasks.ts`

接口：

- `POST /api/tasks`
- `GET /api/tasks/:id`
- `POST /api/tasks/:id/start`
- `POST /api/tasks/:id/complete`
- `POST /api/tasks/:id/block`
- `POST /api/tasks/:id/unblock`

### 2.2.5 父单联动

在 task 完成时增加策略：

- 若父单处于 `waiting_internal`
- 且所有 required child task 均完成
- 则父单自动回到 `open` 或 `in_progress`

建议放到：

- `transition-service.ts` 的公共联动函数
- 或新增 `aggregate-state-service.ts`

---

## 2.3 Workflow

## 2.3.1 Schema

在 [packages/shared-db/src/schema/workorder.ts](/Users/chenjun/Documents/obsidian/workspace/ai-bot/packages/shared-db/src/schema/workorder.ts) 增加：

```ts
export const workflowDefinitions = sqliteTable('workflow_definitions', {
  id: text('id').primaryKey(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  target_type: text('target_type').notNull(), // 'ticket' | 'work_order' | 'appointment' | 'task'
  version_no: integer('version_no').notNull(),
  status: text('status').notNull(), // 'draft' | 'active' | 'retired'
  spec_json: text('spec_json').notNull(),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const workflowRuns = sqliteTable('workflow_runs', {
  id: text('id').primaryKey(),
  definition_id: text('definition_id').notNull().references(() => workflowDefinitions.id, { onDelete: 'cascade' }),
  item_id: text('item_id').notNull().references(() => workItems.id, { onDelete: 'cascade' }),
  status: text('status').notNull(), // 'running' | 'waiting_signal' | 'waiting_child' | 'completed' | 'failed' | 'cancelled'
  current_node_id: text('current_node_id'),
  waiting_signal: text('waiting_signal'),
  context_json: text('context_json'),
  started_at: text('started_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  finished_at: text('finished_at'),
});

export const workflowRunEvents = sqliteTable('workflow_run_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  run_id: text('run_id').notNull().references(() => workflowRuns.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  event_type: text('event_type').notNull(),
  node_id: text('node_id'),
  payload_json: text('payload_json'),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
```

## 2.3.2 Runtime 目标

Workflow 不替代工单状态，而是驱动：

- `create_child_work_order`
- `create_task`
- `create_appointment`
- `wait_signal`
- `close_item`

### 建议节点模型

`spec_json` 支持以下节点：

- `start`
- `create_item`
- `create_appointment`
- `transition_item`
- `wait_signal`
- `wait_children`
- `if`
- `end`

### 建议信号

- `customer_confirmed`
- `appointment_completed`
- `appointment_no_show`
- `child_item_resolved`
- `task_completed`
- `manual_resume`

## 2.3.3 Service

新增：

- `work_order_service/src/services/workflow-service.ts`

提供：

- `startWorkflowForItem(definitionKey, itemId, context)`
- `signalWorkflow(instanceId, signal, payload)`
- `runWorkflowTick(instanceId)`

## 2.3.4 Route

新增：

- `work_order_service/src/routes/workflows.ts`

接口：

- `GET /api/workflows/definitions`
- `POST /api/workflows/runs`
- `GET /api/workflows/runs/:id`
- `POST /api/workflows/runs/:id/signal`

## 2.3.5 与模板打通

在 `work_item_templates.workflow_key` 上落地逻辑：

- 模板创建 item 时，如果 `workflow_key` 不为空
- 自动 `startWorkflowForItem()`

这一步要改：

- [work_order_service/src/services/template-service.ts](/Users/chenjun/Documents/obsidian/workspace/ai-bot/work_order_service/src/services/template-service.ts)

并且修掉当前问题：

- 模板只创建 `work_item`
- 但没创建对应 detail 行

模板实例化要改成：

1. 创建 `work_item`
2. 按 `applies_to_type` 创建 detail 行
3. 可选启动 workflow

---

## 2.4 Appointment 对父 Work Order 的驱动

## 2.4.1 当前状态

当前 [work_order_service/src/services/appointment-service.ts](/Users/chenjun/Documents/obsidian/workspace/ai-bot/work_order_service/src/services/appointment-service.ts) 已经开始做两件事：

- 创建预约时，父工单从 `new/open` 推到 `scheduled`
- 预约状态流转时，按动作推导父工单状态

这说明方向已经开始对了，但还缺两层补齐：

1. API 没把 `start` 暴露出来
2. 父工单状态更新仍然是“静态映射”，没有结合父工单类型、验证模式、workflow

## 2.4.2 先补 API

修改：

- [work_order_service/src/routes/appointments.ts](/Users/chenjun/Documents/obsidian/workspace/ai-bot/work_order_service/src/routes/appointments.ts)

新增：

```ts
POST /api/appointments/:id/start
```

调用：

- `startAppointment(id, actor)`

## 2.4.3 抽出父工单联动策略

把 `deriveParentStatusFromAppointment()` 从 `appointment-service.ts` 抽到新文件：

- `work_order_service/src/policies/parent-sync-policy.ts`

输入：

- parent work item
- appointment action
- appointment detail

输出：

- 父工单下一状态
- 是否需要写事件
- 是否需要发 workflow signal

示例规则：

- `confirm` -> 父单 `scheduled`
- `check_in/start` -> 父单 `in_progress`
- `complete`
  - 如果父单 `verification_mode = none` -> `resolved`
  - 如果父单 `verification_mode != none` -> `waiting_verification`
- `no_show` -> `waiting_customer`
- `cancel` -> 若仍有其他有效 appointment 则不回退，否则 `open`

## 2.4.4 预约驱动 workflow

在 appointment 状态流转成功后：

- 若父单绑定了 `workflow_run`
- 自动向 workflow 发 signal

映射建议：

- `confirm` -> `appointment_confirmed`
- `start` -> `appointment_started`
- `complete` -> `appointment_completed`
- `no_show` -> `appointment_no_show`
- `cancel` -> `appointment_cancelled`

---

## 3. 与现有 skill-runtime 的具体接法

当前 [backend/src/engine/skill-runtime.ts](/Users/chenjun/Documents/obsidian/workspace/ai-bot/backend/src/engine/skill-runtime.ts) 在 `human` 节点的行为是：

- 写 `handoff` 事件
- `finishInstance(..., 'escalated')`
- 结束

这对真正的工单闭环不够。

## 3.1 最小接法

新增一个轻量适配器服务：

- `backend/src/services/work-order-client.ts`

提供：

- `createTicketFromSkill(...)`
- `createWorkOrderFromSkill(...)`
- `createAppointmentFromSkill(...)`
- `signalWorkflow(...)`

## 3.2 Skill-runtime 接入点

在 `skill-runtime.ts` 里先不大改整体结构，只在两类点插入：

### A. `human` 步骤

策略：

- 若 step label / metadata 命中“回访 / 营业厅 / App 自助 / 人工解锁 / 审核”
- 不直接结束
- 先创建工单或预约
- 把 `skill_instance` 写入 `work_item_relations`
- 再决定：
  - `finished = true`
  - 或 `waiting_work_order`

### B. `tool` 步骤成功后

对于特定工具结果：

- `create_callback_task`
- `transfer_to_human`
- `send_followup_sms`

可同步写入 `work_item_events`

## 3.3 第二阶段接法

当 `workflow_service` 成熟后，再把某些 `human` 步骤替换为：

- 启动 `workflow_run`
- 由 workflow 决定后续建单/建预约/等待信号

---

## 4. 文件级改造清单

## 4.1 shared-db

修改：

- [packages/shared-db/src/schema/workorder.ts](/Users/chenjun/Documents/obsidian/workspace/ai-bot/packages/shared-db/src/schema/workorder.ts)

新增：

- `tickets`
- `tasks`
- `workflowDefinitions`
- `workflowRuns`
- `workflowRunEvents`

## 4.2 work_order_service

新增：

- `src/routes/tickets.ts`
- `src/routes/tasks.ts`
- `src/routes/workflows.ts`
- `src/services/ticket-service.ts`
- `src/services/task-service.ts`
- `src/services/workflow-service.ts`
- `src/policies/parent-sync-policy.ts`

修改：

- `src/server.ts`
- `src/services/template-service.ts`
- `src/services/item-service.ts`
- `src/services/appointment-service.ts`
- `src/routes/appointments.ts`

## 4.3 backend

新增：

- `backend/src/services/work-order-client.ts`

修改：

- `backend/src/engine/skill-runtime.ts`

---

## 5. 推荐迭代顺序

### Iteration 1

- 补 `Appointment /start`
- 修模板实例化 detail 行
- 抽父单同步策略

### Iteration 2

- 加 `tickets`
- 加 `tasks`
- 加 `tickets / tasks` API

### Iteration 3

- 加 `workflow_*` 表
- 加 `workflow-service`
- 打通模板自动起 workflow

### Iteration 4

- 接 `skill-runtime`
- 让 `human` 节点真正落单

---

## 6. 成功标准

补齐后，系统应该能做到：

1. 客户诉求先落 `Ticket`
2. 从 `Ticket` 派生 `Work Order`
3. 从 `Work Order` 派生 `Appointment`
4. 从 `Ticket/Work Order` 派生 `Task` 或 `Sub-ticket`
5. `Appointment` 状态变化能推父工单
6. `Workflow` 能等待预约完成/子单完成后继续
7. `skill-runtime` 能把“转人工/后续处理”正式落入工单域
