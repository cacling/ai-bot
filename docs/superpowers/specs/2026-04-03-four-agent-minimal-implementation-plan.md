# 四 Agent 最小实施计划

> 基于 2026-04-03 这一组四 Agent 设计文档，给 `ai-bot` 制定一版最小、保守、可灰度的实施顺序。目标不是一次性把理想架构全做完，而是把最关键的收益优先落地：让前门真正 runtime-first、让人工桥有正式 owner、让 memory 和 eval 有锚点、让后续每一步都有可回退路径。

**Date**: 2026-04-03  
**Status**: Draft  
**Positioning**: Minimal Rollout Plan  
**Related Design**:
- [四 Agent 职责边界与 Handoff Contract 设计](./2026-04-03-four-agent-boundaries-and-handoff-contract.md)
- [四 Agent 数据库表结构与 API Contract 草案](./2026-04-03-four-agent-db-and-api-contract.md)
- [`triage-agent` 决策表与阈值设计](./2026-04-03-triage-agent-decision-table-and-threshold-design.md)
- [`triage-agent` Prompt 与 Structured Output Contract 设计](./2026-04-03-triage-agent-prompt-and-structured-output-contract.md)
- [`human-support-agent` 落单与人工衔接策略设计](./2026-04-03-human-support-agent-materialization-policy.md)
- [四 Agent 评测与可观测性设计](./2026-04-03-four-agent-eval-and-observability-design.md)

**Related Current Code**:
- `backend/src/chat/chat.ts`
- `backend/src/engine/skill-router.ts`
- `backend/src/engine/skill-runtime.ts`
- `backend/src/tool-runtime/pipeline.ts`
- `packages/shared-db/src/schema/platform.ts`
- `packages/shared-db/src/schema/workorder.ts`
- `work_order_service/src/routes/*`

---

## 1. 实施原则

## 1.1 先换前门，不先拆服务

四 Agent 的第一收益来自：

- 正确路由
- 正确 ownership
- 正确 handoff

而不是来自：

- 多个独立进程
- 复杂消息总线

所以第一阶段应先逻辑分层，不急着物理拆分。

## 1.2 先补“控制面”，再补“能力面”

优先顺序建议是：

1. 状态与 handoff
2. runtime-first route
3. human bridge
4. retrieval / memory
5. 再去抠优化和高级自动化

## 1.3 每一阶段都必须可灰度、可回退

任何阶段上线都应满足：

- 不影响现有 legacy 主路径的兜底能力
- 出现异常时可回退到当前实现
- 能被 trace 和 eval 看见

---

## 2. 结论先行

如果只用一句话概括这份计划：

> 第一版不要急着“做出四个 Agent”，而是先把“像四个 Agent 一样协作的运行时控制面”做出来。

最小实施顺序推荐为 6 个阶段：

1. `P0`：补控制面锚点
2. `P1`：让 `triage-agent` 进入前门，但先 shadow / observe
3. `P2`：切到 runtime-first router
4. `P3`：正式引入 `human-support-agent` 编排权
5. `P4`：补 `knowledge-agent` 的逻辑独立和证据包
6. `P5`：补 memory 与 eval 飞轮

---

## 3. `P0`：补控制面锚点

### 目标

让系统至少能表达：

- 当前 session 谁在主导
- 当前有没有 active handoff
- 当前路由到哪一步

### 最小范围

推荐优先补：

- `session_agent_state`
- `agent_handoffs`

这两张表是后续所有功能的锚点。

### 为什么先做这个

因为如果没有这两张表：

- `triage-agent` 没有 ownership 事实
- `human-support-agent` 没有 handoff 事实
- 工作台没有统一读取对象
- eval 没法按 handoff / owner 分层统计

### 上线策略

- 先只写，不读
- 先用于观测与日志
- 不改变现有用户路径

### 验收信号

- 每个 session 都能看到当前 `active_agent / route_status`
- 每次正式转人工都能看到结构化 handoff

