# 测试用例 — fault-diagnosis v1

> 自动生成于 2026-04-02T10:10:26.633Z | source_checksum: `633cb7bdfa23ee9f` | generator: v1.1

## Overview

- 需求数: 18
- 用例数: 15
- 分类: functional(9) / edge(1) / error(2) / state(3)

## Requirements

- **REQ-001** [frontmatter]: 技能应在用户表达网络故障意图（如无信号、网速骤降、通话中断、无法上网）时被加载
- **REQ-002** [trigger]: 用户反映最近突然变慢的网速问题应触发本技能，而非套餐查询
- **REQ-003** [trigger]: 当用户描述'月底限速'或'流量用尽'等长期问题时，不应进入本技能，应转至套餐查询
- **REQ-004** [workflow]: 系统在接收用户故障描述后，应立即调用 diagnose_network 工具进行预诊断，不得先反复追问问题细节
- **REQ-005** [tool]: diagnose_network 工具必须根据用户描述准确映射 issue_type（no_signal / slow_data / call_drop / no_network）
- **REQ-006** [workflow]: 诊断结果中若账号状态为欠费停机，应进入【账号停机】状态并告知充值方式及恢复时间
- **REQ-007** [workflow]: 诊断结果中若流量已耗尽，应进入【流量耗尽】状态并推荐加油包或升级套餐
- **REQ-008** [workflow]: 诊断结果中若存在 APN 配置异常，应引导用户重置 APN 并等待操作反馈
- **REQ-009** [workflow]: 诊断结果中若基站信号异常，应说明需人工跟进，建议转人工提交工单，不得声称已提交或提供工单号
- **REQ-010** [workflow]: 诊断结果全部正常时，应进入【用户自查】状态，并逐步引导用户执行单一操作（如关飞行模式、插拔SIM卡、重启手机），每步确认结果
- **REQ-011** [workflow]: 在【确认恢复】状态，系统应仅询问'问题是否解决'，不得调用工具或给出新建议
- **REQ-012** [workflow]: 用户确认问题未解决或自查无效后，应进入【升级处理】状态，建议转人工或前往营业厅
- **REQ-013** [workflow]: diagnose_network 工具调用失败时，应进入【诊断失败兜底】状态，告知无法获取数据并建议转人工
- **REQ-014** [workflow]: 任何状态下用户要求转人工，应立即进入【转接人工】状态，尊重用户意愿
- **REQ-015** [compliance]: 系统不得在无 diagnose_network 诊断数据的情况下断言故障原因或给出结论性建议
- **REQ-016** [compliance]: 每轮对话只能执行一个操作步骤，不得合并多个引导动作到同一轮回复
- **REQ-017** [workflow]: 网络拥塞（高峰期）场景下，应说明原因并建议等待或切换 Wi-Fi，随后进入【确认恢复】
- **REQ-018** [boundary]: 当用户模糊描述'网速慢'时，系统应先澄清是'最近突然变慢'还是'月底限速'，再决定是否进入本技能

## Functional Tests

### TC-001: 网速突然变慢-正常诊断流程

- **Priority**: P1
- **Requirements**: REQ-001, REQ-002, REQ-004, REQ-005
- **Turns**:
  1. "最近两天网速特别慢，刷视频都卡"
- **Assertions**:
  - `skill_loaded`: fault-diagnosis
  - `tool_called`: diagnose_network
  - `contains`: 网速
  - `response_mentions_any`: 诊断, 检测, 查看

### TC-002: 无信号问题-触发 no_signal 类型

- **Priority**: P1
- **Requirements**: REQ-001, REQ-004, REQ-005
- **Turns**:
  1. "手机完全没有信号了，怎么办？"
- **Assertions**:
  - `tool_called`: diagnose_network
  - `contains`: 信号

### TC-003: 通话中断-触发 call_drop 类型

- **Priority**: P1
- **Requirements**: REQ-001, REQ-004, REQ-005
- **Turns**:
  1. "打电话老是掉线，听不清对方说话"
- **Assertions**:
  - `tool_called`: diagnose_network
  - `contains`: 通话

### TC-004: 模糊描述但可推断 issue_type-仍调用诊断

- **Priority**: P2
- **Requirements**: REQ-004, REQ-015
- **Turns**:
  1. "上不了网"
- **Assertions**:
  - `tool_called`: diagnose_network
  - `not_contains`: 是什么问题
  - `not_contains`: 请详细描述
- **Notes**: 验证即使描述简短，也直接诊断而非反复追问

### TC-007: 诊断结果为欠费停机

- **Priority**: P1
- **Requirements**: REQ-006
- **Persona**: arrears_user
- **Turns**:
  1. "手机突然不能上网了"
