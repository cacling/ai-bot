# 测试用例 — bill-inquiry v1

> 自动生成于 2026-04-02T10:37:04.157Z | source_checksum: `323365130152a7f3` | generator: v1.1

## Overview

- 需求数: 18
- 用例数: 12
- 分类: functional(7) / edge(1) / error(2) / state(2)

## Requirements

- **REQ-001** [frontmatter]: 技能应在用户表达账单查询、欠费、发票或费用异常相关意图时被加载
- **REQ-002** [trigger]: 用户询问本月或上月话费金额时应触发账单查询流程
- **REQ-003** [trigger]: 用户对账单某项费用有疑问时应进入费用解读流程
- **REQ-004** [trigger]: 用户账号欠费停机时应提供欠费详情和充值指引
- **REQ-005** [trigger]: 用户申请电子发票时应引导至发票申请流程
- **REQ-006** [trigger]: 用户感觉话费异常偏高时应启动异常费用分析流程
- **REQ-007** [tool]: 系统应优先使用 get_bill_context 工具一次性获取完整账单上下文，减少多轮调用
- **REQ-008** [tool]: 当用户反映话费变高时，应优先调用 analyze_bill_anomaly 工具进行自动对比分析
- **REQ-009** [tool]: 回复中必须直接复述 analyze_bill_anomaly 返回的 summary 和 changed_items_text 字段，禁止自行计算或拼接数字
- **REQ-010** [workflow]: 账单查询流程必须先确认用户身份再获取账单明细
- **REQ-011** [workflow]: 欠费处理流程应根据欠费天数区分普通欠费、预销号和号码已回收三种情况并给出相应指引
- **REQ-012** [workflow]: 发票申请流程必须确认账单已缴清后才能引导开票操作
- **REQ-013** [workflow]: 异常费用分析流程中，若涨幅超过20%应定位具体原因并提供针对性建议
- **REQ-014** [workflow]: 异常分析后若用户不认可解释，应升级至10086投诉热线
- **REQ-015** [workflow]: 任意节点用户要求转人工时应引导拨打10086
- **REQ-016** [workflow]: 账单对比模式必须满足数据完整性闸门才能输出具体金额变化
- **REQ-017** [workflow]: 工具调用失败时应提示稍后重试或拨打10086，不得捏造账单数据
- **REQ-018** [workflow]: 费用解读时必须引用 query_bill 返回的具体项目名和金额，避免含糊表述

## Functional Tests

### TC-001: 查询当月账单-正常流程（使用 get_bill_context）

- **Priority**: P1
- **Requirements**: REQ-001, REQ-002, REQ-007, REQ-010
- **Turns**:
  1. "帮我查一下这个月的话费账单"
- **Assertions**:
  - `skill_loaded`: bill-inquiry
  - `tool_called`: get_bill_context
  - `contains`: 账单
  - `response_mentions_any`: 金额, 费用, 明细
- **Notes**: 核心主路径，优先使用 get_bill_context 一次性获取上下文

### TC-002: 费用疑问-解读具体项目

- **Priority**: P1
- **Requirements**: REQ-003, REQ-007, REQ-010, REQ-018
- **Turns**:
  1. "我账单里有个视频会员流量包 ¥20，我没订过啊"
- **Assertions**:
  - `tool_called`: get_bill_context
  - `contains`: 视频会员流量包
  - `contains`: ¥20
- **Notes**: 验证回复引用 query_bill 返回的具体项目名和金额

### TC-003: 欠费停机-普通欠费场景

- **Priority**: P1
- **Requirements**: REQ-004, REQ-007, REQ-010, REQ-011
- **Persona**: arrears_user
- **Turns**:
  1. "我手机停机了，是不是欠费了？"
- **Assertions**:
  - `tool_called`: get_bill_context
  - `response_mentions_any`: 欠费, 充值, 恢复
  - `contains`: 30分钟内自动恢复
- **Notes**: 验证区分欠费类型并给出对应指引

### TC-004: 发票申请-已缴清账单

- **Priority**: P2
- **Requirements**: REQ-005, REQ-012
- **Turns**:
  1. "我想开上个月的电子发票"
  2. "已经交过了"
- **Assertions**:
  - `contains`: APP自助申请
  - `not_contains`: 代为开具
- **Notes**: 验证确认缴清后引导自助开票

### TC-005: 话费异常偏高-自动分析并复述 summary

