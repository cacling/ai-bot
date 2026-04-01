# 测试用例 — outbound-marketing v1

> 自动生成于 2026-04-01T01:27:16.955Z | source_checksum: `29554731e3c66b38` | generator: v1.1

## Overview

- 需求数: 15
- 用例数: 10
- 分类: functional(6) / edge(1) / error(2) / state(1)

## Requirements

- **REQ-001** [frontmatter]: 技能应在营销任务平台下发时被触发，用于主动外呼推介套餐升级方案
- **REQ-002** [trigger]: 通话开始前应已注入客户姓名、性别、当前套餐、目标套餐、话术模板等上下文数据
- **REQ-003** [workflow]: 拨号前必须检查 allowed_hours、max_retry 和 DND 名单，任一不合规则延后或终止任务
- **REQ-004** [workflow]: 客户接听后，应先自我介绍、告知录音、用已知姓名确认身份，再征得客户同意继续介绍
- **REQ-005** [workflow]: 客户明确拒绝后不得继续推销，应立即记录结果并礼貌结束
- **REQ-006** [workflow]: 客户表达异议（如价格贵、够用等）时，应进行针对性回应，并根据客户二次表态进入对应分支
- **REQ-007** [workflow]: 客户同意办理后，需再次确认意愿，确认后并行发送套餐短信并记录成交结果
- **REQ-008** [workflow]: 客户犹豫或需考虑时，应询问回访时间，并并行发送短信和记录待回访状态
- **REQ-009** [workflow]: 客户要求不再来电或删除营销名单时，应优先处理 DND 请求并从名单移除
- **REQ-010** [workflow]: 客户要求转人工或出现情绪激烈、投诉意向时，应立即调用 transfer_to_human 转接
- **REQ-011** [tool]: 所有通话结果（包括成交、回访、拒绝、未接等）必须通过 record_marketing_result 工具记录
- **REQ-012** [tool]: 成交或待回访场景下，应调用 send_followup_sms 发送套餐详情短信
- **REQ-013** [compliance]: 不得使用'已为您办理'等误导性表述，因系统无直接开通能力，只能引导自助办理
- **REQ-014** [workflow]: 客户对其他套餐感兴趣时，应切换 target_plan 并重新介绍新套餐
- **REQ-015** [workflow]: 非本人接听时，应记录为 wrong_number 并结束通话

## Functional Tests

### TC-001: 外呼营销完整主流程（客户同意）

- **Priority**: P1
- **Requirements**: REQ-001, REQ-002, REQ-004, REQ-007, REQ-011, REQ-012, REQ-013
- **Turns**:
  1. "您好，请问是张伟先生吗？我是电信智能服务机器人小通，本次通话可能会被录音。我们注意到您当前使用的是畅享套餐，今天来电是想为您介绍一个更划算的5G升级方案，方便占用您30秒了解一下吗？"
  2. "可以啊，你说说看。"
  3. "太好了！新套餐每月仅需59元，包含20GB流量和300分钟通话，比您现在的套餐多10GB流量……"
  4. "听起来不错，我办一个吧。"
  5. "感谢您的信任！为确认办理意愿，请问您确定要升级到这个59元5G套餐吗？"
- **Assertions**:
  - `contains`: 张伟先生
  - `contains`: 可能会被录音
  - `tool_called`: record_marketing_result
  - `tool_called`: send_followup_sms
  - `not_contains`: 已为您办理
  - `response_mentions_any`: 查看短信, 自助办理, APP
- **Notes**: 覆盖主路径：身份确认 → 同意 → 确认 → 成交记录+短信

### TC-002: 客户明确拒绝后立即结束

- **Priority**: P1
- **Requirements**: REQ-004, REQ-005, REQ-011
- **Turns**:
  1. "您好，请问是李芳女士吗？我是电信智能服务机器人小通，本次通话可能会被录音。我们注意到您当前使用的是青春卡，今天来电是想为您介绍一个流量更多的升级方案，方便占用您30秒了解一下吗？"
  2. "不用了，我不需要。"
- **Assertions**:
  - `tool_called`: record_marketing_result
  - `not_contains`: 但是
  - `not_contains`: 再考虑一下
  - `contains`: 感谢
- **Notes**: 验证一次拒绝即收口，不进行异议处理

### TC-003: 客户提出价格异议并最终仍拒绝

- **Priority**: P2
- **Requirements**: REQ-004, REQ-006, REQ-011
- **Turns**:
  1. "您好，请问是王强先生吗？……方便占用您30秒了解一下吗？"
  2. "可以。"
  3. "新套餐每月69元，包含30GB流量……"
  4. "69块太贵了，我现在的套餐才39块。"
  5. "理解您的顾虑！其实新套餐每GB流量成本更低，而且包含5G网络……"
  6. "还是算了，我觉得没必要。"
