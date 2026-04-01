# 测试用例 — plan-inquiry v1

> 自动生成于 2026-03-31T16:16:46.945Z | source_checksum: `9da390dc720e8ba1` | generator: v1.1

## Overview

- 需求数: 18
- 用例数: 11
- 分类: functional(4) / edge(2) / error(3) / state(2)

## Requirements

- **REQ-001** [frontmatter]: 技能应在用户表达套餐查询、变更、对比或流量不足意图时被加载
- **REQ-002** [frontmatter]: 技能不应处理近期突发网络故障、增值业务退订、账单解读或App技术问题，应引导至对应技能
- **REQ-003** [trigger]: 用户询问可用套餐列表时应进入套餐浏览流程
- **REQ-004** [trigger]: 用户表达升级或降级套餐意愿时应进入套餐变更流程
- **REQ-005** [trigger]: 用户要求对比多个套餐差异时应进入套餐对比流程
- **REQ-006** [trigger]: 用户反映流量用完、上网慢或被限速时应先进入网速问题分流判断
- **REQ-007** [workflow]: 当用户提到'上网慢'或'被限速'时，必须先澄清是突发故障还是长期流量不足，突发故障应引导至故障诊断技能
- **REQ-008** [tool]: 系统应优先使用 get_plan_context 工具一次性获取用户信息和套餐列表，避免分别调用 query_subscriber 和 query_plans
- **REQ-009** [workflow]: 套餐浏览流程中，成功获取套餐列表后应询问用户预算偏好和关注点，并基于需求推荐最优套餐
- **REQ-010** [workflow]: 套餐变更流程中，必须先查询用户当前套餐和用量数据，再分析是否建议升级、降级或维持
- **REQ-011** [workflow]: 套餐变更前必须检查用户是否处于合约期内，合约期内变更应告知违约金并引导至营业厅办理
- **REQ-012** [workflow]: 流量不够用流程中，若剩余流量接近零应优先推荐加油包解决燃眉之急，再讨论长期套餐升级方案
- **REQ-013** [workflow]: 所有涉及套餐变更的场景，必须明确告知用户生效时间（升级立即/降级次月）和办理方式（APP自助或营业厅）
- **REQ-014** [workflow]: 套餐对比时必须按月费、流量、通话、权益四个维度进行清晰对比，并突出差异项和每GB单价
- **REQ-015** [workflow]: 任何工具调用失败时，应提示用户稍后重试或拨打10086
- **REQ-016** [workflow]: 用户要求转人工时，应引导拨打10086
- **REQ-017** [workflow]: 推荐套餐时必须引用用户实际用量数据作为依据，禁止反问用户已有数据中可获取的信息
- **REQ-018** [workflow]: 推荐套餐时必须给出明确结论（如'建议您升级到XX套餐'）并说明推荐理由（用量、性价比、生效时间等）

## Functional Tests

### TC-001: 套餐浏览-正常流程并推荐

- **Priority**: P1
- **Requirements**: REQ-001, REQ-003, REQ-008, REQ-009, REQ-017, REQ-018
- **Turns**:
  1. "有哪些套餐可以选？"
- **Assertions**:
  - `tool_called`: get_plan_context
  - `contains`: 预算
  - `contains`: 建议您
  - `response_mentions_all`: 月费,流量,通话,权益
- **Notes**: 核心主路径：使用 get_plan_context 获取上下文，询问偏好后给出明确推荐

### TC-002: 套餐变更-升级推荐并说明生效规则

- **Priority**: P1
- **Requirements**: REQ-001, REQ-004, REQ-008, REQ-010, REQ-013, REQ-017, REQ-018
- **Turns**:
  1. "我想换个大流量的套餐"
- **Assertions**:
  - `tool_called`: get_plan_context
  - `contains`: 建议您升级到
  - `contains`: 立即生效
  - `regex`: 用量.*\d+%
- **Notes**: 验证基于用量数据推荐升级，并说明生效时间

### TC-003: 套餐对比-四维度清晰对比

- **Priority**: P2
- **Requirements**: REQ-001, REQ-005, REQ-008, REQ-014
- **Turns**:
  1. "A套餐和B套餐哪个划算？"
- **Assertions**:
  - `tool_called`: get_plan_context
  - `response_mentions_all`: 月费,流量,通话,权益
  - `contains`: 每GB单价
