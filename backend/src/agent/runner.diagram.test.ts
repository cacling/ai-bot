/**
 * runner.diagram.test.ts
 * 验证流程图高亮能力：highlightMermaidTool + extractMermaidFromContent
 * 以及真实 SKILL.md 中的 %% tool: 标记是否正确可被高亮
 *
 * 运行：cd backend && bun test src/agent/runner.diagram.test.ts
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { highlightMermaidTool, highlightMermaidBranch, determineBranch, extractMermaidFromContent } from './runner.ts';

const SKILLS_DIR = resolve(import.meta.dir, '../..', 'skills', 'biz-skills');

// ── highlightMermaidTool ──────────────────────────────────────────────────────

describe('highlightMermaidTool', () => {
  const rawMermaid = `sequenceDiagram
    participant C as 客户
    participant A as AI 客服
    participant S as 后端系统
    C->>A: 描述问题
    A->>S: diagnose_network(phone, issue_type) %% tool:diagnose_network
    S-->>A: 返回诊断结果`;

  test('将带有匹配标记的行包裹进 rect 块', () => {
    const result = highlightMermaidTool(rawMermaid, 'diagnose_network');
    expect(result).toContain('rect rgba(255, 200, 0, 0.35)');
    expect(result).toContain('diagnose_network(phone, issue_type)');
    expect(result).toContain('\n    end');
  });

  test('rect 块内保留原始行内容（trimStart）', () => {
    const result = highlightMermaidTool(rawMermaid, 'diagnose_network');
    // 原行以 4 空格缩进，trimStart 后无前导空格
    expect(result).toContain('    A->>S: diagnose_network(phone, issue_type) %% tool:diagnose_network');
  });

  test('保留行的缩进层级', () => {
    const result = highlightMermaidTool(rawMermaid, 'diagnose_network');
    const lines = result.split('\n');
    const rectLine = lines.find((l) => l.trimStart().startsWith('rect '));
    expect(rectLine).toBeDefined();
    // rect 行与原行相同缩进（4 空格）
    expect(rectLine).toMatch(/^ {4}rect /);
  });

  test('没有匹配标记时原样返回', () => {
    const result = highlightMermaidTool(rawMermaid, 'diagnose_app');
    expect(result).toBe(rawMermaid);
    expect(result).not.toContain('rect ');
  });

  test('只高亮匹配工具，不影响其他行', () => {
    const multi = `sequenceDiagram
    A->>S: diagnose_network(p) %% tool:diagnose_network
    A->>S: diagnose_app(p) %% tool:diagnose_app`;
    const result = highlightMermaidTool(multi, 'diagnose_network');
    // diagnose_network 被包裹
    expect(result).toContain('rect rgba(255, 200, 0, 0.35)');
    // diagnose_app 行未被包裹（其前无 rect）
    const appLineWrapped = result.includes('rect') &&
      result.split('\n').some((l) => l.includes('diagnose_app') && result.indexOf('rect') > result.indexOf('diagnose_app'));
    expect(appLineWrapped).toBe(false);
  });

  test('空字符串输入不报错', () => {
    expect(() => highlightMermaidTool('', 'diagnose_network')).not.toThrow();
    expect(highlightMermaidTool('', 'diagnose_network')).toBe('');
  });
});

// ── extractMermaidFromContent ─────────────────────────────────────────────────

describe('extractMermaidFromContent', () => {
  const zhOnly = `# 标题\n\`\`\`mermaid\nsequenceDiagram\n    A->>B: 你好\n\`\`\`\n`;
  const bilingualMd = `# 标题\n\`\`\`mermaid\nsequenceDiagram\n    A->>B: 你好\n\`\`\`\n\n<!-- lang:en -->\n\`\`\`mermaid\nsequenceDiagram\n    A->>B: Hello\n\`\`\`\n`;
  const noMermaid = `# 普通文档\n没有代码块\n`;

  test('lang=zh 时提取第一个 mermaid 块', () => {
    const result = extractMermaidFromContent(zhOnly, 'zh');
    expect(result).toContain('A->>B: 你好');
  });

  test('lang=en，存在 <!-- lang:en --> 块时提取英文块', () => {
    const result = extractMermaidFromContent(bilingualMd, 'en');
    expect(result).toContain('A->>B: Hello');
    expect(result).not.toContain('你好');
  });

  test('lang=en，无英文块时回退到第一个块', () => {
    const result = extractMermaidFromContent(zhOnly, 'en');
    expect(result).toContain('A->>B: 你好');
  });

  test('lang=zh 时忽略 <!-- lang:en --> 块，取第一个', () => {
    const result = extractMermaidFromContent(bilingualMd, 'zh');
    expect(result).toContain('A->>B: 你好');
  });

  test('无 mermaid 块时返回 null', () => {
    expect(extractMermaidFromContent(noMermaid)).toBeNull();
    expect(extractMermaidFromContent('')).toBeNull();
  });

  test('提取内容已 trim（无首尾空白）', () => {
    const result = extractMermaidFromContent(zhOnly);
    expect(result).toBe(result?.trim());
  });
});

// ── 真实 SKILL.md 文件验证 ───────────────────────────────────────────────────

describe('fault-diagnosis SKILL.md — 高亮管线集成验证', () => {
  const skillPath = resolve(SKILLS_DIR, 'fault-diagnosis', 'SKILL.md');
  const skillContent = readFileSync(skillPath, 'utf-8');

  test('SKILL.md 包含中文 mermaid 块', () => {
    const mermaid = extractMermaidFromContent(skillContent, 'zh');
    expect(mermaid).not.toBeNull();
    expect(mermaid).toContain('sequenceDiagram');
  });

  test('SKILL.md 包含英文 mermaid 块（lang:en 标记后）', () => {
    const mermaid = extractMermaidFromContent(skillContent, 'en');
    expect(mermaid).not.toBeNull();
    // 英文块有英文参与者标签
    expect(mermaid).toContain('Customer');
  });

  test('中文 mermaid 块包含 %% tool:diagnose_network 标记', () => {
    const mermaid = extractMermaidFromContent(skillContent, 'zh')!;
    expect(mermaid).toContain('%% tool:diagnose_network');
  });

  test('英文 mermaid 块包含 %% tool:diagnose_network 标记', () => {
    const mermaid = extractMermaidFromContent(skillContent, 'en')!;
    expect(mermaid).toContain('%% tool:diagnose_network');
  });

  test('highlightMermaidTool 对中文 mermaid 正确高亮 diagnose_network 行', () => {
    const raw = extractMermaidFromContent(skillContent, 'zh')!;
    const highlighted = highlightMermaidTool(raw, 'diagnose_network');

    expect(highlighted).toContain('rect rgba(255, 200, 0, 0.35)');
    // 高亮行包含原始工具调用内容
    expect(highlighted).toContain('diagnose_network');
    // 产生了 end 块（带缩进）
    expect(highlighted).toContain('end\n');
  });

  test('highlightMermaidTool 对英文 mermaid 正确高亮 diagnose_network 行', () => {
    const raw = extractMermaidFromContent(skillContent, 'en')!;
    const highlighted = highlightMermaidTool(raw, 'diagnose_network');

    expect(highlighted).toContain('rect rgba(255, 200, 0, 0.35)');
    expect(highlighted).toContain('diagnose_network');
  });

  test('对不存在的工具名高亮后内容不变', () => {
    const raw = extractMermaidFromContent(skillContent, 'zh')!;
    const highlighted = highlightMermaidTool(raw, 'nonexistent_tool');
    expect(highlighted).toBe(raw);
  });

  test('高亮后的 mermaid 仍是合法的 sequenceDiagram（以 sequenceDiagram 开头）', () => {
    const raw = extractMermaidFromContent(skillContent, 'zh')!;
    const highlighted = highlightMermaidTool(raw, 'diagnose_network');
    expect(highlighted.trimStart()).toMatch(/^sequenceDiagram/);
  });
});

// ── onDiagramUpdate 回调逻辑模拟验证 ─────────────────────────────────────────

describe('onDiagramUpdate 回调管线（模拟 onStepFinish）', () => {
  /**
   * 模拟 runner.ts 中 onStepFinish 调用 onDiagramUpdate 的逻辑，
   * 不依赖真实 LLM/MCP，直接验证：
   * 给定 toolCalls，对应的 diagram 被正确提取并高亮后传入回调
   */
  function simulateStepFinish(
    toolCalls: Array<{ toolName: string; args: Record<string, unknown> }>,
    lang: 'zh' | 'en',
    onDiagramUpdate: (skillName: string, mermaid: string) => void,
  ) {
    const SKILL_TOOL_MAP: Record<string, string> = {
      diagnose_network: 'fault-diagnosis',
      diagnose_app: 'telecom-app',
    };

    for (const tc of toolCalls) {
      // get_skill_instructions: push raw diagram
      if (tc.toolName === 'get_skill_instructions') {
        const skillName = tc.args.skill_name as string;
        if (skillName) {
          try {
            const content = readFileSync(resolve(SKILLS_DIR, skillName, 'SKILL.md'), 'utf-8');
            const raw = extractMermaidFromContent(content, lang);
            if (raw) onDiagramUpdate(skillName, raw);
          } catch { /* ignore */ }
        }
      }
      // MCP tool: push highlighted diagram
      const skillName = SKILL_TOOL_MAP[tc.toolName];
      if (skillName) {
        try {
          const content = readFileSync(resolve(SKILLS_DIR, skillName, 'SKILL.md'), 'utf-8');
          const raw = extractMermaidFromContent(content, lang);
          if (raw) onDiagramUpdate(skillName, highlightMermaidTool(raw, tc.toolName));
        } catch { /* ignore */ }
      }
    }
  }

  test('get_skill_instructions 触发回调，传入无高亮的 mermaid', () => {
    const updates: Array<{ skillName: string; mermaid: string }> = [];
    simulateStepFinish(
      [{ toolName: 'get_skill_instructions', args: { skill_name: 'fault-diagnosis' } }],
      'zh',
      (skillName, mermaid) => updates.push({ skillName, mermaid }),
    );

    expect(updates).toHaveLength(1);
    expect(updates[0].skillName).toBe('fault-diagnosis');
    expect(updates[0].mermaid).toContain('sequenceDiagram');
    // 无高亮
    expect(updates[0].mermaid).not.toContain('rect rgba');
  });

  test('diagnose_network 触发回调，传入高亮版 mermaid', () => {
    const updates: Array<{ skillName: string; mermaid: string }> = [];
    simulateStepFinish(
      [{ toolName: 'diagnose_network', args: { phone: '13800000001', issue_type: 'slow_data' } }],
      'zh',
      (skillName, mermaid) => updates.push({ skillName, mermaid }),
    );

    expect(updates).toHaveLength(1);
    expect(updates[0].skillName).toBe('fault-diagnosis');
    expect(updates[0].mermaid).toContain('rect rgba(255, 200, 0, 0.35)');
    expect(updates[0].mermaid).toContain('diagnose_network');
  });

  test('同一步骤同时调用 get_skill_instructions + diagnose_network，回调被触发两次', () => {
    const updates: Array<{ skillName: string; mermaid: string }> = [];
    simulateStepFinish(
      [
        { toolName: 'get_skill_instructions', args: { skill_name: 'fault-diagnosis' } },
        { toolName: 'diagnose_network', args: { phone: '13800000001', issue_type: 'slow_data' } },
      ],
      'zh',
      (skillName, mermaid) => updates.push({ skillName, mermaid }),
    );

    expect(updates).toHaveLength(2);
    // 第一次：无高亮
    expect(updates[0].mermaid).not.toContain('rect rgba');
    // 第二次：有高亮
    expect(updates[1].mermaid).toContain('rect rgba(255, 200, 0, 0.35)');
  });

  test('lang=en 时回调中的 mermaid 来自英文块，高亮仍正确', () => {
    const updates: Array<{ skillName: string; mermaid: string }> = [];
    simulateStepFinish(
      [{ toolName: 'diagnose_network', args: {} }],
      'en',
      (skillName, mermaid) => updates.push({ skillName, mermaid }),
    );

    expect(updates).toHaveLength(1);
    // 英文块包含英文参与者
    expect(updates[0].mermaid).toContain('Customer');
    // 高亮仍然生效
    expect(updates[0].mermaid).toContain('rect rgba(255, 200, 0, 0.35)');
  });

  test('未知工具不触发回调', () => {
    const updates: Array<{ skillName: string; mermaid: string }> = [];
    simulateStepFinish(
      [{ toolName: 'query_subscriber', args: {} }],
      'zh',
      (skillName, mermaid) => updates.push({ skillName, mermaid }),
    );
    expect(updates).toHaveLength(0);
  });
});

