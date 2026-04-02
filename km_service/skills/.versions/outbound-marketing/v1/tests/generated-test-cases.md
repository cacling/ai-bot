# 测试用例 — outbound-marketing v1

> 自动生成于 2026-04-01T16:22:35.529Z | source_checksum: `29554731e3c66b38` | generator: v1.1

## Overview

- 需求数: 18
- 用例数: 11
- 分类: functional(6) / edge(3) / error(2) / state(0)

## Requirements

- **REQ-001** [frontmatter]: 技能应在营销任务平台下发外呼任务时被触发，主动拨打电话向客户推介套餐升级方案
- **REQ-002** [trigger]: 系统应基于任务注入的客户信息（姓名、性别、当前套餐、目标套餐等）个性化开场和推介
- **REQ-003** [workflow]: 拨号前必须检查 allowed_hours、max_retry 和 DND 名单，任一不合规则延后或终止任务
- **REQ-004** [workflow]: 呼叫未接通或进入语音信箱时，应记录为 no_answer 并按策略重试
- **REQ-005** [workflow]: 开场白必须包含自我介绍、录音告知、身份确认（使用已知姓名）和征得客户同意继续
- **REQ-006** [workflow]: 身份确认失败（非本人接听）时，应记录为 wrong_number 并结束通话
- **REQ-007** [workflow]: 客户初始意愿为拒绝时，应立即收口，不得进行多轮异议处理
- **REQ-008** [workflow]: 客户明确要求停止拨打或删除营销名单时，应优先处理 DND 请求并记录 dnd 结果
- **REQ-009** [workflow]: 方案介绍应基于目标套餐的核心卖点（≤2个），结合客户当前套餐痛点进行推介
- **REQ-010** [workflow]: 客户对其他套餐感兴趣时，应切换 target_plan 并重新介绍新套餐
- **REQ-011** [workflow]: 针对价格、合约、够用等异议，应提供针对性回应，并根据客户二次表态决定后续路径
- **REQ-012** [workflow]: 客户同意办理后，必须再次确认意愿，确认后再执行成交并行处理（发短信+记录结果）
- **REQ-013** [workflow]: 成交场景下，应并行发送套餐详情短信并记录 converted 结果，根据短信发送成功与否引导自助办理
- **REQ-014** [workflow]: 客户犹豫需考虑时，应确认回访时间，并并行发送短信和记录 callback 结果
- **REQ-015** [workflow]: 客户要求转人工或出现情绪激烈、投诉意向时，应立即调用 transfer_to_human 转接坐席
- **REQ-016** [tool]: 所有通话结果（converted/callback/not_interested/no_answer/wrong_number/dnd）必须通过 record_marketing_result 工具准确记录
- **REQ-017** [compliance]: 严禁在客户明确拒绝后继续推销，必须尊重用户意愿并礼貌结束
- **REQ-018** [compliance]: 严禁使用'已为您办理'等误导性表述，只能引导用户通过 APP 自助完成升级

## Functional Tests

### TC-001: 外呼营销-正常转化流程（含个性化开场与卖点推介）

- **Priority**: P1
- **Requirements**: REQ-001, REQ-002, REQ-005, REQ-009, REQ-016
- **Turns**:
  1. "你好，请问是张伟先生吗？我是电信智能服务机器人小通，来电是关于您当前套餐的升级优惠，通话可能会被录音，方便占用您30秒了解一下吗？"
  2. "好的，那我简单介绍一下：您现在用的是畅享39元套餐，本月流量经常超。我们为您推荐59元全家享套餐，包含30GB通用流量+300分钟通话，本月办理还送视频会员。您看这个方案可以吗？"
  3. "可以，我想办这个"
- **Assertions**:
  - `contains`: 张伟先生
  - `contains`: 录音
  - `contains`: 30GB
  - `tool_called`: record_marketing_result
  - `response_mentions_any`: 同意, 可以, 想办
- **Notes**: 核心主路径：个性化开场 → 卖点推介 → 同意意向

### TC-002: 客户初始拒绝-立即收口并记录

- **Priority**: P1
- **Requirements**: REQ-005, REQ-007, REQ-016, REQ-017
- **Turns**:
  1. "你好，请问是李芳女士吗？我是电信小通，来电介绍套餐升级优惠，通话可能被录音，方便听一下吗？"
  2. "不用了，我不需要"
- **Assertions**:
  - `tool_called`: record_marketing_result
  - `not_contains`: 但是
  - `not_contains`: 再考虑
  - `contains`: 感谢
  - `tool_not_called`: send_followup_sms
- **Notes**: 验证一次拒绝即收口，不进行异议处理，且不发短信

### TC-003: 客户对其他套餐感兴趣-切换目标重新介绍

- **Priority**: P2
- **Requirements**: REQ-010
- **Turns**:
  1. "……我们为您推荐59元全家享套餐……"
  2. "那个79元的套餐有什么？"
