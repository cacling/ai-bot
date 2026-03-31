# 功能规格说明：CDP / Customer Data Platform 架构设计

**功能分支**: `003-cdp-service`  
**创建日期**: 2026-03-31  
**状态**: Draft  
**输入**: 本线程内关于 CDP 模块定位、行业 CDP 能力范围、与 Interaction Platform 的边界、16 个核心实体、客户语义层与客户事实底座等连续讨论结论

> **文档导航**：
> - 完整架构设计、模块分层、全局边界、与现有代码的衔接、服务接口定位、治理与迁移路线见 [plan.md](plan.md)
> - 16 个核心业务实体、ER 关系、逻辑表结构、主键/索引建议、真相表与投影表划分见 [data-model.md](data-model.md)

## 系统概述

当前项目已经拥有一批“客户相关数据”，但它们仍散落在多个系统与语义层中：

- `business.db` 中存在订阅、套餐、账单、偏好、合同、设备、身份校验等业务数据
- `backend` 在实时链路中直接读取业务库，为聊天与语音入口拼接客户信息
- `work_order_service` 在工单与后续处理里大量使用 `customer_phone / customer_id / customer_name`
- `Interaction Platform` 正在从“以 phone 为中心的会话系统”演进为“以 interaction 为中心的实时互动平台”

这些能力说明系统已经有“客户数据”，但尚未形成一个统一、可解释、可授权、可供给的客户语义层。因此，在 Interaction Platform 深度建设之前，需要先建立一个新的基础模块：

> **CDP（Customer Data Platform）**
> = **客户语义层与客户事实底座**
> = **Identity Graph** + **Party / Relationship Hub** + **Consent / Preference Hub** + **Customer Facts Backbone** + **Profile / Summary Compute** + **Serving & Governance**

这里的 CDP 不是“营销自动化平台”的别名，也不是“客户表集合”。  
它是一个独立的、可长期演进的基础模块，其职责是统一客户主体、身份、联系点、关系归属、偏好同意、客户事实与统一消费视图，并向 `Interaction Platform`、`Bot`、`Work Order`、运营与分析系统供给低延迟客户上下文。

## 业务目标

本规格希望解决以下结构性问题：

- 当前系统错误地把 `phone` 同时当成客户身份、服务号码、会话定位符与工单定位字段
- 当前不同系统各自维护客户上下文，导致实时链路、工单链路、机器人链路无法共享统一客户视图
- Interaction Platform 未来需要稳定的 identity resolve、customer context、consent check、service summary、interaction summary，但这些能力当前没有统一归属
- 随着私域、Email、public engagement、多账户、多订阅、多联系点场景增长，现有“订户 + 手机号”模型将无法支撑

因此，本规格将 CDP 明确定义为：

> **面向全渠道互动系统的上游客户语义中枢**
> 它不接管订单、账单、支付、工单、interaction 的运行态真值，
> 但统一承接与客户有关的身份、归属、偏好、事实与消费视图。

## 用户场景与测试

### 用户故事 1 — Interaction Platform 在实时链路中解析客户主体与统一上下文（Priority: P1）

当私域聊天、语音、Email 或公开互动需要进入实时服务链路时，系统需要先通过 CDP 解析主体与身份，返回可消费的客户上下文，而不是让每个下游系统直接读取多个源表并自行拼接。

**为什么是 P1**：这直接决定 Interaction Platform 是否能摆脱 `phone = customer` 的伪模型，也是后续 ACD、Inbox、Bot handoff 能否稳定的基础。

**独立测试**：给定 `phone/email/external_user_id` 之一，CDP 能返回统一的 `party_id`、关键 identity、service summary、interaction summary 与 consent/preference 摘要。

**验收场景**：

1. **Given** 一个客户使用手机号发起 Web Chat，**When** Interaction Platform 调用 `ResolveIdentity`，**Then** CDP 应返回统一 `party_id`，而不是只返回某一张订户表记录。
2. **Given** 一个客户通过公开评论导流到私信，**When** CDP 识别此前存在同一手机号与社媒身份的关联证据，**Then** 它应能将新的私域 interaction 关联到同一 party。
3. **Given** 一个客户有多个订阅号码与同一主账户，**When** 坐席打开客户上下文，**Then** 系统应能返回“客户主体 + 账户 + 主订阅/相关订阅”的统一视图。