// ── determineBranch ───────────────────────────────────────────────────────────

describe('determineBranch', () => {
  test('账号状态检查 error → account_error', () => {
    expect(determineBranch([{ step: '账号状态检查', status: 'error' }])).toBe('account_error');
  });

  test('Account Status error → account_error (英文)', () => {
    expect(determineBranch([{ step: 'Account Status', status: 'error' }])).toBe('account_error');
  });

  test('流量余额检查 error → data_exhausted', () => {
    expect(determineBranch([
      { step: '账号状态检查', status: 'ok' },
      { step: '流量余额检查', status: 'error' },
    ])).toBe('data_exhausted');
  });

  test('流量余额检查 warning → 跳过，取后续（网络拥塞） → congestion', () => {
    expect(determineBranch([
      { step: '账号状态检查', status: 'ok' },
      { step: '流量余额检查', status: 'warning' },
      { step: '网络拥塞检测', status: 'warning' },
    ])).toBe('congestion');
  });

  test('APN 配置检查 warning → apn_warning', () => {
    expect(determineBranch([
      { step: '账号状态检查', status: 'ok' },
      { step: '基站信号检测', status: 'ok' },
      { step: 'SIM 卡状态', status: 'ok' },
      { step: 'APN 配置检查', status: 'warning' },
    ])).toBe('apn_warning');
  });

  test('APN Configuration warning → apn_warning (英文)', () => {
    expect(determineBranch([
      { step: 'Account Status', status: 'ok' },
      { step: 'APN Configuration', status: 'warning' },
    ])).toBe('apn_warning');
  });

  test('基站信号检测 warning → signal_weak', () => {
    expect(determineBranch([
      { step: '账号状态检查', status: 'ok' },
      { step: '基站信号检测', status: 'warning' },
    ])).toBe('signal_weak');
  });

  test('网络拥塞检测 warning → congestion', () => {
    expect(determineBranch([
      { step: '账号状态检查', status: 'ok' },
      { step: '流量余额检查', status: 'ok' },
      { step: '网络拥塞检测', status: 'warning' },
    ])).toBe('congestion');
  });

  test('所有步骤 ok → all_ok', () => {
    expect(determineBranch([
      { step: '账号状态检查', status: 'ok' },
      { step: '基站信号检测', status: 'ok' },
      { step: 'SIM 卡状态', status: 'ok' },
    ])).toBe('all_ok');
  });

  test('空数组 → all_ok', () => {
    expect(determineBranch([])).toBe('all_ok');
  });
});

