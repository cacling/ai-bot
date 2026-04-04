# 应用层专题：AI Interaction Protocol 与消息 Schema

**功能分支**: `006-ontology-service` | **日期**: 2026-04-04 | **规格说明**: [spec.md](spec.md)

> 本文档把 `AI 运营智能助理` 的交互协议继续下沉为接口与消息 schema。  
> 目标是把“AI 会打开页面、调用分析、返回表格/图表/草案卡片”变成明确契约，而不是前端临时拼接。

---

## 1. 协议目标

本协议解决 5 个问题：

1. 用户自然语言如何映射为运营场景
2. AI 如何驱动页面和标签页联动
3. AI 如何调用 `ontology_service`
4. AI 如何返回统一渲染载荷
5. AI 如何在执行相关交互中保持治理边界

---

## 2. 协议总链路

```text
User Message
-> Intent Resolver
-> Scenario Resolver
-> Context Builder
-> UI Action Plan
-> Ontology API Calls
-> Render Payloads
-> Optional Draft Action
```

---

## 3. 核心对象

### 3.1 `AssistantTurn`

```json
{
  "turn_id": "turn_001",
  "tenant_id": "telco-cn",
  "actor_id": "ops_supervisor_01",
  "trace_id": "trace_001",
  "user_message": "账单异常会不会把 SLA 打穿？给我方案",
  "current_context": {
    "event_id": "evt-1015",
    "active_tab": "ops_overview"
  }
}
```

### 3.2 `ResolvedIntent`

```json
{
  "intent": "generate_plan",
  "scenario_code": "contact_center_emergency",
  "confidence": 0.93,
  "required_context": [
    "event_id"
  ],
  "resolved_context": {
    "event_id": "evt-1015"
  }
}
```

### 3.3 `UIActionPlan`

```json
{
  "actions": [
    {
      "type": "OPEN_TAB",
      "tab_code": "emergency_war_room"
    },
    {
      "type": "PIN_CONTEXT",
      "context": {
        "event_id": "evt-1015"
      }
    },
    {
      "type": "RUN_API",
      "api_code": "generate_plan"
    }
  ]
}
```

### 3.4 `AssistantResponse`

```json
{
  "turn_id": "turn_001",
  "messages": [
    {
      "type": "kpi_cards",
      "payload": {}
    },
    {
      "type": "table",
      "payload": {}
    }
  ],
  "ui_actions": [],
  "follow_up_actions": []
}
```

---

## 4. 意图枚举

| 意图 | 说明 | 默认场景 |
|---|---|---|
| `open_workspace` | 打开工作页 | 通用 |
| `show_impact_graph` | 查看影响面与关系图 | 应急调度 / VIP 保护 |
| `generate_plan` | 生成候选方案 | 应急调度 / 技能支援 |
| `compare_options` | 比较多个候选方案 | 应急调度 |
| `explain_plan` | 解释为什么生成此方案 | 通用 |
| `create_action_draft` | 生成执行草案 | 通用 |
| `validate_draft` | 运行草案校验 | 执行中心 |
| `request_approval` | 发起审批 | 执行中心 |
| `track_execution` | 跟踪执行状态 | 执行中心 |
| `replay_execution` | 回放执行链路 | 审计与回放 |
| `show_customer_risk` | 查看高风险客户 | VIP 保护 |
| `find_support_candidates` | 查找支援座席 | 技能支援 |

---

## 5. UI Action Schema

### 5.1 支持动作

| 动作 | 参数 |
|---|---|
| `OPEN_TAB` | `tab_code`, `context?` |
| `FOCUS_TAB` | `tab_code` |
| `PIN_CONTEXT` | `context` |
| `RUN_API` | `api_code`, `request_ref?` |
| `SHOW_COMPONENT` | `component_id`, `payload_ref` |
| `HIGHLIGHT_GRAPH` | `node_ids[]`, `edge_ids[]` |
| `SELECT_OPTION` | `option_id` |
| `CREATE_DRAFT` | `plan_option_id` |
| `RUN_VALIDATE` | `draft_id` |
| `OPEN_APPROVAL` | `draft_id` |
| `SHOW_TIMELINE` | `execution_id` |

### 5.2 动作结构

```json
{
  "type": "OPEN_TAB",
  "tab_code": "emergency_war_room",
  "context": {
    "event_id": "evt-1015"
  }
}
```

### 5.3 动作约束

1. `tab_code` 必须存在于 UI 模型
2. `RUN_API` 必须映射到允许调用的 API 白名单
3. `CREATE_DRAFT / RUN_VALIDATE / OPEN_APPROVAL` 只能作用于合法对象
4. 协议层不得直接输出下游写回命令

---

## 6. 渲染消息 Schema

### 6.1 通用结构

```json
{
  "type": "table",
  "title": "候选座席清单",
  "payload": {},
  "source_refs": [
    {
      "api": "POST /v1/plans/generate",
      "ref_id": "ps_001"
    }
  ]
}
```

### 6.2 `text`

```json
{
  "type": "text",
  "title": "方案说明",
  "payload": {
    "markdown": "方案 A 优先保障语音 SLA，并对 VIP 降低拦截阈值。"
  }
}
```

