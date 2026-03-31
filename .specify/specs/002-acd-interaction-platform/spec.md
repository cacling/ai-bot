# 功能规格说明：ACD / Interaction Platform 架构设计

**功能分支**: `002-acd-interaction-platform`  
**创建日期**: 2026-03-31  
**状态**: Draft  
**输入**: 本线程内关于 CLI、客服工作台、ACD、omnichannel、plugin system、private/public domain、social engagement、work order 协同、API/event 契约等连续讨论结论

> **文档导航**：本功能的完整架构设计、模块分层、领域模型、状态机、插件机制、数据边界、迁移计划与未来扩展路线见 [plan.md](plan.md)。本文档只保留对业务目标、边界与关键需求的概括，作为 speckit feature 入口。

## 系统概述

当前项目中的实时客服链路仍主要围绕：

- `backend` 中的 `/api/chat`、`/ws/chat`、`/ws/voice`、`/ws/outbound`、`/ws/agent`
- 以 `phone` 为主键的 `sessionBus`
- 以会话转发为中心的坐席工作台
- 与 `work_order_service` 弱耦合的后续工单处理

这一结构可以支持单渠道、低并发、单客户视角的演示与基线运行，但不足以支撑以下未来目标：

- 多渠道接入（Web Chat、Voice、DM、Email、公开评论/提及）
- 坐席同时处理多个不同客户与不同工作对象
- 公开互动与私域互动共存的 omnichannel 服务中枢
- 队列、容量、SLA、转接、重排队、wrap-up 的统一管理
- 可治理的 Routing Policy Plugin 机制
- 与 `work_order_service`、`backend`、`staff-auth` 的清晰边界协作

因此，本规格不把 ACD 理解成一个孤立的“分配服务”，而把它定义成：

> **Interaction Platform**
> = **Interaction Gateway** + **Conversation / Engagement Hub** + **ACD Routing Kernel** + **Agent Workspace Gateway** + **Control Plane**

其中，ACD 是共享路由内核，不是全部系统。

## 用户场景与测试

### 用户故事 1 — 私域客户交互统一进入实时工作流（Priority: P1）

客户通过 Web Chat、Voice、DM、SMS 或 Email 与企业沟通时，系统需要能够统一识别其身份、归并到正确的 `conversation`，并在需要人工介入时 materialize 为可路由的 `interaction`，再由 ACD 分配给合适坐席。

**为什么是 P1**：当前项目 100% 的运行能力几乎都属于私域交互域，这是从现状迁移到 Interaction Platform 的最短路径，也是最先产生业务价值的部分。

**独立测试**：以 Web Chat 和 Voice 为起点，将 `phone` 主键迁移为 `conversation + interaction` 主键；验证同一客户可以被分配、切换、关闭、转 follow-up，而不是只能通过 `phone` 跟随。

**验收场景**：

1. **Given** 客户通过 Web Chat 发起咨询，**When** 机器人判断需要人工，**Then** 系统创建 `conversation` 与 `interaction`，ACD 根据队列与容量将其分配给坐席。
2. **Given** 客户通过 Voice 来电且当前坐席已有文本并发，**When** 路由判断 voice 独占容量冲突，**Then** voice interaction 不应直接分配给不符合容量策略的坐席。
3. **Given** 一个客户先 Web Chat 后 Email 跟进，**When** 系统识别这是同一问题域的延续，**Then** 新消息可以挂接同一 `conversation`，但按需要生成新的 `interaction` 或新的 case-like 处理对象。

---

### 用户故事 2 — 坐席工作台从“盯手机号”升级为“盯 Inbox / Interaction”（Priority: P1）

坐席不应再通过切换 `phone` 来工作，而应进入统一 Inbox，接收 `offer`、查看 `assigned interactions`、切换 focus、回复客户、转接、关闭并执行 wrap-up。

**为什么是 P1**：这是当前工作台最明显的架构瓶颈。没有 Inbox 模型，就无法支持多客户并发、队列认领、私域/非私域统一承载。

**独立测试**：构建一个能返回 `assigned/offers/unread` 的 Inbox snapshot；验证坐席可以在多个 interaction 之间切换并回复，而不是重连到另一个手机号。

**验收场景**：

