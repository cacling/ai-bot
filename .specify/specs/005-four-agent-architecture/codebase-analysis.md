# 四 Agent 架构改造：代码差距分析与改造方案

**功能分支**: `005-four-agent-architecture`
**创建日期**: 2026-04-03
**状态**: Draft
**输入**: `docs/superpowers/specs/2026-04-03-four-agent-design-index.md` 及其 11 篇设计文档

---

## 1. 现状总结（As-Is）

### 1.1 当前架构：单体 Agent + 双路径路由



```
用户消息 → chat-ws.ts
           ├─ routeSkill(sessionId)
           │   ├─ 有活跃 workflow instance → skill-runtime.ts (V2)
           │   └─ 无活跃 instance         → runner.ts (legacy LLM)
           └─ runAgent() / runSkillTurn()
               ├─ 系统提示词（含全部技能列表）
               ├─ MCP 工具（全量注入 LLM）
               ├─ SOP Guard（状态约束）
               └─ 返回文本 + 卡片 + 状态图
```

**关键特征**：

| 维度 | 现状 |
|------|------|
| 路由决策 | `skill-router.ts`（47 行）：仅判断"有无活跃 instance"，无意图/话题/信心度判断 |
| 意图理解 | 由 LLM 在 `runAgent()` 中隐式完成（混在系统提示里） |
| 知识检索 | 无独立知识 Agent；KM 搜索仅作为坐席侧卡片功能 |
| 人工转接 | `transfer_to_human` 是 LLM 可调用的一个工具，触发后走 `materializeOnHandoff()` |
| 会话状态 | `sessions` + `messages` 表；无 `session_agent_state`，无 `agent_handoffs` |
| 记忆系统 | 无跨会话记忆；无 memory_items/memory_candidates 表 |
| 可观测性 | `executionRecords` 记录工具调用；无 Agent 级 trace 链路 |

### 1.2 关键代码文件与职责

| 文件 | 行数 | 当前职责 | 四 Agent 中的角色 |
|------|------|---------|-----------------|
| `engine/runner.ts` | 801 | 系统提示构建 + LLM 循环 + 工具执行 + 处置解析 | → 拆分为 triage 调度 + service-agent 执行 |
| `engine/skill-router.ts` | 47 | 仅判断有无活跃 instance | → 升级为 triage-agent 入口 |
| `engine/skill-runtime.ts` | 335 | Workflow 步骤机执行 | → 归入 service-agent |
| `chat/chat-ws.ts` | 604 | WebSocket 入口 + 路由 + 转接 | → 精简为消息分发，路由逻辑抽出 |
| `agent/chat/agent-ws.ts` | 274 | 坐席 WS + 转接分析 | → 对接 human-support-agent |
| `services/km-client.ts` | — | KM HTTP 调用 | → knowledge-agent 的数据源之一 |

---

## 2. 目标架构（To-Be）

### 2.1 四 Agent 职责边界

```
用户消息 → chat-ws.ts（瘦入口）
           ↓
       triage-agent        ← 前门控制器，判断"谁接下一轮"
           ├→ service-agent      ← 业务执行（技能流程 + 工具调用）
           ├→ knowledge-agent    ← 检索证据包（不做最终回答）
           ├→ human-support-agent ← 人工升级桥（工单/Intake/恢复）
           └→ ask_clarification  ← 要求用户澄清
```

### 2.2 核心设计原则

1. **单一职责**：triage 只路由不执行，knowledge 只检索不回答，service 不转接
2. **结构化交接**：Agent 间传递契约对象（HandoffEnvelope），不是自由文本
3. **唯一状态归属**：每类数据有且仅有一个 canonical owner
4. **事实传递**：交接携带结构化事实，不传全量上下文
5. **失败回退**：失败 Agent 归还控制权给 triage，除非正式升级人工

---

## 3. 逐模块差距分析

### 3.1 Triage Agent（差距最大，需新建）

