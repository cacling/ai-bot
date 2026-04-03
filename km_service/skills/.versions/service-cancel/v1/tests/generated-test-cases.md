# 测试用例 — service-cancel v1

> 自动生成于 2026-04-02T10:18:29.422Z | source_checksum: `b60c1fff355e2632` | generator: v1.1

## Overview

- 需求数: 15
- 用例数: 12
- 分类: functional(5) / edge(1) / error(4) / state(2)

## Requirements

- **REQ-001** [frontmatter]: 技能应仅处理视频会员、短信包、流量包等增值业务的退订与误订退款，不处理主套餐变更或销户
- **REQ-002** [trigger]: 用户表达取消增值服务、发现不明扣费或声称误订时应触发本技能
- **REQ-003** [trigger]: 用户询问退订生效时间或本月费用处理方式时应进入退订流程
- **REQ-004** [workflow]: 系统应根据用户请求类型（标准退订、未知扣费、误订退款）进入对应处理分支
- **REQ-005** [tool]: 退订流程开始时应优先使用 get_cancel_context 一次性获取用户信息、套餐和账单上下文
- **REQ-006** [workflow]: 标准退订流程中，若用户未明确指定业务，应列出已订增值业务供用户选择
- **REQ-007** [workflow]: 退订操作前必须向用户说明：本月费用仍收取，退订次月1日生效，且操作不可撤回
- **REQ-008** [workflow]: 执行 cancel_service 前必须获得用户明确确认，禁止擅自退订
- **REQ-009** [workflow]: 未知扣费场景下，应先解释费用来源，再询问用户是否退订
- **REQ-010** [workflow]: 误订退款场景需查询订购时间，24小时内可申请全额退款，超时则按次月生效处理
- **REQ-011** [workflow]: 多业务退订时，每次只退订一个业务，反馈结果后再询问是否继续退订其他业务
- **REQ-012** [workflow]: 主套餐退订请求应引导用户前往营业厅或转至套餐查询技能
- **REQ-013** [workflow]: 工具调用失败时应提示用户稍后重试或拨打10086
- **REQ-014** [workflow]: 用户否认订购某项业务时应升级至人工核查
- **REQ-015** [workflow]: 退订成功后应告知业务名称和生效时间，并按模板格式回复

## Functional Tests

### TC-001: 标准退订流程-用户明确指定业务

- **Priority**: P1
- **Requirements**: REQ-001, REQ-002, REQ-004, REQ-005, REQ-007, REQ-008, REQ-015
- **Turns**:
  1. "我想退掉腾讯视频会员"
- **Assertions**:
  - `tool_called`: get_cancel_context
  - `tool_called`: cancel_service
  - `tool_called_before`: get_cancel_context, cancel_service
  - `contains`: 次月1日生效
  - `contains`: 腾讯视频会员
  - `not_contains`: 已退款
- **Notes**: 核心主路径：明确业务的标准退订

### TC-002: 未知扣费场景-先解释再退订

- **Priority**: P1
- **Requirements**: REQ-002, REQ-004, REQ-005, REQ-008, REQ-009
- **Turns**:
  1. "账单里有个不认识的费用，帮我看看是什么"
- **Assertions**:
  - `tool_called`: query_bill
  - `response_mentions_any`: 费用来源, 解释, 是什么
  - `not_contains`: 已为您退订
- **Notes**: 验证未知扣费先解释后退订的流程

### TC-003: 误订退款-24小时内申请

- **Priority**: P1
- **Requirements**: REQ-002, REQ-004, REQ-005, REQ-008, REQ-010
- **Turns**:
  1. "我不小心订了爱奇艺会员，刚订的能退吗"
- **Assertions**:
  - `tool_called`: query_subscriber
  - `response_mentions_any`: 24小时, 退款, 申请
  - `not_contains`: 已退款
- **Notes**: 验证误订退款规则和表述合规性

### TC-004: 询问退订生效时间

- **Priority**: P2
- **Requirements**: REQ-003, REQ-007, REQ-008
- **Turns**:
  1. "退订后这个月的钱还收吗？什么时候生效"
- **Assertions**:
  - `contains`: 本月费用仍收取
  - `contains`: 次月1日生效
  - `tool_not_called`: cancel_service
