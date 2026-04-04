# 四 Agent 数据库表结构与 API Contract 草案

> 基于 `triage-agent / service-agent / knowledge-agent / human-support-agent` 四 Agent 架构，为 `ai-bot` 定义一套可落地的数据面与接口面。目标不是推翻现有实现，而是在复用 `sessions / skill runtime / work_order_service` 的前提下，补齐四 Agent 运行所必需的结构化状态、handoff、知识包与记忆层。

**Date**: 2026-04-03  
**Status**: Draft  
**Positioning**: Architecture + Data Contract  
**Related Design**:
- [四 Agent 职责边界与 Handoff Contract 设计](./2026-04-03-four-agent-boundaries-and-handoff-contract.md)
- [完整 Workflow Engine 架构说明](./2026-03-24-complete-workflow-engine-architecture.md)
- [工单模块设计与客服工作台协同方案](./2026-03-28-work-order-module-design.md)
- [Work Order 通用入口架构设计](./2026-03-28-work-order-intake-architecture-design.md)

**Related Current Code**:
- `packages/shared-db/src/schema/platform.ts`
- `packages/shared-db/src/schema/workorder.ts`
- `backend/src/chat/chat.ts`
- `backend/src/engine/skill-runtime.ts`
- `backend/src/services/work-order-client.ts`
- `work_order_service/src/routes/*`

---

## 1. 核心目标

这份草案要解决 4 件事：

1. 明确哪些表继续复用，哪些表必须新增。
2. 明确 `platform / runtime / work_order_service` 三层的 ownership。
3. 给四 Agent 之间的内部 API 一个统一 contract。
4. 给 `human-support-agent` 与 `work_order_service` 的衔接提供稳定的外部接口映射。

---

## 2. 分层结论

推荐把数据面拆成三层：

### 2.1 Platform 层

由 `backend` 持有，负责：

- 会话与消息
- 当前 session 的 agent ownership
- Agent 间 handoff 日志
- knowledge packet 缓存
- memory 候选与长期记忆

### 2.2 Runtime 层

继续复用当前 runtime 表，负责：

- Skill 实例状态
- Skill 实例事件流
- 工具执行审计

### 2.3 Work Order 层

继续由 `work_order_service` 持有，负责：

- intake
- draft
- issue thread
- work item / ticket / work order / appointment / task
- workflow run

一句话：

> `platform` 管 Agent 协作，`runtime` 管业务流程推进，`work_order_service` 管人工支持与后续履约。

---

## 3. 现有表复用结论

## 3.1 直接复用，不建议重做

### Platform

- `sessions`
- `messages`
- `skill_instances`
- `skill_instance_events`
- `execution_records`

这些表已分别覆盖：

- 对话基础状态
- Skill Runtime 持久化状态
- 工具执行审计

### Work Order

- `work_item_intakes`
- `work_item_drafts`
- `issue_threads`
- `work_items`
- `tickets`
- `work_orders`
- `appointments`
- `tasks`
- `work_item_events`
- `work_item_relations`
- `workflow_definitions`
- `workflow_runs`
- `workflow_run_events`

当前 `work_order_service` 的建模已经能够支撑：

- 线索接入
- 草稿确认
- 正式建单
- 跟进与预约
- workflow 驱动的后续履约

因此，不建议为了四 Agent 再造一套新的工单域模型。

## 3.2 现有缺口

当前最明显的缺口不在工单，而在 Agent 协作层：

- `session` 还没有当前 agent ownership 的正式状态
- 还没有结构化的 `agent_handoffs`
- 还没有 `knowledge_packets`
- 还没有 `memory_candidates / memory_items`

---

## 4. 新增表建议

## 4.1 `session_agent_state`

### 作用

记录某个 `session` 当前由哪个 Agent 持有，以及当前会话处于哪种协作状态。

### 建议归属

- `platform`

### 建议字段

```ts
export const sessionAgentState = sqliteTable('session_agent_state', {
  session_id: text('session_id').primaryKey().references(() => sessions.id, { onDelete: 'cascade' }),
  active_agent: text('active_agent').notNull(),        // 'triage-agent' | 'service-agent' | 'knowledge-agent' | 'human-support-agent'
  route_status: text('route_status').notNull(),        // 'idle' | 'routing' | 'executing' | 'waiting_knowledge' | 'waiting_human' | 'paused'
  latest_intent: text('latest_intent'),
  latest_summary: text('latest_summary'),
  active_skill_id: text('active_skill_id'),
  active_instance_id: text('active_instance_id'),
  active_handoff_id: text('active_handoff_id'),
  last_user_message_id: integer('last_user_message_id'),
  last_assistant_message_id: integer('last_assistant_message_id'),
  version: integer('version').notNull().default(1),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});
```