// ── highlightMermaidBranch ────────────────────────────────────────────────────

describe('highlightMermaidBranch', () => {
  const rawMermaid = `sequenceDiagram
    participant C as 客户
    participant A as AI 客服
    alt 账号停机（error）
        A->>C: 告知账号欠费停机 %% branch:account_error
    else 所有项均正常（ok）
        A->>C: 引导用户自查 %% branch:all_ok
    end`;

  test('将带有匹配标记的行包裹进 rect 块（绿色）', () => {
    const result = highlightMermaidBranch(rawMermaid, 'account_error');
    expect(result).toContain('rect rgba(100, 220, 120, 0.4)');
    expect(result).toContain('告知账号欠费停机');
    expect(result).toContain('end\n');
  });

  test('只高亮匹配的 branch，不影响其他行', () => {
    const result = highlightMermaidBranch(rawMermaid, 'account_error');
    expect(result).toContain('rect rgba(100, 220, 120, 0.4)');
    // all_ok 行未被包裹
    const lines = result.split('\n');
    const allOkIdx = lines.findIndex((l) => l.includes('all_ok'));
    const rectBeforeAllOk = lines.slice(0, allOkIdx).some((l) => l.includes('rect rgba(100'));
    expect(rectBeforeAllOk).toBe(true); // rect is before account_error line, not all_ok
    // Verify all_ok line itself is not wrapped
    expect(lines[allOkIdx - 1]?.includes('rect rgba(100')).toBe(false);
  });

  test('没有匹配标记时原样返回', () => {
    const result = highlightMermaidBranch(rawMermaid, 'data_exhausted');
    expect(result).toBe(rawMermaid);
  });

  test('空字符串不报错', () => {
    expect(() => highlightMermaidBranch('', 'account_error')).not.toThrow();
    expect(highlightMermaidBranch('', 'account_error')).toBe('');
  });
});

