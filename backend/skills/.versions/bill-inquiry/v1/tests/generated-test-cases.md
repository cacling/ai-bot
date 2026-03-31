# 测试用例 — bill-inquiry v1

> 自动生成于 2026-03-31T15:01:13.004Z | source_checksum: `323365130152a7f3` | generator: v1.1

## Overview

- 需求数: 18
- 用例数: 11
- 分类: functional(6) / edge(1) / error(2) / state(2)

## Requirements

- **REQ-001** [frontmatter]: 技能应在用户表达账单查询、欠费、发票或费用异常相关意图时被加载
- **REQ-002** [trigger]: 用户询问本月或上月话费金额时应触发账单查询流程
- **REQ-003** [trigger]: 用户对账单某项费用有疑问时应进入费用解读流程
- **REQ-004** [trigger]: 用户因欠费停机需了解原因时应进入欠费处理流程
- **REQ-005** [trigger]: 用户申请电子发票时应进入发票申请流程
- **REQ-006** [trigger]: 用户感觉话费异常偏高或要求对比账单时应进入异常费用分析或账单对比模式
- **REQ-007** [tool]: 系统应优先使用 get_bill_context 工具一次性获取完整账单上下文，减少多轮调用
- **REQ-008** [tool]: 当用户反映话费变高时，应优先调用 analyze_bill_anomaly 工具进行结构化异常分析
- **REQ-009** [tool]: 回复中引用账单明细时必须使用 query_bill 返回的具体项目名和金额，不得汇总模糊表述
- **REQ-010** [tool]: 在账单对比场景中，必须直接复述 analyze_bill_anomaly 返回的 summary 和 changed_items_text 字段内容，禁止自行计算或拼接数字
- **REQ-011** [workflow]: 账单查询流程必须先确认用户身份（query_subscriber），再获取账单明细（query_bill）
- **REQ-012** [workflow]: 欠费处理流程应根据欠费天数区分普通欠费、预销号和号码已回收三种状态，并给出对应指引
- **REQ-013** [workflow]: 发票申请前必须确认账单已缴清，未缴清时应引导用户先缴费
- **REQ-014** [workflow]: 异常费用分析中若涨幅超过20%，应进一步判断 primary_cause 并给出针对性解释和建议
- **REQ-015** [workflow]: 在异常分析、发票申请等涉及用户确认的节点，若用户不认可或取消，应升级至10086投诉热线
- **REQ-016** [workflow]: 任意节点用户要求转人工时，应引导拨打10086人工客服
- **REQ-017** [workflow]: 账单对比模式必须满足数据完整性闸门：仅当两个月账单均成功获取且存在可对齐项目时，才允许输出具体金额变化
- **REQ-018** [workflow]: 工具调用失败时（如 query_bill 或 analyze_bill_anomaly 失败），应使用 fallback 话术，禁止猜测或捏造数据

## Functional Tests

### TC-001: 查询当月账单-正常流程（使用 get_bill_context）

- **Priority**: P1
- **Requirements**: REQ-001, REQ-002, REQ-007, REQ-011
- **Turns**:
  1. "帮我查一下这个月的话费账单"
- **Assertions**:
  - `skill_loaded`: bill-inquiry
  - `tool_called`: get_bill_context
  - `contains`: 账单
  - `response_mentions_any`: 话费, 费用, 明细
- **Notes**: 核心主路径，优先使用 get_bill_context 一次性获取上下文

### TC-002: 费用明细疑问-引用具体项目名和金额

- **Priority**: P1
- **Requirements**: REQ-003, REQ-009, REQ-011
- **Turns**:
  1. "账单里有个视频会员流量包 ¥20 是什么？我没订过"
- **Assertions**:
  - `tool_called_any_of`: get_bill_context, query_bill
  - `contains`: 视频会员流量包
  - `contains`: ¥20
  - `not_contains`: 增值业务费
- **Notes**: 验证回复必须引用 query_bill 返回的具体项目名和金额，不得汇总

### TC-003: 欠费停机-区分欠费状态并引导

- **Priority**: P1
- **Requirements**: REQ-004, REQ-011, REQ-012
- **Turns**:
  1. "我手机停机了，是不是欠费了？"
- **Assertions**:
  - `tool_called`: query_subscriber
  - `response_mentions_any`: 欠费, 停机, 充值
  - `response_has_next_step`: 
- **Notes**: 根据欠费天数区分状态，给出对应指引

### TC-004: 发票申请-未缴清时引导先缴费