### 说明

- `triage-agent` 更新这张表的频率最高。
- `service-agent` 只在开始/恢复流程时回写 `active_skill_id / active_instance_id`。
- `knowledge-agent` 与 `human-support-agent` 不直接拥有会话主状态，只在切换 owner 时被写入。

### 索引建议

- `idx_session_agent_state_active_agent(active_agent)`
- `idx_session_agent_state_route_status(route_status)`

---

## 4.2 `agent_handoffs`

### 作用

记录所有结构化 Agent 间交接，作为四 Agent 协作的事实来源。

### 建议归属

- `platform`

### 建议字段

```ts
export const agentHandoffs = sqliteTable('agent_handoffs', {
  id: text('id').primaryKey(),
  session_id: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  trace_id: text('trace_id').notNull(),
  from_agent: text('from_agent').notNull(),
  to_agent: text('to_agent').notNull(),
  handoff_type: text('handoff_type').notNull(),        // 'triage_to_service' | 'service_to_knowledge' | 'service_to_human_support' | 'human_support_to_triage'
  intent: text('intent').notNull(),
  priority: text('priority').notNull().default('medium'),
  status: text('status').notNull().default('created'), // 'created' | 'accepted' | 'completed' | 'cancelled' | 'expired' | 'failed'
  reason_codes_json: text('reason_codes_json'),
  payload_json: text('payload_json').notNull(),
  result_json: text('result_json'),
  source_message_id: integer('source_message_id'),
  acked_at: text('acked_at'),
  completed_at: text('completed_at'),
  expires_at: text('expires_at'),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});
```

### 说明

- `payload_json` 存 request 结构。
- `result_json` 存目标 Agent 返回的结构化结果。
- 这张表不是“消息总线”，而是“handoff 审计与恢复锚点”。

### 索引建议

- `idx_agent_handoffs_session_created(session_id, created_at desc)`
- `idx_agent_handoffs_to_status(to_agent, status)`
- `idx_agent_handoffs_trace(trace_id)`

---

## 4.3 `knowledge_packets`

### 作用

缓存 `knowledge-agent` 返回的结构化知识包，避免每次都从全量检索重新构造。

### 建议归属

- `platform`

### 建议字段

```ts
export const knowledgePackets = sqliteTable('knowledge_packets', {
  id: text('id').primaryKey(),
  session_id: text('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
  request_id: text('request_id').notNull(),
  requester_agent: text('requester_agent').notNull(),
  intent: text('intent').notNull(),
  query: text('query').notNull(),
  skill_id: text('skill_id'),
  answer_brief: text('answer_brief').notNull(),
  confidence_score: integer('confidence_score').notNull(), // 0-100
  constraints_json: text('constraints_json'),
  unresolved_points_json: text('unresolved_points_json'),
  scope_json: text('scope_json'),
  expires_at: text('expires_at'),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
```

### 子表：`knowledge_packet_items`

```ts
export const knowledgePacketItems = sqliteTable('knowledge_packet_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  packet_id: text('packet_id').notNull().references(() => knowledgePackets.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  source_type: text('source_type').notNull(),       // 'skill_ref' | 'km_asset' | 'memory' | 'doc'
  source_id: text('source_id').notNull(),
  title: text('title').notNull(),
  snippet: text('snippet').notNull(),
  confidence_score: integer('confidence_score').notNull(),
  freshness: text('freshness'),
  metadata_json: text('metadata_json'),
});
```

### 说明

- `knowledge_packets` 是 `knowledge-agent` 的输出缓存，不是长期知识库。
- 默认允许 TTL 过期，避免使用陈旧证据。

---

## 4.4 `memory_candidates`

### 作用

承接“本轮可能应该写入长期记忆的候选项”，防止 Agent 直接把所有对话内容污染进长期记忆。

### 建议归属

- `platform`

### 建议字段

```ts
export const memoryCandidates = sqliteTable('memory_candidates', {
  id: text('id').primaryKey(),
  session_id: text('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
  source_agent: text('source_agent').notNull(),
  scope_type: text('scope_type').notNull(),         // 'global' | 'user' | 'workspace' | 'agent' | 'agent_user'
  scope_key: text('scope_key').notNull(),
  memory_type: text('memory_type').notNull(),       // 'user_pref' | 'policy_hint' | 'workflow_hint' | 'terminology' | 'tool_hint'
  candidate_text: text('candidate_text').notNull(),
  evidence_json: text('evidence_json'),
  status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'rejected' | 'expired'
  proposed_by: text('proposed_by'),
  decided_by: text('decided_by'),
  decided_at: text('decided_at'),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
```

