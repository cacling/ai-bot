/**
 * keyword-filter.ts — 合规用语拦截引擎
 *
 * 三类规则：
 *   - banned:  硬拦截（不可发送）
 *   - warning: 软告警（允许发送但提醒）
 *   - pii:     个人敏感信息脱敏
 *
 * 使用 Aho-Corasick 自动机实现 O(n) 多模式匹配，
 * 启动时一次性构建，支持运行时热重载。
 */

import { readFileSync } from 'fs';
import { logger } from '../logger';
import { TECH_SKILLS_DIR } from '../services/paths';

// ── 规则类型 ───────────────────────────────────────────────────────────────────

export type RuleCategory = 'banned' | 'warning' | 'pii';

export interface ComplianceKeyword {
  id: string;
  keyword: string;
  category: RuleCategory;
  description?: string;
}

export interface ComplianceMatch {
  keyword: string;
  category: RuleCategory;
  position: number;
}

export interface PIIMatch {
  type: string;
  value: string;
  masked: string;
  position: number;
}

export interface ComplianceResult {
  matches: ComplianceMatch[];
  piiMatches: PIIMatch[];
  hasBlock: boolean;
  hasWarning: boolean;
  hasPII: boolean;
}

// ── Aho-Corasick 自动机 ────────────────────────────────────────────────────────

interface ACNode {
  children: Map<string, number>;
  fail: number;
  outputs: Array<{ keyword: string; category: RuleCategory }>;
}

class AhoCorasick {
  private nodes: ACNode[] = [];

  constructor() {
    // root node
    this.nodes.push({ children: new Map(), fail: 0, outputs: [] });
  }

  /** 插入一个模式串 */
  addPattern(keyword: string, category: RuleCategory): void {
    let cur = 0;
    for (const ch of keyword) {
      if (!this.nodes[cur].children.has(ch)) {
        this.nodes.push({ children: new Map(), fail: 0, outputs: [] });
        this.nodes[cur].children.set(ch, this.nodes.length - 1);
      }
      cur = this.nodes[cur].children.get(ch)!;
    }
    this.nodes[cur].outputs.push({ keyword, category });
  }

  /** BFS 构建 fail 指针 */
  build(): void {
    const queue: number[] = [];
    // 根节点的直接子节点 fail 指向根
    for (const child of this.nodes[0].children.values()) {
      this.nodes[child].fail = 0;
      queue.push(child);
    }
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const [ch, next] of this.nodes[cur].children) {
        let f = this.nodes[cur].fail;
        while (f !== 0 && !this.nodes[f].children.has(ch)) {
          f = this.nodes[f].fail;
        }
        this.nodes[next].fail = this.nodes[f].children.get(ch) ?? 0;
        if (this.nodes[next].fail === next) this.nodes[next].fail = 0;
        // 合并 fail 链上的输出
        this.nodes[next].outputs = [
          ...this.nodes[next].outputs,
          ...this.nodes[this.nodes[next].fail].outputs,
        ];
        queue.push(next);
      }
    }
  }

  /** 在文本中搜索所有匹配 */
  search(text: string): ComplianceMatch[] {
    const results: ComplianceMatch[] = [];
    let cur = 0;
    let pos = 0;
    for (const ch of text) {
      while (cur !== 0 && !this.nodes[cur].children.has(ch)) {
        cur = this.nodes[cur].fail;
      }
      cur = this.nodes[cur].children.get(ch) ?? 0;
      for (const output of this.nodes[cur].outputs) {
        results.push({
          keyword: output.keyword,
          category: output.category,
          position: pos - output.keyword.length + 1,
        });
      }
      pos++;
    }
    return results;
  }
}

// ── PII 正则检测 ──────────────────────────────────────────────────────────────

const PII_RULES: Array<{ type: string; pattern: RegExp; maskFn: (v: string) => string }> = [
  {
    type: 'id_card',
    pattern: /(?<!\d)\d{17}[\dXx](?!\d)/g,
    maskFn: (v) => v.slice(0, 4) + '**********' + v.slice(-4),
  },
  {
    type: 'bank_card',
    pattern: /(?<!\d)\d{16,19}(?!\d)/g,
    maskFn: (v) => v.slice(0, 4) + ' **** **** ' + v.slice(-4),
  },
];

function checkPII(text: string): PIIMatch[] {
  const matches: PIIMatch[] = [];
  for (const rule of PII_RULES) {
    let m: RegExpExecArray | null;
    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    while ((m = re.exec(text)) !== null) {
      matches.push({
        type: rule.type,
        value: m[0],
        masked: rule.maskFn(m[0]),
        position: m.index,
      });
    }
  }
  return matches;
}

// ── 默认词库（从 SKILL 文件加载） ─────────────────────────────────────────────

