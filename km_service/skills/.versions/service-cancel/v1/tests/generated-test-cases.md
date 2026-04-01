# 测试用例 — service-cancel v1

> 自动生成于 2026-03-31T16:20:32.455Z | source_checksum: `b60c1fff355e2632` | generator: v1.1

## Overview

- 需求数: 18
- 用例数: 11
- 分类: functional(4) / edge(1) / error(4) / state(2)

## Requirements

- **REQ-001** [frontmatter]: 技能应在用户表达退订增值业务、处理未知扣费或误订退款意图时被加载
- **REQ-002** [frontmatter]: 技能不处理主套餐变更、销户、费用明细解读（无退订诉求）或App技术故障，应正确转向其他技能或渠道
- **REQ-003** [trigger]: 用户请求取消视频会员、短信包、流量包等增值业务时应触发标准退订流程
- **REQ-004** [trigger]: 用户发现账单中有不认识的扣费项并希望退订时应触发未知扣费流程
- **REQ-005** [trigger]: 用户声称误订某项业务并要求退款时应触发误订退款流程
- **REQ-006** [tool]: 退订流程开始时应优先使用 get_cancel_context 工具一次性获取用户信息、套餐和账单上下文
- **REQ-007** [tool]: 系统必须先查询用户已订业务或账单明细，再执行退订操作，不得擅自退订
- **REQ-008** [tool]: 执行 cancel_service 前必须获得用户明确确认，且每次仅调用一次该工具
- **REQ-009** [workflow]: 标准退订流程中，若用户未明确指定业务，应列出所有已订增值业务供用户选择
- **REQ-010** [workflow]: 退订前必须告知用户：本月费用仍正常收取，退订将于次月1日生效，且操作不可撤回
- **REQ-011** [workflow]: 未知扣费流程中，必须先解释每笔费用的来源和用途，再询问用户是否仍需退订
- **REQ-012** [workflow]: 误订退款流程中，需根据订购时间判断是否符合24小时内全额退款条件
- **REQ-013** [workflow]: 当用户否认订购某项业务（如'我没订过这个'）时，应升级至人工核查
- **REQ-014** [workflow]: 多业务退订时，每完成一个退订就反馈结果，并询问是否继续退订下一个
- **REQ-015** [workflow]: 当用户请求退订主套餐时，应引导其前往营业厅办理或转至套餐查询技能
- **REQ-016** [workflow]: 工具调用失败（如 query_subscriber 或 cancel_service 异常）时，应提示稍后重试或拨打10086
- **REQ-017** [workflow]: 用户取消退订操作或表示不再需要时，应礼貌结束对话
- **REQ-018** [workflow]: 退订成功后应按规范模板告知业务名称、生效时间及剩余可退订业务（如有）

## Functional Tests

### TC-001: 标准退订流程-用户明确指定业务

- **Priority**: P1
- **Requirements**: REQ-001, REQ-003, REQ-006, REQ-007, REQ-008, REQ-010, REQ-018
- **Turns**:
  1. "帮我退订腾讯视频会员"
- **Assertions**:
  - `tool_called`: get_cancel_context
  - `tool_called`: cancel_service
  - `tool_called_before`: get_cancel_context, cancel_service
  - `contains`: 次月1日生效
  - `contains`: 腾讯视频会员

### TC-002: 未知扣费流程-解释费用后退订

- **Priority**: P1
- **Requirements**: REQ-001, REQ-004, REQ-006, REQ-007, REQ-008, REQ-011
- **Turns**:
  1. "我账单里有个不认识的视频会员扣费，帮我看看是什么并退掉"
- **Assertions**:
  - `tool_called_any_of`: get_cancel_context, query_bill
  - `contains`: 视频会员
  - `response_mentions_any`: 来源, 用途, 订阅

### TC-003: 误订退款流程-24小时内申请

- **Priority**: P1
- **Requirements**: REQ-001, REQ-005, REQ-006, REQ-007, REQ-008, REQ-012
- **Turns**:
  1. "我不小心订了个流量包，刚订的，能退吗？"
