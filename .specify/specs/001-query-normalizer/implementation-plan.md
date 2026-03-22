# Query Normalizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Input Normalization Layer that converts colloquial user input into structured, auditable intermediate representations before the main LLM processes them.

**Architecture:** 6-stage pipeline (preprocess → time-resolve → lexicon-match → coverage+ambiguity → llm-fallback → assemble). Rules engine handles high-confidence cases (<3ms), LLM fallback for low-confidence (<500ms with 2s timeout cap). Output injected as system prompt supplement, original message preserved.

**Tech Stack:** TypeScript strict (Bun), Vercel AI SDK (`generateObject`), Zod, SiliconFlow (Step-3.5-Flash for fallback), JSON dictionaries with fs.watch hot-reload.

---

### Task 1: Define types (types.ts)

**Files:**
- Create: `backend/src/services/query-normalizer/types.ts`

- [ ] **Step 1: Create types.ts with all shared interfaces**

```typescript
// backend/src/services/query-normalizer/types.ts

// ── Core output ──────────────────────────────────────────────────────────

export interface NormalizedQuery {
  original_query: string;
  rewritten_query: string;
  intent_hints: string[];
  normalized_slots: NormalizedSlots;
  ambiguities: Ambiguity[];
  confidence: number;
  source: 'rules' | 'rules+llm';
  latency_ms: number;
}

export interface NormalizedSlots {
  time?: TimeSlot;
  msisdn?: string;
  customer_id?: string;
  service_category?: string;
  service_subtype?: string;
  issue_type?: string;
  action_type?: string;
  network_issue_type?: string;
  account_state?: string;
}

export interface TimeSlot {
  kind: 'natural_month' | 'billing_period' | 'date_range' | 'specific_date';
  value: string;
  source: 'explicit' | 'relative';
}

export interface Ambiguity {
  field: string;
  candidates: string[];
  original_text: string;
}

// ── Stage internals ──────────────────────────────────────────────────────

export interface Span {
  start: number;
  end: number;
  source: 'time' | 'lexicon' | 'identifier';
}

export interface TimeMatch {
  slot: TimeSlot;
  matched_text: string;
  start: number;
  end: number;
}

export interface TimeResolveResult {
  matches: TimeMatch[];
  ambiguities: Ambiguity[];
  normalized_text: string;
}

export interface IdentifierMatch {
  type: 'msisdn' | 'order_id';
  value: string;
  start: number;
  end: number;
}

export interface PreprocessResult {
  cleaned: string;
  identifiers: IdentifierMatch[];
}

export interface LexiconEntry {
  patterns: string[];
  term: string;
  label: string;
  category: string;
  slot_field: string;
  intent_hint?: string;
  priority?: number;
}

export interface LexiconMatch {
  entry: LexiconEntry;
  matched_text: string;
  start: number;
  end: number;
}

export interface LexiconMatchResult {
  matches: LexiconMatch[];
  intent_hints: string[];
  slots: Partial<NormalizedSlots>;
}

export interface CoverageResult {
  confidence: number;
  recognized_spans: Span[];
  unrecognized_text: string;
  should_fallback_llm: boolean;
}

export type AmbiguityTrigger =
  | { type: 'term_present'; term: string }
  | { type: 'terms_absent'; required_term: string; absent_field: string }
  | { type: 'term_conflict'; terms: string[] };

export interface AmbiguityRule {
  trigger: AmbiguityTrigger;
  ambiguity: Omit<Ambiguity, 'original_text'>;
}

export interface NormalizeContext {
  currentDate?: Date;
  phone?: string;
  lang?: 'zh' | 'en';
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd backend && bunx tsc --noEmit src/services/query-normalizer/types.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/query-normalizer/types.ts
git commit -m "feat(query-normalizer): add type definitions"
```

---

### Task 2: Stage 1 — Text preprocessing (preprocess.ts)

**Files:**
- Create: `backend/src/services/query-normalizer/preprocess.ts`
- Create: `tests/unittest/backend/services/query-normalizer/preprocess.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unittest/backend/services/query-normalizer/preprocess.test.ts
import { describe, test, expect } from 'bun:test';
import { preprocess } from '../../../../../backend/src/services/query-normalizer/preprocess';

describe('preprocess', () => {
  test('converts fullwidth digits to halfwidth', () => {
    const r = preprocess('１３８００１３８０００');
    expect(r.cleaned).toBe('13800138000');
  });

  test('collapses multiple spaces', () => {
    const r = preprocess('查下   上个月  话费');
    expect(r.cleaned).toBe('查下 上个月 话费');
  });

  test('trims whitespace', () => {
    const r = preprocess('  查话费  ');
    expect(r.cleaned).toBe('查话费');
  });

  test('extracts phone number', () => {
    const r = preprocess('我号码是13800138000');
    expect(r.identifiers).toHaveLength(1);
    expect(r.identifiers[0].type).toBe('msisdn');
    expect(r.identifiers[0].value).toBe('13800138000');
  });

  test('extracts phone number with spaces', () => {
    const r = preprocess('号码 13900139000 查话费');
    expect(r.identifiers[0].value).toBe('13900139000');
  });

  test('empty string returns empty result', () => {
    const r = preprocess('');
    expect(r.cleaned).toBe('');
    expect(r.identifiers).toHaveLength(0);
  });

  test('fullwidth letters converted', () => {
    const r = preprocess('Ａｐｐ闪退');
    expect(r.cleaned).toBe('App闪退');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && bun test ../tests/unittest/backend/services/query-normalizer/preprocess.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement preprocess.ts**

```typescript
// backend/src/services/query-normalizer/preprocess.ts
import { type PreprocessResult, type IdentifierMatch } from './types';

const MSISDN_RE = /1[3-9]\d{9}/g;
const ORDER_ID_RE = /[A-Za-z]\d{10,20}/g;

/** Convert fullwidth ASCII (0xFF01-0xFF5E) to halfwidth (0x0021-0x007E) */
function toHalfWidth(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0xff01 && code <= 0xff5e) {
      out += String.fromCharCode(code - 0xfee0);
    } else if (code === 0x3000) {
      out += ' '; // fullwidth space
    } else {
      out += s[i];
    }
  }
  return out;
}

