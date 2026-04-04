# 应用层专题：AI 运营智能助理 UI 模型草案

**功能分支**: `006-ontology-service` | **日期**: 2026-04-04 | **规格说明**: [spec.md](spec.md)

> 本文档把 `AI 运营智能助理` 继续下沉为 `m9-ui-model` 风格的页面元数据草案。  
> 它不进入核心本体，只作为应用层 UI 生成与前端实现的元数据基础。

---

## 1. 设计目标

这份 UI 模型需要满足 4 个目标：

1. 保持参考材料中的 `Triple-column + Multi-Tab + AI Copilot`
2. 让 AI 能通过协议驱动页面、标签页和组件联动
3. 让不同运营场景共享一套组件模板，而不是各写一套页面
4. 让前端实现可以直接消费元数据，而不是只靠口头约定

---

## 2. 顶层 UI 模型

```yaml
app:
  id: ai_ops_assistant
  name: AI 运营智能助理
  route: /ops/ai-assistant
  app_type: ai_native_workspace

layout_specification:
  shell: triple_column
  resizable: true
  sidebar:
    width: 240
    min_width: 220
    max_width: 320
  main_area:
    style: multi_tab
    content_padding: "15px 15px 0 15px"
    elevation: flat
  copilot_panel:
    width: 360
    min_width: 320
    max_width: 520
    position: right
  visual_style:
    flat: true
    no_shadow: true
    radius: 0
    border_color: "#e2edf2"
    background_color: "#f0f2f6"

navigation_model:
  sections:
    - id: ops_overview
      label: 今日运营总览
      icon: layout-dashboard
    - id: emergency_war_room
      label: 应急指挥台
      icon: siren
    - id: support_orchestration
      label: 技能支援台
      icon: users-round
    - id: vip_protection
      label: VIP 保护台
      icon: shield-alert
    - id: relation_graph
      label: 关系图谱
      icon: share-2
    - id: option_compare
      label: 方案对比
      icon: git-compare
    - id: action_center
      label: 动作执行中心
      icon: play-square
    - id: audit_replay
      label: 审计与回放
      icon: history

workspace_model:
  tab_policy:
    allow_multi_tab: true
    reuse_existing_tab: true
    tab_context_pinning: true
  allowed_tabs:
    - ops_overview
    - emergency_war_room
    - support_orchestration
    - vip_protection
    - relation_graph
    - option_compare
    - action_center
    - audit_replay
```

---

## 3. 页面元数据

### 3.1 今日运营总览

```yaml
page:
  id: ops_overview
  name: 今日运营总览
  page_type: overview_dashboard
  route: /ops/ai-assistant/overview
  default_open: true
  data_context:
    primary_resources:
      - live_ops_kpis
      - recent_incidents
      - pending_approvals
      - active_executions
  component_templates:
    - type: kpi_card_grid
      id: overview_kpis
    - type: incident_summary_list
      id: overview_incidents
    - type: action_queue_panel
      id: overview_pending_actions
    - type: execution_status_table
      id: overview_active_runs
```

### 3.2 应急指挥台

```yaml
page:
  id: emergency_war_room
  name: 应急指挥台
  page_type: scenario_command_center
  route: /ops/ai-assistant/emergency
  required_context:
    - event_id
  data_context:
    primary_resources:
      - incident_event
      - event_impact
      - queue_runtime
      - plan_options
  component_templates:
    - type: pinned_context_bar
      id: event_context_bar
    - type: kpi_card_grid
      id: emergency_kpis
    - type: chart_panel
      id: queue_forecast_chart
    - type: impact_graph_panel
      id: emergency_impact_graph
    - type: option_compare_table
      id: emergency_option_table
```

### 3.3 技能支援台

```yaml
page:
  id: support_orchestration
  name: 技能支援台
  page_type: support_planning
  route: /ops/ai-assistant/support
  required_context:
    - queue_code
  data_context:
    primary_resources:
      - queue_runtime
      - staffing_gap
      - candidate_agents
      - eligibility_rules
  component_templates:
    - type: pinned_context_bar
      id: support_context_bar
    - type: candidate_table
      id: support_candidate_agents
    - type: gap_chart
      id: support_gap_chart
    - type: risk_summary_card
      id: support_risk_summary
    - type: draft_preview_panel
      id: support_draft_preview
```

### 3.4 VIP 保护台

