# 测试用例 — service-cancel v1

> 自动生成于 2026-04-02T06:44:57.143Z | source_checksum: `b60c1fff355e2632` | generator: v1.1

## Overview

- 需求数: 16
- 用例数: 14
- 分类: functional(5) / edge(2) / error(3) / state(4)

## Requirements

- **REQ-001** [frontmatter]: 技能应仅处理视频会员、短信包、流量包等增值业务的退订与误订退款，不处理主套餐变更或销户
- **REQ-002** [trigger]: 用户表达取消增值服务、发现不明扣费或声称误订时应触发本技能
- **REQ-003** [trigger]: 用户询问退订生效时间或本月费用处理方式时应进入退订流程
- **REQ-004** [workflow]: 系统应根据用户请求类型（标准退订、未知扣费、误订退款）进入对应处理分支
- **REQ-005** [tool]: 退订流程开始时应优先使用 get_cancel_context 工具一次性获取用户完整上下文
- **REQ-006** [workflow]: 标准退订流程中，若用户未明确指定业务，应列出已订增值业务供用户选择
- **REQ-007** [workflow]: 执行退订前必须向用户说明退订影响（本月仍收费、次月1日生效、不可撤回）并获得确认
- **REQ-008** [workflow]: 未知扣费场景下，应先解释费用来源再询问是否退订，不得直接引导取消
- **REQ-009** [workflow]: 误订退款场景需确认订购时间，24小时内可申请全额退款，超过24小时则按次月生效处理
- **REQ-010** [workflow]: 主套餐退订请求应引导用户前往营业厅或转至套餐查询技能，不得通过本技能处理
- **REQ-011** [workflow]: 多业务退订时应逐个处理，每次只调用一次 cancel_service，等待结果后再处理下一个
- **REQ-012** [workflow]: 用户否认订购某项业务时应升级核查，不得直接执行退订
- **REQ-013** [workflow]: 工具调用失败时应提示用户稍后重试或拨打10086
- **REQ-014** [workflow]: 用户要求转人工时应引导拨打10086
- **REQ-015** [compliance]: 禁止未经用户明确确认擅自执行退订操作
- **REQ-016** [compliance]: 退款表述必须符合政策规范，不得承诺具体退款金额或时效，需说明需人工审核

## Functional Tests

### TC-001: 标准退订流程-用户明确指定业务

- **Priority**: P1
- **Requirements**: REQ-001, REQ-002, REQ-004, REQ-005
- **Turns**:
  1. "帮我退订腾讯视频会员"
- **Assertions**:
  - `tool_called`: get_cancel_context
  - `contains`: 腾讯视频
  - `response_mentions_any`: 本月, 次月, 生效

### TC-002: 未知扣费场景-先解释费用来源再询问退订

- **Priority**: P1
- **Requirements**: REQ-002, REQ-004, REQ-005, REQ-008
- **Turns**:
  1. "账单里有个不认识的视频会员扣费，帮我看看是什么"
- **Assertions**:
  - `tool_called`: query_bill
  - `contains`: 费用来源
  - `not_contains`: 直接退订

### TC-003: 误订退款-24小时内申请全额退款

- **Priority**: P1
- **Requirements**: REQ-002, REQ-004, REQ-005, REQ-009, REQ-016
- **Turns**:
  1. "我刚不小心订了个流量包，现在就想退，能退款吗？"
- **Assertions**:
  - `tool_called`: query_subscriber
  - `contains`: 人工审核
  - `not_contains`: 已退款

### TC-004: 询问退订生效时间-进入退订流程

- **Priority**: P2
- **Requirements**: REQ-003
- **Turns**:
  1. "退订视频会员后什么时候生效？这个月的钱还能退吗？"
- **Assertions**:
  - `contains`: 次月1日生效
  - `contains`: 本月仍收费

### TC-005: 标准退订-未明确业务时列出已订列表

- **Priority**: P2
- **Requirements**: REQ-006
- **Turns**:
  1. "我想退订一个增值服务"
