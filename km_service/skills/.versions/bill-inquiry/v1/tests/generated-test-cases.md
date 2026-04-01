# 测试用例 — bill-inquiry v1

> 自动生成于 2026-04-01T01:45:04.809Z | source_checksum: `323365130152a7f3` | generator: v1.1

## Overview

- 需求数: 18
- 用例数: 11
- 分类: functional(7) / edge(1) / error(2) / state(1)

## Requirements

- **REQ-001** [frontmatter]: 技能应在用户表达账单、欠费、发票或费用异常相关意图时被加载
- **REQ-002** [trigger]: 用户询问本月或上月话费金额时应触发账单查询流程
- **REQ-003** [trigger]: 用户对账单某项费用有疑问时应进入费用解读流程
- **REQ-004** [trigger]: 用户账号欠费停机时应进入欠费处理流程，说明欠费详情并引导充值
- **REQ-005** [trigger]: 用户申请电子发票时应进入发票申请流程，并确认账单已缴清
- **REQ-006** [trigger]: 用户反映话费异常偏高或要求对比账单时应进入异常费用分析或账单对比模式
- **REQ-007** [tool]: 系统应优先使用 get_bill_context 工具一次性获取完整账单上下文，减少多轮调用
- **REQ-008** [tool]: 当用户要求账单对比时，必须同时获取当前月和对比月账单数据才能进行精确对比
- **REQ-009** [tool]: analyze_bill_anomaly 返回的 summary 和 changed_items_text 字段应直接复述，禁止自行计算或拼接数字
- **REQ-010** [workflow]: 账单查询流程中必须先确认用户身份（query_subscriber），再查询账单明细（query_bill）
- **REQ-011** [workflow]: 欠费处理流程应根据欠费时长（≤90天、90-180天、>180天）提供差异化处理方案
- **REQ-012** [workflow]: 发票申请前必须确认用户已缴清账单，未缴清时应引导先缴费
- **REQ-013** [workflow]: 异常费用分析中若涨幅超过20%，应定位具体原因（如流量超额、新增增值业务、漫游等）并给出建议
- **REQ-014** [workflow]: 当用户不认可异常分析结果时，应升级至10086投诉热线
- **REQ-015** [workflow]: 任意节点用户要求转人工时，应引导拨打10086人工客服
- **REQ-016** [workflow]: 账单对比场景下，若工具调用失败或缺少可比明细，必须使用 fallback 话术，禁止猜测具体变化金额
- **REQ-017** [workflow]: 费用解读时必须引用 query_bill 返回的具体项目名和金额，避免使用模糊汇总表述
- **REQ-018** [workflow]: 账单对比模式应优先解释金额变化最大的1-3项，并说明项目名、上月金额、本月金额和变化金额

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
  - `response_mentions_any`: 费用, 明细, 金额
- **Notes**: 核心主路径，优先使用 get_bill_context 获取完整上下文

### TC-002: 查询上月账单-指定月份

- **Priority**: P2
- **Requirements**: REQ-002, REQ-007, REQ-010
- **Turns**:
  1. "上个月的话费是多少钱"
- **Assertions**:
  - `tool_called`: get_bill_context
  - `response_mentions_any`: 账单, 话费, 金额, 费用

### TC-003: 不明扣费查询-费用解读并引用具体项目

- **Priority**: P1
- **Requirements**: REQ-003, REQ-007, REQ-010, REQ-017
- **Turns**:
  1. "我账单里有个不认识的费用，帮我看看是什么"
- **Assertions**:
  - `tool_called`: get_bill_context
  - `response_mentions_all`: 项目, 金额
  - `not_contains`: 汇总
- **Notes**: 验证回复引用 query_bill 返回的具体项目名和金额

### TC-004: 欠费停机-普通欠费（≤90天）处理流程

- **Priority**: P1
- **Requirements**: REQ-004, REQ-011
- **Persona**: arrears_user
- **Turns**:
  1. "我手机停机了，是不是欠费了？"
