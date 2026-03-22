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