- **Assertions**:
  - `tool_called`: get_cancel_context
  - `tool_called`: cancel_service
  - `response_mentions_any`: 退款, 原路退回, 1-3个工作日

### TC-004: 标准退订-未指定业务时列出选项

- **Priority**: P2
- **Requirements**: REQ-009, REQ-010
- **Turns**:
  1. "我想退订一些增值服务"
- **Assertions**:
  - `tool_called`: get_cancel_context
  - `response_mentions_any`: 以下, 列表, 可选
  - `contains`: 次月1日生效

## Edge Case Tests

### TC-009: 误订超24小时-无法退款但可退订

- **Priority**: P2
- **Requirements**: REQ-012
- **Turns**:
  1. "三天前不小心订了个短信包，现在能退钱吗？"
- **Assertions**:
  - `contains`: 本月费用不退
  - `contains`: 次月生效

## Error Tests

### TC-007: 请求退订主套餐-引导至营业厅

- **Priority**: P2
- **Requirements**: REQ-002, REQ-015
- **Turns**:
  1. "我要退订我的主套餐"
- **Assertions**:
  - `tool_not_called`: cancel_service
  - `response_mentions_any`: 营业厅, 身份证, 线下办理

### TC-008: 超出范围请求-App故障转技能

- **Priority**: P3
- **Requirements**: REQ-002
- **Turns**:
  1. "你们App打不开，一直闪退"
- **Assertions**:
  - `tool_not_called`: get_cancel_context
  - `response_mentions_any`: App, 技术, 故障

### TC-010: 否认订购-升级人工核查

- **Priority**: P2
- **Requirements**: REQ-013
- **Turns**:
  1. "我没订过这个视频会员，为什么扣我钱？"
- **Assertions**:
  - `tool_not_called`: cancel_service
  - `response_mentions_any`: 人工, 核查, 10086

### TC-011: 工具调用失败-提示重试或拨打10086

- **Priority**: P2
- **Requirements**: REQ-016
- **Turns**:
  1. "帮我退订流量包"
- **Assertions**:
  - `contains`: 稍后重试
  - `contains`: 10086
- **Notes**: 模拟 get_cancel_context 或 cancel_service 工具异常

## State Tests

### TC-005: 多业务退订-逐个确认并反馈

- **Priority**: P1
- **Requirements**: REQ-010, REQ-014, REQ-018
- **Turns**:
  1. "帮我退订腾讯视频和爱奇艺会员"
  2. "先退腾讯视频吧"
  3. "好的，再退爱奇艺"
- **Assertions**:
  - `tool_called`: cancel_service
  - `response_mentions_all`: 腾讯视频, 爱奇艺, 次月1日生效

### TC-006: 用户中途取消退订

- **Priority**: P2
- **Requirements**: REQ-017
- **Turns**:
  1. "我想退订视频会员"
  2. "算了，不用退了"
- **Assertions**:
  - `tool_not_called`: cancel_service
  - `response_mentions_any`: 好的, 再见, 随时

## Coverage Matrix

| Requirement | Covered By |
|-------------|------------|
| REQ-001 | TC-001, TC-002, TC-003 |
| REQ-002 | TC-007, TC-008 |
| REQ-003 | TC-001 |
| REQ-004 | TC-002 |
| REQ-005 | TC-003 |
| REQ-006 | TC-001, TC-002, TC-003 |
| REQ-007 | TC-001, TC-002, TC-003 |
| REQ-008 | TC-001, TC-002, TC-003 |
| REQ-009 | TC-004 |
| REQ-010 | TC-001, TC-004, TC-005 |
| REQ-011 | TC-002 |
| REQ-012 | TC-003, TC-009 |
| REQ-013 | TC-010 |
| REQ-014 | TC-005 |
| REQ-015 | TC-007 |
| REQ-016 | TC-011 |
| REQ-017 | TC-006 |
| REQ-018 | TC-001, TC-005 |
