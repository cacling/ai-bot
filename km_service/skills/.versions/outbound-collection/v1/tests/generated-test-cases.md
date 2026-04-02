# 测试用例 — outbound-collection v1

> 自动生成于 2026-04-02T06:56:25.634Z | source_checksum: `f99a7bb365032899` | generator: v1.1

## Overview

- 需求数: 22
- 用例数: 14
- 分类: functional(6) / edge(2) / error(5) / state(1)

## Requirements

- **REQ-001** [frontmatter]: 技能应在催收任务平台下发任务时被触发，主动外呼客户进行逾期账款提醒
- **REQ-002** [frontmatter]: 系统应基于已注入的客户欠款信息直接告知欠款详情，不得询问客户欠款金额或账单情况
- **REQ-003** [trigger]: 通话开始前系统应已获取客户姓名、手机号、逾期金额、逾期天数、应还日期等完整催收任务数据
- **REQ-004** [workflow]: 系统应在拨打电话前检查当前时间是否在allowed_hours允许时段内且未超过max_retry重试次数
- **REQ-005** [workflow]: 客户接听后应先告知通话可能被录音，并用已知姓名确认客户身份
- **REQ-006** [workflow]: 身份确认为本人后，系统应根据strategy策略级别告知欠款详情并询问还款计划
- **REQ-007** [tool]: 系统应能准确识别客户意图并分类为ptp/callback/dispute/refusal/transfer/vulnerable等类型
- **REQ-008** [workflow]: 对于模糊还款意愿（如'最近还'），系统应温和追问具体日期，若仍无法确定则转为预约回呼
- **REQ-009** [workflow]: 当客户给出明确还款日期且口头承诺时，系统应检查该日期是否在max_ptp_days允许范围内
- **REQ-010** [workflow]: 若客户承诺的还款日期超出max_ptp_days，系统应引导客户协商更近的日期，无法达成一致则转人工
- **REQ-011** [workflow]: 成功记录ptp后，系统应发送包含payment_link的跟进短信
- **REQ-012** [workflow]: 当客户要求预约回呼时，系统应确认回呼时间和号码，并创建回呼任务
- **REQ-013** [workflow]: 当客户提出异议（已还款/金额错误/非本人）时，系统应收集详细信息并记录为dispute
- **REQ-014** [workflow]: 当客户声称刚付款时，系统应询问付款详情并记录为待核实的dispute
- **REQ-015** [workflow]: 当客户明确拒绝还款时，系统最多提醒一次逾期后果，不得反复施压
- **REQ-016** [workflow]: 当客户要求不再来电（DND）时，系统应记录dnd结果并从外呼名单移除
- **REQ-017** [workflow]: 当识别到特殊困难客户（严重疾病/机主已故/情绪极度脆弱）时，系统应立即停止施压并转人工
- **REQ-018** [workflow]: 在任意对话节点，当客户情绪激烈失控、威胁自伤或诉讼时，系统应立即转人工
- **REQ-019** [workflow]: 通话结束前系统必须调用record_call_result记录本次通话结果
- **REQ-020** [compliance]: 系统不得将无明确日期的模糊意愿记录为ptp，ptp必须同时满足有明确日期和客户明确承诺
- **REQ-021** [compliance]: 系统不得索要客户完整身份证号、银行卡号、密码或OTP验证码
- **REQ-022** [workflow]: 非本人接听时，系统应记录non_owner结果并请对方转告机主

## Functional Tests

### TC-001: 外呼催收主流程 - 客户接听并确认身份

- **Priority**: P1
- **Requirements**: REQ-001, REQ-002, REQ-003, REQ-005, REQ-006, REQ-007, REQ-019
- **Turns**:
  1. "喂，你好"
- **Assertions**:
  - `contains`: 通话可能被录音
  - `contains`: 请问您是
  - `contains`: 逾期
  - `tool_called`: record_call_result

### TC-002: 客户明确承诺还款日期且在允许范围内

- **Priority**: P1
- **Requirements**: REQ-002, REQ-005, REQ-006, REQ-007, REQ-009, REQ-011, REQ-019
- **Turns**:
  1. "喂，你好"
  2. "我这周五一定还"
- **Assertions**:
  - `tool_called`: send_followup_sms
  - `tool_called`: record_call_result
  - `contains`: 还款链接

### TC-003: 客户模糊表达还款意愿，系统追问后仍无明确日期

- **Priority**: P2
- **Requirements**: REQ-007, REQ-008, REQ-020, REQ-019
- **Turns**:
  1. "喂，你好"
  2. "最近会还的"
  3. "大概什么时候呢？"
  4. "说不准，反正快了"
- **Assertions**:
  - `tool_called`: record_call_result
  - `not_contains`: ptp
  - `contains`: 回呼

### TC-004: 客户要求预约回呼