| 设计要求 | 现状 | 差距 | 改造工作量 |
|---------|------|------|-----------|
| 四层决策栈（硬规则→结构化判断→LLM语义→阈值兜底） | `routeSkill()` 仅查 DB 有无活跃 instance | **全缺** | 大 |
| `generateObject()` + Zod schema 结构化输出 | 无 | **全缺** | 中 |
| 话题切换三分类（same/possible/clear） | 无话题判断 | **全缺** | 中 |
| 多意图队列（pending_intents） | 无 | **全缺** | 小 |
| `session_agent_state` 表 | 不存在 | **全缺** | 小（DDL） |
| `agent_handoffs` 表 | 不存在 | **全缺** | 小（DDL） |
| 输入信号集（session/runtime/human_bridge/semantics/relation） | 部分可从现有数据推导 | 部分缺 | 中 |
| Shadow 模式（旁路观测不影响生产） | 无 | **全缺** | 小 |

**改造方案**：

1. **P0**：新建 `session_agent_state` 和 `agent_handoffs` 表，在现有路径中写入控制面数据（不改路由行为）
2. **P1**：新建 `engine/triage-agent.ts`，实现 `routeTurn(input): TriageResolvedDecision`
   - Layer 0 硬规则：6 条优先级规则（从设计文档直接翻译）
   - Layer 1 候选评分：加减分规则表
   - LLM 层：`generateObject({ model, schema: triageOutputSchema, prompt })` 输出候选分数
   - 阈值解析：top1 ≥ 85 直接执行，70-85 带护栏执行，< 60 澄清
3. **P1 Shadow**：在 `chat-ws.ts` 中并行调用 triage-agent，记录决策但不使用结果
4. **P2**：替换 `routeSkill()` 为 `routeTurn()`，chat-ws.ts 基于 triage 决策分派

**关键文件变更**：

```
新建：
  engine/triage-agent.ts           — triage 核心逻辑
  engine/triage-prompt.ts          — prompt 模板 + Zod schema
  engine/triage-rules.ts           — Layer 0 硬规则 + Layer 1 评分规则
  db/schema/platform.ts            — 新增 session_agent_state, agent_handoffs 表

修改：
  engine/skill-router.ts           — 从 routeSkill() 升级为 routeTurn() 的 thin wrapper
  chat/chat-ws.ts                  — 路由逻辑从内联改为调用 triage-agent
```

---

### 3.2 Service Agent（改造中等，重构现有）

| 设计要求 | 现状 | 差距 | 改造工作量 |
|---------|------|------|-----------|
| 接收 triage 交接后执行业务 | `runAgent()` 包揽路由+执行 | 需拆分 | 中 |
| 工具白名单（仅业务工具） | 全量注入 | 需过滤 | 小 |
| 向 knowledge-agent 请求证据 | 无此路径 | 需新建 | 中 |
| 向 human-support-agent 升级 | 直接调 `materializeOnHandoff()` | 需改为走 human-support-agent 契约 | 中 |
| 接收 HandoffEnvelope 输入 | 无此接口 | 需新建 | 小 |
| 返回 ServiceResult 输出 | `AgentResult` 类型已有，需规范化 | 小调整 | 小 |

**改造方案**：

1. `runner.ts` 中 `runAgent()` 重命名/包装为 `runServiceAgent()`，接收 `ServiceHandoff` 输入
2. 工具注入时根据 agent 身份过滤白名单（triage 无工具，service 有业务工具，knowledge 无工具）
3. 提取 `buildSystemPrompt()` 逻辑：triage 和 service 使用不同提示词
4. 转接逻辑从 `chat-ws.ts` 移入 service-agent 输出契约（`transferRequested` → `HandoffEnvelope`）

**关键文件变更**：

```
修改：
  engine/runner.ts                 — 拆出 triage 职责，保留 service 执行核心
  engine/skill-runtime.ts          — 输入改为接收 ServiceHandoff，输出规范化
  chat/chat-ws.ts                  — 不再直接调 runAgent()，由 triage 分派
```

---

### 3.3 Knowledge Agent（需新建，但可增量）