---

## 4. `P1`：让 `triage-agent` 先进入前门，但只做 shadow 决策

### 目标

在不影响当前主链路的前提下，先让 `triage-agent` 真正跑起来。

### 做法

在当前 [chat.ts](../../../backend/src/chat/chat.ts) 入口里：

- 保持现有 `runAgent()` 主路径不变
- 旁路运行 `triage-agent`
- 记录它本来会做什么

也就是：

```txt
current path executes
+ triage shadow decision logged
```

### 目的

这一步不是为了立即改变行为，而是为了先回答：

- 它在真实流量下会怎么判
- 和现有行为冲突有多少
- 哪些 case 最容易误判

### 重点评测

- `owner_routing_accuracy`
- `resume_vs_start_accuracy`
- `handoff_trigger_accuracy`

### 验收信号

- triage shadow 决策能稳定产出 schema 合法结果
- 超时/解析失败率可接受
- 能产出可用于回放的日志

---

## 5. `P2`：切到 runtime-first router

### 目标

把当前“只有 active instance 才走 runtime”的模式，升级成真正的前门路由。

### 重点改造对象

- [chat.ts](../../../backend/src/chat/chat.ts)
- [skill-router.ts](../../../backend/src/engine/skill-router.ts)

### 行为目标

从：

```txt
routeSkill(sessionId)
-> runtime only if active instance exists
-> else runAgent()
```

变成：

```txt
routeTurn(input)
-> resume_service / start_service / request_knowledge / handoff_human_support / ask_clarification
```

### 当前阶段推荐能力范围

第一版只强支撑这 4 条：

- `resume_service`
- `start_service`
- `handoff_human_support`
- `ask_clarification`

`request_knowledge` 可以先逻辑接入，但不一定一开始就单独走完整 agent。

### 回退策略

当 triage 输出异常或低置信时：

- 回退到 legacy `runAgent()`
或
- 回到 `ask_clarification`

优先选择对当前业务最稳的一条。

### 验收信号

- 新 session 不需要先跑 legacy 再补 runtime instance
- active workflow 恢复命中率显著提升
- 错误 topic switch 明显下降

---

## 6. `P3`：正式引入 `human-support-agent` 的编排权

### 目标

让“正式转人工”从一个散落在多个逻辑里的动作，收敛到唯一 owner。

### 做法

建立统一入口：

- `POST /internal/agent/human-support/handoff`

并约束：

- `service-agent` 只能发 `HumanSupportRequest`
- 正式 `intake / draft / materialize` 只能由 `human-support-agent` 触发

### 当前阶段推荐策略

- 默认 `intake-first`
- 聊天升级大多走 `intake -> draft`
- 高结构化高确定场景才允许直建

### 工作台协同

此阶段至少要能让工作台看到：

- 当前 handoff
- 当前 support object
- 是否处于 `waiting_human`

### 验收信号

- 重复人工升级显著下降
- 重复工单率可见并可控
- workbench 能展示 handoff + item 的统一上下文

---

## 7. `P4`：补 `knowledge-agent` 的逻辑独立

### 目标

把“知识补证”从普通对话里抽出来，形成受控的 `knowledge_packet`。

### 当前阶段不要求物理拆服务

推荐先做：

- contract
- request/packet 存储
- 统一 scope
- 统一引用结构

不急着做：

- 独立进程
- 独立部署

### 重点补的不是“检索能力本身”，而是“知识包语义”

也就是说：

- 不只是返回 top-k 结果
- 而是返回：
  - `answer_brief`
  - `evidence_items`
  - `constraints`
  - `unresolved_points`
  - `confidence`

### 验收信号

- 上游 agent 可以消费 `knowledge_packet`
- `retrieval-eval` 能自然升级为 `knowledge-agent` 子评测

---

## 8. `P5`：补 Memory 与 Eval 飞轮

### 目标

