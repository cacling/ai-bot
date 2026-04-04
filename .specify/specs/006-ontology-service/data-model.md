# 数据模型：Ontology Service 核心数据模型

**功能分支**: `006-ontology-service` | **日期**: 2026-04-04 | **规格说明**: [spec.md](spec.md)

> 本文档归纳 `ontology_service` 的核心数据模型，重点覆盖：  
> `TBox / ABox` 分层、规划与执行层、客服中心应急场景的核心对象与关系。

---

## 1. 建模原则

### 1.1 TBox 与 ABox 分层

参考资料明确强调本体建模应分为两层：

- `TBox`：抽象层，负责对象类型、关系类型、公理与形式化语义
- `ABox`：实例层，负责对象实例化与事实断言

这意味着在 `ontology_service` 中：

- 模型定义与运行时实例不能混表
- 运行态实例不能反向污染抽象模型
- 版本管理应优先围绕 `TBox`

### 1.2 静态与动态融合

本体建模不止是对象关系，还必须覆盖：

- 对象
- 行为
- 规则
- 事件
- 场景
- 质量约束
- 补偿与回滚

---

## 2. 数据层次

建议把 `ontology_service` 的数据模型拆成三层。

### 2.1 模型层 `TBox`

用于承载抽象模型与版本。

核心表建议：

- `onto_model_bundles`
- `onto_model_versions`
- `onto_object_types`
- `onto_relation_types`
- `onto_attribute_defs`
- `onto_state_machine_defs`
- `onto_rule_defs`
- `onto_function_defs`
- `onto_action_templates`
- `onto_scenario_defs`

### 2.2 运行时层 `ABox`

用于承载实例、关系、事件与派生事实。

核心表建议：

- `onto_object_instances`
- `onto_relation_instances`
- `onto_domain_events`
- `onto_derived_facts`
- `onto_event_impacts`
- `onto_projection_checkpoints`

### 2.3 规划与执行层

用于承载规划会话、方案、动作草案和执行痕迹。

核心表建议：

- `onto_plan_sessions`
- `onto_plan_options`
- `onto_plan_metrics`
- `onto_action_drafts`
- `onto_action_steps`
- `onto_execution_checks`
- `onto_execution_runs`
- `onto_audit_records`

---

## 3. 核心实体

### 3.1 抽象模型实体

| 实体 | 作用 |
|---|---|
| `OntologyObjectType` | 定义对象类型，如 `Event / Queue / Agent` |
| `OntologyRelationType` | 定义对象间关系类型 |
| `OntologyAttributeDef` | 定义属性结构、类型、来源和约束 |
| `OntologyRuleDef` | 定义规则的作用域、级别、条件与解释 |
| `OntologyFunctionDef` | 定义函数的输入输出与执行方式 |
| `OntologyActionTemplate` | 定义动作模板、目标系统、参数约束与回滚模板 |
| `OntologyScenarioDef` | 定义场景模板及其依赖关系 |

### 3.2 运行时实体

| 实体 | 作用 |
|---|---|
| `OntologyObjectInstance` | 某个对象类型在运行时的实例 |
| `OntologyRelationInstance` | 实例间关系边 |
| `DomainEvent` | 运行时领域事件 |
| `DerivedFact` | 派生结果，如预测值、风险评分 |
| `EventImpact` | 事件对对象或资源的影响集合 |

### 3.3 规划与执行实体

| 实体 | 作用 |
|---|---|
| `PlanSession` | 一次分析与规划请求的上下文 |
| `PlanOption` | 具体方案，如 `方案 A / B` |
| `PlanMetric` | 方案的量化预测指标 |
| `ActionDraft` | 动作草案集合 |
| `ActionStep` | 动作草案中的单步动作 |
| `ExecutionCheck` | 权限、规则、灰度、审批、回滚检查 |
| `ExecutionRun` | 实际执行过程和结果 |
| `AuditRecord` | 审计链路记录 |

---

## 4. 客服中心运营应急场景的核心业务对象

V1 应先固定以下业务对象：

1. `Event`
2. `Channel`
3. `Queue`
4. `Skill`
5. `Agent`
6. `Shift`
7. `Customer`
8. `Ticket`
9. `KnowledgeItem`
10. `Policy`
11. `PlanOption`
12. `ActionDraft`

---

## 5. 核心关系类型

V1 建议采用显式 typed edge，而不是一开始就追求任意图。

| 关系类型 | 含义 |
|---|---|
| `Event affects Channel` | 事件影响某渠道 |
| `Event affects Queue` | 事件影响某队列 |
| `Queue requires Skill` | 队列需要某技能 |
| `Agent has Skill` | 座席具备某技能 |
| `Agent belongsTo Shift` | 座席属于某班次 |
| `Agent eligibleFor Queue` | 座席可支援某队列 |
| `Customer linkedTo Ticket` | 客户与工单关联 |
| `Ticket attributedTo Event` | 工单归因到某事件 |
| `Scenario uses Rule` | 场景使用某规则 |
| `Rule constrains Behavior` | 规则约束某行为 |
| `PlanOption proposes ActionDraft` | 方案产出动作草案 |

---

## 6. 推荐字段骨架

### 6.1 `onto_object_instances`

建议字段：

- `id`
- `tenant_id`
- `object_type_code`
- `business_key`
- `display_name`
- `source_refs_json`
- `snapshot_json`
- `current_state`
- `confidence_score`
- `observed_at`
- `created_at`
- `updated_at`

### 6.2 `onto_relation_instances`

建议字段：

- `id`
- `tenant_id`
- `relation_type_code`
- `from_object_id`
- `to_object_id`
- `attrs_json`
- `confidence_score`
- `valid_from`
- `valid_to`

### 6.3 `onto_domain_events`

建议字段：

- `id`
- `tenant_id`
- `source_system`
- `event_type`
- `correlation_id`
- `payload_json`
- `occurred_at`
- `ingested_at`

### 6.4 `onto_action_steps`

建议字段：

- `id`
- `draft_id`
- `target_system`
- `action_type`
- `target_ref`
- `params_json`
- `rollback_template_json`
- `status`

---

## 7. 与现有系统实体的映射

| Ontology 对象 | 上游主要来源 |
|---|---|
| `Customer` | `cdp_service` |
| `Queue` | `interaction_platform` |
| `Agent` | `interaction_platform` + `wfm_service` |
| `Skill` | `wfm_service` |
| `Shift` | `wfm_service` |
| `Ticket` | `work_order_service` |
| `Event` | Billing / 故障平台 / Interaction 事件流 |

---

## 8. 数据模型决策清单

1. `TBox` 与 `ABox` 物理分层
2. 抽象模型、运行时实例、规划执行三层分离
3. V1 只用显式 typed edge，不做任意图自由建模
4. 先固定客服应急场景对象集，避免第一阶段模型失控
5. 所有执行动作都必须能回溯到 `PlanOption`、`RuleDef` 与 `FunctionDef`