| 设计要求 | 现状 | 差距 | 改造工作量 |
|---------|------|------|-----------|
| 结构化 KnowledgePacket 输出 | 无 | **全缺** | 中 |
| 四范围检索（skill_refs/km_assets/workspace_memory/long_term_memory） | KM 仅有坐席侧搜索 | 部分缺 | 中 |
| 混合评分（BM25 35% + 语义 35% + 范围先验 10% + 新鲜度 10% + 信任度 10%） | 无 | **全缺** | 大 |
| LLM 后处理（answer_brief/constraints/unresolved_points） | 无 | **全缺** | 中 |
| 缓存策略（scope-aware TTL） | 无 | 全缺 | 小 |
| `knowledge_packets` + `knowledge_packet_items` 表 | 不存在 | **全缺** | 小（DDL） |

**改造方案**：

1. **P4 阶段**（设计文档建议在 service-agent 稳定后再做）
2. 新建 `engine/knowledge-agent.ts`，实现 `queryKnowledge(request): KnowledgePacket`
3. 初版直接用 km-client 已有搜索 + LLM 后处理包装成 KnowledgePacket
4. 后续迭代加入向量检索、混合评分、缓存

**关键文件变更**：

```
新建：
  engine/knowledge-agent.ts        — 知识检索 + 证据包装
  db/schema/platform.ts            — 新增 knowledge_packets, knowledge_packet_items 表

修改：
  services/km-client.ts            — 扩展搜索接口以支持 scope 过滤
```

---

### 3.4 Human-Support Agent（改造中等，整合现有）

| 设计要求 | 现状 | 差距 | 改造工作量 |
|---------|------|------|-----------|
| 三种物化模式（intake_only/intake_then_draft/intake_then_direct） | 当前仅 `materializeOnHandoff()` 一种 | 需扩展 | 中 |
| ticket vs work_order 选择策略 | 默认走 interaction_platform POST | 需增加判断逻辑 | 中 |
| resume_context 结构化恢复信号 | 无 | **全缺** | 中 |
| 工作台 Read Model（HumanSupportWorkbenchContext） | 部分已有（handoff_card） | 需规范化 | 中 |
| 去重（issue_thread 匹配） | 无 | **全缺** | 中 |
| 5 种工作台状态机 | 无正式状态机 | 需新建 | 中 |

**改造方案**：

1. **P3 阶段**
2. 新建 `engine/human-support-agent.ts`，统一转接入口
3. 将 `chat-ws.ts` 中的 `materializeOnHandoff()` 和 `agent-ws.ts` 中的 `runHandoffAnalysis()` 整合
4. 实现 `MaterializationPolicy`：根据场景选择物化模式
5. 新增 resume_context 写入/读取逻辑，对接 triage-agent 的 P0 硬规则

**关键文件变更**：

```
新建：
  engine/human-support-agent.ts    — 转接策略 + 物化 + 恢复

修改：
  chat/chat-ws.ts                  — 转接逻辑委托给 human-support-agent
  agent/chat/agent-ws.ts           — handoff 分析纳入 human-support-agent 管辖
  db/schema/platform.ts            — 扩展 agent_handoffs 支持 resume_context
```

---

### 3.5 记忆系统（差距大，但优先级低）

| 设计要求 | 现状 | 差距 |
|---------|------|------|
| 四层记忆（Control MD / Session DB / Long-term DB / Workspace MD） | 仅 Session DB（messages 表） | Layer A/C/D 全缺 |
| `.agents/core/` 五核心 MD | 无 | 全缺 |
| `memory_items` + `memory_candidates` 表 | 无 | 全缺 |
| 写回管线（capture→propose→dedupe→decide→materialize→project） | 无 | 全缺 |

**改造方案**：P5 阶段，在其他 Agent 稳定后实施。初版可仅做 `memory_items` 表 + 简单写入。

---

### 3.6 可观测性与评测（差距大，可并行建设）

