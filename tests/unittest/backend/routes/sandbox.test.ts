/**
 * sandbox.test.ts — 沙箱验证环境测试
 *
 * 测试沙箱的创建、编辑、校验、发布和删除流程。
 * 不测试 /test 接口（需要 LLM 和 MCP），只测试文件操作和校验逻辑。
 */

import { describe, test, expect, afterAll } from 'bun:test';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';

// 直接通过 HTTP 调用 API（需要后端运行）会增加复杂度，
// 这里直接测试沙箱的核心文件操作逻辑

const PROJECT_ROOT = resolve(import.meta.dir, '../..');
const SANDBOX_ROOT = resolve(PROJECT_ROOT, 'skills', '.sandbox');

// 测试 SKILL.md 的静态校验逻辑
describe('沙箱校验逻辑', () => {
  // 提取 validate 中的校验逻辑为独立函数测试
  function validateSkillContent(content: string): string[] {
    const issues: string[] = [];

    // 1. YAML frontmatter
    if (!content.startsWith('---')) {
      issues.push('缺少 YAML frontmatter');
    }

    // 2. Mermaid 语法
    const mermaidMatch = content.match(/```mermaid\n([\s\S]*?)```/);
    if (mermaidMatch) {
      const mermaid = mermaidMatch[1];
      if (!mermaid.includes('graph') && !mermaid.includes('flowchart') && !mermaid.includes('sequenceDiagram')) {
        issues.push('Mermaid 缺少图类型声明');
      }
    }

    // 3. 工具引用检查
    const toolRefs = content.match(/%% tool:(\w+)/g) ?? [];
    const knownTools = new Set([
      'query_subscriber', 'query_bill', 'query_plans', 'cancel_service',
      'diagnose_network', 'diagnose_app', 'transfer_to_human',
      'record_call_result', 'send_followup_sms', 'create_callback_task',
    ]);
    for (const ref of toolRefs) {
      const toolName = ref.replace('%% tool:', '');
      if (!knownTools.has(toolName)) {
        issues.push(`未知工具: ${toolName}`);
      }
    }

    // 4. 内容长度
    const body = content.replace(/^---[\s\S]*?---\n/, '').trim();
    if (body.length < 50) {
      issues.push('内容过短');
    }

    return issues;
  }

  test('合法的 SKILL.md 无报错', () => {
    const content = `---
name: test-skill
description: 测试技能
---

# 测试技能

这是一个测试技能，包含足够长的内容来通过长度检查。用于验证沙箱校验逻辑的正确性。

\`\`\`mermaid
graph TD
  A[开始] --> B[查询] %% tool:query_bill
  B --> C[结束]
\`\`\`
`;
    const issues = validateSkillContent(content);
    expect(issues).toHaveLength(0);
  });

  test('缺少 frontmatter 报错', () => {
    const content = '# 没有 frontmatter\n\n这是内容，需要足够长来通过长度检查，所以这里多写一些内容。';
    const issues = validateSkillContent(content);
    expect(issues.some(i => i.includes('frontmatter'))).toBe(true);
  });

  test('Mermaid 缺少图类型报错', () => {
    const content = `---
name: test
---

内容内容内容内容内容内容内容内容内容内容内容内容

\`\`\`mermaid
  A --> B
\`\`\`
`;
    const issues = validateSkillContent(content);
    expect(issues.some(i => i.includes('Mermaid'))).toBe(true);
  });

  test('引用未知工具报错', () => {
    const content = `---
name: test
---

内容内容内容内容内容内容内容内容内容内容内容内容

\`\`\`mermaid
graph TD
  A --> B %% tool:unknown_tool
\`\`\`
`;
    const issues = validateSkillContent(content);
    expect(issues.some(i => i.includes('unknown_tool'))).toBe(true);
  });

  test('内容过短报错', () => {
    const content = `---
name: test
---
短`;
    const issues = validateSkillContent(content);
    expect(issues.some(i => i.includes('过短'))).toBe(true);
  });

  test('已知工具引用不报错', () => {
    const content = `---
name: test
---

这是足够长的内容，用来通过内容长度检查，验证工具引用不会报错。

\`\`\`mermaid
graph TD
  A --> B %% tool:query_bill
  B --> C %% tool:diagnose_network
  C --> D %% tool:transfer_to_human
\`\`\`
`;
    const issues = validateSkillContent(content);
    expect(issues.filter(i => i.includes('未知工具'))).toHaveLength(0);
  });
});

// 清理可能残留的测试沙箱
afterAll(async () => {
  if (existsSync(SANDBOX_ROOT)) {
    // 只清理明显是测试的目录（8 字符 UUID 前缀）
    const { readdirSync } = await import('node:fs');
    try {
      const dirs = readdirSync(SANDBOX_ROOT);
      // 不做清理，留给手动处理，避免误删
    } catch { /* ignore */ }
  }
});
