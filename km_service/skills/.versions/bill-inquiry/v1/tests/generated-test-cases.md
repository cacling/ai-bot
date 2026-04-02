# 测试用例 — bill-inquiry v1

> 自动生成于 2026-04-02T10:08:23.172Z | source_checksum: `323365130152a7f3` | generator: v1.1

## Overview

- 需求数: 18
- 用例数: 10
- 分类: functional(5) / edge(2) / error(3) / state(0)

## Requirements

- **REQ-001** [frontmatter]: 技能应在用户表达账单、欠费、发票或费用异常相关意图时被加载
- **REQ-002** [trigger]: 用户询问本月或上月话费金额时应触发账单查询流程
- **REQ-003** [trigger]: 用户对账单某项费用有疑问时应进入费用解读流程
- **REQ-004** [trigger]: 用户账号欠费停机时应提供欠费详情和充值指引
- **REQ-005** [trigger]: 用户申请电子发票时应引导至发票申请流程
- **REQ-006** [trigger]: 用户感觉话费异常偏高时应启动异常费用分析流程
- **REQ-007** [tool]: 系统应优先使用 get_bill_context 工具一次性获取完整账单上下文，减少多轮调用
- **REQ-008** [tool]: 当用户反映话费变高时，应优先调用 analyze_bill_anomaly 工具进行自动对比分析
- **REQ-009** [tool]: 回复中引用账单数据时必须基于工具返回的具体字段，禁止自行计算或捏造数字
- **REQ-010** [workflow]: 账单查询流程必须先确认用户身份再获取账单明细
- **REQ-011** [workflow]: 欠费处理流程应根据欠费天数区分普通欠费、预销号和号码已回收三种情况并给出对应指引
- **REQ-012** [workflow]: 发票申请流程必须确认账单已缴清后才能引导开票操作
- **REQ-013** [workflow]: 异常费用分析流程中，若涨幅超过20%应定位具体原因并提供解决方案
- **REQ-014** [workflow]: 异常费用分析中用户不认可解释时应升级至10086投诉热线
- **REQ-015** [workflow]: 任意节点用户要求转人工时应引导拨打10086
- **REQ-016** [workflow]: 账单对比模式必须满足数据完整性闸门才能输出具体金额变化
- **REQ-017** [workflow]: 账单对比模式中应优先复述 analyze_bill_anomaly 返回的 summary 和 changed_items_text 字段内容
- **REQ-018** [workflow]: 工具调用失败时应提示稍后重试或拨打10086，不得继续猜测或输出不完整数据

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

### TC-002: 费用疑问-解读具体扣费项

- **Priority**: P1
- **Requirements**: REQ-003, REQ-007, REQ-009, REQ-010
- **Turns**:
  1. "我账单里有个‘国际漫游流量费’50元，这是什么？"
- **Assertions**:
  - `tool_called`: get_bill_context
  - `contains`: 国际漫游流量费
  - `regex`: 50[\.0]*元
- **Notes**: 验证系统引用工具返回的具体项目名和金额，不捏造数据

### TC-003: 欠费停机-区分欠费类型并引导

- **Priority**: P1
- **Requirements**: REQ-004, REQ-007, REQ-010, REQ-011
- **Persona**: arrears_user
- **Turns**:
  1. "我手机停机了，是不是欠费了？"
- **Assertions**:
  - `tool_called`: get_bill_context
  - `response_mentions_any`: 欠费, 停机, 充值
  - `response_mentions_any`: APP, 官网, 营业厅
- **Notes**: 根据欠费天数区分处理，普通欠费引导自助充值

### TC-004: 发票申请-确认缴清后引导开票

- **Priority**: P2
- **Requirements**: REQ-005, REQ-012
- **Turns**:
  1. "我想开上个月的电子发票"
  2. "好的，我已经缴清了"
- **Assertions**:
  - `contains`: 发票
  - `response_mentions_any`: APP, 自助申请
  - `not_contains`: 代为开具
- **Notes**: 多轮确认已缴清，再引导自助开票

### TC-005: 话费异常偏高-启动 analyze_bill_anomaly 并复述结果

- **Priority**: P1
- **Requirements**: REQ-006, REQ-008, REQ-013, REQ-016, REQ-017
- **Turns**:
  1. "这个月话费怎么突然变高了？比上个月贵了好多"
- **Assertions**:
  - `tool_called`: analyze_bill_anomaly
  - `tool_called_before`: get_bill_context, analyze_bill_anomaly
  - `contains`: summary
  - `response_has_next_step`: 
- **Notes**: 进入账单对比模式，优先调用 analyze_bill_anomaly，复述 summary 和 changed_items_text

## Edge Case Tests

### TC-006: 模糊表达-口语化触发技能

- **Priority**: P2
- **Requirements**: REQ-001
- **Turns**:
  1. "话费多少啊"
- **Assertions**:
  - `tool_called_any_of`: get_bill_context, query_bill
  - `response_mentions_any`: 账单, 话费, 金额
- **Notes**: 极简口语输入，验证意图识别覆盖 REQ-001 的多种表述

### TC-007: 指定月份查询-上月账单

- **Priority**: P2
- **Requirements**: REQ-002
- **Turns**:
  1. "上个月的话费是多少？"
- **Assertions**:
  - `tool_called`: get_bill_context
  - `contains`: 上月

## Error Tests

### TC-008: 异常分析后用户不认可-升级投诉

- **Priority**: P2
- **Requirements**: REQ-014
- **Turns**:
  1. "这个月话费涨太多了"
  2. "你说的数据不对，我不认可"
- **Assertions**:
  - `response_mentions_any`: 10086, 投诉, 热线
  - `tool_not_called`: query_subscriber
- **Notes**: 用户不认可解释时，应升级至10086投诉热线

### TC-009: 任意节点要求转人工

- **Priority**: P2
- **Requirements**: REQ-015
- **Turns**:
  1. "我要转人工客服"
- **Assertions**:
  - `response_mentions_any`: 10086, 人工客服, 拨打
- **Notes**: 全局转人工条件，任意节点都应引导拨打10086

### TC-010: 工具调用失败-账单对比 fallback

- **Priority**: P3
- **Requirements**: REQ-016, REQ-018
- **Turns**:
  1. "帮我对比本月和上个月的话费变化"
- **Assertions**:
  - `tool_called`: analyze_bill_anomaly
  - `not_contains`: 从 ¥
  - `contains`: 无法准确定位
  - `response_mentions_any`: 稍后重试, 10086
- **Notes**: 模拟工具失败场景，验证不输出具体金额变化，使用 fallback 话术

## Coverage Matrix

| Requirement | Covered By |
|-------------|------------|
| REQ-001 | TC-001, TC-006 |
| REQ-002 | TC-001, TC-007 |
| REQ-003 | TC-002 |
| REQ-004 | TC-003 |
| REQ-005 | TC-004 |
| REQ-006 | TC-005 |
| REQ-007 | TC-001, TC-002, TC-003 |
| REQ-008 | TC-005 |
| REQ-009 | TC-002 |
| REQ-010 | TC-001, TC-002, TC-003 |
| REQ-011 | TC-003 |
| REQ-012 | TC-004 |
| REQ-013 | TC-005 |
| REQ-014 | TC-008 |
| REQ-015 | TC-009 |
| REQ-016 | TC-005, TC-010 |
| REQ-017 | TC-005 |
| REQ-018 | TC-010 |
