/**
 * Unit tests for: policy-engine-service
 */
import { describe, test, expect } from 'bun:test';
import { resolveDecisionMode, shouldAutoCreate } from '../../src/services/policy-engine-service';

describe('resolveDecisionMode', () => {
  test('agent_after_service → manual_confirm', () => {
    expect(resolveDecisionMode({ source_kind: 'agent_after_service' })).toBe('manual_confirm');
  });

  test('handoff_overflow → auto_create', () => {
    expect(resolveDecisionMode({ source_kind: 'handoff_overflow' })).toBe('auto_create');
  });

  test('emotion_escalation + high risk → auto_create', () => {
    expect(resolveDecisionMode({ source_kind: 'emotion_escalation', risk_score: 90 })).toBe('auto_create');
  });

  test('emotion_escalation + low risk → auto_create_if_confident', () => {
    expect(resolveDecisionMode({ source_kind: 'emotion_escalation', risk_score: 50 })).toBe('auto_create_if_confident');
  });

  test('emotion_escalation + no risk → auto_create_if_confident', () => {
    expect(resolveDecisionMode({ source_kind: 'emotion_escalation' })).toBe('auto_create_if_confident');
  });

  test('self_service_form → auto_create_if_confident', () => {
    expect(resolveDecisionMode({ source_kind: 'self_service_form' })).toBe('auto_create_if_confident');
  });

  test('external_monitoring + high risk → auto_create_and_schedule', () => {
    expect(resolveDecisionMode({ source_kind: 'external_monitoring', risk_score: 95 })).toBe('auto_create_and_schedule');
  });

  test('external_monitoring + medium risk → auto_create', () => {
    expect(resolveDecisionMode({ source_kind: 'external_monitoring', risk_score: 50 })).toBe('auto_create');
  });

  test('external_monitoring + no risk → auto_create', () => {
    expect(resolveDecisionMode({ source_kind: 'external_monitoring' })).toBe('auto_create');
  });
});

describe('shouldAutoCreate', () => {
  test('auto_create → always true', () => {
    expect(shouldAutoCreate('auto_create')).toBe(true);
  });

  test('auto_create_and_schedule → always true', () => {
    expect(shouldAutoCreate('auto_create_and_schedule')).toBe(true);
  });

  test('auto_create_if_confident with high score → true', () => {
    expect(shouldAutoCreate('auto_create_if_confident', 85)).toBe(true);
  });

  test('auto_create_if_confident with low score → false', () => {
    expect(shouldAutoCreate('auto_create_if_confident', 50)).toBe(false);
  });

  test('auto_create_if_confident with boundary score 80 → true', () => {
    expect(shouldAutoCreate('auto_create_if_confident', 80)).toBe(true);
  });

  test('auto_create_if_confident with null score → false', () => {
    expect(shouldAutoCreate('auto_create_if_confident', null)).toBe(false);
  });

  test('manual_confirm → always false', () => {
    expect(shouldAutoCreate('manual_confirm')).toBe(false);
  });
});
