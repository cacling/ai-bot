// backend/src/services/query-normalizer/time-resolver.ts
import { type TimeSlot, type TimeMatch, type TimeResolveResult, type Ambiguity } from './types';

const CN_NUM: Record<string, number> = {
  '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '十一': 11, '十二': 12,
};

function parseCnNumber(s: string): number {
  const cn = CN_NUM[s];
  if (cn !== undefined) return cn;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? 1 : n;
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
  return [
    // 1. Explicit full date: 2026年2月15日, 2026-02-15
    {
      regex: /(\d{4})[年\-.](\d{1,2})[月\-.](\d{1,2})[日号]?/g,
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
      regex: /(\d{2,4})[年\-.](\d{1,2})月?(?![日号\-.\d])/g,
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
      regex: /(\d{1,2})月?\s*[到至~\-]\s*(\d{1,2})月/g,
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
      regex: /(上|前)(一?个?)月/g,
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
      regex: /(下|后)(一?个?)月/g,
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

  const replacements: { start: number; end: number; replacement: string }[] = [];

  for (const rule of rules) {
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

  let normalized_text = text;
  const sortedReplacements = [...replacements].sort((a, b) => b.start - a.start);
  for (const r of sortedReplacements) {
    normalized_text = normalized_text.slice(0, r.start) + r.replacement + normalized_text.slice(r.end);
  }

  return { matches, ambiguities, normalized_text };
}
