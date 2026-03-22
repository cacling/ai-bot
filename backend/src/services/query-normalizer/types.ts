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
