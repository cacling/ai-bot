# 专题：投影一致性、数据新鲜度与冲突调和

**功能分支**: `006-ontology-service` | **日期**: 2026-04-04 | **规格说明**: [spec.md](spec.md)

---

## 1. 目标

定义 `ontology_service` 的运行时一致性模型，明确：

- 投影不是强一致事务系统
- 哪些数据必须足够新
- 哪些数据偏旧时只能分析、不能执行
- 多源冲突如何调和

---

## 2. 一致性模型

V1 采用：

> **event-first + snapshot-reconciled + bounded-staleness semantic projection**

含义：

- 高价值、高实时数据优先走事件
- 未完全事件化数据由快照补全
- 所有规划和执行都受 freshness gate 约束

---

## 3. freshness class

### Class A：实时控制数据

例如：

- queue depth
- arrival rate
- agent presence
- active capacity
- current route status

建议阈值：

- `plan_gate <= 30s`
- `execute_gate <= 15s`

### Class B：近实时约束数据

例如：

- skill certification
- shift assignment
- VIP level
- risk tags
- open ticket summary

建议阈值：

- `plan_gate <= 5min`
- `execute_gate <= 2min`

### Class C：上下文增强数据

例如：

- 历史投诉趋势
- 长周期画像
- 知识命中趋势

建议：

- 仅影响解释质量，不作为硬阻断前提

---

## 4. 必需元数据

建议作为运行时一等公民持久化：

- `source_watermark`
- `object_projection_meta`
- `plan_input_freshness`

至少需要记录：

- source
- dataset
- observed_at
- projected_at
- lag_seconds
- gate_result
- reconciliation_state

---

## 5. 冲突调和

### 5.1 身份冲突

通过 `canonical id + source refs` 解决，不覆盖原始 source id。

### 5.2 属性冲突

每个属性必须定义：

- `owner_source`
- `fallback_sources[]`
- `conflict_policy`

### 5.3 时间冲突

采用：

- `occurred_at + source sequence`
- per-source checkpoint
- 晚到事件按补偿或忽略策略处理

---

## 6. 执行阻断策略

建议在客服应急场景中：

- queue runtime 超过 `15s` 未更新时禁止执行
- agent presence 超过 `15s` 未更新时禁止执行
- skill certification 超过 `2min` 未更新时禁止执行
- 关键 source watermark 为 `degraded / failed` 时禁止执行

---

## 7. 决策清单

1. 不追求跨系统强一致
2. freshness 分 `A/B/C` 三档
3. `plan_gate` 与 `execute_gate` 分离
4. freshness 元数据必须可审计、可展示
5. 冲突调和按身份、属性、时间三类处理
6. freshness 状态必须进入 API 和 UI
