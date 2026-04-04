# 实现细化：Ontology Service 服务边界与模块划分

**功能分支**: `006-ontology-service` | **日期**: 2026-04-04 | **规格说明**: [spec.md](spec.md)

> 本文档归纳最近多轮讨论，重点回答三个问题：  
> 1. `ontology_service` 在现有系统中的边界是什么  
> 2. 它与 `CDP / Interaction Platform / WFM / Work Order` 如何衔接  
> 3. 它在当前仓库现实下应如何落地实现

---

## 1. 服务定位

`ontology_service` 应被定义为：

> **企业运行时语义内核**
> = **统一对象模型** + **规则与约束层** + **事件与状态投影层** + **函数与推演层** + **受控执行编排层**

它不替代上游业务系统，也不把 LLM 变成直接操控生产的管理员。  
它的职责是把跨系统业务事实提升为统一语义，并在治理约束下把“洞察”转化为“动作草案”和“受控写回”。

---

## 2. 与现有系统的边界

### 2.1 必须负责

- 管理业务本体语义：对象、关系、状态、事件、规则、函数、动作模板
- 从多个微服务同步数据并构建统一语义投影
- 输出影响分析、多方案规划、解释链路和动作草案
- 负责模型版本、规则版本、动作模板版本、审计和回放

### 2.2 明确不负责

- 不接管 `CDP` 的客户主数据与客户事实真值
- 不接管 `Interaction Platform` 的 `conversation / interaction / routing / assignment` 真值
- 不接管 `WFM` 的排班和合同真值
- 不接管 `Work Order` 的流程真值
- 不允许 AI 绕过治理层直接改下游生产系统

### 2.3 与现有服务关系

| 服务 | 角色 | 与 Ontology 的关系 |
|---|---|---|
| `cdp_service` | 客户语义层与客户事实底座 | 提供 `Customer / Party / Identity / Risk / Preference` 语义来源 |
| `interaction_platform` | 实时互动与路由中枢 | 提供 `Queue / Interaction / Presence / Event` 运行态来源 |
| `wfm_service` | 排班、技能、覆盖和规则中心 | 提供 `Skill / Shift / Staffing / Certification` 来源 |
| `work_order_service` | 长生命周期后续处理 | 提供 `Ticket / Workflow / Escalation` 来源 |
| `backend` | 总入口与代理层 | 继续像 `cdp-proxy` / `wfm-proxy` 一样代理 `ontology_service` |

---

## 3. 当前仓库下的落地方式

结合现有代码结构，`ontology_service` 最适合沿用现有独立服务模式：

- `Hono` 提供 REST API
- `shared-db` 提供共享 schema
- `backend` 通过反向代理统一入口
- V1 仍采用 `bun + drizzle + sqlite` 的开发方式

这一路径与现有模块风格一致：

- [cdp_service/src/server.ts](../../../cdp_service/src/server.ts)
- [interaction_platform/src/server.ts](../../../interaction_platform/src/server.ts)
- [wfm_service/src/server.ts](../../../wfm_service/src/server.ts)
- [backend/src/index.ts](../../../backend/src/index.ts)

因此，`ontology_service` 不应隐藏在 `backend` 内部，也不应一开始拆成多微服务。  
V1 建议采用：

> **独立服务 + 内部模块化单体**

---

## 4. 推荐模块划分

### 4.1 对外服务层

- `server.ts`
  - 启动服务、CORS、健康检查
- `routes/`
  - 暴露模型管理、事件接入、图谱查询、规划、执行、审计等接口

### 4.2 核心语义层

- `model-registry`
  - 管理 `M1-M7 + Event` 模型、版本、发布和激活
- `projection-engine`
  - 同步外部数据，构建 `TBox / ABox` 所需投影
- `ontology-runtime`
  - 管理实例、关系、状态、事件、派生事实

### 4.3 决策与执行层

- `rule-engine`
  - 负责规则评估、冲突检查、解释输出
- `function-engine`
  - 负责预测、评分、仿真、指标计算
- `planner`
  - 负责方案生成、排序和解释
- `execution-gateway`
  - 负责 `ActionDraft -> Validate -> Approve -> Execute`

### 4.4 外部集成层

- `ingest-connectors`
  - 负责接收事件和快照同步
- `adapter-hub`
  - 负责向 `CTI / WFM / KM / CRM / CASE` 受控写回
- `governance-center`
  - 负责审计、血缘、重放、权限、回滚

---

## 5. 建议目录结构

```text
ontology_service/
  package.json
  src/
    server.ts
    db.ts
    routes/
      index.ts
      ingest.ts
      model.ts
      objects.ts
      relations.ts
      analysis.ts
      plans.ts
      actions.ts
      audit.ts
    services/
      model-registry.ts
      projection-engine.ts
      ontology-runtime.ts
      rule-engine.ts
      function-engine.ts
      planner.ts
      execution-gateway.ts
      explain.ts
      replay.ts
      adapters/
        cti-adapter.ts
        wfm-adapter.ts
        km-adapter.ts
        crm-adapter.ts
        work-order-adapter.ts
    jobs/
      sync-cdp.ts
      sync-interaction.ts
      sync-wfm.ts
      sync-workorder.ts
```

---

## 6. 数据进入方式

结合当前系统现实，V1 推荐两级接入：

### 6.1 一级：显式事件接入

通过 `POST /api/ontology/ingest/events` 接收：

- Billing / 故障平台 的异常事件
- Interaction Platform 的队列状态和流量事件
- WFM 的人员与技能变更事件
- Work Order 的升级与投诉事件

### 6.2 二级：定时快照补全

对尚未完全事件化的服务，按时间窗口拉快照：

- `cdp_service`
- `interaction_platform`
- `wfm_service`
- `work_order_service`

V1 原则：

> **事件优先，快照补全**

---

## 7. 下游写回方式

写回必须通过受控适配器完成，不应直接跨库直写。

### 7.1 推荐方式

- 优先调用下游服务 API
- 每一步动作必须有 `rollback_template`
- 每一次写回都记录到 `execution_run` 和 `audit_record`

### 7.2 禁止方式

- LLM 直接发写命令
- Planner 直接改下游数据库
- 跳过审批或校验链路的“快捷执行”

---

## 8. 客服中心运营应急的实现闭环

针对“10:15 网络故障 / 账单异常导致排队激增”的场景，V1 实现链路应固定为：

1. 接入事件与运行态数据
2. 构建 `Event -> Queue -> Skill -> Agent -> Customer -> Ticket` 影响图
3. 规则引擎过滤非法动作空间
4. 函数引擎计算 `SLA / AHT / Abandon / Complaint / Cost`
5. Planner 输出 `Plan A / B`
6. Execution Gateway 生成 `ActionDraft`
7. 校验与审批通过后写回
8. 结果事件再次回流，形成闭环

---

## 9. V1 实现决策清单

1. `ontology_service` 采用独立服务模式，而不是塞进 `backend`
2. 代码风格复用现有 `cdp_service / interaction_platform / wfm_service`
3. 同步策略采用“事件优先 + 快照补全”
4. V1 不引入纯 RDF / triple store 作为唯一运行时内核
5. LLM 只负责解释和草案，不直接主导执行
6. 下游写回必须经过 `ActionDraft -> Validate -> Approve -> Execute`
