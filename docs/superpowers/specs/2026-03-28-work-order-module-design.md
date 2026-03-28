# 工单模块设计与客服工作台协同方案

> 将“工单”从零散的回访任务、人工升级说明、执行留痕中抽离出来，建设为一个独立的业务编排模块；同时让它成为现有客服工作台和 SOP Runtime 的统一“后续动作承载层”。

**Date**: 2026-03-28  
**Status**: Draft  
**Positioning**: Product + Architecture Design  
**Related Current Code**:
- `frontend/src/agent/AgentWorkstationPage.tsx`：当前客服工作台主体，采用“会话 + 右侧卡片”模式
- `frontend/src/agent/cards/index.ts`：卡片注册中心，适合接入“工单摘要/跟进事项”卡片
- `packages/shared-db/src/schema/business.ts`：当前仅有 `callback_tasks` 这类窄场景任务
- `backend/src/engine/skill-runtime.ts`：`human` 步骤目前直接结束/升级实例，尚未沉淀为可持续跟进的工单
- `backend/skills/biz-skills/*/SKILL.md`：大量 SOP 已出现“提交工单 / 营业厅办理 / App 自助 / 后续跟进”等语义

---

## 1. 背景与现状判断

当前系统已经有三类与“工单”很接近但彼此割裂的能力：

1. **工作台上下文卡片**
   - 客服工作台通过 WebSocket 事件更新右侧卡片。
   - 已有 `用户详情 / 外呼任务 / 转人工摘要 / 坐席助手 / 流程图` 等卡片。
   - 说明前端已经具备很适合承接“当前客户工单上下文”的展示容器。

2. **窄场景任务**
   - 当前真正持久化的后续任务，只有 `callback_tasks` 这类回访任务。
   - 它更像“预约回拨子功能”，还不是通用工单域。

3. **SOP 中大量存在的后续动作**
   - `telecom-app`、`fault-diagnosis`、`service-cancel`、`plan-inquiry` 等技能里，已经反复出现：
   - 提交工单
   - 升级一线/安全团队
   - 用户去营业厅办理
   - 用户去 App 自助完成
   - 后续回访确认
   - 重要执行类动作留痕
   - 但这些动作大多仍停留在“话术和结束语义”层，没有统一的实体承接。

因此，当前最大问题不是“没有任务记录”，而是：

- **缺少统一的工单主实体**
- **缺少 SOP 到工单的正式落点**
- **缺少客服工作台里的工单上下文与闭环入口**
- **缺少从工单反向恢复/继续 SOP 的能力**

---

## 2. 设计目标

### 2.1 核心目标

工单模块要同时解决四件事：

1. **承接跨轮次、跨角色、跨渠道的未完成事项**
2. **把 SOP 中“此刻做不完”的节点正式落到系统里**
3. **让客服工作台随时看到“这个客户当前有哪些待跟进事项”**
4. **为重要执行动作提供审计、跟进、回查能力**

### 2.2 设计原则

#### 原则 A：工单是独立模块，不是聊天附件

工单需要有自己的：

- 列表页
- 详情页
- 状态流转
- 队列与 SLA
- 跟进时间线

但在工作台里要有“上下文投影”，而不是要求坐席切屏处理所有事情。

#### 原则 B：工单是 SOP 的延续载体，不只是备注

工单不只是“写一条 note”。

它必须明确表达：

- 为什么创建
- 当前卡在哪一步
- 下一步谁来做
- 什么时候做
- 做完以后如何验证
- 是否需要恢复原 SOP

#### 原则 C：统一“跟进工单”和“执行工单”

同一个模块内要能容纳两大类场景：

1. **跟进型**
   - 预约外呼
   - 用户去营业厅
   - 用户去 App 自助
   - 后续回访确认

2. **执行型**
   - 停机保号
   - 密码重置/人工解锁
   - 异议复核
   - 安全审核

二者共享一个工单主模型，但使用不同模板和状态机。

#### 原则 D：一个客户可同时存在多个工单，但工作台必须给出“当前主工单”

不能让工作台被工单淹没。

所以需要区分：

- 当前会话关联工单
- 当前客户全部未结工单
- 当前最高优先级工单

---

