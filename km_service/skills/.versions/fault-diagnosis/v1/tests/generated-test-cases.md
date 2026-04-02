# 测试用例 — fault-diagnosis v1

> 自动生成于 2026-04-02T06:30:30.067Z | source_checksum: `633cb7bdfa23ee9f` | generator: v1.1

## Overview

- 需求数: 16
- 用例数: 10
- 分类: functional(4) / edge(1) / error(2) / state(3)

## Requirements

- **REQ-001** [frontmatter]: 技能应在用户表达网络故障意图（如无信号、网速骤降、通话中断、无法上网）时被加载
- **REQ-002** [frontmatter]: 技能不应处理长期流量不足或套餐限速问题，应引导至套餐查询技能
- **REQ-003** [trigger]: 用户反映最近突然变慢的网速问题应触发本技能，而非月底流量用尽导致的限速
- **REQ-004** [trigger]: 用户询问所在区域是否有基站故障应触发本技能
- **REQ-005** [workflow]: 系统应在【接收并诊断】状态立即调用 diagnose_network 工具进行预检，不得先反复追问故障细节
- **REQ-006** [workflow]: 根据 diagnose_network 返回的异常项，应准确进入对应的分支状态（如账号停机、流量耗尽、APN异常等）
- **REQ-007** [workflow]: 当用户描述模糊无法确定 issue_type 时，应先安抚并询问具体故障现象，再进行诊断
- **REQ-008** [workflow]: 在【APN异常】状态，应引导用户重置 APN 并询问操作后是否恢复
- **REQ-009** [workflow]: 在【用户自查】状态，应逐步引导用户执行单一操作（如确认飞行模式、插拔SIM卡、重启手机），每步后询问结果
- **REQ-010** [workflow]: 在【确认恢复】状态，应仅询问用户问题是否已解决，不得调用工具或提供新建议
- **REQ-011** [workflow]: 当 diagnose_network 调用失败时，应进入【诊断失败兜底】状态并建议转人工
- **REQ-012** [workflow]: 在【基站异常】状态，应告知用户需转人工提交工单，不得声称已提交工单或提供工单号
- **REQ-013** [workflow]: 任何状态下用户要求转人工时，应尊重意愿并转接人工客服或引导拨打10086
- **REQ-014** [tool]: 所有故障诊断结论必须基于 diagnose_network 工具返回的数据，不得凭空猜测
- **REQ-015** [workflow]: 当用户反馈问题已解决时，应进入【已解决】状态并礼貌结束对话
- **REQ-016** [workflow]: 当用户反馈问题未解决且满足升级条件（如基站故障、连续重启无效）时，应进入【升级处理】状态

## Functional Tests

### TC-001: 网速突然变慢-诊断后进入APN异常分支

- **Priority**: P1
- **Requirements**: REQ-001, REQ-003, REQ-005, REQ-006, REQ-014
- **Turns**:
  1. "最近两天网特别卡，刷视频都转圈，帮我看看怎么回事"
- **Assertions**:
  - `skill_loaded`: fault-diagnosis
  - `tool_called`: diagnose_network
  - `contains`: APN

### TC-002: 询问区域基站故障-进入基站异常并升级处理

- **Priority**: P1
- **Requirements**: REQ-001, REQ-004, REQ-006, REQ-012, REQ-016
- **Turns**:
  1. "我们这栋楼最近信号特别差，是不是附近基站坏了？"
- **Assertions**:
  - `tool_called`: diagnose_network
  - `response_mentions_all`: 基站, 覆盖, 人工
  - `not_contains`: 工单号
  - `not_contains`: 已提交

### TC-003: 无法上网-诊断后进入流量耗尽分支

- **Priority**: P2
- **Requirements**: REQ-001, REQ-005, REQ-006, REQ-014
- **Turns**:
  1. "手机有信号但上不了网，什么情况？"
- **Assertions**:
  - `tool_called`: diagnose_network
  - `contains`: 流量

### TC-004: 模糊描述故障-先澄清再诊断

- **Priority**: P2
- **Requirements**: REQ-007
- **Turns**:
  1. "网络有问题"
- **Assertions**:
  - `response_mentions_any`: 具体, 什么, 现象
  - `tool_not_called`: diagnose_network

## Edge Case Tests

### TC-008: 口语化表达网速慢-识别为突发故障

- **Priority**: P2
- **Requirements**: REQ-003
- **Turns**:
  1. "网好慢啊"
- **Assertions**:
  - `tool_called`: diagnose_network

## Error Tests

### TC-007: 月底限速问题-引导至套餐查询

- **Priority**: P2
- **Requirements**: REQ-002
- **Turns**:
  1. "每个月月底网速都特别慢，是不是被限速了？"
- **Assertions**:
  - `tool_not_called`: diagnose_network
  - `response_mentions_any`: 套餐, 流量, 查询

### TC-009: 诊断工具调用失败-兜底转人工

- **Priority**: P2
- **Requirements**: REQ-011
- **Turns**:
  1. "手机突然上不了网了"
- **Assertions**:
  - `contains`: 系统暂时无法获取诊断数据
  - `response_mentions_any`: 人工, 客服

## State Tests

### TC-005: APN异常-引导重置并确认恢复

- **Priority**: P1
- **Requirements**: REQ-008, REQ-010, REQ-015
- **Turns**:
  1. "最近两天网特别卡，刷视频都转圈，帮我看看怎么回事"
  2. "好的，我重置了APN，现在能上网了"
- **Assertions**:
  - `contains`: 请问问题现在解决了吗
  - `response_mentions_any`: 感谢, 配合, 再见

### TC-006: 用户自查-逐步引导并最终升级

- **Priority**: P2
- **Requirements**: REQ-009, REQ-010, REQ-016
- **Turns**:
  1. "手机突然没信号了"
  2. "飞行模式关着呢"
  3. "SIM卡也重新插了"
  4. "重启了还是没信号"
- **Assertions**:
  - `response_mentions_all`: 重启, 手机
  - `contains`: 请问问题现在解决了吗
  - `response_mentions_any`: 人工, 客服, 营业厅

### TC-010: 用户中途要求转人工

- **Priority**: P2
- **Requirements**: REQ-013
- **Turns**:
  1. "最近通话老是断线"
  2. "我不想自己弄了，直接转人工吧"
- **Assertions**:
  - `response_mentions_any`: 转接, 人工, 10086
  - `tool_not_called`: diagnose_network

## Coverage Matrix

| Requirement | Covered By |
|-------------|------------|
| REQ-001 | TC-001, TC-002, TC-003 |
| REQ-002 | TC-007 |
| REQ-003 | TC-001, TC-008 |
| REQ-004 | TC-002 |
| REQ-005 | TC-001, TC-003 |
| REQ-006 | TC-001, TC-002, TC-003 |
| REQ-007 | TC-004 |
| REQ-008 | TC-005 |
| REQ-009 | TC-006 |
| REQ-010 | TC-005, TC-006 |
| REQ-011 | TC-009 |
| REQ-012 | TC-002 |
| REQ-013 | TC-010 |
| REQ-014 | TC-001, TC-003 |
| REQ-015 | TC-005 |
| REQ-016 | TC-002, TC-006 |