- **Assertions**:
  - `contains`: 欠费
  - `contains`: 充值
  - `contains`: 恢复时间

### TC-008: 诊断结果为流量耗尽

- **Priority**: P1
- **Requirements**: REQ-007
- **Turns**:
  1. "突然上不了网"
- **Assertions**:
  - `contains`: 流量已用完
  - `response_mentions_any`: 加油包, 套餐升级

### TC-009: APN配置异常-引导重置

- **Priority**: P1
- **Requirements**: REQ-008
- **Turns**:
  1. "有信号但上不了网"
- **Assertions**:
  - `contains`: APN
  - `contains`: 重置为默认
  - `response_has_next_step`: 

### TC-010: 基站信号异常-建议转人工

- **Priority**: P1
- **Requirements**: REQ-009
- **Turns**:
  1. "家里信号特别差，经常断"
- **Assertions**:
  - `contains`: 基站
  - `response_mentions_any`: 转人工, 提交工单
  - `not_contains`: 已提交工单
  - `not_contains`: 工单号

### TC-015: 网络拥塞-高峰期说明并建议等待

- **Priority**: P2
- **Requirements**: REQ-017
- **Turns**:
  1. "晚上七八点网特别卡"
- **Assertions**:
  - `contains`: 高峰期
  - `contains`: 网络拥塞
  - `response_mentions_any`: 等待, 切换 Wi-Fi

## Edge Case Tests

### TC-005: 模糊'网速慢'-需澄清是否突发

- **Priority**: P2
- **Requirements**: REQ-002, REQ-018
- **Turns**:
  1. "网速好慢"
- **Assertions**:
  - `contains`: 最近突然变慢
  - `contains`: 月底流量不够用
  - `tool_not_called`: diagnose_network
- **Notes**: 验证对模糊表述先澄清再决定是否进入技能

## Error Tests

### TC-006: 明确为月底限速-不应进入本技能

- **Priority**: P2
- **Requirements**: REQ-003, REQ-015
- **Turns**:
  1. "每个月底流量用完就限速，太慢了"
- **Assertions**:
  - `tool_not_called`: diagnose_network
  - `response_mentions_any`: 套餐, 流量包, plan-inquiry

### TC-013: diagnose_network 工具调用失败

- **Priority**: P2
- **Requirements**: REQ-013
- **Turns**:
  1. "手机没信号了"
- **Assertions**:
  - `contains`: 无法获取诊断数据
  - `response_mentions_any`: 转人工, 人工客服
- **Notes**: 模拟工具调用失败场景

## State Tests

### TC-011: 诊断全部正常-逐步引导用户自查

- **Priority**: P1
- **Requirements**: REQ-010, REQ-012, REQ-016
- **Turns**:
  1. "网速很慢"
  2. "飞行模式没开"
  3. "SIM卡拔了又插"
  4. "还是不行"
- **Assertions**:
  - `contains`: 重启手机
  - `response_has_next_step`: 
- **Notes**: 验证多轮自查，每轮只做一件事，最后进入升级处理

### TC-012: 确认恢复状态-仅询问是否解决

- **Priority**: P2
- **Requirements**: REQ-011, REQ-012
- **Turns**:
  1. "突然不能上网"
  2. "好的"
- **Assertions**:
  - `contains`: 问题现在解决了吗
  - `tool_not_called`: diagnose_network
  - `not_contains`: 建议
  - `not_contains`: 可以尝试

### TC-014: 任何状态下用户要求转人工

- **Priority**: P1
- **Requirements**: REQ-014
- **Turns**:
  1. "网速慢"
  2. "直接转人工吧"
- **Assertions**:
  - `response_mentions_any`: 转接人工, 10086
  - `tool_not_called`: diagnose_network

## Coverage Matrix

| Requirement | Covered By |
|-------------|------------|
| REQ-001 | TC-001, TC-002, TC-003 |
| REQ-002 | TC-001, TC-005 |
| REQ-003 | TC-006 |
| REQ-004 | TC-001, TC-002, TC-003, TC-004 |
| REQ-005 | TC-001, TC-002, TC-003 |
| REQ-006 | TC-007 |
| REQ-007 | TC-008 |
| REQ-008 | TC-009 |
| REQ-009 | TC-010 |
| REQ-010 | TC-011 |
| REQ-011 | TC-012 |
| REQ-012 | TC-011, TC-012 |
| REQ-013 | TC-013 |
| REQ-014 | TC-014 |
| REQ-015 | TC-004, TC-006 |
| REQ-016 | TC-011 |
| REQ-017 | TC-015 |
| REQ-018 | TC-005 |
