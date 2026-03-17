/**
 * mermaid.test.ts — Mermaid 图表工具函数测试
 */

import { describe, test, expect } from 'bun:test';
import {
  extractMermaidFromContent,
  highlightMermaidTool,
  highlightMermaidBranch,
  stripMermaidMarkers,
  extractStateNames,
  extractTransitions,
  highlightMermaidProgress,
  determineBranch,
} from '../../../../backend/src/services/mermaid';

// ── 测试用 Mermaid 图表 ──────────────────────────────────────────────────────

const SEQUENCE_DIAGRAM = `sequenceDiagram
    participant U as 用户
    participant B as 机器人
    U->>B: 查询账单 %% tool:query_bill
    B->>U: 返回账单信息
    U->>B: 网络诊断 %% tool:diagnose_network
    B->>U: 诊断结果 %% branch:signal_weak`;

const STATE_DIAGRAM = `stateDiagram-v2
    [*] --> 接入
    接入 --> 查询账户: 用户询问 %% tool:query_subscriber
    查询账户 --> 分析结果
    分析结果 --> 解决方案: 找到问题 %% branch:account_error
    解决方案 --> [*]`;

const MARKDOWN_WITH_MERMAID = `# 技能说明

这是一个示例技能。

\`\`\`mermaid
sequenceDiagram
    participant U as 用户
    U->>B: 查询
\`\`\`

其他内容。`;

const MARKDOWN_WITHOUT_MERMAID = `# 技能说明

这是一个没有 mermaid 的文档。`;

// ── extractMermaidFromContent ────────────────────────────────────────────────

describe('extractMermaidFromContent', () => {
  test('从 markdown 中提取 mermaid 代码块', () => {
    const result = extractMermaidFromContent(MARKDOWN_WITH_MERMAID);
    expect(result).not.toBeNull();
    expect(result!).toContain('sequenceDiagram');
    expect(result!).toContain('U->>B: 查询');
  });

  test('无 mermaid 块返回 null', () => {
    expect(extractMermaidFromContent(MARKDOWN_WITHOUT_MERMAID)).toBeNull();
  });

  test('空字符串返回 null', () => {
    expect(extractMermaidFromContent('')).toBeNull();
  });
});

// ── highlightMermaidTool ─────────────────────────────────────────────────────

describe('highlightMermaidTool', () => {
  test('sequenceDiagram 中高亮工具行（用 rect 包裹）', () => {
    const result = highlightMermaidTool(SEQUENCE_DIAGRAM, 'query_bill');
    expect(result).toContain('rect');
    expect(result).toContain('query_bill');
  });

  test('不存在的工具名返回原文', () => {
    const result = highlightMermaidTool(SEQUENCE_DIAGRAM, 'nonexistent_tool');
    expect(result).toBe(SEQUENCE_DIAGRAM);
  });

  test('stateDiagram 中高亮工具行（用 classDef）', () => {
    const result = highlightMermaidTool(STATE_DIAGRAM, 'query_subscriber');
    expect(result).toContain('classDef');
    expect(result).toContain('toolHL');
  });
});

// ── highlightMermaidBranch ───────────────────────────────────────────────────

describe('highlightMermaidBranch', () => {
  test('sequenceDiagram 中高亮分支行', () => {
    const result = highlightMermaidBranch(SEQUENCE_DIAGRAM, 'signal_weak');
    expect(result).toContain('rect');
    expect(result).toContain('signal_weak');
  });

  test('不存在的分支返回原文', () => {
    const result = highlightMermaidBranch(SEQUENCE_DIAGRAM, 'nonexistent');
    expect(result).toBe(SEQUENCE_DIAGRAM);
  });

  test('stateDiagram 中高亮分支行', () => {
    const result = highlightMermaidBranch(STATE_DIAGRAM, 'account_error');
    expect(result).toContain('classDef');
    expect(result).toContain('branchHL');
  });
});

// ── stripMermaidMarkers ──────────────────────────────────────────────────────

describe('stripMermaidMarkers', () => {
  test('去除 tool marker', () => {
    const result = stripMermaidMarkers('U->>B: 查询 %% tool:query_bill');
    expect(result).not.toContain('%% tool:');
    expect(result).toContain('U->>B: 查询');
  });

  test('去除 branch marker', () => {
    const result = stripMermaidMarkers('A --> B: 条件 %% branch:signal_weak');
    expect(result).not.toContain('%% branch:');
  });

  test('无 marker 的文本不变', () => {
    const text = 'sequenceDiagram\n    U->>B: 查询';
    expect(stripMermaidMarkers(text)).toBe(text);
  });

  test('处理完整图表', () => {
    const result = stripMermaidMarkers(SEQUENCE_DIAGRAM);
    expect(result).not.toContain('%% tool:');
    expect(result).not.toContain('%% branch:');
    expect(result).toContain('sequenceDiagram');
  });
});

// ── extractStateNames ────────────────────────────────────────────────────────

