# 四 Agent 设计文档总索引

> 把 2026-04-03 这一轮产出的 11 份四 Agent 设计文档，整理成一个更高层的阅读结构。目标不是再新增一套内容，而是把已有设计按“先看总纲，再看数据与接口，再看各 Agent 分册，最后看实施与评测”的方式重新编排，方便后续评审、分工和实施。

**Date**: 2026-04-03  
**Status**: Draft  
**Positioning**: Design Map / Reading Order

---

## 1. 推荐阅读顺序

如果第一次完整阅读，推荐顺序是：

1. 架构总纲
2. 数据与接口
3. 四个 Agent 分册
4. 落地实施与评测

如果是准备开始实现，推荐顺序是：

1. 架构总纲
2. 数据与接口
3. 落地实施与评测
4. 四个 Agent 分册里对应自己负责的部分

---

## 2. 架构总纲

这一层回答的是：

- 四 Agent 架构整体想解决什么问题
- 四个 Agent 的总体边界是什么
- 请求生命周期如何流转
- 记忆体系如何与整体架构配合

### 2.1 核心总纲

- [2026-04-03-four-agent-boundaries-and-handoff-contract.md](./2026-04-03-four-agent-boundaries-and-handoff-contract.md)  
  四 Agent 的总边界文档。定义 `triage-agent / service-agent / knowledge-agent / human-support-agent` 的职责、输入输出和 handoff contract，是整套设计的主纲。

### 2.2 前门与生命周期总纲

- [2026-04-03-triage-agent-and-request-lifecycle-design.md](./2026-04-03-triage-agent-and-request-lifecycle-design.md)  
  从系统运行时角度定义前门控制、请求生命周期、topic switch、多意图和 agent 间流转关系。

### 2.3 记忆总纲

- [2026-04-03-memory-architecture-db-and-md-coexistence.md](./2026-04-03-memory-architecture-db-and-md-coexistence.md)  
  解释 DB 记忆和 MD 文件记忆如何分层共存，以及它们在四 Agent 架构里的位置。

---

## 3. 数据与接口

这一层回答的是：

- 需要哪些平台层数据结构
- session / handoff / knowledge / memory 怎么落表
- Agent 内部 API 怎么定义
- 与现有 `work_order_service` 怎么映射

### 3.1 平台表与内部 API 主文档

- [2026-04-03-four-agent-db-and-api-contract.md](./2026-04-03-four-agent-db-and-api-contract.md)  
  四 Agent 的数据库表结构草案、内部 API contract、以及与 `work_order_service` 的接口映射总表。

### 3.2 补充说明

下面这些文档虽然属于 Agent 分册，但其中也包含大量接口层定义，实施时常需要和本节一起看：

- [2026-04-03-human-support-agent-workstation-and-resume-protocol.md](./2026-04-03-human-support-agent-workstation-and-resume-protocol.md)  
  重点是工作台 read model、`resume_context` 结构和人机桥动作接口。

- [2026-04-03-knowledge-agent-prompt-packet-and-retrieval-design.md](./2026-04-03-knowledge-agent-prompt-packet-and-retrieval-design.md)  
  重点是 `KnowledgeRequest / KnowledgePacket` 契约、scope、排序和 packet 缓存。

---

## 4. 四个 Agent 分册

这一层按 Agent 拆开看。  
注意：这 11 份里，`service-agent` 没有一篇完全独立的 2026-04-03 专门文档，它当前主要由总纲和更早的 runtime 文档承接；其余三个 Agent 已经有较完整分册。

### 4.1 `triage-agent`

这是目前最完整的一册，建议按下面顺序看：

- [2026-04-03-triage-agent-and-request-lifecycle-design.md](./2026-04-03-triage-agent-and-request-lifecycle-design.md)  
  先理解定位、生命周期和总决策栈。

- [2026-04-03-triage-agent-decision-table-and-threshold-design.md](./2026-04-03-triage-agent-decision-table-and-threshold-design.md)  
  进一步细化成硬规则、候选分数、阈值、`router_action` 和典型案例。

- [2026-04-03-triage-agent-prompt-and-structured-output-contract.md](./2026-04-03-triage-agent-prompt-and-structured-output-contract.md)  
  最后落到 prompt、structured output schema、不变量和 fallback 规则。

### 4.2 `service-agent`

在这 11 份里，`service-agent` 主要分散在总纲中：

- [2026-04-03-four-agent-boundaries-and-handoff-contract.md](./2026-04-03-four-agent-boundaries-and-handoff-contract.md)  
  其中定义了 `service-agent` 的职责边界、输入输出和与其它 Agent 的 handoff 关系。

补充说明：

- 当前如果要深入 `service-agent` 的 runtime 细节，仍需结合更早的 runtime 文档阅读，不属于这 11 份新增文档的范围。