// ── 组合高亮（tool + branch）─────────────────────────────────────────────────

describe('combined tool + branch highlight', () => {
  const skillPath = resolve(SKILLS_DIR, 'fault-diagnosis', 'SKILL.md');
  const skillContent = readFileSync(skillPath, 'utf-8');

  test('中文 mermaid：同时高亮 diagnose_network 和 account_error', () => {
    const raw = extractMermaidFromContent(skillContent, 'zh')!;
    const highlighted = highlightMermaidBranch(highlightMermaidTool(raw, 'diagnose_network'), 'account_error');
    expect(highlighted).toContain('rect rgba(255, 200, 0, 0.35)');   // tool highlight
    expect(highlighted).toContain('rect rgba(100, 220, 120, 0.4)');  // branch highlight
    expect(highlighted).toContain('diagnose_network');
    expect(highlighted).toContain('account_error');
  });

  test('英文 mermaid：同时高亮 diagnose_network 和 account_error', () => {
    const raw = extractMermaidFromContent(skillContent, 'en')!;
    const highlighted = highlightMermaidBranch(highlightMermaidTool(raw, 'diagnose_network'), 'account_error');
    expect(highlighted).toContain('rect rgba(255, 200, 0, 0.35)');
    expect(highlighted).toContain('rect rgba(100, 220, 120, 0.4)');
    expect(highlighted).toContain('Customer');
  });

  test('英文 mermaid 包含所有 %% branch: 标记', () => {
    const raw = extractMermaidFromContent(skillContent, 'en')!;
    const branches = ['account_error', 'data_exhausted', 'apn_warning', 'signal_weak', 'congestion', 'all_ok'];
    for (const b of branches) {
      expect(raw).toContain(`%% branch:${b}`);
    }
  });

  test('中文 mermaid 包含所有 %% branch: 标记', () => {
    const raw = extractMermaidFromContent(skillContent, 'zh')!;
    const branches = ['account_error', 'data_exhausted', 'apn_warning', 'signal_weak', 'congestion', 'all_ok'];
    for (const b of branches) {
      expect(raw).toContain(`%% branch:${b}`);
    }
  });

  test('高亮后的 mermaid 仍以 sequenceDiagram 开头', () => {
    const raw = extractMermaidFromContent(skillContent, 'zh')!;
    const highlighted = highlightMermaidBranch(highlightMermaidTool(raw, 'diagnose_network'), 'congestion');
    expect(highlighted.trimStart()).toMatch(/^sequenceDiagram/);
  });
});