- **Assertions**:
  - `tool_called`: query_subscriber
  - `response_mentions_any`: 欠费, 充值
  - `contains`: 30分钟内自动恢复

### TC-005: 申请电子发票-已缴清账单

- **Priority**: P2
- **Requirements**: REQ-005, REQ-012
- **Turns**:
  1. "我想申请上个月的电子发票"
- **Assertions**:
  - `response_mentions_any`: APP, 自助, 开票
  - `not_contains`: 代为开具
- **Notes**: 验证引导用户通过 APP 自助操作，且未缴清时会先引导缴费

### TC-007: 话费异常偏高-涨幅>20%并定位原因

- **Priority**: P1
- **Requirements**: REQ-006, REQ-008, REQ-009, REQ-013, REQ-018
- **Turns**:
  1. "这个月话费怎么突然变高了？比上个月贵了好多"
- **Assertions**:
  - `tool_called`: analyze_bill_anomaly
  - `response_mentions_any`: summary, changed_items_text
  - `response_mentions_any`: 流量超额, 增值业务, 漫游
- **Notes**: 验证直接复述 analyze_bill_anomaly 返回的 summary 和 changed_items_text，并定位具体原因

### TC-008: 账单对比-明确要求对比本月与上月

- **Priority**: P2
- **Requirements**: REQ-006, REQ-008, REQ-009, REQ-018
- **Turns**:
  1. "帮我对比一下本月和上个月的账单，哪项变高了"
- **Assertions**:
  - `tool_called`: analyze_bill_anomaly
  - `response_mentions_all`: 项目名, 上月金额, 本月金额, 变化金额

## Edge Case Tests

### TC-011: 账单对比-工具调用失败 fallback

- **Priority**: P2
- **Requirements**: REQ-016
- **Turns**:
  1. "帮我对比本月和上个月的账单"
- **Assertions**:
  - `not_contains`: 从 ¥
  - `contains`: 无法准确定位具体项目变化
- **Notes**: 模拟工具失败场景，验证使用 fallback 话术，禁止猜测具体变化金额

## Error Tests

### TC-006: 超出技能范围的请求

- **Priority**: P3
- **Requirements**: REQ-001
- **Turns**:
  1. "帮我办理宽带安装"
- **Assertions**:
  - `tool_not_called`: get_bill_context
  - `response_mentions_any`: 抱歉, 无法, 其他, 转
- **Notes**: 验证不在技能范围内的请求不会误触发账单工具

### TC-009: 不认可异常分析结果-升级投诉

- **Priority**: P2
- **Requirements**: REQ-014
- **Turns**:
  1. "这个月话费怎么突然变高了？"
  2. "你说的流量超额不对，我没用那么多流量，我不认可"
- **Assertions**:
  - `response_mentions_any`: 10086, 投诉, 热线
- **Notes**: 多轮对话：用户不认可分析结果，应升级至10086投诉热线

## State Tests

### TC-010: 任意节点要求转人工

- **Priority**: P2
- **Requirements**: REQ-015
- **Turns**:
  1. "帮我查一下这个月的话费"
  2. "还是转人工吧"
- **Assertions**:
  - `response_mentions_any`: 10086, 人工客服, 拨打

## Coverage Matrix

| Requirement | Covered By |
|-------------|------------|
| REQ-001 | TC-001, TC-006 |
| REQ-002 | TC-001, TC-002 |
| REQ-003 | TC-003 |
| REQ-004 | TC-004 |
| REQ-005 | TC-005 |
| REQ-006 | TC-007, TC-008 |
| REQ-007 | TC-001, TC-002, TC-003 |
| REQ-008 | TC-007, TC-008 |
| REQ-009 | TC-007, TC-008 |
| REQ-010 | TC-001, TC-002, TC-003 |
| REQ-011 | TC-004 |
| REQ-012 | TC-005 |
| REQ-013 | TC-007 |
| REQ-014 | TC-009 |
| REQ-015 | TC-010 |
| REQ-016 | TC-011 |
| REQ-017 | TC-003 |
| REQ-018 | TC-007, TC-008 |