export function preprocess(text: string): PreprocessResult {
  // 1. fullwidth → halfwidth
  let cleaned = toHalfWidth(text);
  // 2. collapse whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // 3. extract identifiers
  const identifiers: IdentifierMatch[] = [];

  for (const m of cleaned.matchAll(MSISDN_RE)) {
    identifiers.push({ type: 'msisdn', value: m[0], start: m.index!, end: m.index! + m[0].length });
  }
  for (const m of cleaned.matchAll(ORDER_ID_RE)) {
    identifiers.push({ type: 'order_id', value: m[0], start: m.index!, end: m.index! + m[0].length });
  }

  return { cleaned, identifiers };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && bun test ../tests/unittest/backend/services/query-normalizer/preprocess.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/query-normalizer/preprocess.ts tests/unittest/backend/services/query-normalizer/preprocess.test.ts
git commit -m "feat(query-normalizer): add text preprocessing (Stage 1)"
```

---

### Task 3: Stage 2 — Time resolver (time-resolver.ts)

**Files:**
- Create: `backend/src/services/query-normalizer/time-resolver.ts`
- Create: `tests/unittest/backend/services/query-normalizer/time-resolver.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unittest/backend/services/query-normalizer/time-resolver.test.ts
import { describe, test, expect } from 'bun:test';
import { resolveTime } from '../../../../../backend/src/services/query-normalizer/time-resolver';

const NOW = new Date('2026-03-22T10:00:00+08:00');

describe('resolveTime', () => {
  // ── Explicit dates ──
  test('explicit year-month: "2026年2月"', () => {
    const r = resolveTime('查2026年2月账单', NOW);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].slot).toEqual({ kind: 'natural_month', value: '2026-02', source: 'explicit' });
  });

  test('explicit full date: "2026年2月15日"', () => {
    const r = resolveTime('2026年2月15日发生的', NOW);
    expect(r.matches[0].slot).toEqual({ kind: 'specific_date', value: '2026-02-15', source: 'explicit' });
  });

  test('explicit date with dash: "2026-02"', () => {
    const r = resolveTime('查2026-02账单', NOW);
    expect(r.matches[0].slot.value).toBe('2026-02');
  });

  // ── Relative natural months ──
  test('relative: "上个月" → 2026-02', () => {
    const r = resolveTime('查下上个月话费', NOW);
    expect(r.matches[0].slot).toEqual({ kind: 'natural_month', value: '2026-02', source: 'relative' });
  });

  test('relative: "本月" → 2026-03', () => {
    const r = resolveTime('本月账单', NOW);
    expect(r.matches[0].slot).toEqual({ kind: 'natural_month', value: '2026-03', source: 'relative' });
  });

  test('relative: "下个月" → 2026-04', () => {
    const r = resolveTime('下个月生效', NOW);
    expect(r.matches[0].slot).toEqual({ kind: 'natural_month', value: '2026-04', source: 'relative' });
  });

  // ── Cross-year ──
  test('cross-year: "上个月" when now=2026-01', () => {
    const jan = new Date('2026-01-15T10:00:00+08:00');
    const r = resolveTime('上个月', jan);
    expect(r.matches[0].slot.value).toBe('2025-12');
  });

  // ── Last year ──
  test('"去年12月" → 2025-12', () => {
    const r = resolveTime('去年12月的账单', NOW);
    expect(r.matches[0].slot).toEqual({ kind: 'natural_month', value: '2025-12', source: 'relative' });
  });

  // ── Recent N months ──
  test('"最近三个月" → date_range', () => {
    const r = resolveTime('最近三个月流量', NOW);
    expect(r.matches[0].slot).toEqual({ kind: 'date_range', value: '2026-01~2026-03', source: 'relative' });
  });

  test('"最近两个月" → date_range', () => {
    const r = resolveTime('最近两个月', NOW);
    expect(r.matches[0].slot.value).toBe('2026-02~2026-03');
  });

  // ── Billing period ──
  test('"本期" → billing_period current', () => {
    const r = resolveTime('本期账单', NOW);
    expect(r.matches[0].slot).toEqual({ kind: 'billing_period', value: 'current', source: 'relative' });
  });

  test('"上期" → billing_period previous', () => {
    const r = resolveTime('上期账单', NOW);
    expect(r.matches[0].slot).toEqual({ kind: 'billing_period', value: 'previous', source: 'relative' });
  });

  test('"上账期" → billing_period previous', () => {
    const r = resolveTime('上账期', NOW);
    expect(r.matches[0].slot).toEqual({ kind: 'billing_period', value: 'previous', source: 'relative' });
  });

  // ── Ambiguous time ──
  test('"最近话费" → ambiguity', () => {
    const r = resolveTime('最近话费不对', NOW);
    expect(r.matches).toHaveLength(0);
    expect(r.ambiguities).toHaveLength(1);
    expect(r.ambiguities[0].field).toBe('time');
  });

  // ── No time expression ──
  test('no time words → empty matches', () => {
    const r = resolveTime('查话费', NOW);
    expect(r.matches).toHaveLength(0);
    expect(r.ambiguities).toHaveLength(0);
  });

  // ── Multiple time expressions ──
  test('mixed: "本期账单和上个月的"', () => {
    const r = resolveTime('本期账单和上个月的', NOW);
    expect(r.matches).toHaveLength(2);
    const kinds = r.matches.map(m => m.slot.kind);
    expect(kinds).toContain('billing_period');
    expect(kinds).toContain('natural_month');
  });

  // ── normalized_text replacement ──
  test('normalized_text replaces relative time', () => {
    const r = resolveTime('查下上个月话费', NOW);
    expect(r.normalized_text).toContain('2026年2月');
    expect(r.normalized_text).not.toContain('上个月');
  });

  test('normalized_text keeps explicit time unchanged', () => {
    const r = resolveTime('2026年2月账单', NOW);
    expect(r.normalized_text).toBe('2026年2月账单');
  });

  // ── Month range ──
  test('"1月到3月" → date_range', () => {
    const r = resolveTime('1月到3月流量', NOW);
    expect(r.matches[0].slot).toEqual({ kind: 'date_range', value: '2026-01~2026-03', source: 'explicit' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && bun test ../tests/unittest/backend/services/query-normalizer/time-resolver.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement time-resolver.ts**

```typescript
// backend/src/services/query-normalizer/time-resolver.ts
import { type TimeSlot, type TimeMatch, type TimeResolveResult, type Ambiguity } from './types';

const CN_NUM: Record<string, number> = {
  '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '十一': 11, '十二': 12,
};

function parseCnNumber(s: string): number {
  return CN_NUM[s] ?? parseInt(s, 10) || 1;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function monthStr(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

/** Shift a year/month pair by delta months (handles cross-year) */
function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const total = (year * 12 + (month - 1)) + delta;
  return [Math.floor(total / 12), (total % 12) + 1];
}

function overlaps(start: number, end: number, occupied: [number, number][]): boolean {
  return occupied.some(([s, e]) => start < e && end > s);
}

interface Rule {
  regex: RegExp;
  parse: (m: RegExpMatchArray, now: Date) => { slot: TimeSlot; replacement: string } | null;
}

function buildRules(): Rule[] {
  const year = String.raw`(\d{2,4})`;
  const mon = String.raw`(\d{1,2})`;
  const day = String.raw`(\d{1,2})`;

  return [
    // 1. Explicit full date: 2026年2月15日, 2026-02-15
    {
      regex: new RegExp(String.raw`(\d{4})[年\-.]${mon}[月\-.]${day}[日号]?`, 'g'),
      parse: (m) => {
        const y = parseInt(m[1]);
        const mo = parseInt(m[2]);
        const d = parseInt(m[3]);
        return {
          slot: { kind: 'specific_date', value: `${y}-${pad2(mo)}-${pad2(d)}`, source: 'explicit' },
          replacement: `${y}年${mo}月${d}日`,
        };
      },
    },
    // 2. Explicit year-month: 2026年2月, 2026-02, 26年2月
    {
      regex: new RegExp(String.raw`${year}[年\-.]${mon}月?(?![日号\-.\d])`, 'g'),
      parse: (m) => {
        let y = parseInt(m[1]);
        if (y < 100) y += 2000;
        const mo = parseInt(m[2]);
        return {
          slot: { kind: 'natural_month', value: monthStr(y, mo), source: 'explicit' },
          replacement: `${y}年${mo}月`,
        };
      },
    },
    // 3. Explicit month range: 1月到3月
    {
      regex: new RegExp(String.raw`${mon}月?\s*[到至~\-]\s*${mon}月`, 'g'),
      parse: (m, now) => {
        const y = now.getFullYear();
        const m1 = parseInt(m[1]);
        const m2 = parseInt(m[2]);
        return {
          slot: { kind: 'date_range', value: `${monthStr(y, m1)}~${monthStr(y, m2)}`, source: 'explicit' },
          replacement: `${m1}月至${m2}月`,
        };
      },
    },
    // 4. Last year month: 去年12月
    {
      regex: /去年(\d{1,2})月/g,
      parse: (m, now) => {
        const mo = parseInt(m[1]);
        const y = now.getFullYear() - 1;
        return {
          slot: { kind: 'natural_month', value: monthStr(y, mo), source: 'relative' },
          replacement: `${y}年${mo}月`,
        };
      },
    },
    // 5a. Current month: 本月/这个月/当月/这月
    {
      regex: /(本|这个?|当)月/g,
      parse: (_m, now) => {
        const y = now.getFullYear();
        const mo = now.getMonth() + 1;
        return {
          slot: { kind: 'natural_month', value: monthStr(y, mo), source: 'relative' },
          replacement: `${y}年${mo}月`,
        };
      },
    },
    // 5b. Previous month: 上个月/上月/上一个月/前一个月
    {
      regex: /(上|前)(一个?)?月/g,
      parse: (_m, now) => {
        const [y, mo] = shiftMonth(now.getFullYear(), now.getMonth() + 1, -1);
        return {
          slot: { kind: 'natural_month', value: monthStr(y, mo), source: 'relative' },
          replacement: `${y}年${mo}月`,
        };
      },
    },
    // 5c. Next month: 下个月/下月/下一个月/后一个月
    {
      regex: /(下|后)(一个?)?月/g,
      parse: (_m, now) => {
        const [y, mo] = shiftMonth(now.getFullYear(), now.getMonth() + 1, 1);
        return {
          slot: { kind: 'natural_month', value: monthStr(y, mo), source: 'relative' },
          replacement: `${y}年${mo}月`,
        };
      },
    },
    // 6. Recent N months: 最近三个月, 最近3个月
    {
      regex: /最近\s*([两三四五六七八九十\d]+)\s*个?月/g,
      parse: (m, now) => {
        const n = parseCnNumber(m[1]);
        const y = now.getFullYear();
        const mo = now.getMonth() + 1;
        const [sy, sm] = shiftMonth(y, mo, -(n - 1));
        return {
          slot: { kind: 'date_range', value: `${monthStr(sy, sm)}~${monthStr(y, mo)}`, source: 'relative' },
          replacement: `${sy}年${sm}月至${y}年${mo}月`,
        };
      },
    },
    // 7a. Current billing period: 本期/当期/本账期/这期
    {
      regex: /(本|当|这)(一?)(期|账期)/g,
      parse: () => ({
        slot: { kind: 'billing_period', value: 'current', source: 'relative' },
        replacement: '本期',
      }),
    },
    // 7b. Previous billing period: 上期/上账期/上一期/前一期
    {
      regex: /(上|前)(一?)(期|账期)/g,
      parse: () => ({
        slot: { kind: 'billing_period', value: 'previous', source: 'relative' },
        replacement: '上期',
      }),
    },
    // 7c. Latest billing period: 最近一期
    {
      regex: /最近一期/g,
      parse: () => ({
        slot: { kind: 'billing_period', value: 'latest', source: 'relative' },
        replacement: '最近一期',
      }),
    },
  ];
}

// 8. Ambiguous time words (checked only if not consumed by above rules)
const AMBIGUOUS_TIME_RE = /最近|之前|以前|那个月/g;

export function resolveTime(text: string, now: Date = new Date()): TimeResolveResult {
  const matches: TimeMatch[] = [];
  const occupied: [number, number][] = [];
  const rules = buildRules();

  // Replacements to apply (sorted later by position descending for safe replace)
  const replacements: { start: number; end: number; replacement: string }[] = [];

  for (const rule of rules) {
    // Reset regex lastIndex
    rule.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.regex.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;

      if (overlaps(start, end, occupied)) continue;

      const parsed = rule.parse(m, now);
      if (!parsed) continue;

      matches.push({
        slot: parsed.slot,
        matched_text: m[0],
        start,
        end,
      });
      occupied.push([start, end]);
      replacements.push({ start, end, replacement: parsed.replacement });
    }
  }

  // Check for ambiguous time words not consumed by rules
  const ambiguities: Ambiguity[] = [];
  AMBIGUOUS_TIME_RE.lastIndex = 0;
  let am: RegExpExecArray | null;
  while ((am = AMBIGUOUS_TIME_RE.exec(text)) !== null) {
    const start = am.index;
    const end = start + am[0].length;
    if (!overlaps(start, end, occupied)) {
      ambiguities.push({
        field: 'time',
        candidates: ['最近一个月', '最近一周', '不确定的时间范围'],
        original_text: am[0],
      });
    }
  }

  // Build normalized_text: replace relative time with standard form (right-to-left to preserve indices)
  let normalized_text = text;
  const sortedReplacements = [...replacements].sort((a, b) => b.start - a.start);
  for (const r of sortedReplacements) {
    normalized_text = normalized_text.slice(0, r.start) + r.replacement + normalized_text.slice(r.end);
  }

  return { matches, ambiguities, normalized_text };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && bun test ../tests/unittest/backend/services/query-normalizer/time-resolver.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/query-normalizer/time-resolver.ts tests/unittest/backend/services/query-normalizer/time-resolver.test.ts
git commit -m "feat(query-normalizer): add time resolver (Stage 2)"
```

---

### Task 4: Stage 3 — Telecom lexicon + dictionaries

**Files:**
- Create: `backend/src/services/query-normalizer/dictionaries/billing.json`
- Create: `backend/src/services/query-normalizer/dictionaries/products.json`
- Create: `backend/src/services/query-normalizer/dictionaries/network.json`
- Create: `backend/src/services/query-normalizer/dictionaries/identity.json`
- Create: `backend/src/services/query-normalizer/dictionaries/actions.json`
- Create: `backend/src/services/query-normalizer/telecom-lexicon.ts`
- Create: `tests/unittest/backend/services/query-normalizer/telecom-lexicon.test.ts`

- [ ] **Step 1: Create all 5 dictionary JSON files**

Create the JSON files with the exact content from the plan.md dictionaries section (billing.json: 9 entries, products.json: 8 entries, network.json: 8 entries, identity.json: 5 entries, actions.json: 10 entries).

- [ ] **Step 2: Write failing tests**

```typescript
// tests/unittest/backend/services/query-normalizer/telecom-lexicon.test.ts
import { describe, test, expect, beforeAll } from 'bun:test';
import { resolve } from 'path';
import { loadLexicons, matchLexicon } from '../../../../../backend/src/services/query-normalizer/telecom-lexicon';

beforeAll(() => {
  loadLexicons(resolve(import.meta.dir, '../../../../../backend/src/services/query-normalizer/dictionaries'));
});

describe('matchLexicon', () => {
  test('"乱扣费" → unexpected_charge + bill_dispute intent', () => {
    const r = matchLexicon('乱扣费');
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].entry.term).toBe('unexpected_charge');
    expect(r.intent_hints).toContain('bill_dispute');
  });

  test('"视频包" → value_added_service.video', () => {
    const r = matchLexicon('帮我看看视频包');
    const terms = r.matches.map(m => m.entry.term);
    expect(terms).toContain('value_added_service.video');
  });

  test('long pattern wins: "收不到验证码" over "验证码"', () => {
    const r = matchLexicon('收不到验证码');
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].entry.term).toBe('otp_delivery_issue');
  });

  test('multi-match: "没网还打不了电话"', () => {
    const r = matchLexicon('没网还打不了电话');
    const terms = r.matches.map(m => m.entry.term);
    expect(terms).toContain('data_service_issue');
    expect(terms).toContain('voice_service_issue');
  });

  test('multi-match: "退订视频包"', () => {
    const r = matchLexicon('退订视频包');
    const terms = r.matches.map(m => m.entry.term);
    expect(terms).toContain('cancel_service');
    expect(terms).toContain('value_added_service.video');
  });

  test('"销户" not swallowed by "退订"', () => {
    const r = matchLexicon('我要销户');
    expect(r.matches[0].entry.term).toBe('close_account');
  });

  test('no match → empty', () => {
    const r = matchLexicon('你好');
    expect(r.matches).toHaveLength(0);
    expect(r.intent_hints).toHaveLength(0);
  });

  test('slots populated correctly', () => {
    const r = matchLexicon('转人工');
    expect(r.slots.action_type).toBe('handoff_to_human');
  });

  test('"不要再打了" → do_not_call intent', () => {
    const r = matchLexicon('不要再打了');
    expect(r.matches[0].entry.term).toBe('do_not_call');
    expect(r.intent_hints).toContain('do_not_call');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && bun test ../tests/unittest/backend/services/query-normalizer/telecom-lexicon.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement telecom-lexicon.ts**

```typescript
// backend/src/services/query-normalizer/telecom-lexicon.ts
import { readFileSync, readdirSync, watch } from 'fs';
import { resolve } from 'path';
import { type LexiconEntry, type LexiconMatch, type LexiconMatchResult, type NormalizedSlots } from './types';
import { logger } from '../../services/logger';

interface PatternIndex {
  pattern: string;
  entry: LexiconEntry;
}

let patternIndex: PatternIndex[] = [];

function rebuildIndex(dictDir: string) {
  const entries: LexiconEntry[] = [];
  try {
    for (const file of readdirSync(dictDir).filter(f => f.endsWith('.json'))) {
      const content = readFileSync(resolve(dictDir, file), 'utf-8');
      const parsed = JSON.parse(content) as LexiconEntry[];
      entries.push(...parsed);
    }
  } catch (err) {
    logger.error('query-normalizer', 'lexicon_load_error', { error: String(err) });
    return; // keep old index
  }

  // Build pattern index: each (pattern, entry) pair, sorted by pattern length desc then priority desc
  const index: PatternIndex[] = [];
  for (const entry of entries) {
    for (const pattern of entry.patterns) {
      index.push({ pattern, entry });
    }
  }
  index.sort((a, b) => {
    const lenDiff = b.pattern.length - a.pattern.length;
    if (lenDiff !== 0) return lenDiff;
    return (b.entry.priority ?? 0) - (a.entry.priority ?? 0);
  });

  patternIndex = index;
}

export function loadLexicons(dictDir: string) {
  rebuildIndex(dictDir);
  logger.info('query-normalizer', 'lexicon_loaded', { count: patternIndex.length });

  try {
    watch(dictDir, { recursive: true }, () => {
      rebuildIndex(dictDir);
      logger.info('query-normalizer', 'lexicon_reloaded', { count: patternIndex.length });
    });
  } catch {
    // watch may not be supported in all environments
  }
}

export function matchLexicon(text: string): LexiconMatchResult {
  const matches: LexiconMatch[] = [];
  const occupied: [number, number][] = [];

  for (const { pattern, entry } of patternIndex) {
    let searchFrom = 0;
    while (true) {
      const idx = text.indexOf(pattern, searchFrom);
      if (idx === -1) break;

      const start = idx;
      const end = idx + pattern.length;

      // Check no overlap with already matched spans
      const hasOverlap = occupied.some(([s, e]) => start < e && end > s);
      if (!hasOverlap) {
        matches.push({ entry, matched_text: pattern, start, end });
        occupied.push([start, end]);
      }
      searchFrom = idx + 1;
    }
  }

  // Collect intent_hints (deduplicated)
  const intentSet = new Set<string>();
  for (const m of matches) {
    if (m.entry.intent_hint) intentSet.add(m.entry.intent_hint);
  }

  // Build partial slots (last match wins per field)
  const slots: Partial<NormalizedSlots> = {};
  for (const m of matches) {
    const field = m.entry.slot_field as keyof NormalizedSlots;
    if (field && field !== 'time') {
      (slots as Record<string, string>)[field] = m.entry.term;
    }
  }

  return {
    matches,
    intent_hints: [...intentSet],
    slots,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && bun test ../tests/unittest/backend/services/query-normalizer/telecom-lexicon.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/query-normalizer/dictionaries/ backend/src/services/query-normalizer/telecom-lexicon.ts tests/unittest/backend/services/query-normalizer/telecom-lexicon.test.ts
git commit -m "feat(query-normalizer): add telecom lexicon + dictionaries (Stage 3)"
```

---

### Task 5: Stage 4 — Coverage + ambiguity detection

**Files:**
- Create: `backend/src/services/query-normalizer/coverage.ts`
- Create: `backend/src/services/query-normalizer/ambiguity-detector.ts`
- Create: `tests/unittest/backend/services/query-normalizer/coverage.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unittest/backend/services/query-normalizer/coverage.test.ts
import { describe, test, expect, beforeAll } from 'bun:test';
import { resolve } from 'path';
import { evaluateCoverage } from '../../../../../backend/src/services/query-normalizer/coverage';
import { detectAmbiguities } from '../../../../../backend/src/services/query-normalizer/ambiguity-detector';
import { resolveTime } from '../../../../../backend/src/services/query-normalizer/time-resolver';
import { loadLexicons, matchLexicon } from '../../../../../backend/src/services/query-normalizer/telecom-lexicon';

const NOW = new Date('2026-03-22T10:00:00+08:00');

beforeAll(() => {
  loadLexicons(resolve(import.meta.dir, '../../../../../backend/src/services/query-normalizer/dictionaries'));
});

describe('evaluateCoverage', () => {
  test('"查下上个月话费" → high confidence', () => {
    const time = resolveTime('查下上个月话费', NOW);
    const lex = matchLexicon(time.normalized_text);
    const r = evaluateCoverage('查下上个月话费', time.matches, lex.matches, []);
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
    expect(r.should_fallback_llm).toBe(false);
  });

  test('"我那个啥包好像多扣了" → low confidence', () => {
    const time = resolveTime('我那个啥包好像多扣了', NOW);
    const lex = matchLexicon(time.normalized_text);
    const r = evaluateCoverage('我那个啥包好像多扣了', time.matches, lex.matches, []);
    expect(r.confidence).toBeLessThan(0.7);
    expect(r.should_fallback_llm).toBe(true);
  });

  test('empty string → confidence 0', () => {
    const r = evaluateCoverage('', [], [], []);
    expect(r.confidence).toBe(0);
    expect(r.should_fallback_llm).toBe(true);
  });
});

describe('detectAmbiguities', () => {
  test('"停机" triggers account_state ambiguity', () => {
    const lex = matchLexicon('我要停机');
    const time = resolveTime('我要停机', NOW);
    const ambigs = detectAmbiguities(lex.matches, time);
    const stateAmbig = ambigs.find(a => a.field === 'account_state');
    expect(stateAmbig).toBeDefined();
    expect(stateAmbig!.candidates).toContain('arrears_suspended');
  });

  test('"没网" triggers network ambiguity', () => {
    const lex = matchLexicon('没网');
    const time = resolveTime('没网', NOW);
    const ambigs = detectAmbiguities(lex.matches, time);
    expect(ambigs.find(a => a.field === 'network_issue_type')).toBeDefined();
  });

  test('"退订" without product → service_subtype ambiguity', () => {
    const lex = matchLexicon('我要退订');
    const time = resolveTime('我要退订', NOW);
    const ambigs = detectAmbiguities(lex.matches, time);
    expect(ambigs.find(a => a.field === 'service_subtype')).toBeDefined();
  });

  test('"退订视频包" → no service_subtype ambiguity (product present)', () => {
    const lex = matchLexicon('退订视频包');
    const time = resolveTime('退订视频包', NOW);
    const ambigs = detectAmbiguities(lex.matches, time);
    expect(ambigs.find(a => a.field === 'service_subtype')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && bun test ../tests/unittest/backend/services/query-normalizer/coverage.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement coverage.ts**

```typescript
// backend/src/services/query-normalizer/coverage.ts
import { type CoverageResult, type Span, type TimeMatch, type LexiconMatch, type IdentifierMatch } from './types';

const STOP_WORDS = [
  '的', '了', '吗', '呢', '啊', '吧', '嘛', '哦', '哈', '嗯',
  '帮我', '帮忙', '麻烦', '请', '请问', '你好',
  '查下', '查一下', '看下', '看看', '看一下',
  '一下', '一个', '那个', '这个', '什么',
  '是不是', '能不能', '有没有', '怎么', '为什么',
  '我', '我的', '你', '你们', '他', '她',
  '还', '也', '就', '都', '又', '和', '跟', '给',
];

// Sort stop words by length descending for greedy removal
const SORTED_STOPS = [...STOP_WORDS].sort((a, b) => b.length - a.length);

function removeStopWords(text: string): string {
  let result = text;
  for (const sw of SORTED_STOPS) {
    result = result.split(sw).join('');
  }
  return result.replace(/\s+/g, '').trim();
}

export function evaluateCoverage(
  original: string,
  timeMatches: TimeMatch[],
  lexiconMatches: LexiconMatch[],
  identifiers: IdentifierMatch[],
): CoverageResult {
  if (!original || original.trim().length === 0) {
    return { confidence: 0, recognized_spans: [], unrecognized_text: '', should_fallback_llm: true };
  }

  // Collect all recognized spans
  const spans: Span[] = [
    ...timeMatches.map(m => ({ start: m.start, end: m.end, source: 'time' as const })),
    ...lexiconMatches.map(m => ({ start: m.start, end: m.end, source: 'lexicon' as const })),
    ...identifiers.map(m => ({ start: m.start, end: m.end, source: 'identifier' as const })),
  ];

  // Build unrecognized text by removing recognized spans
  const chars = [...original];
  const recognized = new Set<number>();
  for (const span of spans) {
    for (let i = span.start; i < span.end && i < chars.length; i++) {
      recognized.add(i);
    }
  }

  const unrecognizedChars = chars.filter((_, i) => !recognized.has(i)).join('');
  const unrecognizedClean = removeStopWords(unrecognizedChars);

  // Clean original of stop words for denominator
  const originalClean = removeStopWords(original);
  const denominator = originalClean.length;

  if (denominator === 0) {
    // All content is stop words — high confidence (nothing meaningful to parse)
    return { confidence: 1, recognized_spans: spans, unrecognized_text: '', should_fallback_llm: false };
  }

  const recognizedCleanLen = denominator - unrecognizedClean.length;
  const confidence = Math.max(0, Math.min(1, recognizedCleanLen / denominator));

  return {
    confidence,
    recognized_spans: spans,
    unrecognized_text: unrecognizedClean,
    should_fallback_llm: confidence < 0.7,
  };
}
```

- [ ] **Step 4: Implement ambiguity-detector.ts**

```typescript
// backend/src/services/query-normalizer/ambiguity-detector.ts
import { type Ambiguity, type AmbiguityRule, type LexiconMatch, type TimeResolveResult } from './types';

const PRODUCT_FIELDS = ['service_category', 'service_subtype'];

const AMBIGUITY_RULES: AmbiguityRule[] = [
  {
    trigger: { type: 'term_present', term: 'suspend_service' },
    ambiguity: {
      field: 'account_state',
      candidates: ['arrears_suspended', 'voluntary_suspended', 'network_issue'],
    },
  },
  {
    trigger: { type: 'term_present', term: 'account_locked' },
    ambiguity: {
      field: 'account_state',
      candidates: ['account_locked', 'device_risk_control'],
    },
  },
  {
    trigger: { type: 'terms_absent', required_term: 'cancel_service', absent_field: 'service_subtype' },
    ambiguity: {
      field: 'service_subtype',
      candidates: ['value_added_service', 'data_add_on', 'plan'],
    },
  },
  {
    trigger: { type: 'term_present', term: 'data_service_issue' },
    ambiguity: {
      field: 'network_issue_type',
      candidates: ['data_service_issue', 'arrears_suspended', 'area_outage'],
    },
  },
  {
    trigger: { type: 'term_present', term: 'billing_amount' },
    ambiguity: {
      field: 'issue_type',
      candidates: ['total_bill', 'plan_monthly_fee', 'overage_charge'],
    },
  },
];

export function detectAmbiguities(
  lexiconMatches: LexiconMatch[],
  timeResult: TimeResolveResult,
): Ambiguity[] {
  const matchedTerms = new Set(lexiconMatches.map(m => m.entry.term));
  const matchedFields = new Set(lexiconMatches.map(m => m.entry.slot_field));
  const ambiguities: Ambiguity[] = [];

  for (const rule of AMBIGUITY_RULES) {
    const trigger = rule.trigger;

    let triggered = false;
    let originalText = '';

    if (trigger.type === 'term_present') {
      if (matchedTerms.has(trigger.term)) {
        triggered = true;
        const match = lexiconMatches.find(m => m.entry.term === trigger.term);
        originalText = match?.matched_text ?? trigger.term;
      }
    } else if (trigger.type === 'terms_absent') {
      if (matchedTerms.has(trigger.required_term) && !matchedFields.has(trigger.absent_field)) {
        triggered = true;
        const match = lexiconMatches.find(m => m.entry.term === trigger.required_term);
        originalText = match?.matched_text ?? trigger.required_term;
      }
    }

    if (triggered) {
      ambiguities.push({
        ...rule.ambiguity,
        original_text: originalText,
      });
    }
  }

  // Include time ambiguities
  ambiguities.push(...timeResult.ambiguities);

  return ambiguities;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && bun test ../tests/unittest/backend/services/query-normalizer/coverage.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/query-normalizer/coverage.ts backend/src/services/query-normalizer/ambiguity-detector.ts tests/unittest/backend/services/query-normalizer/coverage.test.ts
git commit -m "feat(query-normalizer): add coverage + ambiguity detection (Stage 4)"
```

---

### Task 6: Stage 5 — LLM fallback

**Files:**
- Create: `backend/src/services/query-normalizer/llm-fallback.ts`
- Create: `tests/unittest/backend/services/query-normalizer/llm-fallback.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unittest/backend/services/query-normalizer/llm-fallback.test.ts
import { describe, test, expect } from 'bun:test';
import { buildFallbackPrompt } from '../../../../../backend/src/services/query-normalizer/llm-fallback';

describe('llm-fallback', () => {
  test('buildFallbackPrompt includes original query', () => {
    const prompt = buildFallbackPrompt('我那个啥包好像多扣了', { issue_type: 'unexpected_charge' });
    expect(prompt).toContain('我那个啥包好像多扣了');
    expect(prompt).toContain('unexpected_charge');
  });

  test('buildFallbackPrompt includes rules result', () => {
    const prompt = buildFallbackPrompt('测试', { action_type: 'cancel_service' });
    expect(prompt).toContain('cancel_service');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && bun test ../tests/unittest/backend/services/query-normalizer/llm-fallback.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement llm-fallback.ts**

```typescript
// backend/src/services/query-normalizer/llm-fallback.ts
import { generateObject } from 'ai';
import { z } from 'zod';
import { siliconflow } from '../../engine/llm';
import { type NormalizedSlots, type Ambiguity } from './types';
import { logger } from '../../services/logger';

const NORMALIZER_MODEL = siliconflow(
  process.env.QUERY_NORMALIZER_MODEL ?? 'stepfun-ai/Step-3.5-Flash'
);

const LlmNormalizeSchema = z.object({
  rewritten_query: z.string().describe('标准化改写，中文，不扩大请求范围'),
  intent_hints: z.array(z.string()).describe('意图提示，如 bill_inquiry, service_cancel'),
  additional_slots: z.record(z.string()).describe('补充槽位，key 为字段名，value 为标准术语'),
  ambiguities: z.array(z.object({
    field: z.string(),
    candidates: z.array(z.string()),
  })).describe('无法确定的歧义'),
});

export type LlmFallbackResult = z.infer<typeof LlmNormalizeSchema>;

export function buildFallbackPrompt(original: string, rulesSlots: Partial<NormalizedSlots>): string {
  return `你是电信客服系统的输入标准化助手。用户原话如下：

"${original}"

规则引擎已识别的部分：
${JSON.stringify(rulesSlots, null, 2)}

请补全以下内容：
1. rewritten_query：将用户原话改写为标准化的客服工单描述（中文）
2. intent_hints：识别用户意图（如 bill_inquiry, service_cancel, fault_report 等）
3. additional_slots：补充规则引擎未识别的槽位（可选字段：service_category, service_subtype, issue_type, action_type, network_issue_type, account_state）
4. ambiguities：标记无法确定的歧义

要求：
- 不要扩大用户的请求范围
- 不要添加用户未提到的业务承诺
- 如果无法确定，放入 ambiguities 而不是猜测`;
}

export async function llmFallback(
  original: string,
  rulesSlots: Partial<NormalizedSlots>,
  timeout: number = 2000,
): Promise<LlmFallbackResult | null> {
  const prompt = buildFallbackPrompt(original, rulesSlots);

  try {
    const result = await Promise.race([
      generateObject({
        model: NORMALIZER_MODEL,
        schema: LlmNormalizeSchema,
        prompt,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('llm_fallback_timeout')), timeout)
      ),
    ]);

    logger.info('query-normalizer', 'llm_fallback_ok', {
      original,
      rewritten: result.object.rewritten_query,
      intent_hints: result.object.intent_hints,
    });

    return result.object;
  } catch (err) {
    logger.warn('query-normalizer', 'llm_fallback_failed', { original, error: String(err) });
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && bun test ../tests/unittest/backend/services/query-normalizer/llm-fallback.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/query-normalizer/llm-fallback.ts tests/unittest/backend/services/query-normalizer/llm-fallback.test.ts
git commit -m "feat(query-normalizer): add LLM fallback (Stage 5)"
```

---

### Task 7: Stage 6 — Rewrite builder + format

**Files:**
- Create: `backend/src/services/query-normalizer/rewrite-builder.ts`
- Create: `backend/src/services/query-normalizer/format.ts`

- [ ] **Step 1: Implement rewrite-builder.ts**

```typescript
// backend/src/services/query-normalizer/rewrite-builder.ts
import { type TimeResolveResult, type LexiconMatchResult } from './types';

export function buildRewrite(time: TimeResolveResult, lexicon: LexiconMatchResult): string {
  const actions = lexicon.matches
    .filter(m => m.entry.slot_field === 'action_type')
    .map(m => m.entry.label);
  const objects = lexicon.matches
    .filter(m => ['service_category', 'service_subtype', 'issue_type', 'network_issue_type'].includes(m.entry.slot_field))
    .map(m => m.entry.label);

  if (actions.length > 0 || objects.length > 0) {
    const timeStr = time.matches.length > 0
      ? time.matches
          .map(m => m.slot.kind === 'billing_period' ? m.slot.value : m.slot.value)
          .map(v => v.replace(/~/, '至'))
          .join('、') + ' '
      : '';
    const objStr = objects.length > 0 ? objects.join('、') : '';
    const actStr = actions.length > 0 ? actions.join('、') : '';

    const parts = [timeStr, objStr, actStr].filter(Boolean);
    if (parts.length > 0) return parts.join('');
  }

  return time.normalized_text;
}
```

- [ ] **Step 2: Implement format.ts**

```typescript
// backend/src/services/query-normalizer/format.ts
import { type NormalizedQuery, type NormalizedSlots } from './types';

const SLOT_LABELS: Record<string, string> = {
  service_category: '业务类型',
  service_subtype: '业务子类',
  issue_type: '问题类型',
  action_type: '操作类型',
  network_issue_type: '网络问题',
  account_state: '账户状态',
  msisdn: '手机号',
};

export function formatNormalizedContext(nc: NormalizedQuery): string {
  const lines: string[] = [
    '',
    '## 用户输入分析（系统自动生成，仅供参考）',
    '',
    `- 标准化改写：${nc.rewritten_query}`,
  ];

  if (nc.intent_hints.length > 0) {
    lines.push(`- 意图提示：${nc.intent_hints.join('、')}`);
  }

  const slots = nc.normalized_slots;

  if (slots.time) {
    const timeDesc = slots.time.kind === 'billing_period'
      ? `账期=${slots.time.value}`
      : slots.time.value;
    const sourceDesc = slots.time.source === 'explicit' ? '用户明确指定' : '根据相对时间推算';
    lines.push(`- 时间：${timeDesc}（${sourceDesc}）`);
  }

  for (const [key, label] of Object.entries(SLOT_LABELS)) {
    const val = slots[key as keyof NormalizedSlots];
    if (val && typeof val === 'string') {
      lines.push(`- ${label}：${val}`);
    }
  }

  if (nc.ambiguities.length > 0) {
    lines.push('- 歧义提醒（请在对话中向用户确认）：');
    for (const a of nc.ambiguities) {
      lines.push(`  - "${a.original_text}" 可能含义：${a.candidates.join(' / ')}`);
    }
  }

  lines.push(`- 分析置信度：${(nc.confidence * 100).toFixed(0)}%（来源：${nc.source}）`);
  lines.push('');

  return lines.join('\n');
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/query-normalizer/rewrite-builder.ts backend/src/services/query-normalizer/format.ts
git commit -m "feat(query-normalizer): add rewrite builder + format (Stage 6)"
```

---

### Task 8: Main orchestrator (index.ts)

**Files:**
- Create: `backend/src/services/query-normalizer/index.ts`

- [ ] **Step 1: Implement index.ts**

```typescript
// backend/src/services/query-normalizer/index.ts
import { type NormalizedQuery, type NormalizedSlots, type NormalizeContext } from './types';
import { preprocess } from './preprocess';
import { resolveTime } from './time-resolver';
import { matchLexicon, loadLexicons as loadLexiconsInternal } from './telecom-lexicon';
import { evaluateCoverage } from './coverage';
import { detectAmbiguities } from './ambiguity-detector';
import { llmFallback } from './llm-fallback';
import { buildRewrite } from './rewrite-builder';
import { logger } from '../../services/logger';

export { loadLexiconsInternal as loadLexicons };
export { formatNormalizedContext } from './format';
export { type NormalizedQuery } from './types';

function dedup(arr: string[]): string[] {
  return [...new Set(arr)];
}

function dedupAmbiguities(arr: { field: string; candidates: string[]; original_text: string }[]) {
  const seen = new Set<string>();
  return arr.filter(a => {
    const key = a.field;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function normalizeQuery(
  userMessage: string,
  context: NormalizeContext = {},
): Promise<NormalizedQuery> {
  const start = Date.now();
  const now = context.currentDate ?? new Date();

  // Handle empty input
  if (!userMessage || userMessage.trim().length === 0) {
    return {
      original_query: userMessage ?? '',
      rewritten_query: '',
      intent_hints: [],
      normalized_slots: {},
      ambiguities: [],
      confidence: 0,
      source: 'rules',
      latency_ms: Date.now() - start,
    };
  }

  // Stage 1: Preprocess
  const { cleaned, identifiers } = preprocess(userMessage);

  // Stage 2: Time normalization
  const timeResult = resolveTime(cleaned, now);

  // Stage 3: Lexicon matching
  const lexiconResult = matchLexicon(timeResult.normalized_text);

  // Stage 4: Coverage + ambiguity
  const coverage = evaluateCoverage(userMessage, timeResult.matches, lexiconResult.matches, identifiers);
  const ambiguities = detectAmbiguities(lexiconResult.matches, timeResult);

  // Stage 5: LLM fallback (only if low confidence)
  let llmResult: Awaited<ReturnType<typeof llmFallback>> = null;
  if (coverage.should_fallback_llm) {
    const partialSlots: Partial<NormalizedSlots> = {
      ...lexiconResult.slots,
    };
    if (timeResult.matches.length > 0) {
      partialSlots.time = timeResult.matches[0].slot;
    }
    if (identifiers.find(id => id.type === 'msisdn')) {
      partialSlots.msisdn = identifiers.find(id => id.type === 'msisdn')!.value;
    }
    llmResult = await llmFallback(userMessage, partialSlots);
  }

  // Stage 6: Assemble output
  const normalizedSlots: NormalizedSlots = {
    ...lexiconResult.slots,
  };

  // Time slot
  if (timeResult.matches.length > 0) {
    normalizedSlots.time = timeResult.matches[0].slot;
  }

  // Identifiers
  const msisdn = identifiers.find(id => id.type === 'msisdn');
  if (msisdn) normalizedSlots.msisdn = msisdn.value;

  // Merge LLM additional slots
  if (llmResult?.additional_slots) {
    for (const [key, value] of Object.entries(llmResult.additional_slots)) {
      if (value && !(normalizedSlots as Record<string, unknown>)[key]) {
        (normalizedSlots as Record<string, string>)[key] = value;
      }
    }
  }

  const result: NormalizedQuery = {
    original_query: userMessage,
    rewritten_query: llmResult?.rewritten_query ?? buildRewrite(timeResult, lexiconResult),
    intent_hints: dedup([
      ...lexiconResult.intent_hints,
      ...(llmResult?.intent_hints ?? []),
    ]),
    normalized_slots: normalizedSlots,
    ambiguities: dedupAmbiguities([
      ...ambiguities,
      ...(llmResult?.ambiguities?.map(a => ({ ...a, original_text: '' })) ?? []),
    ]),
    confidence: coverage.confidence,
    source: llmResult ? 'rules+llm' : 'rules',
    latency_ms: Date.now() - start,
  };

  logger.info('query-normalizer', 'normalized', {
    original: userMessage,
    rewritten: result.rewritten_query,
    confidence: result.confidence,
    source: result.source,
    intent_hints: result.intent_hints,
    latency_ms: result.latency_ms,
    has_ambiguities: result.ambiguities.length > 0,
  });

  return result;
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd backend && bunx tsc --noEmit src/services/query-normalizer/index.ts`
Expected: No errors (or only non-blocking warnings)

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/query-normalizer/index.ts
git commit -m "feat(query-normalizer): add main orchestrator (index.ts)"
```

---

### Task 9: Integration — runner.ts + chat-ws.ts + startup

**Files:**
- Modify: `backend/src/engine/runner.ts:220-225` (RunAgentOptions) and `backend/src/engine/runner.ts:413-417` (system prompt injection)
- Modify: `backend/src/chat/chat-ws.ts:161` (add normalizeQuery call before runAgent)
- Modify: `backend/src/index.ts:102-121` (add loadLexicons to startup)

- [ ] **Step 1: Extend RunAgentOptions in runner.ts**

In `backend/src/engine/runner.ts`, add the import at top and extend `RunAgentOptions`:

```typescript
// Add import (near other imports at top)
import { type NormalizedQuery } from '../services/query-normalizer';
import { formatNormalizedContext } from '../services/query-normalizer';
```

Extend `RunAgentOptions` (line ~220):

```typescript
export interface RunAgentOptions {
  useMock?: boolean;
  skillContent?: string;
  skillName?: string;
  normalizedContext?: NormalizedQuery;  // ← add this
}
```

- [ ] **Step 2: Inject normalized context into system prompt in runner.ts**

After line 417 (`if (options?.skillContent) { ... }`), add:

```typescript
  if (options?.normalizedContext) {
    systemPrompt += formatNormalizedContext(options.normalizedContext);
  }
```

- [ ] **Step 3: Add normalizeQuery call in chat-ws.ts**

Add import at top of `backend/src/chat/chat-ws.ts`:

```typescript
import { normalizeQuery } from '../services/query-normalizer';
```

In `onMessage` handler, after line 161 (`const message = payload.message;`) and before line 192 (`result = await runAgent(...)`), add:

```typescript
      // Query normalization
      const normalizedContext = await normalizeQuery(message, {
        currentDate: new Date(),
        phone,
        lang: langParam,
      });
```

Update the `runAgent` call (line 192-212) to pass `normalizedContext` via options. The last argument to `runAgent` needs to include it. Since `runAgent` takes `options` as the last parameter, add it:

Change the runAgent call to include `undefined` for `overrideSkillsDir` and add the options object:

```typescript
        result = await runAgent(
          message,
          history,
          phone,
          agentLang,
          (skillName, rawMermaid) => { /* ... existing callback ... */ },
          undefined,
          cachedSubscriberName,
          cachedPlanName,
          cachedGender,
          undefined,  // overrideSkillsDir
          { normalizedContext },  // options
        );
```

- [ ] **Step 4: Add loadLexicons to startup in index.ts**

Add import at top of `backend/src/index.ts`:

```typescript
import { loadLexicons } from './services/query-normalizer';
import { resolve } from 'path';
```

Add initialization before the warmup block (before line 102), after route mounts:

```typescript
// Initialize Query Normalizer dictionaries
loadLexicons(resolve(import.meta.dir, 'services/query-normalizer/dictionaries'));
```

- [ ] **Step 5: Verify the server starts**

Run: `cd backend && bun run src/index.ts`
Expected: Server starts, logs show `query-normalizer lexicon_loaded`

- [ ] **Step 6: Commit**

```bash
git add backend/src/engine/runner.ts backend/src/chat/chat-ws.ts backend/src/index.ts
git commit -m "feat(query-normalizer): integrate into runner + chat-ws + startup"
```

---

### Task 10: Integration tests

**Files:**
- Create: `tests/unittest/backend/services/query-normalizer/index.test.ts`

- [ ] **Step 1: Write integration tests**

```typescript
// tests/unittest/backend/services/query-normalizer/index.test.ts
import { describe, test, expect, beforeAll } from 'bun:test';
import { resolve } from 'path';
import { normalizeQuery, loadLexicons } from '../../../../../backend/src/services/query-normalizer';
import { formatNormalizedContext } from '../../../../../backend/src/services/query-normalizer';

const NOW = new Date('2026-03-22T10:00:00+08:00');
const ctx = { currentDate: NOW };

beforeAll(() => {
  loadLexicons(resolve(import.meta.dir, '../../../../../backend/src/services/query-normalizer/dictionaries'));
});

describe('normalizeQuery — full pipeline', () => {
  test('"查下上个月话费" → high confidence, rules only', async () => {
    const r = await normalizeQuery('查下上个月话费', ctx);
    expect(r.original_query).toBe('查下上个月话费');
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
    expect(r.source).toBe('rules');
    expect(r.normalized_slots.time?.value).toBe('2026-02');
    expect(r.normalized_slots.time?.source).toBe('relative');
    expect(r.latency_ms).toBeLessThan(100); // should be < 5ms but allow headroom
  });

  test('"帮我看看视频包能不能退" → video + cancel', async () => {
    const r = await normalizeQuery('帮我看看视频包能不能退', ctx);
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
    expect(r.normalized_slots.service_subtype).toBe('value_added_service.video');
    expect(r.normalized_slots.action_type).toBe('cancel_service');
  });

  test('"今天突然没网了还打不了电话" → dual network issues', async () => {
    const r = await normalizeQuery('今天突然没网了还打不了电话', ctx);
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
    expect(r.normalized_slots.network_issue_type).toBeDefined();
  });

  test('"我上个月那个视频包是不是乱扣了" → time + video + charge', async () => {
    const r = await normalizeQuery('我上个月那个视频包是不是乱扣了', ctx);
    expect(r.normalized_slots.time?.value).toBe('2026-02');
    expect(r.intent_hints).toContain('bill_dispute');
  });

  test('"查账单顺便退视频包" → multi-intent', async () => {
    const r = await normalizeQuery('查账单顺便退视频包', ctx);
    expect(r.intent_hints.length).toBeGreaterThanOrEqual(1);
    expect(r.normalized_slots.action_type).toBe('cancel_service');
  });

  test('empty string → confidence 0', async () => {
    const r = await normalizeQuery('', ctx);
    expect(r.confidence).toBe(0);
    expect(r.source).toBe('rules');
    expect(r.rewritten_query).toBe('');
  });

  test('rewrite does not contain English terms', async () => {
    const r = await normalizeQuery('帮我退了视频包', ctx);
    expect(r.rewritten_query).not.toContain('cancel_service');
    expect(r.rewritten_query).not.toContain('value_added_service');
  });

  test('phone number extracted to msisdn slot', async () => {
    const r = await normalizeQuery('帮13800138000查话费', ctx);
    expect(r.normalized_slots.msisdn).toBe('13800138000');
  });
});

describe('formatNormalizedContext', () => {
  test('output contains section header', async () => {
    const r = await normalizeQuery('查下上个月话费', ctx);
    const formatted = formatNormalizedContext(r);
    expect(formatted).toContain('用户输入分析');
  });

  test('output contains time info', async () => {
    const r = await normalizeQuery('查下上个月话费', ctx);
    const formatted = formatNormalizedContext(r);
    expect(formatted).toContain('2026-02');
    expect(formatted).toContain('时间');
  });

  test('output contains confidence', async () => {
    const r = await normalizeQuery('查话费', ctx);
    const formatted = formatNormalizedContext(r);
    expect(formatted).toContain('置信度');
    expect(formatted).toContain('来源');
  });

  test('ambiguities formatted when present', async () => {
    const r = await normalizeQuery('我要停机', ctx);
    const formatted = formatNormalizedContext(r);
    if (r.ambiguities.length > 0) {
      expect(formatted).toContain('歧义提醒');
    }
  });
});
```

- [ ] **Step 2: Run all query-normalizer tests**

Run: `cd backend && bun test ../tests/unittest/backend/services/query-normalizer/`
Expected: All tests PASS

- [ ] **Step 3: Run full backend test suite to check no regressions**

Run: `cd backend && bun test ../tests/unittest/backend/`
Expected: No new failures

- [ ] **Step 4: Commit**

```bash
git add tests/unittest/backend/services/query-normalizer/index.test.ts
git commit -m "test(query-normalizer): add integration tests"
```