- **Priority**: P1
- **Requirements**: REQ-006, REQ-008, REQ-009, REQ-007
- **Turns**:
  1. "这个月话费怎么突然变高了？"
- **Assertions**:
  - `tool_called`: analyze_bill_anomaly
  - `llm_rubric`: 回复直接复述 analyze_bill_anomaly 返回的 summary 字段内容，未自行计算或改写数字
- **Notes**: 验证优先调用 analyze_bill_anomaly 并原样复述结果

### TC-007: 账单对比-精确模式（数据完整）

- **Priority**: P2
- **Requirements**: REQ-002, REQ-016, REQ-018
- **Turns**:
  1. "这个月为什么比上个月贵？"
- **Assertions**:
  - `tool_called`: analyze_bill_anomaly
  - `regex`: 从 ¥\d+\.?\d* 变为 ¥\d+\.?\d*
  - `response_mentions_all`: 总额, 变化, 建议
- **Notes**: 验证满足数据完整性闸门时输出精确对比

### TC-008: 异常分析-涨幅超20%并定位原因

- **Priority**: P2
- **Requirements**: REQ-006, REQ-008, REQ-009, REQ-013
- **Turns**:
  1. "话费比上个月多了50块，怎么回事？"
- **Assertions**:
  - `tool_called`: analyze_bill_anomaly
  - `llm_rubric`: 回复包含具体变化项、金额差异，并提供针对性建议（如退订、升级套餐等）
  - `contains`: changed_items_text
- **Notes**: 验证涨幅>20%时定位原因并给建议

## Edge Case Tests

### TC-011: 账单对比-数据不完整 fallback

- **Priority**: P2
- **Requirements**: REQ-016
- **Turns**:
  1. "帮我对比本月和上个月账单"
- **Assertions**:
  - `tool_called`: analyze_bill_anomaly
  - `not_contains`: 从 ¥
  - `contains`: 无法准确定位具体项目变化
- **Notes**: 模拟工具返回不完整数据，验证 fallback 话术

## Error Tests

### TC-006: 超出技能范围的请求

- **Priority**: P3
- **Requirements**: REQ-001
- **Turns**:
  1. "帮我办理宽带安装"
- **Assertions**:
  - `tool_not_called`: get_bill_context
  - `response_mentions_any`: 抱歉, 无法处理, 其他业务
- **Notes**: 验证不在技能范围内的请求不会触发账单工具

### TC-012: 工具调用失败-异常处理

- **Priority**: P2
- **Requirements**: REQ-017
- **Turns**:
  1. "查一下我上个月的话费"
- **Assertions**:
  - `tool_called`: get_bill_context
  - `not_contains`: ¥
  - `response_mentions_any`: 稍后重试, 10086
- **Notes**: 模拟工具失败，验证不捏造数据

## State Tests

### TC-009: 异常分析-用户不认可解释

- **Priority**: P2
- **Requirements**: REQ-014
- **Turns**:
  1. "话费怎么突然多了这么多？"
  2. "我不接受这个解释，我要投诉"
- **Assertions**:
  - `contains`: 10086
  - `response_mentions_any`: 投诉, 热线, 人工
- **Notes**: 验证用户不认可时升级至10086

### TC-010: 任意节点转人工

- **Priority**: P2
- **Requirements**: REQ-015
- **Turns**:
  1. "查一下我这个月话费"
  2. "转人工"
- **Assertions**:
  - `contains`: 10086
  - `tool_not_called`: query_bill
- **Notes**: 验证任意节点可转人工

## Coverage Matrix

| Requirement | Covered By |
|-------------|------------|
| REQ-001 | TC-001, TC-006 |
| REQ-002 | TC-001, TC-007 |
| REQ-003 | TC-002 |
| REQ-004 | TC-003 |
| REQ-005 | TC-004 |
| REQ-006 | TC-005, TC-008 |
| REQ-007 | TC-001, TC-002, TC-003, TC-005 |
| REQ-008 | TC-005, TC-008 |
| REQ-009 | TC-005, TC-008 |
| REQ-010 | TC-001, TC-002, TC-003 |
| REQ-011 | TC-003 |
| REQ-012 | TC-004 |
| REQ-013 | TC-008 |
| REQ-014 | TC-009 |
| REQ-015 | TC-010 |
| REQ-016 | TC-007, TC-011 |
| REQ-017 | TC-012 |
| REQ-018 | TC-002, TC-007 |