---

## 4.5 `memory_items`

### 作用

存放长期记忆的提炼结果，供 `triage-agent / knowledge-agent / service-agent` 按 scope 检索。

### 建议归属

- `platform`

### 建议字段

```ts
export const memoryItems = sqliteTable('memory_items', {
  id: text('id').primaryKey(),
  scope_type: text('scope_type').notNull(),         // 'global' | 'user' | 'workspace' | 'agent' | 'agent_user'
  scope_key: text('scope_key').notNull(),
  memory_type: text('memory_type').notNull(),
  content: text('content').notNull(),
  source_candidate_id: text('source_candidate_id'),
  confidence_score: integer('confidence_score').notNull().default(80),
  freshness_ttl_days: integer('freshness_ttl_days'),
  revision: integer('revision').notNull().default(1),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});
```

### 说明

- 这张表只存提炼后的高价值记忆，不存原始会话日志。
- 向量索引、FTS5、关键词倒排都可以作为这张表的派生索引，不必写死在主 schema 中。

---

## 5. 三层数据面的职责归属

| 数据对象 | 所属层 | Canonical Owner |
| --- | --- | --- |
| `sessions / messages` | `platform` | backend |
| `session_agent_state` | `platform` | `triage-agent` |
| `agent_handoffs` | `platform` | orchestrator |
| `knowledge_packets` | `platform` | `knowledge-agent` |
| `memory_candidates / memory_items` | `platform` | memory service |
| `skill_instances / skill_instance_events` | `runtime` | `service-agent` |
| `execution_records` | `runtime` | tool runtime |
| `work_item_intakes / drafts / threads / items / workflow_runs` | `work_order_service` | `human-support-agent` + work_order_service |

---

## 6. 推荐的最小迁移策略

为了尽量贴合当前仓库，推荐分 2 批做：

### 6.1 第一批

先新增：

- `session_agent_state`
- `agent_handoffs`

这两张表就足以把四 Agent 的协作边界先搭起来。

### 6.2 第二批

再新增：

- `knowledge_packets`
- `knowledge_packet_items`
- `memory_candidates`
- `memory_items`

这样知识缓存和长期记忆才会开始真正进入系统。

---

## 7. API 设计总览

建议 API 分成两层：

### 7.1 Agent-facing Internal API

给四 Agent 和 orchestrator 用的内部接口，建议挂在 `backend` 内部命名空间。

### 7.2 Work Order Service API

继续复用已有 `work_order_service` 的 REST 接口，不轻易重造。

---

## 8. Agent-facing Internal API 草案

建议统一前缀：

```txt
/internal/agent
```

## 8.1 `POST /internal/agent/triage/decide`

### 用途

由入口层调用，请 `triage-agent` 对当前消息做路由决策。

### Request

```json
{
  "session_id": "sess_001",
  "channel": "online",
  "user_message": "我想查下停机保号怎么办",
  "phone": "13800000001",
  "lang": "zh",
  "active_workflow": null,
  "recent_summary": "用户上轮咨询账单，已结束",
  "memory_context": ["用户偏好简洁答复"]
}
```

### Response

```json
{
  "decision_type": "start_service",
  "target_agent": "service-agent",
  "primary_intent": "temporary_service_suspension",
  "confidence": 0.92,
  "reason_codes": ["matched_skill_trigger", "high_confidence"],
  "slots": {
    "phone": "13800000001"
  },
  "knowledge_query": null,
  "clarification_question": null
}
```

### 状态副作用

- upsert `session_agent_state`
- 如需 handoff，则创建 `agent_handoffs`

---

## 8.2 `POST /internal/agent/service/turn`

### 用途

由 orchestrator 调用 `service-agent` 执行一次业务 turn。

### Request

```json
{
  "session_id": "sess_001",
  "trigger_type": "start",
  "skill_id": "service-suspend",
  "user_message": "我想办停机保号",
  "phone": "13800000001",
  "lang": "zh",
  "resolved_slots": {
    "phone": "13800000001"
  },
  "knowledge_packets": []
}
```

### Response

```json
{
  "result_type": "user_reply",
  "user_text": "我先帮您核查当前号码是否满足办理条件。",
  "current_workflow": {
    "instance_id": "inst_001",
    "skill_id": "service-suspend",
    "current_step_id": "check_eligibility",
    "pending_confirm": false,
    "finished": false
  },
  "tool_facts": [
    {
      "tool_name": "query_subscriber",
      "success": true,
      "has_data": true,
      "fact_type": "identity",
      "summary": "号码状态正常，可继续查询办理条件"
    }
  ],
  "next_action": "continue_workflow",
  "handoff_request": null,
  "knowledge_request": null
}
```