### 6.3 `kpi_cards`

```json
{
  "type": "kpi_cards",
  "payload": {
    "items": [
      {
        "label": "SLA 30m",
        "value": "86%",
        "trend": "+8%"
      },
      {
        "label": "放弃率",
        "value": "7%",
        "trend": "-2%"
      }
    ]
  }
}
```

### 6.4 `table`

```json
{
  "type": "table",
  "payload": {
    "columns": [
      "方案",
      "SLA 30m",
      "放弃率",
      "成本变化"
    ],
    "rows": [
      [
        "方案A",
        "86%",
        "7%",
        "+12%"
      ]
    ]
  }
}
```

### 6.5 `chart`

```json
{
  "type": "chart",
  "payload": {
    "engine": "echarts",
    "chart_type": "bar",
    "series": []
  }
}
```

### 6.6 `graph`

```json
{
  "type": "graph",
  "payload": {
    "mode": "scenario",
    "nodes": [],
    "edges": []
  }
}
```

### 6.7 `action_cards`

```json
{
  "type": "action_cards",
  "payload": {
    "draft_id": "draft_001",
    "steps": [
      {
        "target_system": "CTI",
        "action_type": "update_queue_priority",
        "risk_level": "medium"
      }
    ]
  }
}
```

### 6.8 `approval_card`

```json
{
  "type": "approval_card",
  "payload": {
    "draft_id": "draft_001",
    "approval_level": "L2",
    "required_roles": [
      "ops_supervisor"
    ],
    "rollback_ready": true
  }
}
```

### 6.9 `timeline`

```json
{
  "type": "timeline",
  "payload": {
    "execution_id": "exec_001",
    "steps": [
      {
        "name": "update_cti_queue_priority",
        "status": "succeeded",
        "at": "2026-04-04T10:23:10+08:00"
      }
    ]
  }
}
```

---

## 7. API 映射表

| `api_code` | 实际接口 | 用途 |
|---|---|---|
| `analyze_impact` | `POST /v1/analysis/impact` | 影响分析 |
| `generate_plan` | `POST /v1/plans/generate` | 生成方案 |
| `get_plan_explain` | `GET /v1/plans/{plan_session_id}/options/{option_id}/explain` | 解释方案 |
| `get_event_impact` | `GET /v1/events/{event_id}/impact` | 查看事件影响面 |
| `get_graph_view` | `GET /v1/graph/view` | 获取关系子图 |
| `create_draft` | `POST /v1/action-drafts` | 创建草案 |
| `validate_draft` | `POST /v1/action-drafts/{draft_id}/validate` | 校验草案 |
| `approve_draft` | `POST /v1/action-drafts/{draft_id}/approve` | 发起审批 |
| `execute_draft` | `POST /v1/action-drafts/{draft_id}/execute` | 执行草案 |
| `get_execution` | `GET /v1/executions/{execution_id}` | 获取执行态 |

---

## 8. 三个场景的协议样例

### 8.1 应急调度

```json
{
  "intent": "generate_plan",
  "scenario_code": "contact_center_emergency",
  "ui_actions": [
    {
      "type": "OPEN_TAB",
      "tab_code": "emergency_war_room"
    },
    {
      "type": "RUN_API",
      "api_code": "generate_plan"
    }
  ],
  "expected_render_types": [
    "kpi_cards",
    "chart",
    "table",
    "action_cards"
  ]
}
```

### 8.2 技能支援

```json
{
  "intent": "find_support_candidates",
  "scenario_code": "support_orchestration",
  "ui_actions": [
    {
      "type": "OPEN_TAB",
      "tab_code": "support_orchestration"
    },
    {
      "type": "RUN_API",
      "api_code": "analyze_impact"
    }
  ],
  "expected_render_types": [
    "table",
    "chart",
    "action_cards"
  ]
}
```

### 8.3 VIP 保护

```json
{
  "intent": "show_customer_risk",
  "scenario_code": "vip_protection",
  "ui_actions": [
    {
      "type": "OPEN_TAB",
      "tab_code": "vip_protection"
    },
    {
      "type": "RUN_API",
      "api_code": "get_event_impact"
    }
  ],
  "expected_render_types": [
    "table",
    "kpi_cards",
    "action_cards"
  ]
}
```

---

## 9. 治理约束

1. 所有 turn 必须带 `tenant_id / actor_id / trace_id`
2. AI 只能输出白名单中的 `intent / ui_action / render_type`
3. 所有执行型流程必须转成 `ActionDraft`
4. 渲染消息必须可追溯到 API 来源和业务对象
5. 协议层必须尊重脱敏与审批边界

---

## 10. 决策清单

1. `AI Interaction Protocol` 必须独立建模，不嵌在前端临时代码里
2. 协议对象至少包括 `ResolvedIntent / UIActionPlan / AssistantResponse`
3. 所有动作、接口、渲染类型都必须白名单化
4. `table / chart / graph / action_cards / timeline` 是 V1 必须支持的核心渲染类型
5. 协议层只组织交互，不拥有本体真值和执行真值
