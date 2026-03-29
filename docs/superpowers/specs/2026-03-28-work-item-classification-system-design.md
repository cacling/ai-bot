# Work Item 分类体系设计

> 面向 `Ticket / Work Order / Appointment / Task` 的统一分类体系设计。目标不是增加一个零散的 `category` 字段，而是建立“分类目录 + 派生规则 + 治理约束”的完整能力层。

**Date**: 2026-03-28  
**Status**: Draft  
**Scope**: `work_order_service` / `shared-db` / Agent Workstation / workflow runtime

---

## 1. 设计目标

分类体系要同时解决 6 件事：

1. 让 `type` 和业务语义解耦
2. 让建单、派单、SLA、workflow 不再写死在代码里
3. 让父子关系有明确约束，而不是任意派生
4. 让报表能回答“哪类工单最多、哪类最容易超时、哪类最常升级”
5. 让客服工作台能按业务场景展示更友好的文案和动作
6. 让现有零散的 `subtype`、模板名、技能名逐步收口到统一目录

---

## 2. 核心结论

分类体系建议采用 4 层分离：

- `type`
  - 结构类型
  - 取值：`ticket | work_order | appointment | task`
  - 回答“它是什么对象”

- `category`
  - 业务分类
  - 取值：如 `ticket.incident.app_login`、`work_order.execution.suspend_service`
  - 回答“它属于哪类业务”

- `template`
  - 创建默认值
  - 回答“建出来时默认长什么样”

- `workflow`
  - 流程编排
  - 回答“它创建后怎么推进”

不要继续把业务分类塞进 `subtype`。

建议：

- `subtype` 仅作为兼容字段保留一段时间
- 新逻辑统一读写 `category_code`
- 模板、路由、SLA、队列、workflow 都改为绑定 `category_code`

---

## 3. 边界定义

| 概念 | 作用 | 示例 |
| --- | --- | --- |
| `type` | 结构对象类型 | `work_order` |
| `category_code` | 业务分类标识 | `work_order.branch_visit.real_name_change` |
| `template_code` | 建单默认配置 | `tpl_branch_real_name_change_v1` |
| `workflow_key` | 编排模板 | `branch_visit_followup_v1` |
| `queue_code` | 处理队列 | `branch_service_queue` |
| `sla_policy_code` | 时效规则 | `sla_branch_visit_48h` |
| `relation_type` | 父子关系语义 | `sub_ticket` / `derived_work_order` / `sub_work_order` |

---

## 4. 分类建模原则

### 4.1 稳定优先

分类应该表达稳定的业务语义，而不是一次性动作。

建议：

- 用 `app_login`，不要用 `login_retry_3_times`
- 用 `branch_visit_required`，不要用 `go_to_store_now`
- 用 `manual_unlock`，不要用 `unlock_after_callback_failed`

### 4.2 同一 `type` 内分层

不同 `type` 的分类体系分开管理，不混成一张无层级大表。

例如：

- `ticket.incident.app_login`
- `work_order.self_service.password_reset`
- `appointment.callback.result_check`
- `task.verify.identity_material`

### 4.3 两级到三级足够

建议最多三级：

- 一级：业务大类
- 二级：场景类
- 三级：具体动作或原因

超过三级后，路由和运营维护成本会明显上升。

### 4.4 分类决定默认能力，不直接决定最终状态

分类可以绑定：

- 默认模板
- 默认 workflow
- 默认队列
- 默认 SLA
- 默认优先级
- 必填字段
- 允许的子项规则

但不能绕过业务对象自己的状态机。

---

## 5. 数据模型

## 5.1 主表：`work_item_categories`

