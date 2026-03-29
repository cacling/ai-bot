# Work Order 通用入口架构实施计划

## Context

基于 `2026-03-28-work-order-intake-architecture-design.md`，为工单系统补齐"统一入口层""同事项主线层"和"草稿确认层"。

当前系统已有完整的正式工单域底座（11 张表、170+ 测试），但所有场景直接建正式工单，缺少：
- 统一的服务线索收口（Intake）
- 同一事项识别与归并（Issue Thread）
- 草稿确认机制（Draft）
- 自动建单策略引擎（Policy Engine）

目标架构：**Intake → Issue Thread Match → Draft/Decision → Materialization → Workflow** 五段式流水线。

---

## Iteration 1: Schema + 核心服务 + 场景 1（坐席草稿确认建单）

**目标**：端到端流程：坐席提交 intake → 系统分析 + 匹配事项 → 生成草稿 → 坐席确认 → 正式建单。

### 1.1 Schema — 修改 `packages/shared-db/src/schema/workorder.ts`

新增 4 张表：

**work_item_intakes**（待判定的服务线索）
```
id PK, source_kind, source_channel, source_ref,
customer_phone, customer_id, customer_name, subject,
raw_payload_json, normalized_payload_json, signal_json,
dedupe_key, thread_id FK, materialized_item_id FK,
resolution_action, resolution_reason_json,
priority_hint, risk_score, sentiment_score,
status ('new'|'analyzed'|'draft_created'|'materialized'|'discarded'|'failed'),
decision_mode ('manual_confirm'|'auto_create'|'auto_create_if_confident'|'auto_create_and_schedule'),
created_at, updated_at
```

**work_item_drafts**（草稿层）
```
id PK, intake_id FK, target_type ('ticket'|'work_order'),
category_code, title, summary, description,
customer_phone, customer_name, priority, severity,
queue_code, owner_id, workflow_key,
structured_payload_json, appointment_plan_json,
status ('draft'|'pending_review'|'confirmed'|'discarded'|'published'),
confidence_score, review_required (0|1),
reviewed_by, reviewed_at, published_item_id FK,
created_at, updated_at
```

**issue_threads**（同一事项主线）
```
id PK, thread_key UNIQUE, customer_id, customer_phone,
canonical_category_code, canonical_subject,
status ('open'|'resolved'|'closed'),
master_ticket_id FK, latest_item_id FK,
first_seen_at, last_seen_at, reopen_until,
dedupe_window_hours DEFAULT 168,
metadata_json, created_at, updated_at
```

**issue_merge_reviews**（合并审核）
```
id PK, intake_id FK, candidate_thread_id FK,
recommended_action, score_total, score_breakdown_json, match_reason_json,
decision_status ('pending'|'approved'|'rejected'|'executed'|'expired'),
decided_by, decided_at, executed_at, created_at
```

### 1.2 Types — 修改 `work_order_service/src/types.ts`

新增：
- `SourceKind = 'agent_after_service' | 'self_service_form' | 'handoff_overflow' | 'external_monitoring' | 'emotion_escalation'`
- `IntakeStatus`, `DraftStatus`, `IssueThreadStatus`, `MergeReviewStatus`, `ResolutionAction`, `DecisionMode`
- 扩展 `RelatedType` 增加 `'source_intake' | 'source_draft' | 'source_issue_thread'`
- 扩展 `RelationKind` 增加 `'merged_into' | 'same_issue_as' | 'duplicate_of'`

### 1.3 DB — 修改 `work_order_service/src/db.ts`

添加 `workItemIntakes`, `workItemDrafts`, `issueThreads`, `issueMergeReviews` 到 re-export。

### 1.4 新建 6 个服务

**`src/services/intake-service.ts`**
- `createIntake(data)` — 校验 source_kind + raw_payload_json，生成 dedupe_key（SHA-256(source_kind + customer_phone + subject_normalized)），插入 status='new'
- `normalizeIntake(id)` — 解析 raw_payload，提取标准化字段，设 status='analyzed'
- `getIntake(id)`, `listIntakes(filters)`

**`src/services/issue-matching-service.ts`**（最复杂）
- `matchIntake(intakeId)` — 主编排：精确去重 → 候选查询 → 评分 → 阈值判定 → 写 resolution_action
- `scoreCandidate(intake, thread)` — 100 分制评分，6 个维度各为独立纯函数：
  - `scoreIdentity(intake, thread)` 0-30：customer_id 完全匹配 +30，phone 匹配 +20
  - `scoreBusinessObject(intake, thread)` 0-25：同 source_ref +25，同 source_kind +15
  - `scoreCategory(intake, thread)` 0-15：同叶子分类 +15，同父 +8，同域 +5
  - `scoreSemantic(intake, thread)` 0-15：标题完全匹配 +15，子串重叠 +8
  - `scoreRecency(thread)` 0-10：24h +10，72h +6，7d +3
  - `scoreRiskSignal(intake, thread)` 0-5：同风险/情绪标签 +5