让系统从“会路由”升级到“能稳步变好”。

### Memory 当前阶段优先顺序

1. `memory_candidates`
2. `memory_items`
3. retrieval
4. `daily memory` projection
5. `.agents/core/*.md`

### Eval 当前阶段优先顺序

优先补 8 个指标：

1. `owner_routing_accuracy`
2. `trajectory_accuracy`
3. `tool_argument_precision`
4. `citation_correctness`
5. `materialization_mode_accuracy`
6. `duplicate_item_rate`
7. `resume_success_rate`
8. `resume_regret_rate`

### 验收信号

- 坏例能沉淀成回归样本
- 每次改动后能回答“哪一层变好了/变差了”

---

## 9. 每一阶段的最小改动面

## 9.1 `P0`

最小改动面：

- schema
- 内部写入逻辑
- 基础查询接口

## 9.2 `P1`

最小改动面：

- triage model call
- 结构化日志
- shadow compare

## 9.3 `P2`

最小改动面：

- chat 入口顺序
- skill router 升级为 routeTurn
- runtime-first 路由切换

## 9.4 `P3`

最小改动面：

- handoff facade
- work_order_service orchestration
- workbench read model

## 9.5 `P4`

最小改动面：

- `knowledge_packet` schema / API
- retrieval contract

## 9.6 `P5`

最小改动面：

- memory tables
- eval tables / runners
- replay tooling

---

## 10. 当前阶段不建议先做的事

为了让计划更稳，下面这些事情不建议抢在前面：

### 10.1 一开始就物理拆四个独立服务

不建议。

理由：

- 复杂度先涨
- 调试先变难
- 核心收益却还没实现

### 10.2 一开始就做完整 MD 自进化系统

不建议。

理由：

- 当前更需要可控的 DB 记忆层
- 不然很容易先把“可编辑知识”和“运行时事实”混起来

### 10.3 一开始就做自动 resume

不建议。

理由：

- 人工桥还没稳定
- `resume_context` 质量还没站稳

### 10.4 一开始就要求 `knowledge-agent` 成为所有 FAQ 的统一入口

不建议。

理由：

- 会把很多本可直接处理的问题绕远
- 也会让 triage 误路由更难 debug

---

## 11. 风险与对应控制

## 11.1 风险：前门改造影响现有线上稳定性

控制：

- 先 shadow
- 再小流量灰度
- 保留 legacy fallback

## 11.2 风险：人工桥引入后工单暴涨

控制：

- 默认 `intake-first`
- 保守直建阈值
- 重点监控 `duplicate_item_rate`

## 11.3 风险：knowledge-agent 把链路拉长

控制：

- 不做默认入口
- 只用于高价值补证

## 11.4 风险：memory 太早介入，污染路由

控制：

- 初期只给 triage 很少的 memory hints
- 长期记忆只做低频高价值项

---

## 12. 当前阶段最推荐的工程节奏

如果要非常实操地排一下优先级，我会推荐：

### Sprint 1

- `session_agent_state`
- `agent_handoffs`
- triage shadow mode

### Sprint 2

- runtime-first route
- `decision_type + router_action`
- clarification / handoff 主路径

### Sprint 3

- `human-support-agent` orchestration
- workbench read model

### Sprint 4

- `knowledge_packet`
- retrieval 子评测

### Sprint 5

- memory tables
- replay/eval 飞轮

---

## 13. 最终结论

对 `ai-bot` 来说，四 Agent 的第一版实施不该是“把理想图一口气做完”，而应该是：

1. 先把控制面事实建出来
2. 再让 triage 真正进入前门
3. 再把人工桥做成唯一 owner
4. 再把知识和记忆慢慢接进来

这样做的好处是：

- 每一步都能看见收益
- 每一步都能灰度
- 每一步都能回退

一句话总结：

> 先把“前门、hand off、ownership”这三件事做稳，四 Agent 架构才算真正开始落地。 
