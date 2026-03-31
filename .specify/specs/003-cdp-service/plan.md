# 实现方案：CDP / Customer Data Platform 架构设计

**功能分支**: `003-cdp-service` | **日期**: 2026-03-31 | **规格说明**: [spec.md](spec.md)

> 本文档是本线程关于 `cdp_service` 的多轮讨论、业界 CDP 能力抽象、当前仓库代码现实与未来 Interaction Platform 需求的综合定稿稿。  
> 文档重点不在“再建一个客户表”，而在于重新定义本系统中的 **客户语义层**：  
> 它需要足够独立，足够清晰，足够可解释，也足够能服务实时互动、工单与 Bot。

---

## 目录

- [0. 执行摘要](#0-执行摘要)
- [1. 背景、现状与问题定义](#1-背景现状与问题定义)
- [2. 设计目标与非目标](#2-设计目标与非目标)
- [3. CDP 的正式定义与边界](#3-cdp-的正式定义与边界)
- [4. 基于现有代码的现实分析](#4-基于现有代码的现实分析)
- [5. CDP 在全局架构中的位置](#5-cdp-在全局架构中的位置)
- [6. CDP 的六层架构](#6-cdp-的六层架构)
- [7. 四个 Plane 视角下的抽象](#7-四个-plane-视角下的抽象)
- [8. 能力边界：CDP 必须负责什么](#8-能力边界cdp-必须负责什么)
- [9. 能力边界：CDP 明确不负责什么](#9-能力边界cdp-明确不负责什么)
- [10. 与 Interaction Platform 的关系](#10-与-interaction-platform-的关系)
- [11. 与 Backend / Bot / Skills 的关系](#11-与-backend--bot--skills-的关系)
- [12. 与 Work Order Service 的关系](#12-与-work-order-service-的关系)
- [13. 与源系统和事实源的关系](#13-与源系统和事实源的关系)
- [14. 服务供给模型：API / Events / Context Serving](#14-服务供给模型api--events--context-serving)
- [15. 统一数据所有权与数据库边界](#15-统一数据所有权与数据库边界)
- [16. 16 个核心实体的架构分层映射](#16-16-个核心实体的架构分层映射)
- [17. 计算层：Profile / Summary / Traits 的设计原则](#17-计算层profile--summary--traits-的设计原则)
- [18. Identity Resolution 的架构原则](#18-identity-resolution-的架构原则)
- [19. Consent / Preference / Contactability 的架构原则](#19-consent--preference--contactability-的架构原则)
- [20. 时间线与事实回流设计](#20-时间线与事实回流设计)
- [21. 多租户、权限、治理与审计](#21-多租户权限治理与审计)
- [22. 性能、低延迟与可用性要求](#22-性能低延迟与可用性要求)
- [23. 分阶段落地路线](#23-分阶段落地路线)
- [24. 风险、取舍与被否决方案](#24-风险取舍与被否决方案)
- [25. 最终定稿的架构决策清单](#25-最终定稿的架构决策清单)

---

## 0. 执行摘要

### 0.1 一句话定义

`cdp_service` 应被定义为：

> **Customer Data Platform**
> = **客户语义层与客户事实底座**
> = **Identity Graph** + **Party / Relationship Hub** + **Consent / Preference Hub** + **Customer Facts Backbone** + **Profile / Summary Compute** + **Serving & Governance**

这不是营销系统附属件，也不是客户数据大仓库，而是：

> **Interaction Platform 的上游客户语义中枢**

### 0.2 为什么现在就要建

当前系统中，客户相关数据已经散落在：

- `business.db` 的业务订阅与偏好数据
- `backend` 的实时欢迎语和上下文拼接
- `work_order_service` 的工单客户字段
- 未来的 `Interaction Platform` 中的 identity resolve / context serve 需求

如果没有一个统一的 CDP 层，后果会是：

- `backend`、`Interaction Platform`、`Work Order`、`Bot` 各自做一套客户上下文拼接
- `phone` 继续被错误地当成客户主体主键
- public/private、subscription/account、consent/preference 等语义交叉污染

### 0.3 最关键的架构判断

1. `cdp_service` 必须是一个独立模块，不是 `backend` 的一组 helper
2. 顶层主实体必须是 `party`，不是 `phone`
3. `phone/email/social id` 只是 identity 或 contact point，不是客户主键
4. CDP 负责客户语义与客户事实，不负责交易系统真值与 interaction 运行态
5. `customer_profile / service_summary / interaction_summary` 必须是消费视图，而不是原始主表
6. `customer_event` 必须是一等公民，因为后续 route hint、summary、traits 都要依赖它
7. Interaction Platform 未来应主要通过 CDP Serving API 获取客户上下文，而不是直接读取上游业务库

---

## 1. 背景、现状与问题定义

### 1.1 当前系统已经有大量“客户数据”，但还没有客户平台

从当前仓库的代码来看，客户数据并不是没有，而是以多个语义散点存在：

1. **业务数据**
   - `packages/shared-db/src/schema/business.ts`
   - 包含 `subscribers`、`customer_households`、`customer_preferences`、`contracts`、`device_contexts`、`identity_otp_requests`、`identity_login_events` 等对象

2. **实时链路直接消费业务数据**
   - `backend/src/chat/chat-ws.ts` 直接从 `businessDb` 读取 `subscribers`、`plans` 做问候与上下文注入
   - `backend/src/chat/voice.ts` 也直接查询业务表

3. **工单域自带客户字段**
   - `packages/shared-db/src/schema/workorder.ts` 中的 `customer_phone`、`customer_name`、`customer_id`
   - 这些字段对 follow-up 很实用，但并不构成完整客户模型

4. **实时系统仍然以 phone 为核心索引**
   - `backend/src/services/session-bus.ts`
   - `backend/src/chat/chat-ws.ts`
   - `backend/src/agent/chat/agent-ws.ts`

这说明当前系统的状态是：

> **有客户数据，没有客户语义层；有多个客户字段，没有统一客户主体；有多个来源事实，没有统一客户事实底座。**

### 1.2 当前结构的根本问题

#### 问题 A：`phone` 被混用了

在当前系统里，`phone` 同时像：

- 客户身份
- 订阅号码
- 联系点
- 会话主键
- 工单字段

这在单一电信 demo 场景下还能勉强成立，但一旦进入：

- 多订阅
- 多账户
- Email
- public engagement
- social actor
- anonymous visitor

这套模型就会立即崩掉。

#### 问题 B：缺少统一的 `party` 语义

我们现在最接近“客户”的对象其实是 `subscribers.phone`，但这更像：

- 订阅号码
- 服务标识
- 联系点

而不是真正的客户主体。

#### 问题 C：下游系统各自拼上下文

当前 `backend` 为欢迎语拼接订户信息，未来 `Interaction Platform` 也会需要自己的 customer context，`work_order_service` 也需要客户上下文。

如果不先建立 CDP，结果一定是：

- Bot 有一套 customer context
- Agent Workspace 有一套 customer context
- Work Order 又有一套 customer context

这会直接导致字段口径漂移和逻辑分叉。

### 1.3 问题定义

因此，CDP 要解决的不是“再建一个数据库”，而是：

> **如何把上游分散的客户身份、联系点、订阅、偏好、事件和服务摘要，统一为一个可识别、可解释、可授权、可供给的客户语义层。**

---

## 2. 设计目标与非目标

### 2.1 设计目标

本设计的核心目标有 9 个：

1. **建立清晰的客户主体语义**
   - 从 `phone-centric` 升级为 `party-centric`

2. **建立 identity graph**
   - 统一 `phone/email/wa_id/psid/device_id/...`

3. **统一关系与归属**
   - 表达 customer 与 account / subscription / household 的关系

4. **统一联系语义**
   - 联系点、偏好、同意分开建模

5. **沉淀客户事实**
   - 用统一事件骨架承接上游与下游回流事实

6. **形成消费视图**
   - 提供 `customer_profile`、`service_summary`、`interaction_summary`

7. **为实时系统供给低延迟上下文**
   - Interaction Platform、Bot、Workspace 不再各自直接拼源表

8. **提供可解释性与治理能力**
   - identity merge/split、来源链路、访问控制、审计、版本

9. **预留未来扩展**
   - traits、scores、segments、activation 不在第一期强上，但必须有位置

### 2.2 非目标

本设计明确不把以下内容作为 `cdp_service` 的职责：

1. 不接管账单、订单、支付、工单、interaction 运行态的主交易真值
2. 不直接承担 bot orchestration 或 skill 编排
3. 不在第一期就做成全量 marketing automation / journey 平台
4. 不在第一期就把所有上游数据全部搬进 CDP 数据库
5. 不要求 Interaction Platform 一次性切换到 CDP 后才可运行，允许分阶段演进

---

## 3. CDP 的正式定义与边界

### 3.1 正式定义

CDP 的正式定义建议写成：

> **CDP（Customer Data Platform）是面向全渠道互动系统的客户语义层与客户事实底座，负责统一主体、身份、联系点、关系归属、偏好同意、客户事实与消费视图，并以低延迟服务接口向 Interaction Platform、Bot、Work Order 及运营系统供给客户上下文。**

这句话里最关键的四个判断是：

1. **它是语义层**
   - 不是简单存表
2. **它是事实底座**
   - 不是一次性 ETL 仓库
3. **它供给上下文**
   - 不是只做离线分析
4. **它不接管交易真值**
   - 不做第二个订单/账单/工单系统

### 3.2 边界总结

| 维度 | CDP 负责 | CDP 不负责 |
|---|---|---|
| 客户主体 | 统一 party/identity/contact/relationship | 下游 interaction 运行态 |
| 客户事实 | 统一事件骨架、事实索引、时间线摘要 | 订单、账单、支付、工单的事务真值 |
| 客户视图 | profile/service/interaction summaries | 对话流、SLA、offer、assignment |
| 联络治理 | preference/consent 与后续 contactability | 实际渠道发送与消息投递执行 |
| 供给方式 | low-latency APIs + change events | 具体渠道/工单流程的执行编排 |

---

## 4. 基于现有代码的现实分析

### 4.1 `business.ts` 是很好的上游事实源，但还不是 CDP

[`packages/shared-db/src/schema/business.ts`](../../../packages/shared-db/src/schema/business.ts) 中已经有很多可以作为 CDP 来源的对象：

- `subscribers`
- `customer_households`
- `customer_preferences`
- `contracts`
- `device_contexts`
- `identity_otp_requests`
- `identity_login_events`

但这些对象当前仍然是：

- 业务系统视角
- 订阅/号码视角
- 来源系统视角

而不是统一客户语义视角。

### 4.2 `backend` 当前直接消费业务表，说明需要中间语义层

[`backend/src/chat/chat-ws.ts`](../../../backend/src/chat/chat-ws.ts) 和 [`backend/src/chat/voice.ts`](../../../backend/src/chat/voice.ts) 都直接访问 `businessDb` 中的 `subscribers`、`plans`。

这在 demo 期没有问题，但长期会带来三个问题：

1. Bot / chat / voice 自己决定“客户是谁”
2. 实时链路直接耦合到业务表结构
3. 未来 Interaction Platform 也会重复做一次类似上下文拼接

### 4.3 工单域说明客户主数据已经外溢

[`packages/shared-db/src/schema/workorder.ts`](../../../packages/shared-db/src/schema/workorder.ts) 中的多个字段：

- `customer_phone`
- `customer_name`
- `customer_id`

说明当前工单系统也在持有自己的客户定位信息。  
这些字段在短期内仍然有价值，但长期应该退化成：

- 冗余显示字段
- 输入 identity 字段

而不是主关联。

---

## 5. CDP 在全局架构中的位置

CDP 在系统中的位置不是最上游，也不是最下游，而是：

> **位于“多源事实系统”与“互动执行系统”之间的统一客户语义层**

```mermaid
flowchart LR
  subgraph Sources["上游事实源"]
    S1["CRM / Customer Master"]
    S2["Billing / Account / Subscription"]
    S3["Order / Payment / Refund"]
    S4["Interaction Platform Facts"]
    S5["Work Order Facts"]
    S6["App / Device / Identity Events"]
  end

  subgraph CDP["Customer Data Platform"]
    C1["Identity & Party Hub"]
    C2["Relationship / Ownership Layer"]
    C3["Customer Facts Backbone"]
    C4["Profile / Summary Compute"]
    C5["Serving APIs / Change Events"]
    C6["Governance / Audit / Lineage"]
  end

  subgraph Consumers["下游消费方"]
    D1["Interaction Platform"]
    D2["Bot / Skills / Tools"]
    D3["Work Order Service"]
    D4["Outbound / Operations"]
    D5["Analytics / Reporting"]
  end

  Sources --> CDP
  CDP --> Consumers
```

这张图最重要的含义是：

- 上游继续保留自己的交易主责
- CDP 承担统一语义与上下文供给
- 下游不再需要直接耦合到多个源系统

---

## 6. CDP 的六层架构

这是本方案中最推荐的模块分层方式。

### 第 1 层：Source Integration Layer

#### 职责

- 承接 DB、CDC、API、事件、批量导入
- 做最小必要的 schema mapping、normalization、idempotent ingestion

#### 输入来源

- CRM / customer master
- billing / account / subscription
- order / payment / refund
- app / device / identity
- interaction facts
- work order facts

#### 关键原则

这层只负责“把数据接进来”，不负责最终决定客户主体归属。

### 第 2 层：Identity & Party Hub

#### 职责

- 统一主体
- 统一 identity
- 统一 contact point
- 记录 identity link 证据
- 支持 merge/split/relink 审核

#### 对应实体

- `party`
- `party_identity`
- `contact_point`
- `identity_link`
- `source_record_link`
- `identity_resolution_case`

#### 关键原则

这层输出的是：

> **稳定、可解释、可演进的客户主体语义**

### 第 3 层：Relationship & Ownership Layer

#### 职责

- 把 party 与 account/subscription/household 的关系统一起来
- 明确 owner/user/payer 等归属关系

#### 对应实体

- `household`
- `customer_account`
- `service_subscription`
- `party_subscription_relation`

#### 关键原则

Interaction Platform 不能直接拿 `phone -> customer` 做业务判断，必须通过这一层看 party 与 subscription 的关系。

### 第 4 层：Customer Facts Hub

#### 职责

- 承接 append-only 客户事实事件
- 做统一 timeline 和事实索引

#### 对应实体

- `customer_event`

#### 关键原则

没有事实层，profile 只是静态主数据。  
有事实层，才能稳定做：

- interaction summary
- route hint
- traits / future scores

### 第 5 层：Profile & Feature Compute Layer

#### 职责

- 聚合主体、关系、偏好、事实，形成消费视图

#### 对应实体

- `customer_profile`
- `service_summary`
- `interaction_summary`

#### 关键原则

这些对象都是：

> **派生视图 / 消费视图 / 可重建视图**

### 第 6 层：Serving & Governance Layer

#### Serving 职责

- Resolve Identity API
- Customer Context API
- Profile Query API
- Consent / Preference Query API
- Change Events

#### Governance 职责

- lineage
- ownership
- access control
- audit trail
- explainability
- schema/version control

---

## 7. 四个 Plane 视角下的抽象

如果从更高层的平台架构来看，CDP 也可以抽象成四个 Plane：

### 1. Data Ingress Plane

负责把多源数据接进来。

### 2. Identity Plane

负责主体与身份统一。

### 3. Customer Semantic Plane

负责关系、偏好、同意、事实、画像、摘要。

### 4. Serving Plane

负责向下游提供统一上下文与事件。

这四个 Plane 比六层更适合写在平台总纲里；六层更适合用于模块职责拆分。

---

## 8. 能力边界：CDP 必须负责什么

### A. 主体统一

CDP 必须回答：

- 这个客户是谁
- 这个外部 actor 是否是已知客户
- 这些 identity 是否属于同一主体

### B. 联系语义统一

CDP 必须回答：

- 有哪些联系方式
- 哪些是主联系点
- 客户偏好什么渠道
- 当前是否有同意记录

### C. 关系与归属统一

CDP 必须回答：

- 这个 party 属于哪个 account / subscription
- 谁是 owner / user / payer
- household 或共享关系如何表达

### D. 客户事实沉淀

CDP 必须回答：

- 最近发生了什么
- 最近是否有投诉、欠费、升级、OTP 验证、公开负面互动

### E. 消费视图供给

CDP 必须给下游一份可读、统一、稳定的客户上下文，而不是要求下游自己拼源数据。

### F. 服务与治理

CDP 必须提供：

- 查询接口
- 解析接口
- 变更事件
- 可解释性
- 审计和治理

---

## 9. 能力边界：CDP 明确不负责什么

### 不负责 1：不接管交易真值

CDP 不应成为：

- 账单系统
- 订单系统
- 支付系统
- 工单系统

它可以保留：

- 摘要
- 事实索引
- 时间线
- 计算视图

### 不负责 2：不接管 Interaction Platform 运行态

CDP 不负责：

- conversation
- engagement
- interaction
- offer
- assignment
- queue
- SLA
- agent workload

这些属于 Interaction Platform / ACD Core。

### 不负责 3：不接管 Bot 编排

CDP 只供给上下文，不做：

- 对话编排
- skill orchestration
- tool execution
- handoff decision

### 不负责 4：不把 activation 做成第一期主目标

segment / activation / audience 是应保留的扩展位，但不是第一阶段中心。

---

## 10. 与 Interaction Platform 的关系

二者的关系应该被定义为：

> **CDP 负责客户语义；Interaction Platform 负责互动执行。**

### CDP 提供给 Interaction Platform 的关键能力

1. `ResolveIdentity`
2. `GetCustomerContext`
3. `GetServiceSummary`
4. `GetInteractionSummary`
5. `CheckConsentAndContactability`

### Interaction Platform 回流给 CDP 的关键事实

1. interaction created / closed
2. public engagement escalated
3. handoff / escalation
4. route outcome / contact frequency

### 重要架构原则

Interaction Platform 不应直接长期读取 `business.db` 或其它业务表做 customer context 拼装。  
它应逐步切换到通过 CDP Serving API 获取统一视图。

---

## 11. 与 Backend / Bot / Skills 的关系

`backend` 未来主要负责：

- Bot runtime
- skills
- tools
- handoff summary

因此它对 CDP 的依赖，应收敛到以下几类：

- 查询客户基础信息
- 查询服务摘要
- 查询偏好/语言
- 查询 interaction summary

这会使 bot/runtime 从“直接耦合多张业务表”转向“面向上下文服务编排”。

---

## 12. 与 Work Order Service 的关系

`work_order_service` 未来仍持有：

- ticket / appointment / callback / task / workflow 的真值

它与 CDP 的关系应该是：

### 从 CDP 读取

- party 上下文
- 联系偏好
- 账户/订阅摘要
- 客户历史摘要

### 回流给 CDP

- work order created / closed
- unresolved count
- escalated issue facts

这样工单系统不需要成为客户主数据系统，但也不失去客户上下文能力。

---

## 13. 与源系统和事实源的关系

CDP 对源系统的原则是：

### 1. Source of Truth 保持在源系统

例如：

- 账单真值在 billing
- 订单真值在 order
- 工单真值在 work order
- interaction 真值在 Interaction Platform

### 2. CDP 承接标准化镜像与摘要

例如：

- `service_subscription` 是订阅的 canonical mirror
- `service_summary` 是面向消费方的服务摘要
- `customer_event` 是统一事实索引

### 3. CDP 记录来源映射

通过 `source_record_link` 保证：

- 可追溯
- 可修复
- 可重放

---

## 14. 服务供给模型：API / Events / Context Serving

CDP 对下游至少应提供以下一等服务能力：

### A. Identity Resolve APIs

- `ResolveIdentity`
- `SearchPartyByIdentity`
- `GetPartyById`

### B. Context Serving APIs

- `GetCustomerContext`
- `GetServiceSummary`
- `GetInteractionSummary`
- `GetContactPoints`

### C. Governance / Permission APIs

- `GetPreferences`
- `GetConsents`
- `CheckConsentAndContactability`

### D. Change Events

- `party.updated`
- `profile.updated`
- `service_summary.updated`
- `interaction_summary.updated`
- `consent.updated`

### 重要原则

CDP 必须同时提供：

- **查询式接口**
- **变化式事件**

因为：

- 实时链路需要 pull
- 投影系统和 cache 需要 subscribe

---

## 15. 统一数据所有权与数据库边界

### 15.1 CDP 自有真相对象

建议由 `cdp_service` 自有数据库持有：

- `party`
- `party_identity`
- `contact_point`
- `identity_link`
- `source_record_link`
- `identity_resolution_case`
- `communication_preference`
- `consent_record`
- `customer_event`

### 15.2 CDP canonical mirror / snapshot 对象

- `household`
- `customer_account`
- `service_subscription`
- `party_subscription_relation`

这些对象在语义上属于 CDP，但真值仍可能部分来自上游系统。

### 15.3 CDP 派生投影对象

- `customer_profile`
- `service_summary`
- `interaction_summary`

这些必须被视为：

- 可重算
- 可重建
- 可回放

### 15.4 当前代码中的对应来源

- `business.db` 作为第一批主要事实源
- `work_order_service` 作为 follow-up 事实源
- `Interaction Platform` 未来作为互动事实源

---

## 16. 16 个核心实体的架构分层映射

### Identity & Party Hub

1. `party`
2. `party_identity`
3. `contact_point`
4. `identity_link`
5. `source_record_link`
6. `identity_resolution_case`

### Relationship & Ownership Layer

7. `household`
8. `customer_account`
9. `service_subscription`
10. `party_subscription_relation`

### Profile & Summary Compute

11. `customer_profile`
12. `service_summary`
13. `interaction_summary`

### Preference / Consent

14. `communication_preference`
15. `consent_record`

### Facts Backbone

16. `customer_event`

实体的详细字段、约束和索引建议见 [data-model.md](data-model.md)。

---

## 17. 计算层：Profile / Summary / Traits 的设计原则

### 原则 1：Profile 是消费视图，不是交易真值表

`customer_profile` 不应成为“万物归宿表”。  
它应只保存面向消费方稳定有价值的聚合视图。

### 原则 2：Summary 比 Full Profile 更适合实时链路

对于 Interaction Platform / Bot 来说，真正高频消费的是：

- `service_summary`
- `interaction_summary`

而不是一次性拉整份全量 profile。

### 原则 3：可重建

这三类投影表都要有：

- `profile_version`
- `computed_at`
- `updated_at`

并且要允许：

- 全量重算
- 局部重算
- 追溯计算来源

### 原则 4：为 traits / scores 预留扩展位

第一期可以先不单独落 traits/scores 表，但架构上必须预留以下路径：

- route hint
- VIP score
- churn risk
- complaint risk
- abuse risk

---

## 18. Identity Resolution 的架构原则

### 原则 1：必须可解释

系统不能只给出“两个 identity 是同一个人”的结果，还必须能说明：

- 依据是什么
- 证据链是什么
- 匹配分是多少
- 是否人工确认过

### 原则 2：必须支持 merge / split / relink

随着 public/private 融合、多订阅、多账户增长，identity graph 不可能永远不出错。

### 原则 3：必须保留 source linkage

没有 `source_record_link`，后期：

- 回溯来源
- 定位脏数据
- 修复合并错误

都会很痛。

### 原则 4：不要一上来做过于复杂的全自动 graph engine

V1 更稳的路线是：

- 规则匹配
- evidence 记录
- case 审核
- 人工 merge/split

先把治理做稳。

---

## 19. Consent / Preference / Contactability 的架构原则

### 原则 1：preference 与 consent 不同

- `preference` = 客户倾向
- `consent` = 我们是否被授权

### 原则 2：contact point 与 contactability 也不同

- `contact_point` = 地址
- `contactability` = 当前是否允许/是否适合联系

### 原则 3：第一期可先不单独建 `contactability_status`

但 Serving 层应具备：

- 汇总 consent
- 汇总 preference
- 返回 channel-level contactability judgement

### 原则 4：Interaction Platform 和 Outbound 都要复用这层

否则会出现：

- 客服能联系
- 外呼不能联系
- 邮件允许、短信禁止

但没有统一裁决点。

---

## 20. 时间线与事实回流设计

`customer_event` 应被定义为 append-only 事实骨架。

### 来源包括

- identity events
- billing facts
- interaction facts
- work order facts
- public engagement facts
- service/account lifecycle facts

### 为什么必须统一

后续这些能力都依赖统一事实层：

- `interaction_summary`
- `service_summary`
- route hint
- recent contact frequency
- complaint propensity
- recent negative public signal

### 设计原则

1. 允许 `party_id` 在初始入库时为空，后续回补
2. 必须保留 `source_system + source_event_id`
3. 必须保留 `event_time` 与 `created_at`
4. 必须支持以 `party_id` 为主轴查询 timeline

---

## 21. 多租户、权限、治理与审计

### 多租户

所有核心实体应显式包含 `tenant_id`。

### 权限

CDP Serving API 应至少按以下维度控制：

- 租户
- 调用方服务身份
- 数据用途
- 字段级访问限制

### 审计

必须能够回答：

- 谁在什么时候读取了谁的 profile
- 谁发起了 merge/split
- 哪个系统回流了哪些 customer_event

### explainability

尤其针对：

- identity resolution
- profile projection
- consent decisions
- interaction summary

都应能解释来源与推导链路。

---

## 22. 性能、低延迟与可用性要求

### 22.1 查询要求

CDP Serving Layer 最终面向实时链路，因此必须优化：

- `ResolveIdentity`
- `GetCustomerContext`
- `GetServiceSummary`
- `CheckConsentAndContactability`

这些接口不能只按“离线分析系统”思路设计。

### 22.2 投影要求

`customer_profile / service_summary / interaction_summary` 应预计算或增量计算，而不是每次都在线拼接多个源表。

### 22.3 可靠性要求

CDP 要求具备：

- 幂等摄入
- 重放能力
- 投影重建
- lineage
- source traceability

---

## 23. 分阶段落地路线

### Phase 1：完成主体与订阅语义升级

优先落地：

- `party`
- `party_identity`
- `contact_point`
- `customer_account`
- `service_subscription`
- `party_subscription_relation`

目标：

- 让系统从 `phone = customer` 升级到 `party + subscription`

### Phase 2：补齐 identity graph 的治理能力

继续落地：

- `identity_link`
- `source_record_link`
- `identity_resolution_case`

目标：

- identity merge/split 可解释、可治理

### Phase 3：补齐联系语义

- `communication_preference`
- `consent_record`

目标：

- 为短信/电话/邮件/私信/outbound/public-to-private 提供统一判断

### Phase 4：形成消费视图

- `customer_profile`
- `service_summary`
- `interaction_summary`

目标：

- 给 Interaction Platform / Bot / Work Order 输出统一上下文

### Phase 5：补齐 household 和 customer_event

- `household`
- `customer_event`

目标：

- 形成时间线和未来 traits 的计算骨架

> 注意：从理论上 `customer_event` 也可以提前；这里将其放在 Phase 5 主要是从“主实体先稳定，再接回流” 的工程节奏考虑。

---

## 24. 风险、取舍与被否决方案

### 被否决方案 1：不建 CDP，让 Interaction Platform 自己做客户统一

问题：

- Interaction Platform 会被客户主数据职责侵蚀
- Bot、Work Order、Outbound 会重复造轮子
- public/private/customer/subscription/consent 语义都会混在实时平台内

### 被否决方案 2：把 `subscribers.phone` 继续当客户主键

问题：

- 无法支撑多订阅、多账户、多联系点、多 identity
- public actor 无法纳入统一模型

### 被否决方案 3：把所有源系统表直接复制成 CDP 真值

问题：

- CDP 会膨胀成交易中台
- ownership 模糊
- 下游消费反而更复杂

### 被否决方案 4：只做离线 profile 仓库，不提供实时 serving

问题：

- Interaction Platform / Bot 无法在实时链路中使用
- CDP 无法成为客户语义层，只能成为 BI 侧仓库

---

## 25. 最终定稿的架构决策清单

1. `cdp_service` 是独立模块，不并入 `backend`
2. CDP 顶层主实体统一为 `party`
3. `phone / email / social id` 只作为 identity 或 contact point
4. `customer_account`、`service_subscription` 是重要的归属层对象
5. `customer_profile / service_summary / interaction_summary` 是消费视图，不是源真值
6. `customer_event` 是 append-only 客户事实骨架
7. CDP 通过 Serving API + Change Events 向下游供给能力
8. Interaction Platform 不长期直接依赖源业务表做 customer context
9. CDP 不接管交易真值，也不接管 interaction 运行态
10. Phase 1 优先解决主体、identity、subscription 主链，再逐步补充事件、摘要和治理

---

## 结语

CDP 在本项目里不是一个“可有可无的客户资料模块”，而是：

> **整个互动系统的客户语义中枢**

它统一：

- 客户主体
- 身份
- 联系点
- 服务归属
- 偏好同意
- 客户事实
- 统一消费视图

并以此支撑：

- Interaction Platform
- Bot / Skills / Tools
- Work Order Service
- 运营系统
- 后续的分群、激活、特征计算能力

这就是 `cdp_service` 需要被优先建立的根本原因。
