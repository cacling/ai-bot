/**
 * Card extraction 测试
 *
 * 验证 data-driven CARD_EXTRACTORS 映射 + _cardType hint 处理。
 */
import { describe, test, expect } from 'bun:test';

// We test the extractCard logic indirectly via exported CARD_EXTRACTORS patterns.
// Since extractCard is not exported, we test the same logic patterns.

// Re-implement extractCard pattern for testing (mirrors runner.ts)
type CardData = { type: string; data: unknown };
type CardExtractor = (parsed: Record<string, unknown>) => CardData | null;

const CARD_EXTRACTORS: Record<string, CardExtractor> = {
  query_bill: (p) => {
    const d = (p.bill ?? (p.bills as unknown[])?.[0]) as Record<string, unknown> | undefined;
    return d ? { type: 'bill_card', data: d } : null;
  },
  cancel_service: (p) =>
    p.service_name ? { type: 'cancel_card', data: { service_name: p.service_name, monthly_fee: p.monthly_fee, effective_end: p.effective_end, phone: p.phone } } : null,
  query_plans: (p) => {
    const plan = p.plan ?? ((p.plans as unknown[])?.length === 1 ? (p.plans as unknown[])[0] : null);
    return plan ? { type: 'plan_card', data: plan } : null;
  },
  diagnose_network: (p) =>
    p.diagnostic_steps ? { type: 'diagnostic_card', data: { issue_type: p.issue_type, diagnostic_steps: p.diagnostic_steps, conclusion: p.conclusion } } : null,
  analyze_bill_anomaly: (p) =>
    p.current_month ? { type: 'anomaly_card', data: p } : null,
  bill_card: (p) => {
    const raw = p.bill as Record<string, unknown> | undefined;
    if (!raw) return null;
    // L2 aggregated: bill is the full MCP response { bills: [...], count, ... } — unwrap
    const d = (raw.bills ? (raw.bills as unknown[])[0] : raw) as Record<string, unknown> | undefined;
    return d ? { type: 'bill_card', data: d } : null;
  },
  anomaly_card: (p) => {
    const a = p.anomaly as Record<string, unknown> | undefined;
    return a?.current_month ? { type: 'anomaly_card', data: a } : null;
  },
  plan_card: (p) => {
    const plans = p.plans as unknown[] | undefined;
    return plans?.length === 1 ? { type: 'plan_card', data: plans[0] } : null;
  },
};

function extractCard(toolName: string, parsed: Record<string, unknown>): CardData | null {
  const extractor = CARD_EXTRACTORS[toolName];
  if (extractor) return extractor(parsed);
  const hint = parsed._cardType as string | undefined;
  if (hint && CARD_EXTRACTORS[hint]) return CARD_EXTRACTORS[hint](parsed);
  return null;
}

describe('extractCard', () => {
  test('query_bill → bill_card', () => {
    const card = extractCard('query_bill', { found: true, bill: { month: '2026-03', total: 128 } });
    expect(card?.type).toBe('bill_card');
    expect((card?.data as any).month).toBe('2026-03');
  });

  test('query_bill with bills array → bill_card (first item)', () => {
    const card = extractCard('query_bill', { found: true, bills: [{ month: '2026-03' }, { month: '2026-02' }] });
    expect(card?.type).toBe('bill_card');
    expect((card?.data as any).month).toBe('2026-03');
  });

  test('cancel_service → cancel_card', () => {
    const card = extractCard('cancel_service', { success: true, service_name: '视频包', monthly_fee: 20, effective_end: '次月1日', phone: '138' });
    expect(card?.type).toBe('cancel_card');
    expect((card?.data as any).service_name).toBe('视频包');
  });

  test('cancel_service without service_name → null', () => {
    expect(extractCard('cancel_service', { success: false })).toBeNull();
  });

  test('query_plans with single plan → plan_card', () => {
    const card = extractCard('query_plans', { found: true, plans: [{ name: '畅享套餐', monthly_fee: 99 }] });
    expect(card?.type).toBe('plan_card');
  });

  test('query_plans with multiple plans → null', () => {
    expect(extractCard('query_plans', { found: true, plans: [{}, {}] })).toBeNull();
  });

  test('analyze_bill_anomaly → anomaly_card', () => {
    const card = extractCard('analyze_bill_anomaly', { current_month: '2026-03', previous_month: '2026-02' });
    expect(card?.type).toBe('anomaly_card');
  });

  test('diagnose_network → diagnostic_card', () => {
    const card = extractCard('diagnose_network', { success: true, issue_type: 'slow_data', diagnostic_steps: [], conclusion: 'ok' });
    expect(card?.type).toBe('diagnostic_card');
  });

  // Aggregated tool _cardType hint tests
  test('get_bill_context with _cardType hint → bill_card (nested MCP response)', () => {
    // callTool('query_bill') returns the full MCP response, not a flat BillCardData
    const card = extractCard('get_bill_context', {
      subscriber: { phone: '138' },
      bill: { bills: [{ month: '2026-03', total: 128, plan_fee: 50 }], count: 1, requested_month: '2026-03' },
      anomaly: null,
      _cardType: 'bill_card',
    });
    expect(card?.type).toBe('bill_card');
    expect((card?.data as any).month).toBe('2026-03');
    expect((card?.data as any).total).toBe(128);
    expect((card?.data as any).plan_fee).toBe(50);
  });

  test('get_bill_context with flat bill (legacy) → bill_card', () => {
    const card = extractCard('get_bill_context', {
      subscriber: { phone: '138' },
      bill: { month: '2026-03', total: 128 },
      anomaly: null,
      _cardType: 'bill_card',
    });
    expect(card?.type).toBe('bill_card');
    expect((card?.data as any).month).toBe('2026-03');
  });

  test('get_plan_context with _cardType hint → plan_card', () => {
    const card = extractCard('get_plan_context', {
      subscriber: { phone: '138' },
      plans: [{ name: '畅享套餐' }],
      _cardType: 'plan_card',
    });
    expect(card?.type).toBe('plan_card');
  });

  test('get_cancel_context with _cardType hint → bill_card (nested MCP response)', () => {
    const card = extractCard('get_cancel_context', {
      subscriber: { phone: '138' },
      plans: [{ name: '畅享套餐' }],
      bill: { bills: [{ month: '2026-03', total: 128 }], count: 1 },
      _cardType: 'bill_card',
    });
    expect(card?.type).toBe('bill_card');
    expect((card?.data as any).total).toBe(128);
  });

  test('unknown tool without _cardType → null', () => {
    expect(extractCard('some_random_tool', { data: 'foo' })).toBeNull();
  });
});