- `applyThresholds(score, threadStatus, reopenUntil)` — 返回推荐 resolution_action
- `createThread(intake)` — 新建 issue_thread

Phase 1 阈值（简化版）：
- exact_duplicate → `ignored_duplicate`
- ≥85 (open/resolved) → `append_followup`
- ≥80 (closed 且在 reopen_until 内) → `reopen_master`
- 65-84 → 创建 merge_review
- <65 → `create_new_thread`

**`src/services/draft-service.ts`**
- `generateDraft(intakeId)` — 从 intake 构建草稿，解析 category defaults，设 status='pending_review'
- `getDraft(id)`, `editDraft(id, changes)`
- `confirmDraft(id, reviewedBy)` — 设 confirmed → 调 materializer
- `discardDraft(id, reviewedBy)` — 设 discarded

**`src/services/materializer-service.ts`**
- `materializeDraft(draftId)` — 读草稿 → 调已有 `createTicket()`/`createWorkItem()` → 写 source_intake/source_draft relations → 更新 draft.published_item_id + intake.materialized_item_id
- 使用 dynamic import 调 ticket-service/template-service（避免循环依赖）

**`src/services/policy-engine-service.ts`**
- `resolveDecisionMode(intake)` — Phase 1 全部返回 `'manual_confirm'`

**`src/services/followup-orchestrator-service.ts`**
- `orchestratePostMaterialization(itemId, intake)` — 启动 workflow（如有）、link to thread
- `appendFollowup(threadId, intakeId)` — 基础实现
- `reopenThread(threadId, intakeId)` — 基础实现

### 1.5 新建 4 个路由

**`src/routes/intakes.ts`**
```
POST /           — 创建 intake
GET  /           — 列表（status, source_kind, customer_phone）
GET  /:id        — 详情
POST /:id/match  — 触发匹配
```

**`src/routes/drafts.ts`**
```
POST /generate      — 生成草稿（body: { intake_id }）
GET  /:id           — 详情
PATCH /:id          — 编辑
POST /:id/confirm   — 确认发布
POST /:id/discard   — 丢弃
```

**`src/routes/issue-threads.ts`**
```
GET  /               — 列表
GET  /:id            — 详情（含关联 intakes）
POST /:id/follow-ups — 追加跟进
POST /:id/reopen     — 重开
POST /:id/merge-master — 合并主单（Phase 2 完善）
```

**`src/routes/merge-reviews.ts`**
```
GET  /              — 列表
GET  /:id           — 详情
POST /:id/approve   — 批准
POST /:id/reject    — 驳回
```

### 1.6 修改 `src/server.ts`

挂载 4 个新路由，更新 health check modules。

### 1.7 种子数据 — 修改 `src/seed.ts`

- 2 个 issue_threads（open）
- 2 个 intakes（1 个 materialized，1 个 new）
- 1 个 draft（pending_review）

### 1.8 测试

- **单测**: intake-service, issue-matching-service（评分维度）, draft-service, policy-engine
- **API 测试**: intakes, drafts, issue-threads, merge-reviews
- **集成测试**: `intake-flow.test.ts` — 完整 Scenario 1 端到端（intake → match → draft → confirm → 正式工单）

**文件变更**: 6 新服务 + 4 新路由 + 4 修改 + ~8 新测试文件

---

## Iteration 2: 自动建单路径 + 完整匹配（场景 3 + 场景 5）

**目标**：handoff_overflow 和 emotion_escalation 场景的自动建单，无需人工确认。完善 merge review 审批流程。

### 2.1 Policy Engine 增强 — 修改 `src/services/policy-engine-service.ts`

- `handoff_overflow` → `'auto_create'`
- `emotion_escalation` → risk_score ≥ 70 时 `'auto_create'`，否则 `'auto_create_if_confident'`
- 新增 `shouldAutoCreate(mode, confidenceScore)` 辅助函数

### 2.2 Intake Service 增强 — 修改 `src/services/intake-service.ts`

新增 `processIntakeAuto(intakeId)` — 全自动流水线：
normalize → match → resolveDecisionMode → materialize（跳过 draft）→ orchestrate

### 2.3 Materializer 增强 — 修改 `src/services/materializer-service.ts`

实现 `materializeIntakeDirectly(intakeId)` — 直接从 intake 建正式工单，无 draft 中间层。

### 2.4 新建 `src/services/merge-review-service.ts`

