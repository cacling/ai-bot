# 专题：非功能指标与验收阈值

**功能分支**: `006-ontology-service` | **日期**: 2026-04-04 | **规格说明**: [spec.md](spec.md)

---

## 1. 目标

为 `ontology_service` 定义工程上的合格边界，覆盖：

- freshness
- 规划
- 图谱
- 执行
- 治理
- 安全
- 可用性
- 客服应急专项验收

---

## 2. freshness 与投影

建议目标：

- `queue_runtime` healthy `<= 15s`
- `agent_presence` healthy `<= 15s`
- `skill_certification` healthy `<= 2min`
- `vip/risk_tags` healthy `<= 5min`
- `ticket_summary` healthy `<= 5min`

投影延迟：

- P95 `event_ingested -> projection_applied <= 5s`
- P99 `<= 15s`

---

## 3. 规划与解释

- impact analysis P95 `<= 1s`
- plan generation P95 `<= 3s`
- 结构化 explain P95 `<= 500ms`
- forecast function P95 `<= 1.5s`

---

## 4. 图谱

- 初始场景图 P95 `<= 1.5s`
- 邻居展开 P95 `<= 500ms`
- 最短路径 P95 `<= 1s`
- 初始返回规模 `<= 80 nodes / 120 edges`

---

## 5. 执行

- draft validate P95 `<= 1s`
- 配置型动作执行确认 P95 `<= 10s`
- full success rate `>= 95%`
- compensation failed `<= 0.5%`

---

## 6. 治理与安全

- 审计覆盖率 `100%`
- 脱敏错误容忍度 `0`
- 权限判断 P95 `<= 100ms`
- planning / execution replay 在 `3s` 内可加载

---

## 7. 客服应急专项验收

- 事件进入后 `<= 5s` 生成影响对象集合
- `<= 3s` 返回两套以上可比较方案
- 选择方案后 `<= 2s` 生成 `ActionDraft`
- 校验通过后 `<= 10s` 完成大部分配置型写回确认

---

## 8. 决策清单

1. 非功能指标分八类定义
2. freshness gate 必须量化
3. 图谱必须有规模上限
4. 执行链路必须有时延和成功率目标
5. 审计覆盖率必须 `100%`
6. 脱敏泄露容忍度必须为 `0`
7. 模型发布、激活、回放都必须量化
8. V1 最终专项验收以客服应急闭环达成为准
