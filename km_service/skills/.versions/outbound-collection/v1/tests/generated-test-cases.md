# 测试用例 — outbound-collection v1

> 自动生成于 2026-04-01T01:18:55.720Z | source_checksum: `f99a7bb365032899` | generator: v1.1

## Overview

- 需求数: 18
- 用例数: 10
- 分类: functional(5) / edge(3) / error(2) / state(0)

## Requirements

- **REQ-001** [frontmatter]: 技能应在催收任务平台下发任务时被触发，主动外呼客户进行逾期账款提醒
- **REQ-002** [trigger]: 系统应基于任务注入的客户信息（姓名、性别、欠款金额、逾期天数等）直接开展催收对话，不得询问客户基础身份或欠款信息
- **REQ-003** [workflow]: 外呼前必须检查当前时间是否在 allowed_hours 允许拨打时段内，且未超过 max_retry 次数
- **REQ-004** [workflow]: 通话开始时必须告知客户本通话可能被录音，并使用已知姓名确认客户身份
- **REQ-005** [workflow]: 仅当客户确认是本人后，才可告知欠款详情并询问还款意向
- **REQ-006** [tool]: 系统应根据客户回复准确分类还款意向（ptp/callback/dispute/refusal/transfer/vulnerable 等）并执行对应处理流程
- **REQ-007** [workflow]: 承诺还款（ptp）必须同时满足两个条件：客户明确说出还款日期 + 明确口头承诺，方可记录为 ptp
- **REQ-008** [workflow]: 若客户承诺的还款日期超出 max_ptp_days 限制，应引导客户协商更近的日期；若无法达成一致，应转人工
- **REQ-009** [workflow]: 对特殊困难客户（如严重疾病、丧失劳动能力、机主已故、情绪极度脆弱），应立即停止施压并转人工
- **REQ-010** [workflow]: 客户要求不再来电（DND）时，必须记录 dnd 结果并从后续外呼名单中移除
- **REQ-011** [workflow]: 模糊意愿（如'最近''回头''晚点看看'）不得记录为 ptp，应追问具体日期或转为预约回呼
- **REQ-012** [workflow]: 每通电话最多只能提醒一次逾期后果，禁止在客户明确拒绝后反复施压
- **REQ-013** [workflow]: 任意节点若客户情绪激烈失控、威胁自伤或诉讼，应立即转人工
- **REQ-014** [workflow]: 通话结束前必须调用 record_call_result 工具记录最终结果
- **REQ-015** [workflow]: 非本人接听时，应记录 non_owner 并请对方转告机主，不得继续催收
- **REQ-016** [workflow]: PTP 成功确认后，应并行发送还款链接短信并记录承诺结果
- **REQ-017** [workflow]: 预约回呼场景下，应确认客户期望的回呼时间和号码，并创建回访任务
- **REQ-018** [compliance]: 严禁使用威胁、恐吓、侮辱性语言，或编造不实欠款信息

## Functional Tests

### TC-001: 承诺还款（PTP）- 正常流程

- **Priority**: P1
- **Requirements**: REQ-001, REQ-002, REQ-004, REQ-005, REQ-006, REQ-007, REQ-014, REQ-016
- **Turns**:
  1. "喂，你好"
  2. "是的，我是张伟"
  3. "这周五一定还"
- **Assertions**:
  - `contains`: 录音
  - `contains`: 张伟先生
  - `tool_called`: record_call_result
  - `tool_called`: send_followup_sms
  - `response_mentions_any`: 感谢, 还款, 链接
- **Notes**: 核心 PTP 流程：身份确认 → 明确承诺日期 → 记录 + 发短信

### TC-002: 非本人接听

- **Priority**: P2
- **Requirements**: REQ-002, REQ-004, REQ-005, REQ-014, REQ-015
- **Turns**:
  1. "喂？"
  2. "我不是张伟，他是我哥"
- **Assertions**:
  - `contains`: 录音
  - `contains`: 张伟先生
  - `tool_called`: record_call_result
  - `response_mentions_all`: 非本人, 转告, 机主

### TC-004: 明确拒绝后仅提醒一次后果

- **Priority**: P1
- **Requirements**: REQ-002, REQ-006, REQ-012, REQ-014, REQ-018
- **Turns**:
  1. "你好"
  2. "是我"
  3. "我不还，你们爱咋咋地"
- **Assertions**:
  - `tool_called`: record_call_result
  - `response_mentions_any`: 后果, 影响, 信用
  - `not_contains`: 再不还就
  - `not_contains`: 起诉
