---
name: transfer-detection
description: 转人工话术检测规则，定义触发转人工流程的短语模式
metadata:
  version: "1.0.0"
  tags: ["transfer", "handoff", "detection"]
---
# 转人工检测 Skill

## 转人工触发短语

以下短语出现在机器人回复中时，表示机器人正在执行转人工操作，系统应触发转人工流程：

### 中文短语
- 转接人工
- 为您转接
- 转人工客服
- 正在为您转接

### 英文短语
- transferring you to a human
- transfer to human
- connecting you to an agent

## 转人工触发条件

以下情况必须调用 transfer_to_human 工具：

| 触发条件 | reason 值 | 说明 |
|---|---|---|
| 用户明确要求人工 | user_request | 用户说"转人工""我要找人工客服"等 |
| 连续两轮无法识别意图 | unrecognized_intent | 机器人无法理解用户需求 |
| 用户情绪激烈或投诉 | emotional_complaint | 用户愤怒、反复投诉 |
| 高风险操作需人工确认 | high_risk_operation | 销户、实名变更、大额退款、套餐降档 |
| 工具连续失败 | tool_failure | 同一工具连续失败两次 |
| 身份校验未通过 | identity_verify_failed | 无法核实用户身份 |
| 置信度不足 | low_confidence | 机器人对回答没有把握 |

## 检测策略

- 使用正则表达式匹配机器人的语音转写文本
- 中英文短语均需匹配（大小写不敏感）
- 匹配成功后触发转人工流程，防止重复触发