---

### 用户故事 2 — Bot、Agent、Work Order 读取同一份客户 360 视图（Priority: P1）

无论是 Bot 在首轮问答中、Agent 在 Inbox 中，还是 Work Order 在 follow-up 中，都应读取同一份统一客户视图，而不是各自从不同源系统做临时拼接。

**为什么是 P1**：这是去耦的关键。如果没有统一服务视图，下游每个系统都会长出自己的“伪 CDP”。

**独立测试**：定义一个 `GetCustomerContext` 输出契约，验证相同客户在 bot、workspace、work order 三个消费方中读取到一致的核心字段。

**验收场景**：

1. **Given** Bot 在会话中需要说明客户当前套餐、欠费状态与语言偏好，**When** 读取 CDP context，**Then** 返回的值与 Agent Workspace 中应保持一致。
2. **Given** 工单系统为客户创建 follow-up，**When** 读取 CDP profile，**Then** 工单上下文中的客户主体、联系偏好、服务摘要应与 Interaction Platform 使用的视图一致。

---

### 用户故事 3 — 联系偏好、同意与联系可达性由 CDP 统一判断（Priority: P1）

当系统尝试通过短信、邮件、电话、私信或其他渠道联系客户时，应统一通过 CDP 判断客户偏好、同意状态和是否可联系，而不是每个系统各自做规则判断。

**为什么是 P1**：未来 Interaction Platform、Work Order、Outbound、Public-to-private conversion 都会依赖这一能力；如果没有统一语义，合规与客户体验都会出问题。

**独立测试**：对同一客户在多个渠道上的触达请求进行检查，确保 CDP 能返回统一的 consent/preference 判定结果。

**验收场景**：

1. **Given** 客户允许服务通知但拒绝营销短信，**When** Outbound 系统发起营销短信，**Then** CDP 应返回拒绝结果。
2. **Given** 客户设置仅允许在特定时间窗接受电话联系，**When** Callback 任务尝试立即回拨，**Then** CDP 应提示当前不满足联系策略。

---

### 用户故事 4 — 客户事实事件可以回流并生成统一交互摘要（Priority: P2）

客户的登录、验证、支付失败、工单创建、interaction 关闭、公开投诉等事件应统一回流到 CDP，形成客户时间线和派生摘要，为后续路由、客服、机器人提供更稳定的上下文。

**为什么是 P2**：没有事件骨架，客户画像只能停留在静态主数据层；后续 priority hint、risk tag、service summary 都会缺少演化基础。

**独立测试**：向 `customer_event` 输入多种来源事件，验证 `interaction_summary` 能正确更新最近联系次数、最近升级时间、开放工单数等派生字段。

**验收场景**：

1. **Given** 客户 7 天内多次联系且最近一次刚升级工单，**When** Interaction Platform 拉取客户上下文，**Then** `interaction_summary` 应反映这一风险与优先级提示。
2. **Given** 客户刚完成 OTP 验证，**When** Bot 或 Agent 查询客户状态，**Then** 上下文应能体现近期身份验证成功这一事实。

---

### 用户故事 5 — identity merge / split 具备可解释与人工审核能力（Priority: P2）

当系统发现多个 identity 可能属于同一主体时，不应只有黑盒自动合并结果，而应保留证据、置信度、状态与人工审核闭环。

**为什么是 P2**：随着 private/public 融合、多个订阅、多个渠道、多个账户共存，错误合并的代价会快速上升。

**独立测试**：构造两个存在冲突或模糊匹配的 identity，验证系统可生成 `identity_resolution_case` 并保留证据链，而不是直接不可逆合并。

**验收场景**：

1. **Given** 手机号与邮箱强匹配但姓名弱匹配，**When** identity resolution 运行，**Then** 系统应能记录 evidence 与 score，并决定自动合并或进入人工审核。
2. **Given** 已合并的两个 identity 被人工判定属于不同主体，**When** 执行 split / relink，**Then** 系统应保留 resolution case 记录与可追溯性。

## 边界情况

