/**
 * Unit tests for parent-sync-policy — 父单联动策略纯函数测试
 */
import { describe, test, expect } from 'bun:test';
import {
  deriveParentStatusFromAppointment,
  shouldRevertParentOnCancel,
  shouldAutoAdvanceParent,
} from '../../src/policies/parent-sync-policy';

describe('deriveParentStatusFromAppointment', () => {
  test('confirm → scheduled', () => {
    expect(deriveParentStatusFromAppointment('confirm', 'confirmed')).toBe('scheduled');
  });

  test('check_in → in_progress', () => {
    expect(deriveParentStatusFromAppointment('check_in', 'checked_in')).toBe('in_progress');
  });

  test('start → in_progress', () => {
    expect(deriveParentStatusFromAppointment('start', 'in_service')).toBe('in_progress');
  });

  test('complete + verification_mode=none → resolved', () => {
    expect(deriveParentStatusFromAppointment('complete', 'completed', 'none')).toBe('resolved');
  });

  test('complete + verification_mode=customer_confirm → waiting_verification', () => {
    expect(deriveParentStatusFromAppointment('complete', 'completed', 'customer_confirm')).toBe('waiting_verification');
  });

  test('complete + verification_mode=system_check → waiting_verification', () => {
    expect(deriveParentStatusFromAppointment('complete', 'completed', 'system_check')).toBe('waiting_verification');
  });

  test('complete + verification_mode=agent_review → waiting_verification', () => {
    expect(deriveParentStatusFromAppointment('complete', 'completed', 'agent_review')).toBe('waiting_verification');
  });

  test('complete + verification_mode=null → waiting_verification (default)', () => {
    expect(deriveParentStatusFromAppointment('complete', 'completed', null)).toBe('waiting_verification');
  });

  test('complete + verification_mode=undefined → waiting_verification (default)', () => {
    expect(deriveParentStatusFromAppointment('complete', 'completed')).toBe('waiting_verification');
  });

  test('no_show → waiting_customer', () => {
    expect(deriveParentStatusFromAppointment('no_show', 'no_show')).toBe('waiting_customer');
  });

  test('cancel → open (default fallback)', () => {
    expect(deriveParentStatusFromAppointment('cancel', 'cancelled')).toBe('open');
  });

  test('reschedule → scheduled', () => {
    expect(deriveParentStatusFromAppointment('reschedule', 'rescheduled')).toBe('scheduled');
  });
});

describe('shouldRevertParentOnCancel', () => {
  test('no siblings → open', () => {
    expect(shouldRevertParentOnCancel([])).toBe('open');
  });

  test('all siblings cancelled → open', () => {
    expect(shouldRevertParentOnCancel(['cancelled', 'cancelled'])).toBe('open');
  });

  test('all siblings no_show → open', () => {
    expect(shouldRevertParentOnCancel(['no_show'])).toBe('open');
  });

  test('siblings cancelled + no_show → open', () => {
    expect(shouldRevertParentOnCancel(['cancelled', 'no_show'])).toBe('open');
  });

  test('one sibling proposed → null (do not revert)', () => {
    expect(shouldRevertParentOnCancel(['proposed', 'cancelled'])).toBeNull();
  });

  test('one sibling confirmed → null', () => {
    expect(shouldRevertParentOnCancel(['confirmed'])).toBeNull();
  });

  test('one sibling in_service → null', () => {
    expect(shouldRevertParentOnCancel(['in_service', 'cancelled'])).toBeNull();
  });

  test('one sibling checked_in → null', () => {
    expect(shouldRevertParentOnCancel(['checked_in'])).toBeNull();
  });

  test('one sibling rescheduled → null', () => {
    expect(shouldRevertParentOnCancel(['rescheduled', 'no_show'])).toBeNull();
  });

  test('completed siblings only → open (completed is terminal, not active)', () => {
    expect(shouldRevertParentOnCancel(['completed'])).toBe('open');
  });
});

describe('shouldAutoAdvanceParent', () => {
  test('empty array → false', () => {
    expect(shouldAutoAdvanceParent([])).toBe(false);
  });

  test('all resolved → true', () => {
    expect(shouldAutoAdvanceParent(['resolved', 'resolved'])).toBe(true);
  });

  test('all closed → true', () => {
    expect(shouldAutoAdvanceParent(['closed'])).toBe(true);
  });

  test('all cancelled → true', () => {
    expect(shouldAutoAdvanceParent(['cancelled'])).toBe(true);
  });

  test('mix of resolved/closed/cancelled → true', () => {
    expect(shouldAutoAdvanceParent(['resolved', 'closed', 'cancelled'])).toBe(true);
  });

  test('one in_progress → false', () => {
    expect(shouldAutoAdvanceParent(['resolved', 'in_progress'])).toBe(false);
  });

  test('one new → false', () => {
    expect(shouldAutoAdvanceParent(['new', 'resolved'])).toBe(false);
  });

  test('one waiting_internal → false', () => {
    expect(shouldAutoAdvanceParent(['waiting_internal', 'resolved'])).toBe(false);
  });
});
