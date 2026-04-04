# 架构决策清单：Ontology Service 关键架构收敛

**功能分支**: `006-ontology-service` | **日期**: 2026-04-04 | **规格说明**: [spec.md](spec.md)

> 本文档汇总最近九个架构专题的收敛结论，并作为后续实现与继续讨论的总索引。

> **专题文档导航**：
> - 投影一致性、freshness gate 与冲突调和见 [freshness-and-reconciliation.md](freshness-and-reconciliation.md)
> - 规则引擎、函数引擎与 OWL 执行边界见 [rule-function-runtime.md](rule-function-runtime.md)
> - `ActionDraft` 状态机、补偿与 Saga 策略见 [execution-saga.md](execution-saga.md)
> - 跨服务集成契约、主键映射与最小字段集见 [integration-contracts.md](integration-contracts.md)
> - 模型版本迁移、运行时钉住与回放策略见 [versioning-and-replay.md](versioning-and-replay.md)
> - 图投影、查询 API 与大图性能策略见 [graph-serving.md](graph-serving.md)
> - 租户、安全、审批与脱敏模型见 [security-and-tenancy.md](security-and-tenancy.md)
> - namespace、bounded context 与 import 策略见 [contexts-and-namespaces.md](contexts-and-namespaces.md)
> - 非功能指标与验收阈值见 [nfr-and-slos.md](nfr-and-slos.md)
> - AI 运营智能助理应用层设计见 [ai-ops-assistant.md](ai-ops-assistant.md)
> - AI 运营智能助理 UI 元数据与协议 schema 见 [ai-ops-ui-model.md](ai-ops-ui-model.md) 与 [ai-ops-protocol.md](ai-ops-protocol.md)
> - AI 运营智能助理应用层 API、共享类型与核心工作台低保真见 [ai-ops-api-types.md](ai-ops-api-types.md) 与 [ai-ops-lowfi.md](ai-ops-lowfi.md)

---

## 1. 当前已收敛的 9 组架构决策

1. 投影一致性采用 `event-first + snapshot-reconciled + bounded-staleness` 模型，并把 freshness gate 显式化。
2. YAML / Registry 是设计与执行桥梁，OWL 是标准发布件和浏览件，不承担在线业务规则主执行。
3. `ActionDraft` 是唯一合法执行边界，执行采用 orchestrated saga。
4. Ontology 依赖的是语义集成契约，不直接依赖源表细节。
5. `plan_session / action_draft / execution_run` 必须强钉住模型、规则、函数与动作模板版本。
6. 图层是 traversal / explanation projection，不是唯一真值，V1 用关系库图投影即可。
7. 系统采用最小授权、多维权限控制和服务端脱敏模型，AI 只具备建议权。
8. 本体按 bounded context 模块化管理，通过显式 namespace 和 integration context 连接。
9. 非功能指标以 freshness、规划、图谱、执行、安全、治理和客服应急专项验收为主线。

---

## 2. 仍需在后续实现阶段进一步落地的重点

### 2.1 先落地

- `shared-db/schema/ontology.ts` 的表结构草案
- `ontology_service` 的服务骨架与模块目录
- 最小上游 6 个集成契约
- 客服应急场景的 `ActionDraft` step 编排模板

### 2.2 再落地

- 图谱页与模型工作台 UI 原型
- AI 运营智能助理工作台与交互协议
- AI 运营智能助理应用层 API 与前端类型
- YAML 到 OWL 的转换脚本与校验器
- 规划与执行回放机制

---

## 3. 建议的实现先后顺序

1. 模型资产层与版本治理
2. 投影运行时与 freshness / reconciliation
3. 规则与函数运行时
4. Planner 与 `ActionDraft`
5. Execution Gateway 与 Saga
6. 图投影与图谱页
7. 安全、审批、脱敏与审计强化

---

## 4. 后续文档使用方式

- 需要看总原则时，优先阅读本文件
- 需要收敛某一专题时，跳到对应专题文档
- 需要修改 `spec / plan` 时，以本文件中的决策为准，不再回退到对话口述版本