### 失败分支

- `result_type = "need_knowledge"`
- `result_type = "need_human_support"`
- `result_type = "workflow_completed"`

---

## 8.3 `POST /internal/agent/knowledge/query`

### 用途

由 `triage-agent` 或 `service-agent` 发起知识检索。

### Request

```json
{
  "request_id": "kr_001",
  "session_id": "sess_001",
  "requester": "service-agent",
  "query": "停机保号的最短办理周期和限制条件",
  "intent": "temporary_service_suspension",
  "scope": ["skill_refs", "km_assets", "workspace_memory"],
  "skill_id": "service-suspend",
  "constraints": {
    "top_k": 5,
    "freshness_days": 180,
    "require_sources": true
  }
}
```

### Response

```json
{
  "packet_id": "kp_001",
  "query": "停机保号的最短办理周期和限制条件",
  "answer_brief": "需先满足无欠费且不在特殊限制状态，具体周期以业务规则为准。",
  "evidence_items": [
    {
      "source_type": "skill_ref",
      "source_id": "service-suspend/ref-eligibility",
      "title": "办理条件说明",
      "snippet": "办理前需确认号码状态正常且无欠费。",
      "confidence": 0.93,
      "freshness": "2026-03-01"
    }
  ],
  "constraints": [
    "未发现面向所有渠道统一规则",
    "需要以工具查询结果为准"
  ],
  "unresolved_points": [],
  "confidence": 0.87
}
```

### 状态副作用

- insert `knowledge_packets`
- insert `knowledge_packet_items`

---

## 8.4 `POST /internal/agent/human-support/handoff`

### 用途

由 `triage-agent` 或 `service-agent` 发起正式人工支持升级。

### Request

```json
{
  "request_id": "hs_001",
  "session_id": "sess_001",
  "source_agent": "service-agent",
  "handoff_reason": "workflow_blocked",
  "current_intent": "temporary_service_suspension",
  "user_message": "你帮我直接办了吧",
  "workflow_context": {
    "instance_id": "inst_001",
    "skill_id": "service-suspend",
    "current_step_id": "need_manual_review",
    "pending_confirm": false
  },
  "tool_facts": [
    {
      "tool_name": "query_subscriber",
      "success": true,
      "has_data": true,
      "fact_type": "identity",
      "summary": "号码状态正常"
    }
  ],
  "recommended_actions": [
    "人工确认特殊办理条件",
    "必要时创建执行工单"
  ],
  "priority": "high"
}
```

### Response

```json
{
  "result_type": "handoff_created",
  "handoff_id": "ah_001",
  "summary": "用户咨询停机保号，机器人已完成基础核查，但当前步骤需人工确认特殊办理条件。",
  "work_order": {
    "id": "wo_001",
    "type": "work_order",
    "status": "new",
    "queue_code": "frontline_online"
  },
  "resume_context": {
    "session_id": "sess_001",
    "instance_id": "inst_001",
    "suggested_next_step": "manual_review"
  }
}
```

### 状态副作用

- insert `agent_handoffs`
- 调用 `work_order_service`
- update `session_agent_state.route_status = waiting_human`

---

## 8.5 `POST /internal/agent/handoffs/:id/complete`

### 用途

当目标 Agent 完成处理后，回写 handoff 结果。

### Request

```json
{
  "result_json": {
    "summary": "已创建工单并通知人工处理",
    "work_order_id": "wo_001"
  },
  "status": "completed"
}
```

### Response

```json
{
  "success": true
}
```

---

## 8.6 `GET /internal/agent/sessions/:id/state`

### 用途

统一拉取当前 session 的协作态，供调试、工作台、回放使用。

### Response

```json
{
  "session_id": "sess_001",
  "agent_state": {
    "active_agent": "human-support-agent",
    "route_status": "waiting_human",
    "latest_intent": "temporary_service_suspension",
    "active_skill_id": "service-suspend",
    "active_instance_id": "inst_001",
    "active_handoff_id": "ah_001"
  },
  "active_workflow": {
    "instance_id": "inst_001",
    "current_step_id": "manual_review"
  },
  "recent_handoffs": [],
  "recent_packets": []
}
```

---

## 9. `human-support-agent` 到 `work_order_service` 的映射

核心原则：

- 尽量复用已有路由
- 由 `human-support-agent` 负责 orchestration
- 不要求 `work_order_service` 理解四 Agent 内部状态

## 9.1 创建人工支持线索

优先使用：

```txt
POST /api/intakes
```

建议 `source_kind`：