- **Notes**: 验证按四个维度对比并突出差异

### TC-004: 流量不够用-优先推荐加油包再讨论升级

- **Priority**: P1
- **Requirements**: REQ-001, REQ-006, REQ-008, REQ-012, REQ-017, REQ-018
- **Turns**:
  1. "流量用完了，现在上不了网"
- **Assertions**:
  - `tool_called`: get_plan_context
  - `contains`: 加油包
  - `contains`: 建议您
  - `regex`: 剩余流量.*接近零
- **Notes**: 验证先解决燃眉之急（加油包），再提长期方案

## Edge Case Tests

### TC-005: 合约期内变更-引导营业厅办理

- **Priority**: P2
- **Requirements**: REQ-004, REQ-010, REQ-011, REQ-013
- **Persona**: contract_user
- **Turns**:
  1. "我要降级套餐"
- **Assertions**:
  - `contains`: 合约期内
  - `contains`: 违约金
  - `contains`: 营业厅
  - `tool_not_called`: query_plans
- **Notes**: 模拟合约用户，验证不直接推荐降级而是引导线下办理

### TC-006: 模糊表达-口语化套餐查询

- **Priority**: P2
- **Requirements**: REQ-001, REQ-003
- **Turns**:
  1. "有啥套餐啊"
- **Assertions**:
  - `tool_called_any_of`: get_plan_context, query_plans
  - `contains`: 套餐
- **Notes**: 极简口语输入，验证意图识别鲁棒性

## Error Tests

### TC-008: 增值业务退订请求-引导至对应技能

- **Priority**: P3
- **Requirements**: REQ-002
- **Turns**:
  1. "帮我退订视频会员"
- **Assertions**:
  - `tool_not_called`: get_plan_context
  - `response_mentions_any`: 退订, 增值业务, service-cancel
- **Notes**: 验证超出范围请求不会触发套餐工具

### TC-009: 账单解读请求-引导至账单技能

- **Priority**: P3
- **Requirements**: REQ-002
- **Turns**:
  1. "我上个月话费怎么这么多？"
- **Assertions**:
  - `tool_not_called`: get_plan_context
  - `response_mentions_any`: 账单, bill-inquiry, 费用明细

### TC-010: 工具调用失败-提示重试或拨打10086

- **Priority**: P2
- **Requirements**: REQ-015
- **Turns**:
  1. "有什么套餐？"
- **Assertions**:
  - `contains`: 稍后重试
  - `contains`: 10086
  - `tool_not_called`: query_subscriber
- **Notes**: 模拟工具异常场景，验证错误提示

## State Tests

### TC-007: 上网慢-澄清后分流至故障诊断

- **Priority**: P2
- **Requirements**: REQ-006, REQ-007
- **Turns**:
  1. "最近上网特别慢"
  2. "就是这两天突然变慢的"
- **Assertions**:
  - `contains`: 最近突然变慢
  - `response_mentions_any`: 故障诊断, 网络问题, 排查
  - `tool_not_called`: get_plan_context
- **Notes**: 多轮对话：第一轮澄清，第二轮确认为突发故障后转出

### TC-011: 用户要求转人工-引导拨打10086

- **Priority**: P2
- **Requirements**: REQ-016
- **Turns**:
  1. "转人工客服"
- **Assertions**:
  - `contains`: 10086
  - `tool_not_called`: get_plan_context

## Coverage Matrix

| Requirement | Covered By |
|-------------|------------|
| REQ-001 | TC-001, TC-002, TC-003, TC-004, TC-006 |
| REQ-002 | TC-008, TC-009 |
| REQ-003 | TC-001, TC-006 |
| REQ-004 | TC-002, TC-005 |
| REQ-005 | TC-003 |
| REQ-006 | TC-004, TC-007 |
| REQ-007 | TC-007 |
| REQ-008 | TC-001, TC-002, TC-003, TC-004 |
| REQ-009 | TC-001 |
| REQ-010 | TC-002, TC-005 |
| REQ-011 | TC-005 |
| REQ-012 | TC-004 |
| REQ-013 | TC-002, TC-005 |
| REQ-014 | TC-003 |
| REQ-015 | TC-010 |
| REQ-016 | TC-011 |
| REQ-017 | TC-001, TC-002, TC-004 |
| REQ-018 | TC-001, TC-002, TC-004 |
