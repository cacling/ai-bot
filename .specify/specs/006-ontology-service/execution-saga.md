# 专题：ActionDraft 执行状态机、补偿与 Saga 策略

**功能分支**: `006-ontology-service` | **日期**: 2026-04-04 | **规格说明**: [spec.md](spec.md)

---

## 1. 总原则

> `ActionDraft` 是 Ontology Service 与下游系统之间的唯一合法执行边界。

所有执行都必须经过：

`PlanOption -> ActionDraft -> Validate -> Approve -> Execute`

---

## 2. 执行模式

V1 采用：

> **orchestrated saga**

不采用跨系统分布式事务。

---

## 3. 对象层次

- `ActionDraft`
- `ActionStep`
- `ExecutionRun`
- `CompensationRun`

---

## 4. 状态机

### 4.1 `ActionDraft`

```text
draft -> validating -> validated -> awaiting_approval -> approved -> executing
-> partially_succeeded -> succeeded
-> failed -> compensating -> compensated
-> compensation_failed -> manual_intervention_required -> closed
```

### 4.2 `ActionStep`

```text
pending -> ready -> dispatching -> dispatched -> acknowledged -> succeeded
pending -> failed -> retrying
failed -> compensating -> compensated
failed -> manual_intervention_required
```

---

## 5. 补偿模式

每个 step 必须声明：

- `reversible`
- `compensatable`
- `irreversible`

---

## 6. 执行约束

- 每个 step 必须有 `idempotency_key`
- 每个 step 必须声明 `retry_policy`
- 每个 step 必须声明 `timeout_ms`
- 每个 step 必须支持 `pre_dispatch_check`
- 部分成功必须进入显式状态
- 人工接管必须是显式业务状态

---

## 7. 决策清单

1. `ActionDraft` 是唯一合法执行边界
2. 执行采用 orchestrated saga
3. `ActionDraft` 与 `ActionStep` 各自维护状态机
4. 补偿模式分三类
5. 执行前必须做最后一跳重验证
6. 幂等、重试、超时都是 step 级能力
7. `manual_intervention_required` 是显式状态
8. 所有执行、补偿、回滚都必须可审计
