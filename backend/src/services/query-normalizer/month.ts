// backend/src/services/query-normalizer/month.ts

const CN_MONTH: Record<string, string> = {
  '一': '01', '二': '02', '三': '03', '四': '04', '五': '05', '六': '06',
  '七': '07', '八': '08', '九': '09', '十': '10', '十一': '11', '十二': '12',
};

/**
 * 工具调用参数标准化：把 LLM 传的月份统一为 YYYY-MM。
 * 支持格式：2026-02, 2026-2, 2026年2月, 二月, 2月, 02 等。
 * 缺年份时自动补当前年。
 */
export function normalizeMonthParam(raw: string): string {
  const s = raw.trim();
  // "2026-02" — already standard
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  // "2026-2" → "2026-02"
  const dash = s.match(/^(\d{4})-(\d{1,2})$/);
  if (dash) return `${dash[1]}-${dash[2].padStart(2, '0')}`;
  // "2026年2月" / "2026年02月"
  const cnFull = s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月?/);
  if (cnFull) return `${cnFull[1]}-${cnFull[2].padStart(2, '0')}`;
  // "二月" / "十二月" (中文数字月)
  for (const [cn, mm] of Object.entries(CN_MONTH)) {
    if (s === `${cn}月` || s === `${cn}月份`) return `${new Date().getFullYear()}-${mm}`;
  }
  // "2月" / "02" / "2" (bare month number)
  const bare = s.match(/^(\d{1,2})\s*月?(?:份)?$/);
  if (bare) {
    const m = parseInt(bare[1]);
    if (m >= 1 && m <= 12) return `${new Date().getFullYear()}-${String(m).padStart(2, '0')}`;
  }
  // unrecognized — return as-is, MCP Server has its own fallback
  return s;
}