1. **Given** 坐席在线且可接单，**When** 新 interaction 被分配，**Then** Inbox 收到 `offer.created` 或 `interaction.assigned`，无需通过切换客户手机号重建连接。
2. **Given** 坐席同时持有多个文本 interaction，**When** 其中一个客户继续发消息，**Then** 该 interaction 的 unread 与优先级更新，而不会覆盖其他客户上下文。
3. **Given** 坐席处理完成，**When** 关闭 interaction 并选择 follow-up，**Then** 系统落 wrap-up 并可继续创建工单，不丢失上下文。

---

### 用户故事 3 — 公开互动进入独立的 Public Engagement 工作流（Priority: P2）

公开评论、提及、回复不应被强行塞进私聊线程，而应先经过 triage，判断是否需要审核、是否需要回复、是否需要导流私域，再决定是否 materialize 成 `interaction` 进入共享 Routing Kernel。

**为什么是 P2**：当前仓库尚未实现社媒接入，但这是架构是否真的具备扩展性的分水岭。若现在不把 public domain 设计清楚，未来会被 DM 模型拖垮。

**独立测试**：引入一个抽象的 `public engagement ingress`，验证 `engagement_item -> triage -> engagement_interaction -> route` 的完整链路逻辑，而不要求马上接通真实平台。

**验收场景**：

1. **Given** 一条公开负面评论进入系统，**When** triage 判定其需要人工处理，**Then** 系统生成 `engagement_interaction` 并送往合适队列。
2. **Given** 一条垃圾评论进入系统，**When** triage 判定为 spam，**Then** 系统不必生成 interaction，而只记录 moderation action。
3. **Given** 一条公开投诉需要转私信，**When** 坐席执行 public-to-private conversion，**Then** 系统建立私域 `conversation`，把后续深度处理迁移到 Private Interaction Domain。

---

### 用户故事 4 — Routing Policy 可扩展，但状态机与真值归属稳定（Priority: P2）

队列选择、候选过滤、打分、offer、overflow 等决策逻辑应可插拔；但 `interaction / offer / assignment / event / timers / locks` 等主内核必须由 core 统一持有，不允许插件直接接管。

**为什么是 P2**：系统后期一定会出现不同渠道、品牌、业务线对路由策略的差异化诉求。如果一开始不保留策略扩展点，后面只能不断改 core；但如果放任插件接管内核，系统会失去一致性和可治理性。

**独立测试**：在不改变主状态机与数据库归属的前提下，为 Routing Kernel 注入不同的 `queueSelector/candidateScorer/offerStrategy` 策略，验证路由结果可变化但状态真值不漂移。

**验收场景**：

1. **Given** 某租户启用了 Sticky + VIP scorer，**When** interaction 进入路由链路，**Then** 插件能影响候选分数与 offer 结果，但不能直接改写 assignment 表。
2. **Given** 某个 scorer 插件超时或报错，**When** ACD 执行路由，**Then** 系统按 fallback 回落到 core default，不应让 interaction 卡死。

---

### 用户故事 5 — Follow-up 与 Work Order 彻底从实时交互链路解耦（Priority: P3）

实时 interaction 关闭后，若需要 callback、appointment、follow-up task 或 ticket，应通过稳定的 source link 关联到 `work_order_service`，而不是让工单域直接介入实时分配逻辑。

**为什么是 P3**：当前项目已经拥有较强的工单与 workflow 能力，ACD/Interaction Platform 的设计必须与之协同，但又不能污染其边界。

**独立测试**：从已关闭 interaction 创建 follow-up work order，验证 source link 可追溯，并且 work order 队列与 ACD 队列语义不混淆。

**验收场景**：

1. **Given** interaction 关闭且需要后续确认，**When** 系统创建 callback task，**Then** `work_order_service` 中产生正式后续对象，并保留 `source_interaction_id`。
2. **Given** 工单系统存在 queue 配置，**When** ACD 使用 routing queue 路由 interaction，**Then** 工单 queue 不应成为实时路由真值源，只能通过 mapping 协作。

## 边界情况