- **Notes**: 验证仅一次后果提醒，且无威胁性语言

### TC-005: 预约回呼 - 确认时间和号码

- **Priority**: P2
- **Requirements**: REQ-002, REQ-006, REQ-014, REQ-017
- **Turns**:
  1. "喂"
  2. "是的"
  3. "现在不方便，明天下午打我这个号就行"
- **Assertions**:
  - `tool_called`: create_callback_task
  - `tool_called`: record_call_result
  - `response_mentions_all`: 回呼, 时间, 号码

### TC-007: 客户要求不再来电（DND）

- **Priority**: P2
- **Requirements**: REQ-002, REQ-006, REQ-010, REQ-014
- **Turns**:
  1. "喂"
  2. "是我"
  3. "以后别再打了，我不想接催收电话"
- **Assertions**:
  - `tool_called`: record_call_result
  - `response_mentions_all`: 不再拨打, 移除, 名单

## Edge Case Tests

### TC-003: 模糊意愿 - 不记录为 PTP

- **Priority**: P2
- **Requirements**: REQ-002, REQ-006, REQ-011, REQ-014
- **Turns**:
  1. "喂"
  2. "是的"
  3. "最近手头紧，回头看看吧"
- **Assertions**:
  - `tool_called`: record_call_result
  - `not_contains`: 承诺
  - `response_mentions_any`: 回呼, 再联系, 方便时
- **Notes**: 验证模糊表达不会被误记为 PTP

### TC-008: 拨打时段外 - 任务延后

- **Priority**: P3
- **Requirements**: REQ-003, REQ-014
- **Turns**:
  1. "系统在非 allowed_hours 时段尝试外呼"
- **Assertions**:
  - `tool_not_called`: record_call_result
  - `response_mentions_any`: 时段, 暂不拨打, 稍后
- **Notes**: 模拟合规检查失败，任务应延后而非拨出

### TC-009: PTP 日期超限 - 协商失败转人工

- **Priority**: P2
- **Requirements**: REQ-002, REQ-006, REQ-008, REQ-014
- **Turns**:
  1. "你好"
  2. "是我"
  3. "下个月15号还"
  4. "不行，就那天，没得商量"
- **Assertions**:
  - `tool_called`: transfer_to_human
  - `response_mentions_any`: 超出, 协商, 人工
- **Notes**: max_ptp_days=7，客户承诺30天后，协商失败转人工

## Error Tests

### TC-006: 特殊困难客户 - 立即转人工

- **Priority**: P1
- **Requirements**: REQ-002, REQ-006, REQ-009, REQ-014, REQ-018
- **Turns**:
  1. "你好"
  2. "是我"
  3. "我刚做完癌症手术，实在没钱还了"
- **Assertions**:
  - `tool_called`: record_call_result
  - `tool_called`: transfer_to_human
  - `response_mentions_any`: 理解, 困难, 人工
  - `not_contains`: 必须还
- **Notes**: 验证对脆弱客户立即停止施压并转人工

### TC-010: 情绪激烈威胁诉讼 - 紧急转人工

- **Priority**: P1
- **Requirements**: REQ-002, REQ-006, REQ-013, REQ-014
- **Turns**:
  1. "喂！"
  2. "是我！"
  3. "再打我就去法院告你们骚扰！"
- **Assertions**:
  - `tool_called`: transfer_to_human
  - `response_mentions_any`: 人工, 坐席, 接管
- **Notes**: 任意节点触发情绪升级，立即转人工

## Coverage Matrix

| Requirement | Covered By |
|-------------|------------|
| REQ-001 | TC-001 |
| REQ-002 | TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-007, TC-009, TC-010 |
| REQ-003 | TC-008 |
| REQ-004 | TC-001, TC-002 |
| REQ-005 | TC-001, TC-002 |
| REQ-006 | TC-001, TC-003, TC-004, TC-005, TC-006, TC-007, TC-009, TC-010 |
| REQ-007 | TC-001 |
| REQ-008 | TC-009 |
| REQ-009 | TC-006 |
| REQ-010 | TC-007 |
| REQ-011 | TC-003 |
| REQ-012 | TC-004 |
| REQ-013 | TC-010 |
| REQ-014 | TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-007, TC-008, TC-009, TC-010 |
| REQ-015 | TC-002 |
| REQ-016 | TC-001 |
| REQ-017 | TC-005 |
| REQ-018 | TC-004, TC-006 |