```ts
export const workItemCategories = sqliteTable('work_item_categories', {
  code: text('code').primaryKey(),                     // 全局唯一，推荐 namespaced code
  name: text('name').notNull(),                        // 内部名称
  display_name: text('display_name').notNull(),        // 工作台展示名称
  type: text('type').notNull(),                        // 'ticket' | 'work_order' | 'appointment' | 'task'
  level: integer('level').notNull(),                   // 1 | 2 | 3
  parent_code: text('parent_code'),
  status: text('status').notNull(),                    // 'active' | 'inactive' | 'retired'
  description: text('description'),

  domain_code: text('domain_code'),                    // 'app' | 'billing' | 'security' | 'branch' | 'complaint'
  scene_code: text('scene_code'),                      // 'login' | 'callback' | 'suspend' | 'real_name_change'

  default_template_code: text('default_template_code'),
  default_workflow_key: text('default_workflow_key'),
  default_queue_code: text('default_queue_code'),
  default_sla_policy_code: text('default_sla_policy_code'),
  default_priority: text('default_priority'),

  required_fields_schema: text('required_fields_schema'),   // JSON Schema
  customer_visible_name: text('customer_visible_name'),
  customer_visible_status_map: text('customer_visible_status_map'),

  allowed_parent_rules_json: text('allowed_parent_rules_json'),
  allowed_child_rules_json: text('allowed_child_rules_json'),
  close_policy_json: text('close_policy_json'),
  routing_policy_json: text('routing_policy_json'),
  metadata_json: text('metadata_json'),

  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});
```

### 5.2 业务对象挂载

在 `work_items` 上新增：

```ts
category_code: text('category_code').references(() => workItemCategories.code)
```

建议保留：

```ts
subtype: text('subtype')
```

但仅用于兼容旧逻辑，逐步迁移到：

- `work_items.category_code`
- `work_item_templates.category_code`

### 5.3 规则表达

第一版不建议拆太多配置表，直接把规则收在分类上即可。

`allowed_child_rules_json` 示例：

```json
[
  {
    "relation_type": "derived_work_order",
    "child_type": "work_order",
    "child_categories": [
      "work_order.self_service.password_reset",
      "work_order.review.manual_unlock"
    ]
  },
  {
    "relation_type": "task",
    "child_type": "task",
    "child_categories": [
      "task.collect.screenshot"
    ]
  }
]
```

---

## 6. 分类编码规范

建议统一使用：

```txt
{type}.{level1}.{level2}[.{level3}]
```

示例：

- `ticket.inquiry.bill`
- `ticket.request.plan_change`
- `ticket.incident.app_login`
- `ticket.complaint.unknown_charge`
- `work_order.followup.callback`
- `work_order.self_service.password_reset`
- `work_order.branch_visit.real_name_change`
- `work_order.execution.suspend_service`
- `work_order.review.security_review`
- `work_order.exception.branch_followup`
- `appointment.callback.result_check`
- `appointment.branch_visit.service_handle`
- `appointment.video_verify.identity_check`
- `task.notify.branch_materials`
- `task.collect.screenshot`
- `task.verify.identity_material`

编码规则：

- 全小写
- 单词间用下划线
- 不直接写具体组织名
- 不把临时策略写进 code
- code 一旦对外使用，不轻易修改

---

## 7. 分类型分类目录

## 7.1 Ticket 分类

### 一级类目

| 一级分类 | code 前缀 | 说明 |
| --- | --- | --- |
| 咨询 | `ticket.inquiry.*` | 以信息咨询、规则解释为主 |
| 请求 | `ticket.request.*` | 以办理、变更、执行诉求为主 |
| 事件/故障 | `ticket.incident.*` | 以异常、不可用、失败为主 |
| 投诉/争议 | `ticket.complaint.*` | 以异议、申诉、不满意为主 |

### 二级示例