describe('extractStateNames', () => {
  test('从 stateDiagram 提取状态名', () => {
    const names = extractStateNames(STATE_DIAGRAM);
    expect(names).toContain('接入');
    expect(names).toContain('查询账户');
    expect(names).toContain('分析结果');
    expect(names).toContain('解决方案');
  });

  test('排除 [*] 伪状态', () => {
    const names = extractStateNames(STATE_DIAGRAM);
    expect(names).not.toContain('[*]');
  });

  test('非 stateDiagram 返回空数组', () => {
    expect(extractStateNames(SEQUENCE_DIAGRAM)).toEqual([]);
  });

  test('排除 <<choice>> 状态', () => {
    const diagram = `stateDiagram-v2
    state check <<choice>>
    [*] --> check
    check --> 成功: ok
    check --> 失败: error`;
    const names = extractStateNames(diagram);
    expect(names).not.toContain('check');
    expect(names).toContain('成功');
    expect(names).toContain('失败');
  });
});

// ── extractTransitions ───────────────────────────────────────────────────────

describe('extractTransitions', () => {
  test('从 stateDiagram 提取转移关系', () => {
    const transitions = extractTransitions(STATE_DIAGRAM);
    expect(transitions.length).toBeGreaterThan(0);
    expect(transitions.some(t => t.includes('接入') && t.includes('查询账户'))).toBe(true);
  });

  test('排除 [*] 相关的转移', () => {
    const transitions = extractTransitions(STATE_DIAGRAM);
    for (const t of transitions) {
      expect(t).not.toContain('[*]');
    }
  });

  test('非 stateDiagram 返回空数组', () => {
    expect(extractTransitions(SEQUENCE_DIAGRAM)).toEqual([]);
  });

  test('带标签的转移包含标签文本', () => {
    const transitions = extractTransitions(STATE_DIAGRAM);
    const labeled = transitions.find(t => t.includes('接入') && t.includes('查询账户'));
    expect(labeled).toContain('用户询问');
  });
});

// ── highlightMermaidProgress ─────────────────────────────────────────────────

describe('highlightMermaidProgress', () => {
  test('高亮存在的状态节点', () => {
    const result = highlightMermaidProgress(STATE_DIAGRAM, '分析结果');
    expect(result).toContain('progressHL');
    expect(result).toContain('classDef');
  });

  test('不存在的状态名返回原文', () => {
    const result = highlightMermaidProgress(STATE_DIAGRAM, '不存在的状态');
    expect(result).toBe(STATE_DIAGRAM);
  });

  test('非 stateDiagram 返回原文', () => {
    const result = highlightMermaidProgress(SEQUENCE_DIAGRAM, '查询');
    expect(result).toBe(SEQUENCE_DIAGRAM);
  });

  test('空 stateName 返回原文', () => {
    const result = highlightMermaidProgress(STATE_DIAGRAM, '');
    expect(result).toBe(STATE_DIAGRAM);
  });
});

// ── determineBranch ──────────────────────────────────────────────────────────

describe('determineBranch', () => {
  test('账号状态错误 → account_error', () => {
    const steps = [{ step: '账号状态检查', status: 'error' as const }];
    expect(determineBranch(steps)).toBe('account_error');
  });

  test('流量耗尽 → data_exhausted', () => {
    const steps = [
      { step: '账号状态检查', status: 'ok' as const },
      { step: '流量余额检查', status: 'error' as const },
    ];
    expect(determineBranch(steps)).toBe('data_exhausted');
  });

  test('APN 警告 → apn_warning', () => {
    const steps = [
      { step: '账号状态检查', status: 'ok' as const },
      { step: '流量余额检查', status: 'ok' as const },
      { step: 'APN 配置检查', status: 'warning' as const },
    ];
    expect(determineBranch(steps)).toBe('apn_warning');
  });

  test('信号弱 → signal_weak', () => {
    const steps = [
      { step: '账号状态检查', status: 'ok' as const },
      { step: '基站信号检测', status: 'warning' as const },
    ];
    expect(determineBranch(steps)).toBe('signal_weak');
  });

  test('网络拥塞 → congestion', () => {
    const steps = [
      { step: '账号状态检查', status: 'ok' as const },
      { step: '网络拥塞检测', status: 'warning' as const },
    ];
    expect(determineBranch(steps)).toBe('congestion');
  });

  test('全部正常 → all_ok', () => {
    const steps = [
      { step: '账号状态检查', status: 'ok' as const },
      { step: '流量余额检查', status: 'ok' as const },
    ];
    expect(determineBranch(steps)).toBe('all_ok');
  });

  test('空步骤 → all_ok', () => {
    expect(determineBranch([])).toBe('all_ok');
  });

  test('英文步骤名也能识别', () => {
    expect(determineBranch([{ step: 'Account Status', status: 'error' as const }])).toBe('account_error');
    expect(determineBranch([{ step: 'APN Configuration', status: 'warning' as const }])).toBe('apn_warning');
    expect(determineBranch([{ step: 'Base Station Signal', status: 'error' as const }])).toBe('signal_weak');
    expect(determineBranch([{ step: 'Network Congestion', status: 'warning' as const }])).toBe('congestion');
  });

  test('流量余额 warning 不触发 data_exhausted（仅 error 触发）', () => {
    const steps = [
      { step: '账号状态检查', status: 'ok' as const },
      { step: '流量余额检查', status: 'warning' as const },
    ];
    // warning 不匹配 data_exhausted 的条件（需要 error）
    expect(determineBranch(steps)).not.toBe('data_exhausted');
  });
});