## 3. 模块边界

建议把工单设计成三个层次。

### 3.1 工单中心（独立主模块）

这是完整的工单工作区，负责：

- 我的工单
- 队列工单
- 待回访
- 待客户完成
- 超时/SLA 风险
- 工单详情与时间线
- 统计与运营报表

它是独立模块，适合班组长、质检、二线、运营看全局。

### 3.2 工作台工单上下文（客服工作台内嵌）

这是当前客服会话的“工单投影层”，负责：

- 展示当前手机号关联的未结工单
- 展示本轮会话是否建议创建工单
- 快速创建、补录、改派、预约、完结
- 从工单跳回会话/SOP/工具执行记录

它是协同层，不是完整工单中心替代品。

### 3.3 SOP/Runtime 接入层

这是让工单真正串起 SOP 的关键一层，负责：

- 从技能步骤或升级路径自动生成工单
- 把 skill instance 与工单绑定
- 在工单完成后支持恢复/继续流程
- 让“human / escalation / external action”不再只是一个结束语义

---

## 4. 业务模型

建议采用“主工单 + 时间线 + 关系 + 模板”的模型。

### 4.1 主表：`work_orders`

建议放在 `platform` 域，而不是 `business` 域。

原因：

- 它是跨技能、跨渠道、跨连接器的编排对象
- 强绑定客服工作台与 runtime
- 不属于某个单一外部业务系统

建议字段：

```ts
work_orders
- id
- ticket_no
- parent_id
- root_id
- title
- summary
- category
- action_type
- source_channel
- source_session_id
- source_skill_id
- source_skill_version
- source_step_id
- source_instance_id
- phone
- customer_name
- priority
- severity
- queue_code
- owner_id
- status
- actor_type_required
- due_at
- next_followup_at
- scheduled_at
- sla_deadline_at
- resume_mode
- resume_instance_id
- resume_step_id
- external_ref
- context_json
- resolution_code
- resolved_at
- closed_at
- created_by
- created_at
- updated_at
```

### 4.2 时间线表：`work_order_events`

用于记录每次变更、外呼、回访、改派、补充说明、客户反馈。

```ts
work_order_events
- id
- work_order_id
- event_type
- actor_type
- actor_id
- note
- payload_json
- created_at
```

典型 `event_type`：

- `created`
- `assigned`
- `customer_notified`
- `callback_scheduled`
- `callback_completed`
- `customer_confirmed`
- `store_visit_reported`
- `app_self_service_reported`
- `execution_started`
- `execution_succeeded`
- `execution_failed`
- `reopened`
- `closed`

### 4.3 关系表：`work_order_relations`

用于把工单挂到现有对象上。

```ts
work_order_relations
- id
- work_order_id
- relation_type
- relation_id
- metadata_json
```

关系类型建议支持：

- `session`
- `skill_instance`
- `outbound_task`
- `callback_task`
- `execution_record`
- `service_order`
- `handoff_case`

### 4.4 模板表：`work_order_templates`

这是把 SOP 和工单连起来的配置入口。

```ts
work_order_templates
- id
- template_key
- name
- category
- action_type
- default_queue
- default_priority
- default_sla_hours
- actor_type_required
- required_fields_json
- resume_policy_json
- trigger_scope_json
- active
```

---

## 5. 工单分类建议

不建议一开始按部门组织，而建议按“后续动作语义”组织。

### 5.1 一级分类 `category`

- `customer_followup`
- `internal_execution`
- `manual_review`
- `escalation`
- `outbound_followup`

### 5.2 二级动作 `action_type`

- `callback`
- `store_visit`
- `app_self_service`
- `password_reset`
- `manual_unlock`
- `service_suspension`
- `billing_review`
- `security_review`
- `complaint_followup`
- `network_fault_followup`

这样做的好处是：

- 业务表达稳定
- 便于模板化
- 便于后期做统计和自动派单

---

## 6. 状态机建议

建议不要只用 `open / closed` 两态，而是采用统一主状态。

### 6.1 主状态 `status`