| 设计要求 | 现状 | 差距 |
|---------|------|------|
| 统一 trace 链路 | `executionRecords` 有 trace_id 但无 Agent 级串联 | 需扩展 |
| 8 项优先指标 | 无 Agent 级指标 | 全缺 |
| `agent_eval_cases` / `agent_eval_runs` 表 | 无 | 全缺 |
| Shadow 对比框架 | 无 | 全缺 |

**改造方案**：随 P0-P2 逐步加入。P0 先落 `session_agent_state` 做控制面审计，P1 加 shadow 对比日志。

---

## 4. 数据库变更汇总

### 新增表（按阶段）

| 阶段 | 表名 | 用途 |
|------|------|------|
| P0 | `session_agent_state` | 会话级 Agent 归属 + 路由状态 |
| P0 | `agent_handoffs` | Agent 间交接记录 |
| P4 | `knowledge_packets` | 知识检索结果缓存 |
| P4 | `knowledge_packet_items` | 证据条目 |
| P5 | `memory_candidates` | 记忆候选 |
| P5 | `memory_items` | 长期记忆 |
| P1+ | `agent_eval_cases` | 评测用例 |

### 现有表变更

| 表 | 变更 | 阶段 |
|---|------|------|
| `sessions` | 可能增加 `current_agent` 字段（或由 session_agent_state 替代） | P0 |
| `skillInstances` | 增加 `handoff_id` 外键关联 | P3 |

---

## 5. 改造阶段与风险评估

### 阶段路线图（与设计文档 P0-P5 对齐）

```
Sprint 1 (P0 + P1 Shadow)
├─ 新建 session_agent_state / agent_handoffs 表
├─ 在现有路径写入控制面数据
├─ 新建 triage-agent（Shadow 模式，旁路运行不影响生产）
└─ 验收：triage 决策日志可查，与现有路由行为对比

Sprint 2 (P2 Runtime-first Router)
├─ routeSkill() → routeTurn()
├─ chat-ws.ts 改为基于 triage 决策分派
├─ runner.ts 拆分：service-agent 专用提示词
└─ 验收：全部流量走 triage 路由，回归测试通过

Sprint 3 (P3 Human-support Orchestration)
├─ 新建 human-support-agent.ts
├─ 统一转接入口（物化策略 + 去重）
├─ 坐席工作台对接 Read Model
└─ 验收：转接场景覆盖原有行为 + intake/draft 分层

Sprint 4 (P4 Knowledge Packets)
├─ 新建 knowledge-agent.ts
├─ KnowledgePacket 结构化输出
├─ service-agent 调用 knowledge-agent 获取证据
└─ 验收：知识类问题有 evidence_items + confidence

Sprint 5 (P5 Memory & Eval)
├─ memory_items 表 + 写入管线
├─ eval 框架 + 8 项优先指标
└─ 验收：跨会话记忆可召回，eval 指标可度量
```

### 风险矩阵

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| Triage LLM 调用增加延迟 | 用户感知响应变慢 | 中 | 用轻量模型 + 1.5-2.5s 超时 + 规则兜底 |
| 双路径（legacy/runtime）过渡期复杂度 | 排查困难 | 高 | Shadow 模式先行，逐步切流 |
| Agent 间契约不稳定导致联调成本 | 开发效率 | 中 | Zod schema 做契约校验，TypeScript 类型强约束 |
| 现有 E2E 测试回归 | 功能退步 | 中 | P2 前完善 E2E 覆盖，每个 Sprint 回归 |
| service-agent 提示词拆分后 LLM 行为漂移 | 回答质量 | 中 | A/B 对比，保留 fallback 到旧提示词 |

---

## 6. 关键设计决策（需确认）

### 决策 1：物理进程 vs 逻辑模块

设计文档明确建议"优先逻辑分层，不急于物理拆分"。

**建议**：四个 Agent 均为 `engine/` 下的 TypeScript 模块，共享同一 Bun 进程。不新增微服务。

### 决策 2：Triage LLM 模型选择

设计文档建议"轻量稳定模型，不需要深度推理"。