- **Notes**: 仅咨询不执行退订，验证信息说明完整性

### TC-005: 标准退订-未指定业务时列出选项

- **Priority**: P2
- **Requirements**: REQ-006, REQ-007, REQ-008
- **Turns**:
  1. "我想退订一些增值服务"
- **Assertions**:
  - `tool_called`: get_cancel_context
  - `response_mentions_any`: 以下, 已订, 选择
  - `tool_not_called`: cancel_service
- **Notes**: 验证未明确业务时正确列出选项

## Edge Case Tests

### TC-010: 模糊表达-口语化退订请求

- **Priority**: P3
- **Requirements**: REQ-002
- **Turns**:
  1. "那个视频会员不要了"
- **Assertions**:
  - `tool_called_any_of`: get_cancel_context, query_subscriber
  - `response_mentions_any`: 视频, 会员, 退订
- **Notes**: 验证模糊口语表达的意图识别

## Error Tests

### TC-007: 工具调用失败-系统异常

- **Priority**: P2
- **Requirements**: REQ-013
- **Turns**:
  1. "退订腾讯视频会员"
- **Assertions**:
  - `contains`: 稍后重试
  - `response_mentions_any`: 10086, 拨打
  - `tool_not_called`: cancel_service
- **Notes**: 模拟工具调用失败场景

### TC-008: 主套餐退订请求-正确引导

- **Priority**: P2
- **Requirements**: REQ-001, REQ-012
- **Turns**:
  1. "我要退订我的主套餐"
- **Assertions**:
  - `tool_not_called`: cancel_service
  - `response_mentions_any`: 营业厅, 身份证, 线下
  - `not_contains`: 退订成功
- **Notes**: 验证主套餐请求的边界处理

### TC-009: 否认订购-升级人工核查

- **Priority**: P2
- **Requirements**: REQ-014
- **Turns**:
  1. "帮我退订游戏加速包"
  2. "我没订过这个游戏加速包"
- **Assertions**:
  - `response_mentions_any`: 人工, 核查, 升级
  - `tool_not_called`: cancel_service
- **Notes**: 验证否认订购时的升级处理

### TC-011: 超出范围请求-宽带安装

- **Priority**: P3
- **Requirements**: REQ-001
- **Turns**:
  1. "帮我办理宽带安装"
- **Assertions**:
  - `tool_not_called`: get_cancel_context
  - `response_mentions_any`: 抱歉, 无法处理, 其他服务
- **Notes**: 验证完全无关请求的拒绝处理

## State Tests

### TC-006: 多业务退订-逐个处理

- **Priority**: P2
- **Requirements**: REQ-011, REQ-015
- **Turns**:
  1. "我要退订腾讯视频和爱奇艺会员"
  2. "先退腾讯视频"
  3. "好的，再退爱奇艺"
- **Assertions**:
  - `tool_called`: cancel_service
  - `llm_rubric`: 系统应分两次完成退订，每次退订后反馈结果并等待用户确认下一个
- **Notes**: 验证多业务退订的逐个处理机制

### TC-012: 用户中途取消退订

- **Priority**: P3
- **Requirements**: REQ-008
- **Turns**:
  1. "退订腾讯视频会员"
  2. "算了，不用退了"
- **Assertions**:
  - `tool_not_called`: cancel_service
  - `response_mentions_any`: 好的, 取消, 不再操作
- **Notes**: 验证用户取消确认后的终止行为

## Coverage Matrix

| Requirement | Covered By |
|-------------|------------|
| REQ-001 | TC-001, TC-008, TC-011 |
| REQ-002 | TC-001, TC-002, TC-003, TC-010 |
| REQ-003 | TC-004 |
| REQ-004 | TC-001, TC-002, TC-003 |
| REQ-005 | TC-001, TC-002, TC-003 |
| REQ-006 | TC-005 |
| REQ-007 | TC-001, TC-004, TC-005 |
| REQ-008 | TC-001, TC-002, TC-003, TC-004, TC-005, TC-012 |
| REQ-009 | TC-002 |
| REQ-010 | TC-003 |
| REQ-011 | TC-006 |
| REQ-012 | TC-008 |
| REQ-013 | TC-007 |
| REQ-014 | TC-009 |
| REQ-015 | TC-001, TC-006 |
