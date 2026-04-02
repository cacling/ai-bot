# 测试用例 — plan-inquiry v1

> 自动生成于 2026-04-02T06:41:45.155Z | source_checksum: `9da390dc720e8ba1` | generator: v1.1

## Overview

- 需求数: 18
- 用例数: 11
- 分类: functional(4) / edge(2) / error(3) / state(2)

## Requirements

- **REQ-001** [frontmatter]: 技能应在用户表达套餐查询、变更、对比或流量不足意图时被加载
- **REQ-002** [frontmatter]: 技能不应处理近期突发网络故障，应引导至故障诊断技能
- **REQ-003** [trigger]: 用户询问可用套餐列表时应进入套餐浏览流程
- **REQ-004** [trigger]: 用户表达升级或降级套餐意愿时应进入套餐变更流程
- **REQ-005** [trigger]: 用户要求对比多个套餐差异时应进入套餐对比流程
- **REQ-006** [trigger]: 用户反映流量经常不够用、被限速时应进入流量不足处理流程
- **REQ-007** [workflow]: 当用户提到上网慢或被限速时，必须先澄清是突发故障还是长期流量不足，再决定是否继续本技能
- **REQ-008** [tool]: 系统应优先使用 get_plan_context 工具一次性获取用户信息和套餐列表，避免分别调用 query_subscriber 和 query_plans
- **REQ-009** [workflow]: 套餐浏览流程中，获取套餐列表后应询问用户预算偏好和关注点，再进行个性化推荐
- **REQ-010** [workflow]: 套餐变更流程中，必须先查询用户当前套餐和用量数据，再分析是否适合升降档
- **REQ-011** [workflow]: 套餐变更前必须检查用户是否处于合约期内，合约期内变更需告知违约金并引导至营业厅
- **REQ-012** [workflow]: 根据用户用量数据（如流量使用率>80%）应给出明确的升降档建议，并说明推荐理由
- **REQ-013** [workflow]: 套餐对比流程中，应按月费、流量、通话、权益四个维度进行结构化对比，并突出差异项
- **REQ-014** [workflow]: 流量不足场景下，若剩余流量接近零应优先推荐加油包解决燃眉之急，再讨论长期套餐升级方案
- **REQ-015** [workflow]: 所有套餐变更操作只能引导用户通过APP自助办理或前往营业厅，不得声称已直接办理成功
- **REQ-016** [workflow]: 用户表示仅了解信息无办理意愿时，应礼貌结束对话
- **REQ-017** [workflow]: 用户要求转人工时，应引导拨打10086
- **REQ-018** [workflow]: 工具调用失败时应提示稍后重试或拨打10086

## Functional Tests

### TC-001: 套餐浏览-正常流程

- **Priority**: P1
- **Requirements**: REQ-001, REQ-003, REQ-009
- **Turns**:
  1. "有什么套餐可以选？"
- **Assertions**:
  - `tool_called`: query_plans
  - `response_mentions_all`: 月费,流量,通话,权益
  - `response_has_next_step`: 

### TC-002: 套餐变更-升级推荐（用量>80%）

- **Priority**: P1
- **Requirements**: REQ-001, REQ-004, REQ-010, REQ-012, REQ-015
- **Turns**:
  1. "我想换个大流量的套餐"
- **Assertions**:
  - `tool_called_any_of`: get_plan_context,query_subscriber
  - `tool_called`: query_plans
  - `contains`: 建议您升级到
  - `not_contains`: 已为您办理
  - `response_mentions_any`: APP,营业厅

### TC-003: 套餐对比-结构化四维对比

- **Priority**: P2
- **Requirements**: REQ-001, REQ-005, REQ-013
- **Turns**:
  1. "A套餐和B套餐哪个更划算？"
- **Assertions**:
  - `tool_called`: query_plans
  - `response_mentions_all`: 月费,流量,通话,权益
  - `contains`: 对比

### TC-004: 流量不足-优先推荐加油包

- **Priority**: P1
- **Requirements**: REQ-001, REQ-006, REQ-014, REQ-015
- **Turns**:
  1. "流量用完了，现在上不了网"
- **Assertions**:
  - `tool_called_any_of`: get_plan_context,query_subscriber
  - `contains`: 加油包
  - `response_mentions_any`: APP,自助购买
  - `not_contains`: 已开通

## Edge Case Tests

### TC-007: 工具调用优化-使用get_plan_context

- **Priority**: P2
- **Requirements**: REQ-008
- **Turns**:
  1. "帮我看看适合我的套餐"
- **Assertions**:
  - `tool_called`: get_plan_context
- **Notes**: 验证优先使用合并工具

### TC-008: 合约期内变更-引导营业厅

- **Priority**: P2
- **Requirements**: REQ-011
- **Persona**: contract_user
- **Turns**:
  1. "我要降级套餐"
- **Assertions**:
  - `contains`: 合约期内
  - `response_mentions_any`: 营业厅,违约金

## Error Tests

### TC-005: 突发网络故障-引导至故障诊断

- **Priority**: P2
- **Requirements**: REQ-002
- **Turns**:
  1. "刚才突然上不了网了"
- **Assertions**:
  - `tool_not_called`: query_plans
  - `response_mentions_any`: 故障,诊断,排查

### TC-010: 用户要求转人工

- **Priority**: P2
- **Requirements**: REQ-017
- **Turns**:
  1. "转人工客服"
- **Assertions**:
  - `contains`: 10086

### TC-011: 工具调用失败-提示重试或拨打10086

- **Priority**: P3
- **Requirements**: REQ-018
- **Turns**:
  1. "查一下我的套餐"
- **Assertions**:
  - `contains`: 稍后重试
  - `response_mentions_any`: 10086,客服
- **Notes**: 模拟工具异常场景

## State Tests

### TC-006: 网速问题澄清-区分故障与流量不足

- **Priority**: P2
- **Requirements**: REQ-007
- **Turns**:
  1. "上网好慢啊"
- **Assertions**:
  - `contains`: 是最近突然变慢，还是经常月底流量不够用

### TC-009: 仅了解信息-礼貌结束

- **Priority**: P3
- **Requirements**: REQ-016
- **Turns**:
  1. "有哪些套餐？"
  2. "我就随便问问，不用办理"
- **Assertions**:
  - `response_mentions_any`: 还有,其他,帮到,再见

## Coverage Matrix

| Requirement | Covered By |
|-------------|------------|
| REQ-001 | TC-001, TC-002, TC-003, TC-004 |
| REQ-002 | TC-005 |
| REQ-003 | TC-001 |
| REQ-004 | TC-002 |
| REQ-005 | TC-003 |
| REQ-006 | TC-004 |
| REQ-007 | TC-006 |
| REQ-008 | TC-007 |
| REQ-009 | TC-001 |
| REQ-010 | TC-002 |
| REQ-011 | TC-008 |
| REQ-012 | TC-002 |
| REQ-013 | TC-003 |
| REQ-014 | TC-004 |
| REQ-015 | TC-002, TC-004 |
| REQ-016 | TC-009 |
| REQ-017 | TC-010 |
| REQ-018 | TC-011 |