- **Assertions**:
  - `contains`: 理解您的顾虑
  - `tool_called`: record_marketing_result
  - `contains`: 感谢
- **Notes**: 覆盖异议处理分支：价格异议 → 回应 → 仍拒绝

### TC-005: 客户犹豫并约定回访时间

- **Priority**: P2
- **Requirements**: REQ-004, REQ-008, REQ-011, REQ-012
- **Turns**:
  1. "……方便占用您30秒了解一下吗？"
  2. "现在有点忙，晚点再说吧。"
  3. "好的！请问您希望我们什么时候再联系您比较方便呢？比如明天下午3点？"
- **Assertions**:
  - `tool_called`: record_marketing_result
  - `tool_called`: send_followup_sms
  - `contains`: 回访
- **Notes**: 覆盖待回访路径：询问时间 + 发短信 + 记录callback

### TC-006: 客户要求不再来电（DND请求）

- **Priority**: P2
- **Requirements**: REQ-004, REQ-009, REQ-011
- **Turns**:
  1. "……方便占用您30秒了解一下吗？"
  2. "以后不要再打来了，把我从你们营销名单里删掉！"
- **Assertions**:
  - `tool_called`: record_marketing_result
  - `contains`: 已记录您的要求
  - `contains`: 不再打扰
- **Notes**: DND请求优先级最高，立即处理并结束

### TC-009: 客户对其他套餐感兴趣并切换推介

- **Priority**: P2
- **Requirements**: REQ-014, REQ-004, REQ-011
- **Turns**:
  1. "……我们为您推荐59元5G套餐……"
  2. "这个我不感兴趣，你们有没有带国际漫游的套餐？"
- **Assertions**:
  - `contains`: 国际漫游
  - `tool_called_any_of`: record_marketing_result, send_followup_sms
- **Notes**: 验证 target_plan 切换后重新介绍

## Edge Case Tests

### TC-010: 非本人接听

- **Priority**: P2
- **Requirements**: REQ-004, REQ-015, REQ-011
- **Turns**:
  1. "您好，请问是赵敏女士吗？"
  2. "不是，你打错了。"
- **Assertions**:
  - `tool_called`: record_marketing_result
  - `contains`: 打扰了
- **Notes**: 验证 wrong_number 记录

## Error Tests

### TC-007: 客户要求转人工

- **Priority**: P2
- **Requirements**: REQ-004, REQ-010, REQ-011
- **Turns**:
  1. "……方便占用您30秒了解一下吗？"
  2. "我不想跟机器人聊，转人工！"
- **Assertions**:
  - `tool_called`: transfer_to_human
  - `tool_not_called`: record_marketing_result
- **Notes**: 转人工场景下不记录营销结果，由人工后续处理

### TC-008: 拨号前合规检查失败（时段不允许）

- **Priority**: P2
- **Requirements**: REQ-003, REQ-011
- **Persona**: normal_user
- **Turns**:
  1. "系统检测到当前时间为凌晨2点，不在允许拨打时段[8,21]内"
- **Assertions**:
  - `tool_not_called`: record_marketing_result
  - `tool_not_called`: send_followup_sms
  - `tool_not_called`: transfer_to_human
- **Notes**: 模拟拨前门控失败，任务延后，不产生任何工具调用

## State Tests

### TC-004: 客户同意办理后的确认与引导

- **Priority**: P1
- **Requirements**: REQ-007, REQ-011, REQ-012, REQ-013
- **Turns**:
  1. "……请问您确定要升级到这个59元5G套餐吗？"
  2. "确定。"
- **Assertions**:
  - `tool_called`: record_marketing_result
  - `tool_called`: send_followup_sms
  - `not_contains`: 已开通
  - `response_mentions_all`: 短信, 查看, 自助办理
- **Notes**: 聚焦确认后的行为：并行记录+发短信，且不误导

## Coverage Matrix

| Requirement | Covered By |
|-------------|------------|
| REQ-001 | TC-001 |
| REQ-002 | TC-001 |
| REQ-003 | TC-008 |
| REQ-004 | TC-001, TC-002, TC-003, TC-005, TC-006, TC-007, TC-009, TC-010 |
| REQ-005 | TC-002 |
| REQ-006 | TC-003 |
| REQ-007 | TC-001, TC-004 |
| REQ-008 | TC-005 |
| REQ-009 | TC-006 |
| REQ-010 | TC-007 |
| REQ-011 | TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-007, TC-008, TC-009, TC-010 |
| REQ-012 | TC-001, TC-004, TC-005 |
| REQ-013 | TC-001, TC-004 |
| REQ-014 | TC-009 |
| REQ-015 | TC-010 |