| code | 名称 | 典型后续 |
| --- | --- | --- |
| `ticket.inquiry.bill` | 账单咨询 | 可能无后续执行 |
| `ticket.inquiry.plan` | 套餐咨询 | 可能引导自助办理 |
| `ticket.request.service_change` | 业务变更请求 | 常派生 `work_order` |
| `ticket.request.branch_handle` | 需营业厅办理请求 | 常派生营业厅类 `work_order` |
| `ticket.incident.app_login` | App 登录异常 | 常派生自助修复或人工解锁 |
| `ticket.incident.service_suspend` | 停机/停复机异常 | 常派生执行类 `work_order` |
| `ticket.complaint.unknown_charge` | 未知扣费投诉 | 常拆 `sub-ticket` 并行核查 |
| `ticket.complaint.charge_investigation` | 扣费核查子诉求 | 常作为 `sub-ticket` 承接并行核查 |
| `ticket.complaint.branch_service` | 营业厅服务投诉 | 常拆 `sub-ticket` 给门店核查 |

## 7.2 Work Order 分类

### 一级类目

| 一级分类 | code 前缀 | 说明 |
| --- | --- | --- |
| 跟进 | `work_order.followup.*` | 需要回访、提醒、核销 |
| 自助引导 | `work_order.self_service.*` | 客户在 App 或线上自主处理 |
| 营业厅办理 | `work_order.branch_visit.*` | 客户必须到营业厅处理 |
| 执行 | `work_order.execution.*` | 系统或人工执行具体动作 |
| 复核/审核 | `work_order.review.*` | 高风险操作前置审核 |
| 异常跟进 | `work_order.exception.*` | 失败、拒绝、异常后的补救 |

### 二级示例

| code | 名称 | 典型父项 |
| --- | --- | --- |
| `work_order.followup.callback` | 回访跟进工单 | `ticket` / `work_order` |
| `work_order.self_service.password_reset` | App 自助重置密码 | `ticket.incident.app_login` |
| `work_order.branch_visit.real_name_change` | 实名变更到厅办理 | `ticket.request.branch_handle` |
| `work_order.execution.suspend_service` | 停机执行 | `ticket.request.service_change` |
| `work_order.execution.resume_service` | 复机执行 | `ticket.request.service_change` |
| `work_order.execution.charge_adjustment` | 调账/补偿执行 | 投诉核查后的执行处理 |
| `work_order.review.security_review` | 安全审核 | 高风险执行工单 |
| `work_order.review.manual_unlock` | 人工解锁 | 登录异常处理链 |
| `work_order.exception.branch_followup` | 营业厅异常跟进 | 营业厅办理失败后 |

## 7.3 Appointment 分类

| code | 名称 | 说明 |
| --- | --- | --- |
| `appointment.callback.result_check` | 结果确认回访 | 自助处理后的回访确认 |
| `appointment.callback.payment_reminder` | 缴费回呼 | 催缴或承诺还款后续联系 |
| `appointment.branch_visit.service_handle` | 到厅办理预约 | 到厅时间承诺 |
| `appointment.video_verify.identity_check` | 视频核身预约 | 高风险身份核验 |
| `appointment.onsite.field_service` | 上门服务预约 | 现场处理 |

## 7.4 Task 分类

| code | 名称 | 说明 |
| --- | --- | --- |
| `task.notify.branch_materials` | 发送到厅材料清单 | 轻量通知 |
| `task.notify.app_guide` | 发送 App 操作指引 | 自助引导 |
| `task.collect.screenshot` | 收集截图 | 资料补充 |
| `task.collect.identity_doc` | 收集身份资料 | 高风险前置 |
| `task.verify.identity_material` | 核验身份资料 | 审核前置 |
| `task.fill.execution_note` | 回填执行备注 | 收尾留痕 |
| `task.review.callback_result` | 复核回访结论 | 轻量人工判断 |

---

## 8. 父子关系与分类约束

分类体系必须和父子规则绑在一起，否则分类只是标签。

### 8.1 允许的关系