- 同一客户在短时间内通过多个私域渠道发起问题时，系统如何决定复用 `conversation` 还是创建新 `conversation`？
- 一条公开互动是否应直接 materialize 成 interaction，还是先停留在 triage / moderation 阶段？
- 插件策略与默认 core policy 同时命中时，chainable slot 的组合语义如何避免重复加权？
- 坐席从 public engagement 转到 private conversation 时，如何避免上下文断裂或身份误绑？
- 当前系统仍使用 SQLite 多库模式，Interaction Platform 引入 PostgreSQL 后如何与现有服务分阶段协作？

## 需求

### 功能需求

- **FR-001**: 系统必须将实时客服平台重新定义为 `Interaction Platform`，而不是单一的 `acd_service`。
- **FR-002**: 系统必须先按域建模：`Private Interaction Domain` 与 `Public Engagement Domain`。
- **FR-003**: 系统必须在两个域之上共享一套稳定的 `Routing Kernel`，但允许按域配置不同策略。
- **FR-004**: 系统必须以 `interaction_id` 作为 ACD 工作对象主键，以 `conversation_id` 作为连续性主键，不得再以 `phone` 作为客服工作对象主键。
- **FR-005**: 系统必须将 `interaction` 的状态机、assignment 提交、timers、locks、audit events 作为 core-owned 能力，不得交给插件直接控制。
- **FR-006**: 系统必须让坐席工作台围绕 Inbox / Offer / Assigned / Focused Interaction 工作，而不是围绕手机号切换工作。
- **FR-007**: 系统必须把 `Backend` 的职责收缩为 bot、skills、tools、handoff summary、人机切换前逻辑，不再持有分配真值。
- **FR-008**: 系统必须让 `Work Order Service` 只承担 follow-up / appointment / callback / ticket 等长生命周期对象，不参与实时路由。
- **FR-009**: 系统必须让 `Staff Auth` 继续承担员工身份与认证，不复制第二套员工身份系统。
- **FR-010**: 系统必须为 Private Domain 设计 `conversation / private message / email message / case link` 对象模型。
- **FR-011**: 系统必须为 Public Domain 设计 `content asset / engagement thread / engagement item / moderation action / triage result` 对象模型。
- **FR-012**: 系统必须支持“原始事件进入 → triage / enrich → materialize interaction → route → workspace → close / follow-up”的完整链路。
- **FR-013**: 系统必须支持队列选择、候选过滤、打分、offer、overflow 等策略扩展点的插件化治理。
- **FR-014**: 系统必须具备统一的审计、回放、监控、灰度与插件执行日志能力。
- **FR-015**: 系统必须为未来新增渠道保留扩展性，新增 provider 时不得要求重构主状态机。

### 核心实体

- **Conversation**: 私域域中的连续沟通容器，用于承载跨消息、跨渠道、跨时间的客户问题上下文。
- **Interaction**: ACD 统一工作对象；只有 materialize 后的工作单元才进入队列、分配、SLA、wrap-up。
- **Content Asset**: 公共内容资产，如 post、media、video、tweet，是 Public Engagement Domain 的一等对象。
- **Engagement Item**: 公开互动原始项，如 comment、mention、reply，不等于 interaction。
- **Routing Queue**: ACD 路由域队列，与工单域的 `work_queue` 命名可映射但语义必须分离。
- **Offer / Assignment**: 路由分配过程中对坐席的接单邀请和已生效归属历史。

## 成功标准

### 可量化指标

- **SC-001**: 私域文本互动完成从 `message -> interaction -> assigned` 的端到端路由链路时间在常态下应可稳定控制在秒级。
- **SC-002**: 坐席工作台不再依赖 `phone` 切换来承载多客户并发，至少支持多 interaction 并行可视化管理。
- **SC-003**: Routing Policy 插件故障不会导致 interaction 状态机失真，核心路由链路必须具备可验证的 fallback。
- **SC-004**: Public Engagement Domain 在引入新 provider 时，应主要新增 adapter、triage rule 或 policy，而不是改写共享 Routing Kernel。
- **SC-005**: 所有 interaction 的创建、路由、分配、转接、关闭、follow-up 均可在审计日志中追溯完整链路。
- **SC-006**: 架构能够支持当前私域能力平滑迁移，同时为未来 public engagement、email、更多 provider 预留清晰扩展路径。