- `open`：已创建，待分派/待处理
- `scheduled`：已约时间，等待到点执行
- `waiting_customer`：等待客户去营业厅/App/补资料
- `waiting_internal`：等待内部坐席/二线/审核处理
- `in_progress`：处理中
- `waiting_verification`：动作已完成，等待确认结果
- `resolved`：处理完成，目标达成
- `closed`：关闭归档
- `cancelled`：取消，不再继续
- `expired`：超期未完成

### 6.2 为什么要有 `waiting_customer`

这是本次设计里最关键的状态之一。

因为“用户去营业厅”“用户去 App 自助”“用户稍后再处理”并不是结束，而是：

- 当前渠道无法继续
- 但业务流程还未真正闭环

这类场景必须被正式建模，否则 SOP 只能停在“口头交代”。

---

## 7. 三类典型场景

### 7.1 预约外呼 / 回访

当前系统已有 `callback_tasks`，但它只覆盖一个窄点。

建议升级方式：

- `create_callback_task` 继续保留，作为兼容入口
- 底层不再直接写 `callback_tasks`
- 而是改为创建 `work_orders(action_type=callback)`
- 原 `callback_tasks` 可作为兼容视图或逐步迁移

标准流程：

1. 当前会话判断需要后续联系
2. 创建 `callback` 工单
3. 状态置为 `scheduled`
4. 到时间后进入外呼执行
5. 外呼结果回写到工单时间线
6. 必要时创建子工单或关闭

### 7.2 用户去营业厅 / App 自助

这是最适合工单化、但当前最缺失的场景。

例如：

- 主套餐退订需营业厅办理
- App 登录问题需用户先自助重置密码
- 套餐变更需客户到 App 自助完成

标准流程：

1. SOP 命中“外部动作节点”
2. 创建 `store_visit` 或 `app_self_service` 工单
3. 工单保存：
   - 原因
   - 用户需完成的动作
   - 引导内容快照
   - 建议完成时限
   - 后续验证方式
4. 状态置为 `waiting_customer`
5. 到期前提醒 / 到期后回访 / 用户再次来话时自动识别并关联
6. 客户确认完成后关闭，必要时恢复原 SOP

### 7.3 重要执行类动作

例如：

- 停机保号
- 人工改密/解锁
- 争议复核
- 风险审核

建议统一建成“执行工单”。

区别在于：

- 若动作已即时成功，可直接进入 `waiting_verification` 或 `resolved`
- 若需要后台处理，则进入 `waiting_internal`

这可以把“执行成功日志”和“后续核验闭环”统一起来。

---

## 8. 与客服工作台的配合方式

建议采用“独立页面 + 工作台卡片 + 快捷动作”的组合。

### 8.1 工作台新增卡片

建议新增两张卡片：

1. **工单摘要卡**
   - 当前客户未结工单数
   - 当前主工单标题
   - 状态
   - 下次跟进时间
   - 责任队列/责任人

2. **工单时间线卡**
   - 最近事件
   - 最近一次联系结果
   - 最近一次执行结果
   - 快捷补录

其中摘要卡默认展开，时间线卡可折叠。

### 8.2 工作台快捷动作

在会话区增加快捷入口：

- 新建工单
- 预约回访
- 标记待营业厅处理
- 标记待 App 自助
- 记录执行完成
- 关闭工单
- 恢复 SOP

### 8.3 当前客户自动注入工单上下文

现在工作台已经会基于手机号自动注入：

- 用户详情
- 外呼任务详情

同样可以自动注入：

- 当前手机号关联的未结工单
- 当前 session 关联工单
- 当前最高优先级工单

### 8.4 独立“工单中心”页面

建议在 `AgentWorkstationPage` 顶部一级页签里增加 `工单`：

- `chat`
- `ticket`
- `editor`

这样既保持独立模块，又不会脱离工作台整体体验。

---

## 9. 与现有 SOP / Runtime 的接入方式

这是本方案最关键的一部分。

### 9.1 当前限制

在现有 `skill-runtime.ts` 中，`human` 步骤当前是：

- 记录事件
- 直接把实例标为 `escalated`
- 结束本次技能实例

这对“转人工”够用，但对“待客户到营业厅 / 待 App 自助 / 待后续回访”是不够的。

### 9.2 建议新增实例状态

在 `skill_instances` 增加以下状态：