### 4.3 `knowledge-agent`

- [2026-04-03-knowledge-agent-prompt-packet-and-retrieval-design.md](./2026-04-03-knowledge-agent-prompt-packet-and-retrieval-design.md)  
  这是 `knowledge-agent` 的主分册，定义输入输出、scope、hybrid retrieval、排序、压缩和 packet 设计。

### 4.4 `human-support-agent`

推荐按下面顺序看：

- [2026-04-03-human-support-agent-materialization-policy.md](./2026-04-03-human-support-agent-materialization-policy.md)  
  先看人工桥如何落到 `intake / draft / materialize`，以及何时 `ticket / work_order`。

- [2026-04-03-human-support-agent-workstation-and-resume-protocol.md](./2026-04-03-human-support-agent-workstation-and-resume-protocol.md)  
  再看工作台投影、人工接单、`resume_context` 回流和人机桥闭环。

---

## 5. 落地实施与评测

这一层回答的是：

- 这套设计该怎么最小落地
- 先做什么、后做什么
- 怎么评测、观测、回归

### 5.1 实施主计划

- [2026-04-03-four-agent-minimal-implementation-plan.md](./2026-04-03-four-agent-minimal-implementation-plan.md)  
  把四 Agent 的第一版落地拆成阶段计划，重点是 `P0-P5` 的顺序、灰度和回退思路。

### 5.2 评测与观测主计划

- [2026-04-03-four-agent-eval-and-observability-design.md](./2026-04-03-four-agent-eval-and-observability-design.md)  
  定义四 Agent 的评测指标、trace 主线、坏例沉淀和回归飞轮。

---

## 6. 最推荐的最小阅读包

如果是不同角色阅读，我建议这样分：

### 6.1 架构 / 技术负责人

必读：

- [2026-04-03-four-agent-boundaries-and-handoff-contract.md](./2026-04-03-four-agent-boundaries-and-handoff-contract.md)
- [2026-04-03-four-agent-db-and-api-contract.md](./2026-04-03-four-agent-db-and-api-contract.md)
- [2026-04-03-four-agent-minimal-implementation-plan.md](./2026-04-03-four-agent-minimal-implementation-plan.md)
- [2026-04-03-four-agent-eval-and-observability-design.md](./2026-04-03-four-agent-eval-and-observability-design.md)

### 6.2 前门 / runtime 负责人

必读：

- [2026-04-03-triage-agent-and-request-lifecycle-design.md](./2026-04-03-triage-agent-and-request-lifecycle-design.md)
- [2026-04-03-triage-agent-decision-table-and-threshold-design.md](./2026-04-03-triage-agent-decision-table-and-threshold-design.md)
- [2026-04-03-triage-agent-prompt-and-structured-output-contract.md](./2026-04-03-triage-agent-prompt-and-structured-output-contract.md)

### 6.3 人工桥 / 工单 / 工作台负责人

必读：

- [2026-04-03-human-support-agent-materialization-policy.md](./2026-04-03-human-support-agent-materialization-policy.md)
- [2026-04-03-human-support-agent-workstation-and-resume-protocol.md](./2026-04-03-human-support-agent-workstation-and-resume-protocol.md)
- [2026-04-03-four-agent-db-and-api-contract.md](./2026-04-03-four-agent-db-and-api-contract.md)

### 6.4 知识 / 记忆 / 检索负责人

必读：

- [2026-04-03-knowledge-agent-prompt-packet-and-retrieval-design.md](./2026-04-03-knowledge-agent-prompt-packet-and-retrieval-design.md)
- [2026-04-03-memory-architecture-db-and-md-coexistence.md](./2026-04-03-memory-architecture-db-and-md-coexistence.md)
- [2026-04-03-four-agent-eval-and-observability-design.md](./2026-04-03-four-agent-eval-and-observability-design.md)

---

## 7. 一句话版本

如果要把这 11 份再压成一句话：

- 架构总纲：先知道这套系统为什么这么分
- 数据与接口：再知道这些边界怎么落表、怎么通信
- 四个 Agent 分册：再看每个 Agent 自己怎么工作
- 落地实施与评测：最后决定先做什么、怎么证明它真有效

---

## 8. 最终结论

这 11 份文档现在可以被看成 4 层：

1. **架构总纲**：解释全局设计
2. **数据与接口**：定义结构化事实与通信方式
3. **四个 Agent 分册**：展开每个 Agent 的具体职责与协议
4. **落地实施与评测**：定义实施顺序、观测、回归与风险控制

一句话总结：

> 现在这组文档已经不再是零散草稿，而是一套可以按“总纲 -> 契约 -> 分册 -> 实施”阅读和推进的设计包。 