function loadDefaultKeywords(): ComplianceKeyword[] {
  try {
    const raw = readFileSync(`${TECH_SKILLS_DIR}/compliance-rules/SKILL.md`, 'utf-8');
    const result: ComplianceKeyword[] = [];
    // 解析 Markdown 表格行：| ID | 关键词 | 说明 |
    const tableRe = /^\|\s*(b\d+|w\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/gm;
    let match;
    while ((match = tableRe.exec(raw)) !== null) {
      const id = match[1];
      const keyword = match[2].trim();
      const description = match[3].trim();
      const category: RuleCategory = id.startsWith('b') ? 'banned' : 'warning';
      result.push({ id, keyword, category, description });
    }
    if (result.length > 0) {
      logger.info('compliance', 'loaded_from_skill', { count: result.length });
      return result;
    }
  } catch (e) {
    logger.warn('compliance', 'skill_load_failed', { error: String(e) });
  }
  // 内联兜底（SKILL 文件不可用时）
  return [
    { id: 'b01', keyword: '这不是我负责的', category: 'banned', description: '推诿责任' },
    { id: 'b02', keyword: '你自己去查', category: 'banned', description: '推诿责任' },
    { id: 'b03', keyword: '关我什么事', category: 'banned', description: '推诿责任' },
    { id: 'b04', keyword: '你怎么这么烦', category: 'banned', description: '态度恶劣' },
    { id: 'b05', keyword: '你听不懂吗', category: 'banned', description: '态度恶劣' },
    { id: 'b06', keyword: '我不知道', category: 'banned', description: '不专业回应' },
    { id: 'b07', keyword: '没有办法', category: 'banned', description: '不专业回应' },
    { id: 'b08', keyword: '你去投诉吧', category: 'banned', description: '激化矛盾' },
    { id: 'b09', keyword: '爱办不办', category: 'banned', description: '态度恶劣' },
    { id: 'b10', keyword: '催什么催', category: 'banned', description: '催收违规' },
    { id: 'b11', keyword: '不还钱就起诉你', category: 'banned', description: '催收违规-威胁' },
    { id: 'b12', keyword: '通知你家人', category: 'banned', description: '催收违规-骚扰第三方' },
    { id: 'w01', keyword: '保证能', category: 'warning', description: '过度承诺' },
    { id: 'w02', keyword: '一定能', category: 'warning', description: '过度承诺' },
    { id: 'w03', keyword: '绝对不会', category: 'warning', description: '过度承诺' },
    { id: 'w04', keyword: '肯定没问题', category: 'warning', description: '过度承诺' },
    { id: 'w05', keyword: '百分之百', category: 'warning', description: '过度承诺' },
    { id: 'w06', keyword: '永远不会', category: 'warning', description: '过度承诺' },
  ];
}

const DEFAULT_KEYWORDS: ComplianceKeyword[] = loadDefaultKeywords();

// ── 全局实例 ──────────────────────────────────────────────────────────────────

let ac = new AhoCorasick();
let keywords: ComplianceKeyword[] = [...DEFAULT_KEYWORDS];
let nextId = 100;

function rebuildAC(): void {
  ac = new AhoCorasick();
  for (const kw of keywords) {
    ac.addPattern(kw.keyword, kw.category);
  }
  ac.build();
  logger.info('compliance', 'ac_rebuilt', { keyword_count: keywords.length });
}

// 启动时构建
rebuildAC();

// ── 公开 API ──────────────────────────────────────────────────────────────────

/** 检查文本是否包含违规内容 */
export function checkCompliance(text: string): ComplianceResult {
  const matches = ac.search(text);
  const piiMatches = checkPII(text);
  return {
    matches,
    piiMatches,
    hasBlock: matches.some((m) => m.category === 'banned'),
    hasWarning: matches.some((m) => m.category === 'warning'),
    hasPII: piiMatches.length > 0,
  };
}

/** 对文本执行 PII 脱敏 */
export function maskPII(text: string, piiMatches?: PIIMatch[]): string {
  const matches = piiMatches ?? checkPII(text);
  if (matches.length === 0) return text;
  let result = text;
  // 从后往前替换，避免位置偏移
  for (const m of [...matches].sort((a, b) => b.position - a.position)) {
    result = result.slice(0, m.position) + m.masked + result.slice(m.position + m.value.length);
  }
  return result;
}

/** 替换违规词为 *** */
export function sanitizeText(text: string, matches?: ComplianceMatch[]): string {
  const ms = matches ?? ac.search(text);
  if (ms.length === 0) return text;
  let result = text;
  // 从后往前替换
  const bannedMatches = ms.filter((m) => m.category === 'banned').sort((a, b) => b.position - a.position);
  for (const m of bannedMatches) {
    result = result.slice(0, m.position) + '***' + result.slice(m.position + m.keyword.length);
  }
  return result;
}

// ── 词库管理 ──────────────────────────────────────────────────────────────────

/** 获取全部词库 */
export function getAllKeywords(): ComplianceKeyword[] {
  return [...keywords];
}

/** 添加关键词 */
export function addKeyword(keyword: string, category: RuleCategory, description?: string): ComplianceKeyword {
  const id = `custom_${nextId++}`;
  const entry: ComplianceKeyword = { id, keyword, category, description };
  keywords.push(entry);
  rebuildAC();
  return entry;
}

/** 删除关键词 */
export function removeKeyword(id: string): boolean {
  const idx = keywords.findIndex((k) => k.id === id);
  if (idx === -1) return false;
  keywords.splice(idx, 1);
  rebuildAC();
  return true;
}

/** 热重载（用新词库替换全部） */
export function reloadKeywords(newKeywords?: ComplianceKeyword[]): void {
  if (newKeywords) {
    keywords = newKeywords;
  }
  rebuildAC();
}