- **Priority**: P2
- **Requirements**: REQ-005, REQ-013
- **Turns**:
  1. "我要开上个月的电子发票"
- **Assertions**:
  - `contains`: 缴清
  - `contains`: 充值
  - `tool_not_called`: get_invoice
- **Notes**: 发票申请前必须确认账单已缴清，否则引导缴费

### TC-005: 话费异常偏高-调用 analyze_bill_anomaly 并解释原因

- **Priority**: P1
- **Requirements**: REQ-006, REQ-008, REQ-014
- **Turns**:
  1. "这个月话费怎么突然变高了？"
- **Assertions**:
  - `tool_called`: analyze_bill_anomaly
  - `response_mentions_any`: 上涨, 变化, 原因
  - `response_has_next_step`: 
- **Notes**: 涨幅>20%时需判断 primary_cause 并给出针对性建议

### TC-007: 查询上月账单-指定月份并引用明细

- **Priority**: P2
- **Requirements**: REQ-002, REQ-009, REQ-011
- **Turns**:
  1. "上个月的话费明细发我看下"
- **Assertions**:
  - `tool_called_any_of`: get_bill_context, query_bill
  - `contains`: 上月
  - `response_mentions_all`: 项目, 金额

## Edge Case Tests

### TC-008: 账单对比模式-完整数据下复述 summary 和 changed_items_text

- **Priority**: P1
- **Requirements**: REQ-006, REQ-008, REQ-010, REQ-017
- **Turns**:
  1. "这个月为什么比上个月贵？帮我对比一下"
- **Assertions**:
  - `tool_called`: analyze_bill_anomaly
  - `contains`: 从
  - `contains`: 变为
  - `response_mentions_any`: 变化, 增加
- **Notes**: 验证在数据完整时直接复述 analyze_bill_anomaly 的 summary 和 changed_items_text

## Error Tests

### TC-006: 超出技能范围的请求

- **Priority**: P3
- **Requirements**: REQ-001
- **Turns**:
  1. "帮我办理宽带安装"
- **Assertions**:
  - `tool_not_called`: get_bill_context
  - `tool_not_called`: query_bill
  - `response_mentions_any`: 抱歉, 无法, 其他, 转
- **Notes**: 验证不在技能范围内的请求不会误触发账单工具

### TC-011: 工具调用失败-使用 fallback 话术

- **Priority**: P2
- **Requirements**: REQ-018
- **Turns**:
  1. "帮我对比本月和上个月账单"
- **Assertions**:
  - `tool_called`: analyze_bill_anomaly
  - `not_contains`: 从 ¥
  - `not_contains`: 增加了
  - `response_mentions_any`: 未成功, 完整数据, 稍后重试
- **Notes**: 工具失败时禁止猜测或捏造数据，使用 fallback 话术

## State Tests

### TC-009: 异常分析后用户不认可-升级至10086投诉

- **Priority**: P2
- **Requirements**: REQ-015
- **Turns**:
  1. "这个月话费怎么多了50块？"
  2. "这不是我的问题，我要投诉"
- **Assertions**:
  - `contains`: 10086
  - `contains`: 投诉
  - `tool_not_called`: cancel_service
- **Notes**: 用户不认可异常分析结果时，应升级至投诉热线

### TC-010: 任意节点用户要求转人工

- **Priority**: P2
- **Requirements**: REQ-016
- **Turns**:
  1. "我要找人工客服"
- **Assertions**:
  - `contains`: 10086
  - `contains`: 人工客服
  - `tool_not_called`: query_bill
- **Notes**: 任意节点用户要求转人工，应引导拨打10086

## Coverage Matrix

| Requirement | Covered By |
|-------------|------------|
| REQ-001 | TC-001, TC-006 |
| REQ-002 | TC-001, TC-007 |
| REQ-003 | TC-002 |
| REQ-004 | TC-003 |
| REQ-005 | TC-004 |
| REQ-006 | TC-005, TC-008 |
| REQ-007 | TC-001 |
| REQ-008 | TC-005, TC-008 |
| REQ-009 | TC-002, TC-007 |
| REQ-010 | TC-008 |
| REQ-011 | TC-001, TC-002, TC-003, TC-007 |
| REQ-012 | TC-003 |
| REQ-013 | TC-004 |
| REQ-014 | TC-005 |
| REQ-015 | TC-009 |
| REQ-016 | TC-010 |
| REQ-017 | TC-008 |
| REQ-018 | TC-011 |