- **Assertions**:
  - `contains`: 79元
  - `contains`: 介绍
  - `response_has_next_step`: 
- **Notes**: 验证能根据客户兴趣动态切换 target_plan 并重新推介

### TC-004: 价格异议处理-针对性回应后客户转为同意

- **Priority**: P2
- **Requirements**: REQ-011
- **Turns**:
  1. "……59元全家享套餐……"
  2. "太贵了"
  3. "理解您的顾虑，其实对比您目前超套费用，这个套餐每月反而能省10元左右。而且首月免费体验，不满意可随时退订。您觉得这样可以接受吗？"
  4. "那行吧，试试看"
- **Assertions**:
  - `contains`: 省
  - `contains`: 首月免费
  - `response_mentions_any`: 试试, 可以, 同意

### TC-005: 客户同意办理-二次确认后成交并引导自助

- **Priority**: P1
- **Requirements**: REQ-012, REQ-013, REQ-016, REQ-018
- **Turns**:
  1. "……您看这个方案可以吗？"
  2. "可以"
  3. "好的，请问您确认要办理59元全家享套餐吗？"
  4. "确认"
- **Assertions**:
  - `tool_called`: send_followup_sms
  - `tool_called`: record_marketing_result
  - `not_contains`: 已为您办理
  - `contains`: 短信
  - `contains`: APP
- **Notes**: 验证二次确认、并行操作、禁止误导性表述

### TC-006: 客户犹豫需考虑-确认回访时间并发送短信

- **Priority**: P2
- **Requirements**: REQ-014, REQ-016
- **Turns**:
  1. "……您看这个方案可以吗？"
  2. "我得问问家人"
  3. "理解，那您希望我们什么时候再联系您呢？"
  4. "明天下午三点吧"
- **Assertions**:
  - `tool_called`: send_followup_sms
  - `tool_called`: record_marketing_result
  - `contains`: 明天下午三点
  - `contains`: 短信

## Edge Case Tests

### TC-007: 拨号时段不合规则-任务延后不拨打

- **Priority**: P2
- **Requirements**: REQ-003
- **Persona**: normal_user
- **Turns**:
  1. "（系统模拟当前时间为凌晨2点）"
- **Assertions**:
  - `tool_not_called`: mkt-dial
  - `llm_rubric`: 系统应识别当前不在 allowed_hours 范围内，不发起呼叫，任务进入延后队列
- **Notes**: 边界测试：时段检查失败，不拨号

### TC-008: 呼叫未接通-记录 no_answer 并准备重试

- **Priority**: P2
- **Requirements**: REQ-004, REQ-016
- **Turns**:
  1. "（系统模拟呼叫未接通）"
- **Assertions**:
  - `tool_called`: record_marketing_result
  - `llm_rubric`: 系统应记录结果为 no_answer，并按策略安排重试

### TC-009: 非本人接听-记录 wrong_number 并结束

- **Priority**: P2
- **Requirements**: REQ-006, REQ-016
- **Turns**:
  1. "你好，请问是王强先生吗？"
  2. "不是，你打错了"
- **Assertions**:
  - `tool_called`: record_marketing_result
  - `contains`: 抱歉
  - `not_contains`: 套餐

## Error Tests

### TC-010: 客户要求停止拨打-优先处理 DND 请求

- **Priority**: P1
- **Requirements**: REQ-008, REQ-016
- **Turns**:
  1. "……方便听一下吗？"
  2. "以后不要再打来了，把我从名单里删掉"
- **Assertions**:
  - `tool_called`: record_marketing_result
  - `contains`: 已记录
  - `contains`: 不再打扰
  - `not_contains`: 套餐
- **Notes**: DND 请求优先级最高，立即终止营销动作

### TC-011: 客户情绪激烈要求转人工-立即转接

- **Priority**: P1
- **Requirements**: REQ-015
- **Turns**:
  1. "……您看这个方案可以吗？"
  2. "你们天天打电话烦不烦！我要投诉！马上转人工！"
- **Assertions**:
  - `tool_called`: transfer_to_human
  - `not_contains`: 套餐
  - `contains`: 正在为您转接

## Coverage Matrix

| Requirement | Covered By |
|-------------|------------|
| REQ-001 | TC-001 |
| REQ-002 | TC-001 |
| REQ-003 | TC-007 |
| REQ-004 | TC-008 |
| REQ-005 | TC-001, TC-002 |
| REQ-006 | TC-009 |
| REQ-007 | TC-002 |
| REQ-008 | TC-010 |
| REQ-009 | TC-001 |
| REQ-010 | TC-003 |
| REQ-011 | TC-004 |
| REQ-012 | TC-005 |
| REQ-013 | TC-005 |
| REQ-014 | TC-006 |
| REQ-015 | TC-011 |
| REQ-016 | TC-001, TC-002, TC-005, TC-006, TC-008, TC-009, TC-010 |
| REQ-017 | TC-002 |
| REQ-018 | TC-005 |
