/**
 * skill-versions.test.ts — 版本 Diff 算法测试
 *
 * 测试行级 LCS Diff 的正确性。
 */

import { describe, test, expect } from 'bun:test';

// 从 skill-versions.ts 中提取 diff 算法（与源码一致）
interface DiffLine {
  type: 'equal' | 'add' | 'remove';
  content: string;
  lineFrom?: number;
  lineTo?: number;
}

function generateLineDiff(fromLines: string[], toLines: string[]): DiffLine[] {
  const m = fromLines.length;
  const n = toLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (fromLines[i - 1] === toLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && fromLines[i - 1] === toLines[j - 1]) {
      result.unshift({ type: 'equal', content: fromLines[i - 1], lineFrom: i, lineTo: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'add', content: toLines[j - 1], lineTo: j });
      j--;
    } else {
      result.unshift({ type: 'remove', content: fromLines[i - 1], lineFrom: i });
      i--;
    }
  }
  return result;
}

describe('行级 Diff 算法', () => {
  test('相同内容无差异', () => {
    const lines = ['line1', 'line2', 'line3'];
    const diff = generateLineDiff(lines, lines);
    expect(diff.every(d => d.type === 'equal')).toBe(true);
    expect(diff).toHaveLength(3);
  });

  test('完全不同的内容', () => {
    const from = ['aaa', 'bbb'];
    const to = ['ccc', 'ddd'];
    const diff = generateLineDiff(from, to);
    const removes = diff.filter(d => d.type === 'remove');
    const adds = diff.filter(d => d.type === 'add');
    expect(removes).toHaveLength(2);
    expect(adds).toHaveLength(2);
  });

  test('单行修改', () => {
    const from = ['line1', 'old content', 'line3'];
    const to = ['line1', 'new content', 'line3'];
    const diff = generateLineDiff(from, to);
    const changes = diff.filter(d => d.type !== 'equal');
    expect(changes).toHaveLength(2); // 1 remove + 1 add
    expect(changes.some(d => d.type === 'remove' && d.content === 'old content')).toBe(true);
    expect(changes.some(d => d.type === 'add' && d.content === 'new content')).toBe(true);
  });

  test('新增行', () => {
    const from = ['line1', 'line3'];
    const to = ['line1', 'line2', 'line3'];
    const diff = generateLineDiff(from, to);
    const adds = diff.filter(d => d.type === 'add');
    expect(adds).toHaveLength(1);
    expect(adds[0].content).toBe('line2');
  });

  test('删除行', () => {
    const from = ['line1', 'line2', 'line3'];
    const to = ['line1', 'line3'];
    const diff = generateLineDiff(from, to);
    const removes = diff.filter(d => d.type === 'remove');
    expect(removes).toHaveLength(1);
    expect(removes[0].content).toBe('line2');
  });

  test('空文件对比', () => {
    const diff = generateLineDiff([], []);
    expect(diff).toHaveLength(0);
  });

  test('从空到有内容', () => {
    const diff = generateLineDiff([], ['new line']);
    expect(diff).toHaveLength(1);
    expect(diff[0].type).toBe('add');
  });

  test('从有内容到空', () => {
    const diff = generateLineDiff(['old line'], []);
    expect(diff).toHaveLength(1);
    expect(diff[0].type).toBe('remove');
  });

  test('复杂修改（SKILL.md 场景）', () => {
    const from = [
      '---',
      'name: bill-inquiry',
      '---',
      '',
      '# 账单查询',
      '发票开具时效：1-2个工作日',
      '',
      '## 流程',
    ];
    const to = [
      '---',
      'name: bill-inquiry',
      '---',
      '',
      '# 账单查询',
      '发票开具时效：3-5个工作日',
      '',
      '## 流程',
    ];
    const diff = generateLineDiff(from, to);
    const changes = diff.filter(d => d.type !== 'equal');
    expect(changes).toHaveLength(2); // remove old + add new
    expect(changes.some(d => d.content.includes('1-2'))).toBe(true);
    expect(changes.some(d => d.content.includes('3-5'))).toBe(true);
  });
});
