import { describe, test, expect } from 'bun:test';
import { validateRefs } from '../../../../../backend/skills/tech-skills/skill-creator-spec/scripts/validate_refs.ts';
import type { DraftInput } from '../../../../../backend/skills/tech-skills/skill-creator-spec/scripts/types.ts';

const SKILL_MD_WITH_REFS = `
\`\`\`mermaid
stateDiagram-v2
    [*] --> 查询: query_subscriber(phone) %% tool:query_subscriber %% ref:cancellation-policy.md#标准退订指引
    state R <<choice>>
    查询 --> R
    R --> 退订: 成功 %% ref:assets/cancel-result.md
    R --> 失败: 异常
    退订 --> [*]: cancel_service(phone, id) %% tool:cancel_service
    失败 --> [*]
\`\`\`
`;

describe('validateRefs', () => {
  test('ref 和 tool 都存在时无 error', () => {
    const input: DraftInput = {
      skill_name: 'test',
      skill_md: SKILL_MD_WITH_REFS,
      references: [{ filename: 'cancellation-policy.md' }],
      assets: [{ filename: 'cancel-result.md' }],
      registered_tools: ['query_subscriber', 'cancel_service'],
    };
    const checks = validateRefs(input);
    const errors = checks.filter(c => c.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('reference 文件缺失', () => {
    const input: DraftInput = {
      skill_name: 'test',
      skill_md: SKILL_MD_WITH_REFS,
      references: [], // 缺少 cancellation-policy.md
      assets: [{ filename: 'cancel-result.md' }],
      registered_tools: ['query_subscriber', 'cancel_service'],
    };
    const checks = validateRefs(input);
    expect(checks.some(c => c.rule === 'ref.file_missing' && c.message.includes('cancellation-policy.md'))).toBe(true);
  });

  test('asset 文件缺失', () => {
    const input: DraftInput = {
      skill_name: 'test',
      skill_md: SKILL_MD_WITH_REFS,
      references: [{ filename: 'cancellation-policy.md' }],
      assets: [], // 缺少 cancel-result.md
      registered_tools: ['query_subscriber', 'cancel_service'],
    };
    const checks = validateRefs(input);
    expect(checks.some(c => c.rule === 'ref.file_missing' && c.message.includes('cancel-result.md'))).toBe(true);
  });

  test('tool 未注册', () => {
    const input: DraftInput = {
      skill_name: 'test',
      skill_md: SKILL_MD_WITH_REFS,
      references: [{ filename: 'cancellation-policy.md' }],
      assets: [{ filename: 'cancel-result.md' }],
      registered_tools: ['query_subscriber'], // 缺少 cancel_service
    };
    const checks = validateRefs(input);
    expect(checks.some(c => c.rule === 'ref.tool_missing' && c.message.includes('cancel_service'))).toBe(true);
  });

  test('孤儿 reference', () => {
    const input: DraftInput = {
      skill_name: 'test',
      skill_md: SKILL_MD_WITH_REFS,
      references: [
        { filename: 'cancellation-policy.md' },
        { filename: 'orphan-doc.md' }, // 未被引用
      ],
      assets: [{ filename: 'cancel-result.md' }],
      registered_tools: ['query_subscriber', 'cancel_service'],
    };
    const checks = validateRefs(input);
    expect(checks.some(c => c.rule === 'ref.orphan_file' && c.message.includes('orphan-doc.md'))).toBe(true);
  });

  test('无 registered_tools 时跳过工具检查', () => {
    const input: DraftInput = {
      skill_name: 'test',
      skill_md: SKILL_MD_WITH_REFS,
      references: [{ filename: 'cancellation-policy.md' }],
      assets: [{ filename: 'cancel-result.md' }],
      // 不传 registered_tools
    };
    const checks = validateRefs(input);
    expect(checks.some(c => c.rule === 'ref.tool_missing')).toBe(false);
  });
});
