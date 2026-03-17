/**
 * runner.diagram.test.ts
 * 验证流程图高亮能力：highlightMermaidTool + extractMermaidFromContent
 * 支持 sequenceDiagram（rect 高亮）和 stateDiagram（classDef 高亮）
 *
 * 运行：cd backend && bun test src/agent/runner.diagram.test.ts
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { highlightMermaidTool, highlightMermaidBranch, determineBranch, extractMermaidFromContent } from '../../../backend/src/agent/runner.ts';
import { BIZ_SKILLS_DIR as SKILLS_DIR } from '../../../backend/src/config/paths';

// ── highlightMermaidTool · sequenceDiagram ───────────────────────────────────

describe('highlightMermaidTool · sequenceDiagram', () => {
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

// ── highlightMermaidTool · stateDiagram ──────────────────────────────────────

describe('highlightMermaidTool · stateDiagram', () => {
  const rawMermaid = `stateDiagram-v2
    [*] --> 接收问题: 客户反映问题
    接收问题 --> 系统诊断: 确定类型
    系统诊断 --> 分析诊断结果: diagnose_network(phone, issue_type) %% tool:diagnose_network
    state 分析诊断结果 <<choice>>
    分析诊断结果 --> 账号停机: error`;

  test('使用 classDef 高亮目标状态节点', () => {
    const result = highlightMermaidTool(rawMermaid, 'diagnose_network');
    expect(result).toContain('classDef toolHL fill:#fff3b0,stroke:#ffc800,stroke-width:2px');
    expect(result).toContain('分析诊断结果:::toolHL');
  });

  test('classDef 插入在第一行之后', () => {
    const result = highlightMermaidTool(rawMermaid, 'diagnose_network');
    const lines = result.split('\n');
    expect(lines[0]).toBe('stateDiagram-v2');
    expect(lines[1]).toContain('classDef toolHL');
  });

  test('内联 :::className 语法应用在标记行', () => {
    const result = highlightMermaidTool(rawMermaid, 'diagnose_network');
    expect(result).toContain('--> 分析诊断结果:::toolHL :');
  });

  test('没有匹配标记时原样返回', () => {
    const result = highlightMermaidTool(rawMermaid, 'nonexistent');
    expect(result).toBe(rawMermaid);
  });

  test('不使用 rect 语法', () => {
    const result = highlightMermaidTool(rawMermaid, 'diagnose_network');
    expect(result).not.toContain('rect ');
  });
});

// ── highlightMermaidBranch · stateDiagram ────────────────────────────────────

describe('highlightMermaidBranch · stateDiagram', () => {
  const rawMermaid = `stateDiagram-v2
    state 分析诊断结果 <<choice>>
    分析诊断结果 --> 账号停机: error — 账号欠费 %% branch:account_error
    分析诊断结果 --> 流量耗尽: error — 流量用完 %% branch:data_exhausted
    分析诊断结果 --> 用户自查: ok — 所有项正常 %% branch:all_ok`;

  test('使用 classDef 高亮目标分支状态', () => {
    const result = highlightMermaidBranch(rawMermaid, 'account_error');
    expect(result).toContain('classDef branchHL fill:#d4f5d4,stroke:#64dc78,stroke-width:2px');
    expect(result).toContain('账号停机:::branchHL');
  });

  test('只高亮匹配的分支，不影响其他分支', () => {
    const result = highlightMermaidBranch(rawMermaid, 'account_error');
    expect(result).toContain('账号停机:::branchHL');
    expect(result).not.toContain('流量耗尽:::branchHL');
    expect(result).not.toContain('用户自查:::branchHL');
  });

  test('没有匹配标记时原样返回', () => {
    const result = highlightMermaidBranch(rawMermaid, 'nonexistent');
    expect(result).toBe(rawMermaid);
  });

  test('不使用 rect 语法', () => {
    const result = highlightMermaidBranch(rawMermaid, 'account_error');
    expect(result).not.toContain('rect ');
  });
});

// ── highlightMermaidBranch · sequenceDiagram ─────────────────────────────────

describe('highlightMermaidBranch · sequenceDiagram', () => {
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

// ── extractMermaidFromContent ─────────────────────────────────────────────────

describe('extractMermaidFromContent', () => {
  const zhOnly = `# 标题\n\`\`\`mermaid\nsequenceDiagram\n    A->>B: 你好\n\`\`\`\n`;
  const noMermaid = `# 普通文档\n没有代码块\n`;

  test('提取第一个 mermaid 块', () => {
    const result = extractMermaidFromContent(zhOnly);
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

describe('fault-diagnosis SKILL.md — stateDiagram 高亮集成验证', () => {
  const skillPath = resolve(SKILLS_DIR, 'fault-diagnosis', 'SKILL.md');
  const skillContent = readFileSync(skillPath, 'utf-8');

  test('SKILL.md 包含 mermaid 块', () => {
    const mermaid = extractMermaidFromContent(skillContent);
    expect(mermaid).not.toBeNull();
    expect(mermaid).toContain('stateDiagram-v2');
  });

  test('mermaid 块包含 %% tool:diagnose_network 标记', () => {
    const mermaid = extractMermaidFromContent(skillContent)!;
    expect(mermaid).toContain('%% tool:diagnose_network');
  });

  test('mermaid 块包含 %% branch: 标记', () => {
    const mermaid = extractMermaidFromContent(skillContent)!;
    expect(mermaid).toContain('%% branch:account_error');
    expect(mermaid).toContain('%% branch:data_exhausted');
    expect(mermaid).toContain('%% branch:apn_warning');
    expect(mermaid).toContain('%% branch:signal_weak');
    expect(mermaid).toContain('%% branch:congestion');
    expect(mermaid).toContain('%% branch:all_ok');
  });

  test('toolHL 函数仍可工作（虽然运行时不再使用）', () => {
    const raw = extractMermaidFromContent(skillContent)!;
    const highlighted = highlightMermaidTool(raw, 'diagnose_network');
    expect(highlighted).toContain('classDef toolHL');
    expect(highlighted).not.toContain('rect ');
  });

  test('branchHL 函数仍可工作（虽然运行时不再使用）', () => {
    const raw = extractMermaidFromContent(skillContent)!;
    const highlighted = highlightMermaidBranch(raw, 'account_error');
    expect(highlighted).toContain('classDef branchHL');
    expect(highlighted).not.toContain('rect ');
  });

  test('对不存在的工具名高亮后内容不变', () => {
    const raw = extractMermaidFromContent(skillContent)!;
    const highlighted = highlightMermaidTool(raw, 'nonexistent_tool');
    expect(highlighted).toBe(raw);
  });

  test('progressHL 高亮真实状态节点', () => {
    const raw = extractMermaidFromContent(skillContent)!;
    const { highlightMermaidProgress } = require('../../../backend/src/utils/mermaid');
    const highlighted = highlightMermaidProgress(raw, '网络拥塞');
    expect(highlighted).toContain('classDef progressHL');
    expect(highlighted).toContain('网络拥塞:::progressHL');
  });

  test('progressHL 不高亮 <<choice>> 节点', () => {
    const raw = extractMermaidFromContent(skillContent)!;
    const { extractStateNames } = require('../../../backend/src/utils/mermaid');
    const states = extractStateNames(raw);
    // <<choice>> nodes like 已尝试自查, 诊断结果判断 should be excluded
    expect(states).not.toContain('已尝试自查');
    expect(states).not.toContain('诊断结果判断');
    expect(states).not.toContain('分析诊断结果');
    // Real nodes should be included
    expect(states).toContain('接收问题');
    expect(states).toContain('网络拥塞');
    expect(states).toContain('系统诊断');
  });
});

// ── telecom-app SKILL.md — stateDiagram tool 高亮验证 ────────────────────────

describe('telecom-app SKILL.md — stateDiagram tool 高亮验证', () => {
  const skillPath = resolve(SKILLS_DIR, 'telecom-app', 'SKILL.md');
  const skillContent = readFileSync(skillPath, 'utf-8');

  test('SKILL.md 包含 stateDiagram mermaid 块', () => {
    const mermaid = extractMermaidFromContent(skillContent);
    expect(mermaid).not.toBeNull();
    expect(mermaid).toContain('stateDiagram-v2');
  });

  test('mermaid 块包含 %% tool:diagnose_app 标记', () => {
    const mermaid = extractMermaidFromContent(skillContent)!;
    expect(mermaid).toContain('%% tool:diagnose_app');
  });

  test('tool 高亮生成 classDef + class', () => {
    const raw = extractMermaidFromContent(skillContent)!;
    const highlighted = highlightMermaidTool(raw, 'diagnose_app');
    expect(highlighted).toContain('classDef toolHL');
    // diagnose_app 在 TC2 和 TC5 中各出现一次，应高亮两个目标状态
    expect(highlighted).toContain('按诊断引导:::toolHL');
    expect(highlighted).toContain('安全诊断_5:::toolHL');
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
            const raw = extractMermaidFromContent(content);
            if (raw) onDiagramUpdate(skillName, raw);
          } catch { /* ignore */ }
        }
      }
      // MCP tool: push raw diagram (progressHL is applied async by progress tracker)
      const skillName = SKILL_TOOL_MAP[tc.toolName];
      if (skillName) {
        try {
          const content = readFileSync(resolve(SKILLS_DIR, skillName, 'SKILL.md'), 'utf-8');
          const raw = extractMermaidFromContent(content);
          if (raw) onDiagramUpdate(skillName, raw);
        } catch { /* ignore */ }
      }
    }
  }

  test('get_skill_instructions 触发回调，传入原始 mermaid（无高亮）', () => {
    const updates: Array<{ skillName: string; mermaid: string }> = [];
    simulateStepFinish(
      [{ toolName: 'get_skill_instructions', args: { skill_name: 'fault-diagnosis' } }],
      (skillName, mermaid) => updates.push({ skillName, mermaid }),
    );

    expect(updates).toHaveLength(1);
    expect(updates[0].skillName).toBe('fault-diagnosis');
    expect(updates[0].mermaid).toContain('stateDiagram-v2');
    expect(updates[0].mermaid).not.toContain('classDef');
  });

  test('diagnose_network 触发回调，传入无高亮的原始 mermaid', () => {
    const updates: Array<{ skillName: string; mermaid: string }> = [];
    simulateStepFinish(
      [{ toolName: 'diagnose_network', args: { phone: '13800000001', issue_type: 'slow_data' } }],
      (skillName, mermaid) => updates.push({ skillName, mermaid }),
    );

    expect(updates).toHaveLength(1);
    expect(updates[0].skillName).toBe('fault-diagnosis');
    expect(updates[0].mermaid).toContain('stateDiagram-v2');
    expect(updates[0].mermaid).not.toContain('classDef toolHL');
  });

  test('同一步骤同时调用 get_skill_instructions + diagnose_network，回调被触发两次', () => {
    const updates: Array<{ skillName: string; mermaid: string }> = [];
    simulateStepFinish(
      [
        { toolName: 'get_skill_instructions', args: { skill_name: 'fault-diagnosis' } },
        { toolName: 'diagnose_network', args: { phone: '13800000001', issue_type: 'slow_data' } },
      ],
      (skillName, mermaid) => updates.push({ skillName, mermaid }),
    );

    expect(updates).toHaveLength(2);
  });

  test('未知工具不触发回调', () => {
    const updates: Array<{ skillName: string; mermaid: string }> = [];
    simulateStepFinish(
      [{ toolName: 'query_subscriber', args: {} }],
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