| 父分类 | 允许子关系 | 子分类示例 |
| --- | --- | --- |
| `ticket.incident.app_login` | `derived_work_order` | `work_order.self_service.password_reset` |
| `ticket.incident.app_login` | `task` | `task.collect.screenshot` |
| `ticket.complaint.unknown_charge` | `sub_ticket` | `ticket.complaint.charge_investigation` |
| `work_order.self_service.password_reset` | `appointment` | `appointment.callback.result_check` |
| `work_order.self_service.password_reset` | `sub_work_order` | `work_order.review.manual_unlock` |
| `work_order.execution.suspend_service` | `task` | `task.verify.identity_material` |
| `work_order.execution.suspend_service` | `sub_work_order` | `work_order.review.security_review` |
| `work_order.branch_visit.real_name_change` | `appointment` | `appointment.branch_visit.service_handle` |
| `work_order.branch_visit.real_name_change` | `task` | `task.notify.branch_materials` |

### 8.2 不允许的关系

| 关系 | 原因 |
| --- | --- |
| `ticket -> appointment` | 预约应挂在执行工单下，避免跳层 |
| `work_order -> ticket` | 会把执行问题反向变成新诉求，语义混乱 |
| `appointment -> *` | 预约保持叶子对象 |
| `task -> *` | Task 保持轻量动作，不做父单 |

---

## 9. 分类与模板、workflow、SLA 的绑定

分类是配置入口。

创建工单时不需要每次都显式传：

- `template_code`
- `workflow_key`
- `queue_code`
- `sla_policy_code`

而是先根据 `category_code` 自动带出默认值，再允许局部覆盖。

### 9.1 解析顺序

```txt
category_code
-> default_template_code
-> default_workflow_key
-> default_queue_code
-> default_sla_policy_code
-> required_fields_schema
-> allowed_child_rules_json
```

### 9.2 覆盖规则

- 默认走分类绑定
- 业务方可在建单请求里临时覆盖 `queue_code`
- `workflow_key` 只允许覆盖到同类流程，不允许跨大类乱配
- `required_fields_schema` 不能被调用方绕过

---

## 10. 结合具体场景

## 10.1 App 登录异常

### 分类链路

```txt
Ticket:
  category_code = ticket.incident.app_login

Derived Work Order:
  category_code = work_order.self_service.password_reset

Appointment:
  category_code = appointment.callback.result_check

Sub-work_order:
  category_code = work_order.review.manual_unlock

Task:
  category_code = task.collect.screenshot
```

### 自动绑定

- `ticket.incident.app_login`
  - 默认 workflow：`app_login_triage_v1`
- `work_order.self_service.password_reset`
  - 默认 workflow：`app_login_recovery_v1`
  - 默认队列：`self_service_followup_queue`
  - 默认 SLA：`sla_self_service_24h`
- `appointment.callback.result_check`
  - 默认队列：`callback_team`

## 10.2 营业厅办理

### 分类链路

```txt
Ticket:
  category_code = ticket.request.branch_handle

Derived Work Order:
  category_code = work_order.branch_visit.real_name_change

Task:
  category_code = task.notify.branch_materials

Appointment:
  category_code = appointment.branch_visit.service_handle

Sub-work_order:
  category_code = work_order.exception.branch_followup
```

### 自动绑定

- `work_order.branch_visit.real_name_change`
  - 默认 workflow：`branch_visit_followup_v1`
  - 默认队列：`branch_service_queue`
  - 默认 SLA：`sla_branch_visit_48h`
  - 允许子项：
    - `task.notify.branch_materials`
    - `appointment.branch_visit.service_handle`
    - `work_order.exception.branch_followup`

## 10.3 高风险停机/改密

### 分类链路

```txt
Ticket:
  category_code = ticket.request.service_change

Derived Work Order:
  category_code = work_order.execution.suspend_service

Task:
  category_code = task.verify.identity_material

Sub-work_order:
  category_code = work_order.review.security_review
```

### 自动绑定