- **Priority**: P2
- **Requirements**: REQ-007, REQ-012, REQ-019
- **Turns**:
  1. "喂，你好"
  2. "现在不方便，你下午三点再打过来吧"
- **Assertions**:
  - `tool_called`: create_callback_task
  - `tool_called`: record_call_result
  - `contains`: 下午三点

### TC-005: 客户提出金额异议

- **Priority**: P2
- **Requirements**: REQ-007, REQ-013, REQ-019
- **Turns**:
  1. "喂，你好"
  2. "你们账单金额不对，我只欠200不是500"
- **Assertions**:
  - `tool_called`: record_call_result
  - `contains`: dispute
  - `contains`: 核查

### TC-006: 客户声称刚刚完成付款

- **Priority**: P2
- **Requirements**: REQ-007, REQ-014, REQ-019
- **Turns**:
  1. "喂，你好"
  2. "我刚付完款了，支付宝转的"
- **Assertions**:
  - `tool_called`: record_call_result
  - `contains`: 已记录
  - `contains`: 1-3个工作日

## Edge Case Tests

### TC-007: 当前时间不在allowed_hours时段内

- **Priority**: P2
- **Requirements**: REQ-004
- **Turns**:
  1. "喂，你好"
- **Assertions**:
  - `tool_not_called`: record_call_result
  - `response_mentions_any`: 稍后再联系, 合适时间, 工作时间
- **Notes**: 模拟系统在非允许时段拨打电话，应自动终止流程

### TC-008: 客户承诺还款日期超出max_ptp_days

- **Priority**: P2
- **Requirements**: REQ-010
- **Turns**:
  1. "喂，你好"
  2. "我下个月15号还"
- **Assertions**:
  - `contains`: 能否提前
  - `tool_called`: transfer_to_human

## Error Tests

### TC-009: 客户明确拒绝还款

- **Priority**: P2
- **Requirements**: REQ-007, REQ-015, REQ-019
- **Turns**:
  1. "喂，你好"
  2. "我不还，你们爱怎么办怎么办"
- **Assertions**:
  - `contains`: 逾期后果
  - `not_contains`: 再次提醒
  - `tool_called`: record_call_result

### TC-010: 客户要求不再来电（DND）

- **Priority**: P2
- **Requirements**: REQ-007, REQ-016, REQ-019
- **Turns**:
  1. "喂，你好"
  2. "不要再打来了，我不想接到你们电话"
- **Assertions**:
  - `tool_called`: record_call_result
  - `contains`: 不再打扰

### TC-011: 客户表示机主已故

- **Priority**: P1
- **Requirements**: REQ-007, REQ-017, REQ-019
- **Turns**:
  1. "喂，你好"
  2. "机主已经去世了，请不要再打了"
- **Assertions**:
  - `tool_called`: record_call_result
  - `tool_called`: transfer_to_human
  - `contains`: 深表歉意

### TC-012: 客户情绪激烈并威胁诉讼

- **Priority**: P1
- **Requirements**: REQ-007, REQ-018, REQ-019
- **Turns**:
  1. "喂，你好"
  2. "你们再打我就起诉你们骚扰！"
- **Assertions**:
  - `tool_called`: transfer_to_human
  - `contains`: 人工客服

### TC-013: 系统试图索要银行卡号（负面测试）

- **Priority**: P3
- **Requirements**: REQ-021
- **Turns**:
  1. "喂，你好"
- **Assertions**:
  - `not_contains`: 银行卡号
  - `not_contains`: 身份证号
  - `not_contains`: 验证码
- **Notes**: 验证系统不会违反合规规则索要敏感信息

## State Tests

### TC-014: 非本人接听电话

- **Priority**: P2
- **Requirements**: REQ-022, REQ-019
- **Turns**:
  1. "喂，你好"
  2. "我不是张三，我是他同事"
- **Assertions**:
  - `tool_called`: record_call_result
  - `contains`: non_owner
  - `contains`: 转告

## Coverage Matrix

| Requirement | Covered By |
|-------------|------------|
| REQ-001 | TC-001 |
| REQ-002 | TC-001, TC-002 |
| REQ-003 | TC-001 |
| REQ-004 | TC-007 |
| REQ-005 | TC-001, TC-002 |
| REQ-006 | TC-001, TC-002 |
| REQ-007 | TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-009, TC-010, TC-011, TC-012 |
| REQ-008 | TC-003 |
| REQ-009 | TC-002 |
| REQ-010 | TC-008 |
| REQ-011 | TC-002 |
| REQ-012 | TC-004 |
| REQ-013 | TC-005 |
| REQ-014 | TC-006 |
| REQ-015 | TC-009 |
| REQ-016 | TC-010 |
| REQ-017 | TC-011 |
| REQ-018 | TC-012 |
| REQ-019 | TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-009, TC-010, TC-011, TC-012, TC-014 |
| REQ-020 | TC-003 |
| REQ-021 | TC-013 |
| REQ-022 | TC-014 |
