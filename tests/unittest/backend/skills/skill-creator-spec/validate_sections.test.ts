import { describe, test, expect } from 'bun:test';
import { validateSections, extractSections } from '../../../../../backend/skills/tech-skills/skill-creator-spec/scripts/validate_sections.ts';

const VALID_SKILL = `---
name: test-skill
description: 测试
---
# 测试技能

你是一名客服专家。

## 触发条件

- 用户想查询

## 工具与分类

### 工具说明

## 客户引导状态图

\`\`\`mermaid
stateDiagram-v2
\`\`\`

## 升级处理

| 升级路径 | 触发条件 | 处理方式 |

## 合规规则

- **禁止**：xxx

## 回复规范

- 回复控制在 3 段以内
`;

const MISSING_SECTIONS = `---
name: test-skill
description: 测试
---
# 测试技能

## 触发条件

## 客户引导状态图

## 回复规范
`;

const WRONG_ORDER = `---
name: test-skill
description: 测试
---
# 测试技能

角色定义。

## 合规规则

## 触发条件

## 工具与分类

## 客户引导状态图

## 升级处理

## 回复规范
`;

const NO_ROLE = `---
name: test-skill
description: 测试
---
# 测试技能

## 触发条件
`;

describe('extractSections', () => {
  test('提取所有 ## 级标题', () => {
    const sections = extractSections(VALID_SKILL);
    expect(sections.length).toBeGreaterThanOrEqual(6);
    expect(sections[0].title).toBe('触发条件');
  });
});

describe('validateSections', () => {
  test('完整正确的 SKILL 无 error', () => {
    const checks = validateSections(VALID_SKILL);
    const errors = checks.filter(c => c.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('缺少必要章节', () => {
    const checks = validateSections(MISSING_SECTIONS);
    const missing = checks.filter(c => c.severity === 'error' && c.rule.includes('_missing'));
    expect(missing.length).toBeGreaterThanOrEqual(3); // 缺 工具与分类、升级处理、合规规则
  });

  test('章节顺序错误', () => {
    const checks = validateSections(WRONG_ORDER);
    expect(checks.some(c => c.rule === 'sec.order_wrong')).toBe(true);
  });

  test('缺少角色定义', () => {
    const checks = validateSections(NO_ROLE);
    expect(checks.some(c => c.rule === 'sec.role_missing')).toBe(true);
  });
});
