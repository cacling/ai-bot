import { describe, test, expect } from 'bun:test';
import { runValidation } from '../../../../../backend/skills/tech-skills/skill-creator-spec/scripts/run_validation.ts';
import type { DraftInput } from '../../../../../backend/skills/tech-skills/skill-creator-spec/scripts/types.ts';

const VALID_SKILL_MD = `---
name: test-skill
description: 测试技能，处理退订业务
metadata:
  version: "1.0.0"
  tags: ["cancel", "unsubscribe", "test"]
  mode: inbound
  trigger: user_intent
  channels: ["online", "voice"]
---
# 测试退订技能

你是一名电信业务专家。

## 触发条件

- 用户想退订

## 工具与分类

### 工具说明

- \`cancel_service(phone, service_id)\` — 退订

## 客户引导状态图

\`\`\`mermaid
stateDiagram-v2
    [*] --> 接收请求

    用户要求转人工 --> 转接10086: 引导拨打10086
    转接10086 --> [*]

    接收请求 --> 查询: query_subscriber(phone) %% tool:query_subscriber %% ref:policy.md#指引
    state 查询结果 <<choice>>
    查询 --> 查询结果
    查询结果 --> 执行退订: 成功 %% branch:standard_cancel
    查询结果 --> 失败: 异常
    失败 --> [*]

    执行退订 --> 反馈: cancel_service(phone, id) %% tool:cancel_service
    state 退订结果 <<choice>>
    反馈 --> 退订结果
    退订结果 --> 成功: ok
    退订结果 --> 退订失败: fail
    成功 --> [*]
    退订失败 --> [*]
\`\`\`

## 升级处理

| 升级路径 | 触发条件 | 处理方式 |
|---------|---------|---------|
| hotline | 退订失败 | 拨打10086 |

## 合规规则

- **禁止**：未确认就退订

## 回复规范

- 回复控制在 3 段以内
`;

describe('runValidation - 端到端', () => {
  test('完整正确的技能通过校验', () => {
    const input: DraftInput = {
      skill_name: 'test-skill',
      skill_md: VALID_SKILL_MD,
      references: [{ filename: 'policy.md' }],
      assets: [],
      registered_tools: ['query_subscriber', 'cancel_service'],
    };
    const result = runValidation(input);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('缺少 frontmatter 和章节时报多个 error', () => {
    const input: DraftInput = {
      skill_name: 'bad',
      skill_md: '# 没有 frontmatter 也没有章节',
      references: [],
      assets: [],
    };
    const result = runValidation(input);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(3);
  });
});