```yaml
page:
  id: vip_protection
  name: VIP 保护台
  page_type: customer_protection
  route: /ops/ai-assistant/vip
  required_context:
    - event_id
  data_context:
    primary_resources:
      - impacted_vip_customers
      - escalated_tickets
      - callback_candidates
  component_templates:
    - type: customer_risk_table
      id: vip_risk_table
    - type: ticket_table
      id: vip_ticket_table
    - type: action_recommendation_cards
      id: vip_action_cards
```

### 3.5 关系图谱

```yaml
page:
  id: relation_graph
  name: 关系图谱
  page_type: graph_workspace
  route: /ops/ai-assistant/graph
  data_context:
    primary_resources:
      - ontology_graph
  component_templates:
    - type: graph_filter_panel
      id: relation_graph_filters
    - type: graph_canvas
      id: relation_graph_canvas
    - type: graph_detail_panel
      id: relation_graph_detail
```

### 3.6 方案对比

```yaml
page:
  id: option_compare
  name: 方案对比
  page_type: compare_workspace
  route: /ops/ai-assistant/compare
  required_context:
    - plan_session_id
  component_templates:
    - type: compare_card_row
      id: option_compare_cards
    - type: compare_table
      id: option_compare_table
    - type: explain_panel
      id: option_compare_explain
```

### 3.7 动作执行中心

```yaml
page:
  id: action_center
  name: 动作执行中心
  page_type: action_console
  route: /ops/ai-assistant/actions
  required_context:
    - draft_id
  component_templates:
    - type: draft_summary
      id: action_draft_summary
    - type: validation_result_panel
      id: action_validation_panel
    - type: approval_panel
      id: action_approval_panel
    - type: execution_timeline
      id: action_execution_timeline
```

### 3.8 审计与回放

```yaml
page:
  id: audit_replay
  name: 审计与回放
  page_type: replay_workspace
  route: /ops/ai-assistant/replay
  component_templates:
    - type: replay_selector
      id: replay_selector
    - type: audit_table
      id: replay_audit_table
    - type: replay_timeline
      id: replay_timeline
```

---

## 4. 组件模板

### 4.1 建议固定的组件模板

| 模板 | 用途 |
|---|---|
| `kpi_card_grid` | 展示 SLA、AHT、放弃率、成本等指标 |
| `incident_summary_list` | 展示当前异常与严重级别 |
| `impact_graph_panel` | 展示事件影响关系子图 |
| `option_compare_table` | 展示多方案比较 |
| `candidate_table` | 展示候选座席或候选客户 |
| `risk_summary_card` | 展示规则命中与风险汇总 |
| `draft_preview_panel` | 展示 `ActionDraft` 草案 |
| `validation_result_panel` | 展示校验结果 |
| `approval_panel` | 展示审批链与审批入口 |
| `execution_timeline` | 展示执行与补偿时间轴 |

### 4.2 组件模板约束

1. 组件模板必须与消息渲染协议可对齐
2. 组件模板必须接受 `context_id / event_id / plan_session_id / draft_id`
3. 图表与图谱类组件必须支持容器 resize
4. 执行类组件必须显示权限、规则、审批和回滚信息

---

## 5. Copilot 面板元数据

```yaml
copilot_panel:
  id: ai_ops_copilot
  title: AI 运营智能助理
  mode: conversation_plus_actions
  sections:
    - type: conversation_stream
      id: copilot_messages
    - type: quick_action_bar
      id: copilot_quick_actions
    - type: context_summary
      id: copilot_context_summary
    - type: suggested_actions
      id: copilot_suggested_actions
  quick_actions:
    - label: 分析影响面
      intent: show_impact_graph
    - label: 生成方案
      intent: generate_plan
    - label: 比较方案
      intent: compare_options
    - label: 生成草案
      intent: create_action_draft
    - label: 跟踪执行
      intent: track_execution
```

---

## 6. 与 AI Interaction Protocol 的绑定点

UI 模型需要暴露以下绑定点给协议层：

- `tab_code`
- `page_type`
- `required_context`
- `supported_intents`
- `supported_render_types`
- `action_targets`

例如：

```yaml
intent_bindings:
  emergency_war_room:
    supported_intents:
      - show_impact_graph
      - generate_plan
      - explain_plan
      - create_action_draft
    supported_render_types:
      - kpi_cards
      - chart
      - graph
      - table
      - action_cards
```

---

## 7. 决策清单

1. AI 运营智能助理需要独立的 UI 模型，而不是复用本体建模工作台
2. UI 模型只属于应用层，不进入核心本体
3. 页面应围绕运营场景而不是围绕对象类型来组织
4. `Triple-column + Multi-Tab + Copilot` 是固定骨架
5. 页面、组件和标签页必须可被 `AI Interaction Protocol` 直接寻址