- `agent_after_service`
- `handoff_overflow`
- `emotion_escalation`

示例：

```json
{
  "source_kind": "agent_after_service",
  "source_channel": "online",
  "source_ref": "sess_001",
  "customer_phone": "13800000001",
  "customer_name": "张三",
  "subject": "停机保号人工支持",
  "priority_hint": "high",
  "raw_payload": {
    "handoff_id": "ah_001",
    "current_intent": "temporary_service_suspension",
    "workflow_context": {
      "instance_id": "inst_001",
      "skill_id": "service-suspend",
      "current_step_id": "manual_review"
    },
    "tool_facts": [
      {
        "tool_name": "query_subscriber",
        "summary": "号码状态正常"
      }
    ]
  }
}
```

## 9.2 自动处理线索

复用：

```txt
POST /api/intakes/:id/process
```

适用：

- 可自动落成 draft
- 或可直接 materialize 为 ticket / work_order

## 9.3 需要人工审核的草稿

复用：

```txt
POST /api/drafts/generate
POST /api/drafts/:id/confirm
POST /api/drafts/:id/discard
```

## 9.4 直接建 Ticket

复用：

```txt
POST /api/tickets
```

适用：

- 用户投诉
- 服务请求需人工受理
- 需要一个 customer-visible case

## 9.5 直接建 Work Order

复用：

```txt
POST /api/work-orders
```

适用：

- 执行类后续动作
- 回访、审核、复核、外部履约

## 9.6 触发工单 workflow

复用：

```txt
POST /api/workflows/runs
POST /api/workflows/runs/:id/signal
```

---

## 10. 建议新增但非必需的 `work_order_service` API

当前路由已经能用，但如果要让 `human-support-agent` 更顺手，建议再新增 3 个 facade API。

## 10.1 `POST /api/human-support/materialize`

### 作用

给 `human-support-agent` 一个单入口：

- intake
- decision
- draft
- direct create

都由 `work_order_service` 内部统一处理。

### 价值

- 减少 backend 编排复杂度
- 降低 `human-support-agent` 对工单域内部细节的耦合

## 10.2 `GET /api/work-items/:id/timeline`

### 作用

统一返回：

- item detail
- events
- relations
- workflow run summary

适合工作台直接消费。

## 10.3 `POST /api/work-items/:id/relations`

### 作用

显式为工单挂接：

- `session`
- `skill_instance`
- `execution_record`
- `agent_handoff`

方便回放和审计。

---

## 11. 错误码建议

Agent-facing internal API 建议统一错误码：

- `SESSION_NOT_FOUND`
- `WORKFLOW_NOT_FOUND`
- `HANDOFF_NOT_FOUND`
- `HANDOFF_EXPIRED`
- `INVALID_AGENT_TRANSITION`
- `KNOWLEDGE_UNAVAILABLE`
- `MEMORY_SCOPE_INVALID`
- `WORK_ORDER_SERVICE_UNAVAILABLE`
- `POLICY_REJECTED`
- `LOW_CONFIDENCE_BLOCKED`

这样后续 eval 和 trace 才能按错误类型统计。

---

## 12. 幂等性建议

### 必须支持幂等的接口

- `POST /internal/agent/human-support/handoff`
- `POST /api/intakes`
- `POST /api/tickets`
- `POST /api/work-orders`

### 幂等键建议

- `trace_id`
- `handoff_id`
- `source_ref`
- `source_session_id + source_step_id + current_intent`

这样能避免：

- 同一轮重复建工单
- 同一 handoff 多次落单
- 重试时重复创建 intake

---

## 13. 最小实施顺序

### Phase 1

- 新增 `session_agent_state`
- 新增 `agent_handoffs`
- 新增 `GET /internal/agent/sessions/:id/state`
- 将 `triage-agent` 接入这两张表

### Phase 2

- 新增 `knowledge_packets / knowledge_packet_items`
- 实现 `POST /internal/agent/knowledge/query`

### Phase 3

- 新增 `memory_candidates / memory_items`
- 建立 memory write-back 流程

### Phase 4

- 视复杂度决定是否增加 `work_order_service` facade API

---

## 14. 最终判断

这份草案的核心不是“加很多表”，而是把现有系统补成一个完整闭环：

- 用现有 `sessions + skill runtime + work_order_service`
- 补最少的 4 张关键协作表：
  - `session_agent_state`
  - `agent_handoffs`
  - `knowledge_packets`
  - `memory_items`

只要这层补起来，四 Agent 架构就不再只是概念，而会变成：

- 有 owner
- 有 handoff
- 有证据包
- 有长期记忆
- 有工单落点

的真正生产化系统。