- `waiting_work_order`
- `waiting_customer_action`
- `waiting_callback`

并增加字段：

- `linked_work_order_id`
- `resume_step_id`

### 9.3 建议新增工单类工具

建议提供统一工具集：

- `create_work_order`
- `update_work_order`
- `list_work_orders`
- `append_work_order_event`
- `resolve_work_order`

然后把 `create_callback_task` 变为 `create_work_order(template=callback)` 的兼容封装。

### 9.4 建议新增模板映射

不要一开始就要求所有 `SKILL.md` 全量改写。

更现实的做法是先引入“技能步骤 -> 工单模板”的映射表：

- `telecom-app / app-tc3-escalate-frontline` -> `frontline_app_issue`
- `service-cancel / guide-store-visit` -> `store_visit`
- `outbound-collection / col-callback-fork` -> `callback`

后续再考虑在 Mermaid 注解中增加工单元数据。

### 9.5 恢复策略

工单关闭时支持三种策略：

1. `none`
   - 纯留痕，不恢复原流程

2. `manual_resume`
   - 坐席点击“恢复 SOP”

3. `auto_resume`
   - 某些确定场景自动恢复到指定步骤

---

## 10. 推荐的后端分层

### 10.1 数据层

新增 platform schema：

- `work_orders`
- `work_order_events`
- `work_order_relations`
- `work_order_templates`

### 10.2 API 层

建议新增：

```txt
GET    /api/work-orders
POST   /api/work-orders
GET    /api/work-orders/:id
POST   /api/work-orders/:id/events
POST   /api/work-orders/:id/assign
POST   /api/work-orders/:id/schedule
POST   /api/work-orders/:id/resolve
POST   /api/work-orders/:id/reopen
GET    /api/work-orders/by-phone/:phone
GET    /api/work-orders/by-session/:sessionId
```

### 10.3 工作台实时事件

沿用当前 `agent-ws` 事件思路，增加：

- `work_order_summary`
- `work_order_updated`
- `work_order_timeline`

这样工单卡片可以和现有卡片体系保持一致。

---

## 11. 分阶段落地建议

### Phase 1：先把“回访任务”升级成通用工单底座

目标：

- 落 schema
- 落基础 API
- 工作台接入工单摘要卡
- `create_callback_task` 改为兼容封装

收益：

- 外呼回访立刻接到工单体系
- 风险最低
- 最容易验证价值

### Phase 2：把“待客户处理”场景接进来

优先接入：

- 营业厅办理
- App 自助处理
- 客户补资料

收益：

- 把大量“口头交代后失联”的流程真正闭环

### Phase 3：把执行类动作与 runtime 恢复接进来

接入：

- 停机保号
- 改密/解锁
- 争议复核
- 安全审核
- skill instance pause/resume

收益：

- 工单真正成为 SOP 编排的一部分

---

## 12. 本方案相对当前系统的关键增量

### 12.1 不是替换外呼任务，而是向上抽象

- `outbound_task` 仍然是任务来源
- `work_order` 是后续闭环载体

### 12.2 不是替换转人工摘要，而是让摘要落到真实工单

当前 `handoff_card` 更像“工单摘要草稿”。

下一步应当是：

- 先生成摘要
- 再真正落一张工单
- 卡片展示真实工单号和状态

### 12.3 不是让所有会话都建工单

只有满足以下条件才建议创建：

- 当前轮处理不完
- 需要后续跟进
- 需要跨角色处理
- 需要重要执行留痕
- 需要 SLA 或提醒

---

## 13. 最终建议

### 建议的产品形态

一句话总结：

> **工单中心做“独立模块”，工作台做“上下文投影”，SOP Runtime 做“创建与恢复入口”。**

### 建议的第一批落地点

优先顺序建议如下：

1. `callback` 统一收口到工单
2. `store_visit / app_self_service` 建模
3. 工作台工单摘要卡
4. skill instance 与工单绑定
5. 执行类工单接入

### 为什么这样最合适

因为它既满足你说的“工单要独立”，又不会让坐席跳出当前客服工作台才能处理；同时也能把现在大量已经写在 SOP 里的“后续跟进语义”正式沉淀成系统能力，而不是继续停留在话术层。

