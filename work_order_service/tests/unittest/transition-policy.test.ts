/**
 * 状态机单元测试 — 纯函数，无 DB 依赖
 */
import { describe, test, expect } from 'bun:test';
import {
  validateWorkOrderTransition,
  validateAppointmentTransition,
  getAvailableWorkOrderActions,
  getAvailableAppointmentActions,
  BOOKING_TO_ITEM_STATUS,
} from '../../src/policies/transition-policy';

describe('Work Order 状态机', () => {
  test('new → accept → open', () => {
    const r = validateWorkOrderTransition('new', 'accept');
    expect(r.valid).toBe(true);
    expect(r.toStatus).toBe('open');
  });

  test('open → start → in_progress', () => {
    const r = validateWorkOrderTransition('open', 'start');
    expect(r.valid).toBe(true);
    expect(r.toStatus).toBe('in_progress');
  });

  test('open → create_appointment → scheduled', () => {
    const r = validateWorkOrderTransition('open', 'create_appointment');
    expect(r.valid).toBe(true);
    expect(r.toStatus).toBe('scheduled');
  });

  test('in_progress → mark_waiting_verification → waiting_verification', () => {
    const r = validateWorkOrderTransition('in_progress', 'mark_waiting_verification');
    expect(r.valid).toBe(true);
    expect(r.toStatus).toBe('waiting_verification');
  });

  test('waiting_verification → verify_pass → resolved', () => {
    const r = validateWorkOrderTransition('waiting_verification', 'verify_pass');
    expect(r.valid).toBe(true);
    expect(r.toStatus).toBe('resolved');
  });

  test('waiting_verification → verify_fail → open', () => {
    const r = validateWorkOrderTransition('waiting_verification', 'verify_fail');
    expect(r.valid).toBe(true);
    expect(r.toStatus).toBe('open');
  });

  test('resolved → close → closed', () => {
    const r = validateWorkOrderTransition('resolved', 'close');
    expect(r.valid).toBe(true);
    expect(r.toStatus).toBe('closed');
  });

  test('resolved → reopen → open', () => {
    const r = validateWorkOrderTransition('resolved', 'reopen');
    expect(r.valid).toBe(true);
    expect(r.toStatus).toBe('open');
  });

  test('new → cancel → cancelled', () => {
    const r = validateWorkOrderTransition('new', 'cancel');
    expect(r.valid).toBe(true);
    expect(r.toStatus).toBe('cancelled');
  });

  test('invalid: new → start should fail', () => {
    const r = validateWorkOrderTransition('new', 'start');
    expect(r.valid).toBe(false);
    expect(r.error).toBeDefined();
  });

  test('invalid: closed → reopen should fail', () => {
    const r = validateWorkOrderTransition('closed', 'reopen');
    expect(r.valid).toBe(false);
  });

  test('invalid: resolved → cancel should fail', () => {
    const r = validateWorkOrderTransition('resolved', 'cancel');
    expect(r.valid).toBe(false);
  });

  test('unknown action should fail', () => {
    const r = validateWorkOrderTransition('open', 'fly_to_moon' as any);
    expect(r.valid).toBe(false);
    expect(r.error).toContain('未知动作');
  });

  test('getAvailableWorkOrderActions for new', () => {
    const actions = getAvailableWorkOrderActions('new');
    expect(actions).toContain('accept');
    expect(actions).toContain('cancel');
    expect(actions).not.toContain('start');
  });

  test('getAvailableWorkOrderActions for resolved', () => {
    const actions = getAvailableWorkOrderActions('resolved');
    expect(actions).toContain('close');
    expect(actions).toContain('reopen');
    expect(actions).not.toContain('cancel');
  });
});

describe('Appointment 状态机', () => {
  test('proposed → confirm → confirmed', () => {
    const r = validateAppointmentTransition('proposed', 'confirm');
    expect(r.valid).toBe(true);
    expect(r.toBookingStatus).toBe('confirmed');
    expect(r.toStatus).toBe('scheduled');
  });

  test('confirmed → check_in → checked_in', () => {
    const r = validateAppointmentTransition('confirmed', 'check_in');
    expect(r.valid).toBe(true);
    expect(r.toBookingStatus).toBe('checked_in');
    expect(r.toStatus).toBe('in_progress');
  });

  test('checked_in → start → in_service', () => {
    const r = validateAppointmentTransition('checked_in', 'start');
    expect(r.valid).toBe(true);
    expect(r.toBookingStatus).toBe('in_service');
    expect(r.toStatus).toBe('in_progress');
  });

  test('in_service → complete → completed', () => {
    const r = validateAppointmentTransition('in_service', 'complete');
    expect(r.valid).toBe(true);
    expect(r.toBookingStatus).toBe('completed');
    expect(r.toStatus).toBe('resolved');
  });

  test('confirmed → reschedule → rescheduled', () => {
    const r = validateAppointmentTransition('confirmed', 'reschedule');
    expect(r.valid).toBe(true);
    expect(r.toBookingStatus).toBe('rescheduled');
  });

  test('rescheduled → confirm → confirmed', () => {
    const r = validateAppointmentTransition('rescheduled', 'confirm');
    expect(r.valid).toBe(true);
    expect(r.toBookingStatus).toBe('confirmed');
  });

  test('confirmed → no_show → no_show', () => {
    const r = validateAppointmentTransition('confirmed', 'no_show');
    expect(r.valid).toBe(true);
    expect(r.toBookingStatus).toBe('no_show');
    expect(r.toStatus).toBe('waiting_customer');
  });

  test('confirmed → cancel → cancelled', () => {
    const r = validateAppointmentTransition('confirmed', 'cancel');
    expect(r.valid).toBe(true);
    expect(r.toBookingStatus).toBe('cancelled');
    expect(r.toStatus).toBe('cancelled');
  });

  test('invalid: proposed → complete should fail', () => {
    const r = validateAppointmentTransition('proposed', 'complete');
    expect(r.valid).toBe(false);
  });

  test('invalid: completed → cancel should fail', () => {
    const r = validateAppointmentTransition('completed', 'cancel');
    expect(r.valid).toBe(false);
  });

  test('getAvailableAppointmentActions for confirmed', () => {
    const actions = getAvailableAppointmentActions('confirmed');
    expect(actions).toContain('check_in');
    expect(actions).toContain('reschedule');
    expect(actions).toContain('no_show');
    expect(actions).toContain('cancel');
  });
});

describe('BOOKING_TO_ITEM_STATUS 映射', () => {
  test('proposed/confirmed → scheduled', () => {
    expect(BOOKING_TO_ITEM_STATUS['proposed']).toBe('scheduled');
    expect(BOOKING_TO_ITEM_STATUS['confirmed']).toBe('scheduled');
  });

  test('checked_in/in_service → in_progress', () => {
    expect(BOOKING_TO_ITEM_STATUS['checked_in']).toBe('in_progress');
    expect(BOOKING_TO_ITEM_STATUS['in_service']).toBe('in_progress');
  });

  test('completed → resolved', () => {
    expect(BOOKING_TO_ITEM_STATUS['completed']).toBe('resolved');
  });

  test('no_show → waiting_customer', () => {
    expect(BOOKING_TO_ITEM_STATUS['no_show']).toBe('waiting_customer');
  });

  test('cancelled → cancelled', () => {
    expect(BOOKING_TO_ITEM_STATUS['cancelled']).toBe('cancelled');
  });
});
