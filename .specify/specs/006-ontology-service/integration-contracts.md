# 专题：跨服务集成契约、主键映射与最小字段集

**功能分支**: `006-ontology-service` | **日期**: 2026-04-04 | **规格说明**: [spec.md](spec.md)

---

## 1. 总原则

> Ontology 依赖的是语义集成契约，不直接依赖源表细节。

---

## 2. 主键策略

采用两层 ID：

- `source-native id`
- `ontology canonical id`

每个对象实例必须保留 `source_refs_json`。

---

## 3. owner source

每个关键属性和关系都必须声明：

- `owner_source`
- `fallback_sources[]`
- `conflict_policy`

---

## 4. 最小上游契约

V1 先固定六个：

1. `IncidentEventContract`
2. `QueueRuntimeContract`
3. `AgentPresenceContract`
4. `AgentSkillContract`
5. `CustomerContextContract`
6. `TicketSummaryContract`

---

## 5. 事件与快照分离

### 5.1 事件契约

回答：

- 刚刚发生了什么

### 5.2 快照契约

回答：

- 现在是什么状态

两者必须分离。

---

## 6. 缺字段降级策略

- 缺主键：拒绝入图
- 缺执行关键字段：允许分析降级，禁止执行
- 缺增强字段：仅降低解释质量

---

## 7. 最小下游写契约

V1 先支持：

- `UpdateQueuePriorityCommand`
- `ActivateCrossSkillSupportCommand`
- `PublishEmergencyKnowledgeCommand`
- `CreateBatchAttributionCommand`

---

## 8. 决策清单

1. Ontology 依赖语义契约，不依赖源表细节
2. 所有对象采用双层 ID
3. 关键属性与关系必须声明 owner source
4. 事件契约和快照契约分离
5. V1 先收敛到六个最小上游契约
6. V1 先收敛到四个最小下游写契约
7. 缺字段按三档策略降级
8. 所有输入都带时间与版本元数据
