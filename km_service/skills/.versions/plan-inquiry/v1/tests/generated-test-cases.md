# 测试用例 — plan-inquiry v1

> 自动生成于 2026-04-02T10:16:49.461Z | source_checksum: `9da390dc720e8ba1` | generator: v1.1

## Overview

- 需求数: 20
- 用例数: 11
- 分类: functional(4) / edge(2) / error(2) / state(3)

## Requirements

- **REQ-001** [frontmatter]: 技能应在用户表达套餐查询、变更、对比或流量不足意图时被加载
- **REQ-002** [frontmatter]: 技能不应处理近期突发网络故障，应引导至故障诊断技能
- **REQ-003** [trigger]: 用户询问有哪些套餐可选时应进入套餐浏览流程
- **REQ-004** [trigger]: 用户表达升级或降级套餐意愿时应进入套餐变更流程
- **REQ-005** [trigger]: 用户要求对比多个套餐差异时应进入套餐对比流程
- **REQ-006** [trigger]: 用户反映流量经常不够用、月底被限速时应进入流量不足处理流程
- **REQ-007** [workflow]: 当用户提到'上网慢'或'被限速'时，必须先澄清是突发故障还是长期流量不足，再决定是否继续本技能
- **REQ-008** [tool]: 当需要同时获取用户信息和套餐列表时，应优先调用 get_plan_context 工具
- **REQ-009** [workflow]: 套餐浏览流程中，应先获取套餐列表，再根据用户预算和偏好推荐合适套餐
- **REQ-010** [workflow]: 套餐变更流程中，必须先查询用户当前套餐和用量数据，再分析是否建议升降档
- **REQ-011** [workflow]: 套餐变更前必须检查用户是否处于合约期，合约期内变更需告知违约金并引导至营业厅
- **REQ-012** [workflow]: 流量不足流程中，若剩余流量接近零，应优先推荐加油包解决燃眉之急
- **REQ-013** [workflow]: 推荐套餐或加油包前，必须基于 query_subscriber 返回的实际用量数据，不得反问用户已知信息
- **REQ-014** [workflow]: 所有套餐推荐必须说明月费、流量、通话、权益四项核心信息及推荐理由
- **REQ-015** [workflow]: 涉及套餐变更时，必须明确告知生效时间（升级立即/降级次月）和办理方式（APP自助或营业厅）
- **REQ-016** [workflow]: 用户确认同意变更后，系统应引导其通过APP自助办理或前往营业厅，不得声称已直接办理
- **REQ-017** [workflow]: 套餐对比应按月费、流量、通话、权益四维展开，并突出差异项和每GB单价
- **REQ-018** [workflow]: 用户中途要求转人工时，应引导拨打10086结束对话
- **REQ-019** [workflow]: 任一工具调用失败时，应提示稍后重试或拨打10086并终止流程
- **REQ-020** [workflow]: 用户表示仅了解无办理意愿时，应礼貌结束对话

## Functional Tests

### TC-001: 套餐浏览-正常流程

- **Priority**: P1
- **Requirements**: REQ-001, REQ-003, REQ-009, REQ-014
- **Turns**:
  1. "我想看看有哪些套餐可选"
- **Assertions**:
  - `tool_called`: query_plans
  - `response_mentions_all`: 月费,流量,通话,权益
  - `contains`: 推荐

### TC-002: 套餐变更-升级建议

- **Priority**: P1
- **Requirements**: REQ-001, REQ-004, REQ-010, REQ-013, REQ-014, REQ-015, REQ-016
- **Turns**:
  1. "我这个月流量又不够用了，想换个大一点的套餐"
- **Assertions**:
  - `tool_called_any_of`: get_plan_context,query_subscriber
  - `tool_called`: query_plans
  - `response_mentions_all`: 月费,流量,通话,权益
  - `contains`: 生效时间
  - `not_contains`: 已为您办理

### TC-003: 套餐对比-多维差异展示

- **Priority**: P2
- **Requirements**: REQ-001, REQ-005, REQ-017
- **Turns**:
  1. "A套餐和B套餐哪个更划算？帮我对比一下"
- **Assertions**:
  - `tool_called`: query_plans
  - `response_mentions_all`: 月费,流量,通话,权益
  - `contains`: 每GB单价

### TC-004: 流量不足-加油包优先

- **Priority**: P1
- **Requirements**: REQ-001, REQ-006, REQ-012, REQ-013
- **Turns**:
  1. "我流量用完了，现在上不了网怎么办"
- **Assertions**:
  - `tool_called`: query_subscriber
  - `contains`: 加油包
  - `contains`: APP

## Edge Case Tests

### TC-007: 上下文获取-优先使用get_plan_context

- **Priority**: P2
- **Requirements**: REQ-008
- **Turns**:
  1. "我想升级套餐"
- **Assertions**:
  - `tool_called`: get_plan_context
- **Notes**: 验证工具调用优化策略

### TC-008: 合约期内变更-引导营业厅

- **Priority**: P2
- **Requirements**: REQ-011
- **Persona**: contract_user
- **Turns**:
  1. "我想降级到便宜点的套餐"
- **Assertions**:
  - `contains`: 合约期
  - `contains`: 营业厅
  - `not_contains`: APP自助

## Error Tests

### TC-005: 突发网络故障-转向故障诊断

- **Priority**: P2
- **Requirements**: REQ-002
- **Turns**:
  1. "今天突然上不了网了，信号也没有"
- **Assertions**:
  - `tool_not_called`: query_plans
  - `response_mentions_any`: 故障,诊断,排查

### TC-010: 工具调用失败-异常处理

- **Priority**: P2
- **Requirements**: REQ-019
- **Turns**:
  1. "帮我查下有什么套餐"
- **Assertions**:
  - `contains`: 稍后重试
  - `contains`: 10086
- **Notes**: 模拟工具调用失败场景

## State Tests

### TC-006: 模糊网速问题-澄清分流

- **Priority**: P2
- **Requirements**: REQ-007
- **Turns**:
  1. "上网好慢啊"
- **Assertions**:
  - `contains`: 最近突然变慢
  - `contains`: 经常月底不够用

### TC-009: 用户要求转人工

- **Priority**: P2
- **Requirements**: REQ-018
- **Turns**:
  1. "我要转人工客服"
- **Assertions**:
  - `contains`: 10086

### TC-011: 仅了解无办理意愿-礼貌结束

- **Priority**: P3
- **Requirements**: REQ-020
- **Turns**:
  1. "有什么套餐推荐吗"
  2. "好的我知道了，暂时不办理"
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
| REQ-012 | TC-004 |
| REQ-013 | TC-002, TC-004 |
| REQ-014 | TC-001, TC-002 |
| REQ-015 | TC-002 |
| REQ-016 | TC-002 |
| REQ-017 | TC-003 |
| REQ-018 | TC-009 |
| REQ-019 | TC-010 |
| REQ-020 | TC-011 |