- **Assertions**:
  - `tool_called`: query_subscriber
  - `response_mentions_any`: 腾讯视频, 爱奇艺, 流量包, 短信包

## Edge Case Tests

### TC-008: 未知扣费-用户要求直接退订但系统先解释

- **Priority**: P2
- **Requirements**: REQ-008, REQ-015
- **Turns**:
  1. "那个不认识的扣费直接给我退掉！"
- **Assertions**:
  - `contains`: 先为您说明这笔费用的来源
  - `tool_not_called`: cancel_service

### TC-009: 误订超24小时-无法退款但可次月生效

- **Priority**: P2
- **Requirements**: REQ-009, REQ-016
- **Turns**:
  1. "三天前误订的视频会员能退款吗？"
- **Assertions**:
  - `contains`: 本月费用不退
  - `contains`: 需人工审核

## Error Tests

### TC-011: 用户否认订购-升级核查不直接退订

- **Priority**: P2
- **Requirements**: REQ-012
- **Turns**:
  1. "我没订过这个视频会员，为什么在扣费？"
- **Assertions**:
  - `tool_not_called`: cancel_service
  - `response_mentions_any`: 升级核查, 安全团队

### TC-012: 主套餐退订请求-引导至营业厅或套餐查询

- **Priority**: P2
- **Requirements**: REQ-001, REQ-010
- **Turns**:
  1. "我想退订我的主套餐"
- **Assertions**:
  - `tool_not_called`: cancel_service
  - `response_mentions_any`: 营业厅, 套餐查询

### TC-013: 工具调用失败-提示重试或拨打10086

- **Priority**: P3
- **Requirements**: REQ-013
- **Turns**:
  1. "退订流量包"
- **Assertions**:
  - `contains`: 稍后重试
  - `contains`: 10086
- **Notes**: 模拟工具调用失败场景

## State Tests

### TC-006: 退订前确认影响-用户确认后执行

- **Priority**: P1
- **Requirements**: REQ-007, REQ-015
- **Turns**:
  1. "退订爱奇艺会员"
  2. "好的，我知道了，确认退订"
- **Assertions**:
  - `tool_called`: cancel_service
  - `contains`: 不可撤回

### TC-007: 退订前确认影响-用户拒绝后终止

- **Priority**: P2
- **Requirements**: REQ-007, REQ-015
- **Turns**:
  1. "退订游戏加速包"
  2. "算了，我不退了"
- **Assertions**:
  - `tool_not_called`: cancel_service
  - `contains`: 尊重您的选择

### TC-010: 多业务退订-逐个处理并等待确认

- **Priority**: P2
- **Requirements**: REQ-011
- **Turns**:
  1. "我要退订腾讯视频和爱奇艺会员"
  2. "先退腾讯视频"
  3. "好的，再退爱奇艺"
- **Assertions**:
  - `tool_called`: cancel_service
  - `response_mentions_all`: 腾讯视频, 爱奇艺

### TC-014: 用户要求转人工-引导拨打10086

- **Priority**: P2
- **Requirements**: REQ-014
- **Turns**:
  1. "我要转人工客服"
- **Assertions**:
  - `response_mentions_any`: 10086, 人工客服

## Coverage Matrix

| Requirement | Covered By |
|-------------|------------|
| REQ-001 | TC-001, TC-012 |
| REQ-002 | TC-001, TC-002, TC-003 |
| REQ-003 | TC-004 |
| REQ-004 | TC-001, TC-002, TC-003 |
| REQ-005 | TC-001, TC-002, TC-003 |
| REQ-006 | TC-005 |
| REQ-007 | TC-006, TC-007 |
| REQ-008 | TC-002, TC-008 |
| REQ-009 | TC-003, TC-009 |
| REQ-010 | TC-012 |
| REQ-011 | TC-010 |
| REQ-012 | TC-011 |
| REQ-013 | TC-013 |
| REQ-014 | TC-014 |
| REQ-015 | TC-006, TC-007, TC-008 |
| REQ-016 | TC-003, TC-009 |
