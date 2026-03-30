/**
 * Unit tests for: issue-matching-service scoring functions
 */
import { describe, test, expect } from 'bun:test';
import {
  scoreIdentity,
  scoreBusinessObject,
  scoreCategory,
  scoreSemantic,
  scoreRecency,
  scoreRiskSignal,
  scoreCandidate,
  applyThresholds,
} from '../../src/services/issue-matching-service';

const baseThread = {
  customer_phone: '13800000001',
  customer_id: 'cust_001',
  canonical_category_code: 'ticket.incident.app_login',
  canonical_subject: 'App 登录异常',
  last_seen_at: new Date().toISOString(),
  status: 'open',
  reopen_until: null,
  metadata_json: JSON.stringify({ source_kind: 'agent_after_service', source_ref: 'sess_001' }),
};

describe('scoreIdentity', () => {
  test('customer_id exact match → 30', () => {
    expect(scoreIdentity({ customer_id: 'cust_001' }, baseThread)).toBe(30);
  });

  test('phone match (no customer_id) → 20', () => {
    expect(scoreIdentity({ customer_phone: '13800000001' }, baseThread)).toBe(20);
  });

  test('no match → 0', () => {
    expect(scoreIdentity({ customer_phone: '13899999999' }, baseThread)).toBe(0);
  });

  test('customer_id takes priority over phone', () => {
    expect(scoreIdentity({ customer_id: 'cust_001', customer_phone: '13899999999' }, baseThread)).toBe(30);
  });
});

describe('scoreBusinessObject', () => {
  test('same source_ref → 25', () => {
    expect(scoreBusinessObject({ source_ref: 'sess_001' } as any, baseThread)).toBe(25);
  });

  test('same source_kind → 15', () => {
    expect(scoreBusinessObject({ source_kind: 'agent_after_service' } as any, baseThread)).toBe(15);
  });

  test('no match → 0', () => {
    expect(scoreBusinessObject({ source_kind: 'handoff_overflow' } as any, {
      ...baseThread,
      metadata_json: JSON.stringify({ source_kind: 'emotion_escalation' }),
    })).toBe(0);
  });
});

describe('scoreCategory', () => {
  test('same leaf category → 15', () => {
    const intake = { normalized_payload_json: JSON.stringify({ category_code: 'ticket.incident.app_login' }) };
    expect(scoreCategory(intake, baseThread)).toBe(15);
  });

  test('same parent → 8', () => {
    const intake = { normalized_payload_json: JSON.stringify({ category_code: 'ticket.incident.service_suspend' }) };
    expect(scoreCategory(intake, baseThread)).toBe(8);
  });

  test('same domain → 5', () => {
    const intake = { normalized_payload_json: JSON.stringify({ category_code: 'ticket.request.branch_handle' }) };
    expect(scoreCategory(intake, baseThread)).toBe(5);
  });

  test('no category → 0', () => {
    expect(scoreCategory({}, baseThread)).toBe(0);
  });
});

describe('scoreSemantic', () => {
  test('exact match → 15', () => {
    expect(scoreSemantic({ subject: 'App 登录异常' }, baseThread)).toBe(15);
  });

  test('case insensitive exact → 15', () => {
    expect(scoreSemantic({ subject: 'app 登录异常' }, baseThread)).toBe(15);
  });

  test('substring match → 8', () => {
    expect(scoreSemantic({ subject: 'App 登录异常再次出现' }, baseThread)).toBe(8);
  });

  test('no match → 0', () => {
    expect(scoreSemantic({ subject: '套餐变更' }, baseThread)).toBe(0);
  });
});

describe('scoreRecency', () => {
  test('last seen within 24h → 10', () => {
    const recent = { ...baseThread, last_seen_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() };
    expect(scoreRecency(recent)).toBe(10);
  });

  test('last seen 48h ago → 6', () => {
    const older = { ...baseThread, last_seen_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() };
    expect(scoreRecency(older)).toBe(6);
  });

  test('last seen 5 days ago → 3', () => {
    const old = { ...baseThread, last_seen_at: new Date(Date.now() - 120 * 60 * 60 * 1000).toISOString() };
    expect(scoreRecency(old)).toBe(3);
  });

  test('last seen 8 days ago → 0', () => {
    const stale = { ...baseThread, last_seen_at: new Date(Date.now() - 200 * 60 * 60 * 1000).toISOString() };
    expect(scoreRecency(stale)).toBe(0);
  });
});

describe('scoreRiskSignal', () => {
  test('matching risk tags → 5', () => {
    const intake = { signal_json: JSON.stringify({ risk_tags: ['vip', 'complaint'] }) };
    const thread = { ...baseThread, metadata_json: JSON.stringify({ risk_tags: ['complaint'] }) };
    expect(scoreRiskSignal(intake, thread)).toBe(5);
  });

  test('no signals → 0', () => {
    expect(scoreRiskSignal({}, baseThread)).toBe(0);
  });
});

describe('scoreCandidate (composite)', () => {
  test('high similarity returns high score', () => {
    const intake = {
      customer_id: 'cust_001',
      subject: 'App 登录异常',
      normalized_payload_json: JSON.stringify({ category_code: 'ticket.incident.app_login' }),
      source_ref: 'sess_001',
    };
    const result = scoreCandidate(intake as any, baseThread);
    expect(result.total).toBeGreaterThanOrEqual(85);
    expect(result.breakdown.identity).toBe(30);
    expect(result.breakdown.category).toBe(15);
    expect(result.breakdown.semantic).toBe(15);
  });

  test('different customer returns low score', () => {
    const intake = {
      customer_phone: '13899999999',
      subject: '完全不同的问题',
    };
    const result = scoreCandidate(intake, baseThread);
    expect(result.total).toBeLessThan(30);
  });
});

describe('applyThresholds', () => {
  test('score >= 85 with open thread → append_followup', () => {
    expect(applyThresholds(90, 'open')).toBe('append_followup');
  });

  test('score >= 85 with resolved → append_followup', () => {
    expect(applyThresholds(88, 'resolved')).toBe('append_followup');
  });

  test('score >= 80 with closed + valid reopen → reopen_master', () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(applyThresholds(82, 'closed', future)).toBe('reopen_master');
  });

  test('score >= 80 with closed + expired reopen → create_new_thread', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(applyThresholds(82, 'closed', past)).toBe('create_new_thread');
  });

  test('score < 65 → create_new_thread', () => {
    expect(applyThresholds(60, 'open')).toBe('create_new_thread');
  });
});
