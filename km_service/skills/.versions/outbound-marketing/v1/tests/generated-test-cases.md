# 测试用例 — outbound-marketing v1

> 自动生成于 2026-04-02T10:30:59.087Z | source_checksum: `29554731e3c66b38` | generator: v1.1

## Overview

- 需求数: 20
- 用例数: 11
- 分类: functional(6) / edge(2) / error(3) / state(0)

## Requirements

- **REQ-001** [frontmatter]: 系统应在营销任务平台下发任务时加载外呼营销技能，并使用注入的客户信息和目标套餐进行主动外呼
- **REQ-002** [trigger]: 外呼前必须已注入客户姓名、性别、当前套餐、目标套餐、话术模板等上下文数据
- **REQ-003** [workflow]: 拨打电话前必须检查 allowed_hours、max_retry 和 DND 名单，任一不合规则延后或终止任务
- **REQ-004** [workflow]: 呼叫未接通、忙线或语音信箱时，应记录为 no_answer 并结束通话
- **REQ-005** [workflow]: 开场白必须包含自我介绍、录音告知、身份确认（使用已知姓名）和征得客户同意继续介绍
- **REQ-006** [workflow]: 若接听者非本人，应记录为 wrong_number 并礼貌结束
- **REQ-007** [workflow]: 客户明确拒绝后不得继续推销，应立即记录为 not_interested 并道谢结束
- **REQ-008** [workflow]: 客户表示没时间或需要考虑时，应询问回访时间并进入待回访流程
- **REQ-009** [workflow]: 方案介绍应基于目标套餐，突出不超过两个核心卖点，并结合客户当前套餐痛点
- **REQ-010** [workflow]: 客户对其他套餐感兴趣时，应切换 target_plan 并重新介绍新套餐
- **REQ-011** [workflow]: 针对价格、合约、够用等异议，应按话术手册进行针对性回应
- **REQ-012** [workflow]: 客户要求转人工时，应立即调用 transfer_to_human 转接坐席
- **REQ-013** [workflow]: 客户同意办理后，需再次确认意愿，确认后并行发送套餐短信并记录 converted 结果
- **REQ-014** [workflow]: 客户要求不再来电或删除营销名单时，应记录为 dnd 并从名单移除
- **REQ-015** [workflow]: 客户情绪激烈、质疑合法性或有投诉意向时，应立即转接人工
- **REQ-016** [tool]: 所有通话结果（converted/callback/not_interested/no_answer/wrong_number/dnd）必须通过 record_marketing_result 工具准确记录
- **REQ-017** [tool]: 成交或待回访场景下，应调用 send_followup_sms 发送 plan_detail 类型短信
- **REQ-018** [compliance]: 禁止在客户明确拒绝后继续多轮推销，必须一次拒绝即收口
- **REQ-019** [compliance]: 禁止使用'已为您办理'等表述，因系统无直接开通工具，只能引导自助办理
- **REQ-020** [compliance]: 必须在 allowed_hours 允许时段内拨打电话，且遵守 max_retry 限制

## Functional Tests

### TC-001: 完整外呼流程：客户同意办理

- **Priority**: P1
- **Requirements**: REQ-001, REQ-002, REQ-005, REQ-009, REQ-013, REQ-016, REQ-017, REQ-019
- **Turns**:
  1. "（系统自动拨出）"
  2. "喂，你好"
  3. "好的，我愿意听一下"
  4. "听起来不错，可以办理"
  5. "确认办理"
- **Assertions**:
  - `contains`: 先生
  - `contains`: 录音
  - `contains`: 请问您是
  - `contains`: 方便占用您30秒
  - `not_contains`: 已为您办理
  - `tool_called`: record_marketing_result
  - `tool_called`: send_followup_sms
  - `response_mentions_any`: 短信, 查看, APP
- **Notes**: 核心主路径，覆盖开场、介绍、确认、成交全流程

### TC-002: 呼叫未接通或忙线

- **Priority**: P2
- **Requirements**: REQ-004, REQ-016
- **Turns**:
  1. "（系统自动拨出，未接通）"
- **Assertions**:
  - `tool_called`: record_marketing_result
  - `llm_rubric`: 系统应记录结果为 no_answer 并结束通话，不进行任何营销对话
- **Notes**: 模拟未接通场景，验证工具调用和流程终止

### TC-003: 接听者非本人

- **Priority**: P2
- **Requirements**: REQ-005, REQ-006, REQ-016
- **Turns**:
  1. "（系统自动拨出）"
  2. "喂，找谁？"
  3. "我不是张三"
- **Assertions**:
  - `contains`: 请问您是张三先生吗
  - `tool_called`: record_marketing_result
  - `response_mentions_any`: 打扰, 再见, 谢谢