**选项**：
- A) 复用现有 SiliconFlow 模型（简单，但可能偏重）
- B) 配置独立的小模型端点（如 Qwen-7B）用于 triage（更快，需额外部署）
- C) 初版仅用规则 + 评分（无 LLM），后续再接入

**建议**：初版用 C（纯规则），P2 稳定后切 A 加入 LLM 层。

### 决策 3：现有 `runAgent()` 的处理

**选项**：
- A) 保留 `runAgent()` 作为 service-agent 的核心，仅剥离路由和转接逻辑
- B) 全部重写为新的 `runServiceAgent()`

**建议**：用 A。`runAgent()` 内部的 LLM 循环 + 工具执行 + SOP Guard 逻辑稳定运行，仅需：
1. 接收 `ServiceHandoff` 替代原始参数
2. 不再自己构建完整系统提示，而是接收 triage 提供的技能上下文
3. 转接检测移至输出契约层

### 决策 4：`chat-ws.ts` 瘦化程度

**建议**：P2 阶段将 `chat-ws.ts` 中约 100 行路由+转接逻辑抽入 `engine/orchestrator.ts`（协调四个 Agent 的主循环），chat-ws.ts 仅保留 WebSocket 连接管理 + 消息序列化。

### 决策 5：knowledge-agent 初版策略

设计文档描述了完整的混合评分管线（BM25 + 语义 + 先验 + 新鲜度 + 信任度），但也建议渐进实施。

**建议**：P4 初版仅做 km-client 搜索 + LLM 后处理包装成 `KnowledgePacket`，不实现向量检索和混合评分。

---

## 7. 不改什么

以下内容设计文档明确建议 **当前阶段不做**：

1. ~~物理微服务拆分~~（四 Agent 保持单进程）
2. ~~完整 MD 自演化记忆系统~~（先 DB 再 MD）
3. ~~自动恢复（auto-resume）~~（默认手动恢复，人工点击"恢复 AI"）
4. ~~knowledge-agent 作为通用 FAQ 入口~~（先做 service-agent 内部调用）
5. ~~Mermaid 状态图重构~~（保持现有 skill diagram 机制）
6. ~~MCP 工具层变更~~（五个 MCP Server 不变）

---

## 8. 文件变更清单预览

```
新建文件：
  engine/triage-agent.ts               — triage 核心逻辑
  engine/triage-prompt.ts              — prompt + Zod schema
  engine/triage-rules.ts               — 硬规则 + 评分规则
  engine/knowledge-agent.ts            — 知识检索（P4）
  engine/human-support-agent.ts        — 人工桥接（P3）
  engine/orchestrator.ts               — 四 Agent 协调主循环（P2）
  engine/types/handoff.ts              — HandoffEnvelope, ServiceHandoff 等契约类型
  engine/types/triage.ts               — TriageInput, TriageOutput, TriageResolvedDecision
  engine/types/knowledge.ts            — KnowledgeRequest, KnowledgePacket

修改文件：
  engine/runner.ts                     — 剥离路由/转接，保留 service 执行核心
  engine/skill-router.ts               — 升级为 routeTurn() 的 thin wrapper / 废弃
  engine/skill-runtime.ts              — 输入/输出规范化为 ServiceHandoff/ServiceResult
  chat/chat-ws.ts                      — 精简为消息入口，路由委托 orchestrator
  agent/chat/agent-ws.ts               — handoff 分析委托 human-support-agent
  packages/shared-db/src/schema/platform.ts — 新增 4-6 张表

不变文件：
  mcp_servers/*                        — MCP 工具层不变
  km_service/*                         — KM 服务接口不变（P4 扩展搜索接口）
  frontend/*                           — 前端不变（P3 坐席工作台可能微调卡片）
  engine/llm.ts                        — LLM 客户端配置不变
  engine/skill-instance-store.ts       — Instance 存储不变
  engine/sop-guard.ts                  — SOP 约束不变
```

---

## 下一步

确认以上方案后，将为每个 Sprint 编写详细的 `plan.md`（实现计划），包含具体的函数签名、Zod schema 定义、和逐步骤的代码变更指引。
