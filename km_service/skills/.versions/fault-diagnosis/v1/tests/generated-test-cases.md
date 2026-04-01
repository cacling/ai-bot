# 测试用例 — fault-diagnosis v1

> 自动生成于 2026-03-31T16:12:04.896Z | source_checksum: `633cb7bdfa23ee9f` | generator: v1.1

## Overview

- 需求数: 12
- 用例数: 10
- 分类: functional(4) / edge(1) / error(2) / state(3)

## Requirements

- **REQ-001** [frontmatter]: 技能应在用户表达网络故障意图（如无信号、网速骤降、通话中断、无法上网）时被加载
- **REQ-002** [frontmatter]: 技能不应处理长期流量不足或套餐限速问题，此类请求应转至套餐查询技能
- **REQ-003** [trigger]: 用户反映最近突然网速变慢、无信号、通话中断或无法上网时应触发本技能
- **REQ-004** [trigger]: 当用户提到“网速慢”或“被限速”时，应先澄清是突发故障还是月底流量用尽，以决定是否继续本技能
- **REQ-005** [tool]: 系统应在【接收并诊断】状态立即调用 diagnose_network 工具进行预检，不得先反复追问故障细节
- **REQ-006** [workflow]: 根据 diagnose_network 返回的异常项（如账号停机、流量耗尽、APN异常、基站异常、网络拥塞等），应进入对应的处理状态
- **REQ-007** [workflow]: 若 diagnose_network 返回所有项正常，应进入【用户自查】状态，逐步引导用户执行自查步骤（每轮仅一个动作）
- **REQ-008** [workflow]: 在【确认恢复】状态，必须询问用户问题是否已解决，并根据回答决定进入【已解决】或【升级处理】
- **REQ-009** [workflow]: 涉及基站异常、SIM卡损坏、连续重启无效等场景时，应引导用户转人工或前往营业厅，不得承诺已提交工单
- **REQ-010** [workflow]: 若 diagnose_network 调用失败，应进入【诊断失败兜底】状态并建议转人工处理
- **REQ-011** [workflow]: 任何状态下用户主动要求转人工，应立即进入【转接人工】状态并提供人工客服路径
- **REQ-012** [workflow]: 每轮对话只能执行当前状态定义的操作，禁止合并多个步骤或提前透露后续流程

## Functional Tests

### TC-001: 突发无信号-正常诊断流程

- **Priority**: P1
- **Requirements**: REQ-001, REQ-003, REQ-005
- **Turns**:
  1. "我手机突然没信号了，完全打不了电话"
- **Assertions**:
  - `skill_loaded`: fault-diagnosis
  - `tool_called`: diagnose_network
  - `contains`: 抱歉
  - `contains`: 正在为您诊断
- **Notes**: 核心主路径：突发无信号触发技能并立即调用诊断工具

### TC-002: 网速骤降-诊断返回基站异常

- **Priority**: P1
- **Requirements**: REQ-001, REQ-003, REQ-005, REQ-006, REQ-009
- **Turns**:
  1. "最近两天网特别卡，刷视频都转圈，以前都好好的"
- **Assertions**:
  - `tool_called`: diagnose_network
  - `contains`: 基站
  - `response_mentions_any`: 转人工, 人工客服, 营业厅
- **Notes**: 诊断返回基站异常，应引导转人工而非承诺解决

### TC-003: 通话中断-诊断返回SIM卡问题

- **Priority**: P2
- **Requirements**: REQ-001, REQ-003, REQ-005, REQ-006, REQ-009, REQ-012
- **Turns**:
  1. "打电话老是断线，听不清对方说话"
- **Assertions**:
  - `tool_called`: diagnose_network
  - `contains`: SIM卡
  - `contains`: 营业厅
  - `not_contains`: 已提交工单
- **Notes**: 涉及SIM卡损坏需引导营业厅，且不得提及工单提交

### TC-004: 所有诊断项正常-进入用户自查流程

- **Priority**: P2
- **Requirements**: REQ-005, REQ-007, REQ-012
- **Turns**:
  1. "手机有信号但上不了网"
- **Assertions**:
  - `tool_called`: diagnose_network
  - `contains`: 飞行模式
  - `not_contains`: 重启
  - `not_contains`: 插拔SIM卡
- **Notes**: 首轮自查仅引导确认飞行模式，不合并后续步骤

## Edge Case Tests

### TC-006: 模糊网速慢-需澄清是否月底限速

- **Priority**: P2
- **Requirements**: REQ-004
- **Turns**:
  1. "我网速好慢，是不是被限速了？"
- **Assertions**:
  - `response_mentions_all`: 最近, 月底
  - `contains`: 突然变慢
  - `tool_not_called`: diagnose_network
- **Notes**: 需先澄清是突发故障还是套餐限速，再决定是否诊断

## Error Tests

### TC-007: 长期流量不足-应转套餐查询

- **Priority**: P2
- **Requirements**: REQ-002
- **Turns**:
  1. "每个月底都特别卡，流量不够用"
- **Assertions**:
  - `tool_not_called`: diagnose_network
  - `response_mentions_any`: 套餐, 流量包, plan-inquiry
- **Notes**: 明确属于套餐问题，不应触发故障诊断

### TC-009: 诊断工具调用失败-兜底转人工

- **Priority**: P2
- **Requirements**: REQ-010
- **Turns**:
  1. "突然上不了网了"
- **Assertions**:
  - `tool_not_called`: diagnose_network
  - `contains`: 无法获取诊断数据
  - `response_mentions_any`: 转人工, 人工客服
- **Notes**: 模拟诊断失败场景，应进入兜底状态

## State Tests

### TC-005: 确认恢复状态-用户反馈未解决

- **Priority**: P1
- **Requirements**: REQ-008, REQ-012
- **Turns**:
  1. "网速突然变慢了"
  2. "好的，我知道了"
- **Assertions**:
  - `contains`: 请问问题现在解决了吗
  - `tool_not_called`: diagnose_network
- **Notes**: 在【确认恢复】状态仅询问是否解决，不执行其他操作

### TC-008: 基站异常后升级处理-合规引导

- **Priority**: P2
- **Requirements**: REQ-009, REQ-012
- **Turns**:
  1. "附近都没信号，是不是基站坏了？"
  2. "是的，换了地方也没用"
- **Assertions**:
  - `contains`: 人工客服
  - `not_contains`: 已提交
  - `not_contains`: 工单号
- **Notes**: 基站问题必须引导转人工，且不得虚构工单信息

### TC-010: 任意状态用户要求转人工

- **Priority**: P1
- **Requirements**: REQ-011
- **Turns**:
  1. "网速慢"
  2. "直接转人工吧"
- **Assertions**:
  - `contains`: 10086
  - `response_mentions_any`: 转接, 人工客服
- **Notes**: 用户中途要求转人工，应立即终止流程并提供路径

## Coverage Matrix

| Requirement | Covered By |
|-------------|------------|
| REQ-001 | TC-001, TC-002, TC-003 |
| REQ-002 | TC-007 |
| REQ-003 | TC-001, TC-002, TC-003 |
| REQ-004 | TC-006 |
| REQ-005 | TC-001, TC-002, TC-003, TC-004 |
| REQ-006 | TC-002, TC-003 |
| REQ-007 | TC-004 |
| REQ-008 | TC-005 |
| REQ-009 | TC-002, TC-003, TC-008 |
| REQ-010 | TC-009 |
| REQ-011 | TC-010 |
| REQ-012 | TC-003, TC-004, TC-005, TC-008 |