- **Notes**: 验证身份确认和 wrong_number 记录

### TC-004: 客户明确拒绝后立即收口

- **Priority**: P1
- **Requirements**: REQ-007, REQ-016, REQ-018
- **Turns**:
  1. "（系统自动拨出）"
  2. "喂"
  3. "不需要，谢谢"
- **Assertions**:
  - `tool_called`: record_marketing_result
  - `not_contains`: 为什么
  - `not_contains`: 考虑一下
  - `response_mentions_any`: 感谢, 打扰, 再见
- **Notes**: 验证一次拒绝即结束，不进行异议处理

### TC-005: 客户表示需要考虑，进入待回访

- **Priority**: P2
- **Requirements**: REQ-008, REQ-016, REQ-017
- **Turns**:
  1. "（系统自动拨出）"
  2. "喂"
  3. "我现在没时间，晚点再说吧"
- **Assertions**:
  - `contains`: 请问您什么时候方便
  - `tool_called`: record_marketing_result
  - `tool_called`: send_followup_sms
- **Notes**: 验证 callback 流程触发

### TC-006: 客户对其他套餐感兴趣，切换推介

- **Priority**: P2
- **Requirements**: REQ-010
- **Turns**:
  1. "（系统自动拨出）"
  2. "喂"
  3. "好的"
  4. "我对你们那个5G畅享套餐更感兴趣"
- **Assertions**:
  - `contains`: 5G畅享
  - `contains`: 为您介绍
- **Notes**: 验证 target_plan 动态切换能力

## Edge Case Tests

### TC-007: 拨号时段不合规则，任务延后

- **Priority**: P2
- **Requirements**: REQ-003, REQ-020
- **Turns**:
  1. "（系统尝试在非 allowed_hours 时段拨出）"
- **Assertions**:
  - `tool_not_called`: record_marketing_result
  - `llm_rubric`: 系统不应拨打电话，任务应被延后或终止，无任何营销对话
- **Notes**: 边界测试：时段合规检查

### TC-008: 客户提出价格异议，按话术回应

- **Priority**: P2
- **Requirements**: REQ-011
- **Turns**:
  1. "（系统自动拨出）"
  2. "喂"
  3. "好的"
  4. "太贵了，能不能便宜点？"
- **Assertions**:
  - `response_mentions_any`: 性价比, 优惠, 活动
  - `not_contains`: 可以降价
- **Notes**: 验证异议处理符合话术手册

## Error Tests

### TC-009: 客户要求转人工

- **Priority**: P1
- **Requirements**: REQ-012
- **Turns**:
  1. "（系统自动拨出）"
  2. "喂"
  3. "我要转人工客服"
- **Assertions**:
  - `tool_called`: transfer_to_human
  - `response_mentions_any`: 正在为您转接, 请稍候
- **Notes**: 验证转人工触发

### TC-010: 客户要求不再来电，记录DND

- **Priority**: P2
- **Requirements**: REQ-014, REQ-016
- **Turns**:
  1. "（系统自动拨出）"
  2. "喂"
  3. "以后不要再打来了，把我从名单里删掉"
- **Assertions**:
  - `tool_called`: record_marketing_result
  - `response_mentions_any`: 已记录, 不再打扰, 谢谢
- **Notes**: 验证 DND 请求处理优先级

### TC-011: 客户情绪激烈，立即转人工

- **Priority**: P2
- **Requirements**: REQ-015
- **Turns**:
  1. "（系统自动拨出）"
  2. "又是推销电话？你们这是骚扰！我要投诉！"
- **Assertions**:
  - `tool_called`: transfer_to_human
  - `response_mentions_any`: 非常抱歉, 立即为您转接
- **Notes**: 验证情绪升级出口

## Coverage Matrix

| Requirement | Covered By |
|-------------|------------|
| REQ-001 | TC-001 |
| REQ-002 | TC-001 |
| REQ-003 | TC-007 |
| REQ-004 | TC-002 |
| REQ-005 | TC-001, TC-003 |
| REQ-006 | TC-003 |
| REQ-007 | TC-004 |
| REQ-008 | TC-005 |
| REQ-009 | TC-001 |
| REQ-010 | TC-006 |
| REQ-011 | TC-008 |
| REQ-012 | TC-009 |
| REQ-013 | TC-001 |
| REQ-014 | TC-010 |
| REQ-015 | TC-011 |
| REQ-016 | TC-001, TC-002, TC-003, TC-004, TC-005, TC-010 |
| REQ-017 | TC-001, TC-005 |
| REQ-018 | TC-004 |
| REQ-019 | TC-001 |
| REQ-020 | TC-007 |