- `createMergeReview(...)` — 创建审核记录
- `approveMergeReview(id, decidedBy)` — 批准 → 执行推荐动作
- `rejectMergeReview(id, decidedBy)` — 驳回 → 新建 thread

### 2.5 Follow-up Orchestrator 完善

完整实现 `appendFollowup`（更新 thread + 主单事件）、`reopenThread`（重开主单）、`mergeMaster`（合并 + 关系写入）。

### 2.6 路由更新

- `POST /api/intakes/:id/process` — 自动处理
- merge-reviews approve/reject 完整实现
- issue-threads merge-master 完整实现

### 2.7 测试

- 场景 3 端到端：handoff_overflow → auto-create → 正式工单
- 场景 5 端到端：emotion_escalation + high risk → auto-create
- merge review 审批流程测试
- 评分 65-84 → pending review → approve/reject 测试

**文件变更**: 1 新服务 + 4 修改 + ~5 新测试文件

---

## Iteration 3: 外部接入 + 自动预约（场景 2 + 场景 4）

**目标**：自助表单建单、舆情 webhook 接入、auto_create_and_schedule 模式。

### 3.1 Intake Service 增强

新增专用 normalizer：
- `normalizeSelfServiceForm(rawPayload)` — 表单字段提取
- `normalizeExternalMonitoring(rawPayload)` — 监控告警提取 + 自动设 risk_score

### 3.2 Policy Engine 最终版

- `self_service_form` → `'auto_create_if_confident'`（confidence ≥ 70）
- `external_monitoring` → severity critical/high 时 `'auto_create_and_schedule'`，否则 `'auto_create'`

### 3.3 Follow-up Orchestrator: 自动预约

`orchestratePostMaterialization` 增加：如果 decision_mode 是 `auto_create_and_schedule` 且有 appointment_plan_json，调 `createAppointment()` 创建子预约。

### 3.4 Webhook 路由

`POST /api/intakes/webhook` — 接收外部监控事件，返回 202 Accepted，fire-and-forget 处理。

### 3.5 测试

- 场景 2：自助表单 → auto-create
- 场景 4：webhook → auto-create + appointment
- 多 intake 归并到同一 thread 的聚合测试

**文件变更**: 3 修改 + ~3 新测试文件

---

## 文件变更汇总

### 新建文件（~20 个）

| 文件 | Iteration | 用途 |
|------|-----------|------|
| `src/services/intake-service.ts` | 1 | Intake 收口 |
| `src/services/issue-matching-service.ts` | 1 | 同事项匹配评分 |
| `src/services/draft-service.ts` | 1 | 草稿管理 |
| `src/services/materializer-service.ts` | 1 | 正式建单 |
| `src/services/policy-engine-service.ts` | 1 | 决策引擎 |
| `src/services/followup-orchestrator-service.ts` | 1 | 后续编排 |
| `src/services/merge-review-service.ts` | 2 | 合并审核 |
| `src/routes/intakes.ts` | 1 | Intake 路由 |
| `src/routes/drafts.ts` | 1 | Draft 路由 |
| `src/routes/issue-threads.ts` | 1 | Thread 路由 |
| `src/routes/merge-reviews.ts` | 1 | Review 路由 |
| + ~9 个测试文件 | 1-3 | 单测 + API 测试 |

### 修改文件（5 个）

| 文件 | 改动 |
|------|------|
| `packages/shared-db/src/schema/workorder.ts` | +4 张表 |
| `work_order_service/src/types.ts` | +7 类型，扩展 RelatedType + RelationKind |
| `work_order_service/src/db.ts` | +4 表 re-export |
| `work_order_service/src/server.ts` | +4 路由挂载 |
| `work_order_service/src/seed.ts` | +intake pipeline 种子数据 |

---

## 迭代依赖

```
Iteration 1 (Schema + 核心服务 + 场景 1) → Iteration 2 (自动建单 + 场景 3/5) → Iteration 3 (外部接入 + 场景 2/4)
```

每个 Iteration 独立可验证。

## 验证方式

每个 Iteration 完成后：
1. `cd work_order_service && bun test` — 全部测试通过（含原有 170+）
2. `cd packages/shared-db && bunx drizzle-kit push` — Schema 变更应用
3. `cd work_order_service && bun run src/seed.ts` — 种子数据写入
4. curl 验证新 API 端点

最终验收：
- Scenario 1: intake → match → draft → confirm → 正式 ticket，可追溯来源
- Scenario 3: handoff_overflow intake → auto-create ticket，无需人工
- Scenario 5: emotion_escalation + high risk → auto-create complaint ticket
- 同客户同问题多次 intake 正确归并到同一 issue_thread
- merge review 人工审批流程可走通