- `work_order.execution.suspend_service`
  - 默认 workflow：`suspend_service_controlled_execution_v1`
  - 默认队列：`sensitive_ops_queue`
  - 默认 SLA：`sla_sensitive_ops_4h`
  - 必填字段：
    - `verification_mode`
    - `risk_level`
    - `customer_contact`
  - 关闭前置条件：
    - 身份核验完成
    - 审核子工单通过

## 10.4 投诉并行核查

### 分类链路

```txt
Ticket:
  category_code = ticket.complaint.unknown_charge

Sub-ticket:
  category_code = ticket.complaint.charge_investigation

Sub-ticket:
  category_code = ticket.complaint.branch_service

Derived Work Order:
  category_code = work_order.execution.charge_adjustment
```

### 自动绑定

- `ticket.complaint.unknown_charge`
  - 默认 workflow：`charge_complaint_parallel_investigation_v1`
  - 允许：
    - 创建多个 `sub-ticket`
    - 所有 `sub-ticket` 完成后再派生执行工单

---

## 11. API 设计

## 11.1 分类目录查询

### `GET /api/categories`

查询参数：

- `type`
- `parent_code`
- `status`

返回：

- 当前节点分类
- 默认模板、workflow、SLA、队列摘要
- 允许子项规则

### `GET /api/categories/:code`

返回：

- 分类详情
- 绑定的模板、workflow、队列、SLA
- 父子约束

## 11.2 建单时按分类创建

### `POST /api/tickets`

```json
{
  "title": "App 登录异常",
  "category_code": "ticket.incident.app_login",
  "customer_id": "cust_123"
}
```

### `POST /api/work-orders`

```json
{
  "title": "引导客户 App 自助重置密码",
  "category_code": "work_order.self_service.password_reset",
  "parent_id": "tk_001"
}
```

### 服务端行为

1. 校验 `category_code` 是否存在且状态为 `active`
2. 校验 `type` 是否与路由匹配
3. 校验父子关系是否合法
4. 应用分类默认配置
5. 校验必填字段
6. 创建对象
7. 如有默认 workflow，则自动启动

---

## 12. 工作台展示建议

工作台里不要只展示 code，要翻译成“业务分类卡”。

建议展示：

- 分类名称
- 所属大类
- 当前默认处理队列
- 当前 SLA
- 推荐下一步动作

示例：

```txt
业务分类：App 登录异常
工单类型：事件/故障
默认流程：App 登录恢复流程
默认队列：自助修复跟进队列
SLA：24 小时内闭环
```

---

## 13. 治理机制

### 13.1 谁可以新增分类

建议仅允许平台管理员或运营配置角色维护分类。

### 13.2 版本策略

- 分类 `code` 尽量稳定
- 规则变化优先改绑定，不轻易改 code
- 真正语义变化时，新建分类 code，旧分类标记 `retired`

### 13.3 报表维度

至少支持：

- 按 `type`
- 按 `category_code`
- 按一级类目
- 按队列
- 按 workflow
- 按 SLA 是否超时

---

## 14. 落地顺序

### Phase 1

- 在 `work_items` 增加 `category_code`
- 新增 `work_item_categories`
- 在模板上增加 `category_code`
- 建分类目录查询 API

### Phase 2

- 建单接口按 `category_code` 走默认绑定
- 校验父子关系规则
- 让 workflow/template/queue/SLA 从分类出发解析

### Phase 3

- 工作台展示分类信息
- 报表按分类聚合
- 逐步废弃 `subtype`

---

## 15. 最终建议

推荐把分类体系定义为：

> **以 `type` 作为结构骨架，以 `category_code` 作为业务语义主键，以分类绑定模板、workflow、队列、SLA 和父子规则。**

这样一来：

- `Ticket / Work Order / Appointment / Task` 的边界清楚
- `sub-ticket / sub-work_order` 的使用条件清楚
- workflow 有稳定入口
- 队列和 SLA 不再散落在代码里
- 客服工作台能按真实业务场景组织工单，而不是按底层对象结构展示