- 一个客户主体可能拥有多个订阅、多个号码、多个联系点；系统如何区分 `party` 与 `subscription`？
- 一个 `external_actor` 可能尚未被识别为正式客户，CDP 是否允许其先以 `party_type=external_actor` 存在？
- 一个 identity 可能被多个源系统同时声明归属于不同主体时，系统如何保留冲突与审核状态？
- 某些字段可能在源系统中是交易真值，在 CDP 中只应作为摘要或镜像；如何明确所有权？
- Interaction Platform 与 Work Order 是否可以直接回写 `customer_profile`？如果不可以，应该回写什么？

## 需求

### 功能需求

- **FR-001**: 系统必须新增 `cdp_service` 作为独立模块，而不是把客户档案能力散落在 `backend`、`work_order_service`、`business.db` 查询逻辑中。
- **FR-002**: CDP 必须把自己定义为“客户语义层与客户事实底座”，而不是交易系统真值仓库。
- **FR-003**: CDP 必须以 `party` 作为统一主体根，而不是以 `phone`、`email`、`subscription` 作为顶层主键。
- **FR-004**: CDP 必须支持统一 identity graph，包括 identity normalization、matching、linking、merge/split 审核与 source linkage。
- **FR-005**: CDP 必须支持客户联系语义统一，包括联系点、偏好、同意记录及后续可扩的 contactability 计算。
- **FR-006**: CDP 必须支持账户、订阅、家庭/归属关系建模，使 Interaction Platform 不再依赖“手机号等于客户”的伪模型。
- **FR-007**: CDP 必须沉淀 `customer_event` 作为 append-only 客户事实骨架，以支持 timeline、summary、traits 与后续 feature 计算。
- **FR-008**: CDP 必须输出至少三类统一消费视图：`customer_profile`、`service_summary`、`interaction_summary`。
- **FR-009**: CDP 必须向 `Interaction Platform`、`Bot`、`Work Order`、运营与分析系统提供统一的低延迟 Serving API。
- **FR-010**: CDP 必须支持 `ResolveIdentity`、`GetCustomerContext`、`GetServiceSummary`、`CheckConsentAndContactability` 等一等服务能力。
- **FR-011**: CDP 必须明确不接管订单、账单、支付、工单、interaction 运行态等交易真值。
- **FR-012**: CDP 必须提供数据治理能力，包括 lineage、ownership、access control、audit trail 与 explainability。
- **FR-013**: CDP 必须能够接收 `Interaction Platform` 与 `Work Order Service` 的事实回流，而不要求这些系统直接共享数据库真值。
- **FR-014**: CDP 的 Profile / Summary 层必须被视作消费视图，可重建、可回放、可版本化。
- **FR-015**: CDP 必须为 future activation、segment、feature score、party relationship 扩展预留设计位，但不强制在 V1 一次性全部落地。
- **FR-016**: CDP 的 V1 领域模型必须至少覆盖本功能定义的 16 个核心业务实体。

### 核心实体

本功能 V1 采用以下 16 个核心实体作为领域模型底稿：

1. `party`
2. `party_identity`
3. `contact_point`
4. `identity_link`
5. `source_record_link`
6. `identity_resolution_case`
7. `household`
8. `customer_account`
9. `service_subscription`
10. `party_subscription_relation`
11. `customer_profile`
12. `service_summary`
13. `interaction_summary`
14. `communication_preference`
15. `consent_record`
16. `customer_event`

## 成功标准

### 可量化指标

- **SC-001**: 任一 private/public 互动在进入 Interaction Platform 时，都可以通过 CDP 返回稳定的 `party_id` 或明确的“未解析主体”结果，而不是依赖单一手机号。
- **SC-002**: 同一客户在 Bot、Agent Workspace、Work Order 中读取到的核心客户上下文字段应保持一致，避免出现多套拼接逻辑。
- **SC-003**: CDP 输出的 `customer_profile / service_summary / interaction_summary` 必须支持重建，并可追溯来源事实与计算时间。
- **SC-004**: 客户沟通偏好与同意记录必须能够支撑跨短信、邮件、电话、私信等渠道的一致判断。
- **SC-005**: identity merge / split 过程必须可解释、可追溯、可人工审核，而非黑盒不可逆操作。
- **SC-006**: 新增一个渠道 identity、一个上游客户源系统或一个新的服务订阅类型时，不应要求重写下游 Interaction Platform 的核心逻辑。
