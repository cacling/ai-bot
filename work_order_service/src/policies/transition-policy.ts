/**
 * 状态机 — 纯函数，定义各类型 work_item 的合法状态流转
 *
 * 对齐设计文档 §5.2-§5.5
 */
import type { WorkItemStatus, WorkOrderAction, AppointmentAction, BookingStatus } from "../types.js";

// ── Work Order 状态机（§5.3）──────────────────────────────────────────────────

/** action → { from[], to } */
const WORK_ORDER_TRANSITIONS: Record<WorkOrderAction, { from: WorkItemStatus[]; to: WorkItemStatus }> = {
  accept:                    { from: ['new'],                                                          to: 'open' },
  start:                     { from: ['open', 'scheduled'],                                            to: 'in_progress' },
  create_appointment:        { from: ['open'],                                                         to: 'scheduled' },
  mark_waiting_customer:     { from: ['open', 'scheduled', 'in_progress'],                             to: 'waiting_customer' },
  mark_waiting_internal:     { from: ['open', 'in_progress'],                                          to: 'waiting_internal' },
  mark_waiting_external:     { from: ['open'],                                                         to: 'waiting_external' },
  mark_waiting_verification: { from: ['in_progress'],                                                  to: 'waiting_verification' },
  verify_pass:               { from: ['waiting_verification'],                                         to: 'resolved' },
  verify_fail:               { from: ['waiting_verification'],                                         to: 'open' },
  resolve:                   { from: ['in_progress', 'waiting_customer', 'waiting_internal', 'waiting_external'], to: 'resolved' },
  close:                     { from: ['resolved'],                                                     to: 'closed' },
  cancel:                    { from: ['new', 'open', 'scheduled', 'waiting_customer', 'waiting_internal', 'waiting_external'], to: 'cancelled' },
  reopen:                    { from: ['resolved'],                                                     to: 'open' },
};

// ── Appointment 状态机（§5.4）────────────────────────────────────────────────

const APPOINTMENT_TRANSITIONS: Record<AppointmentAction, { from: BookingStatus[]; to: BookingStatus }> = {
  confirm:    { from: ['proposed', 'rescheduled'],         to: 'confirmed' },
  reschedule: { from: ['confirmed'],                       to: 'rescheduled' },
  check_in:   { from: ['confirmed'],                       to: 'checked_in' },
  start:      { from: ['checked_in'],                      to: 'in_service' },
  complete:   { from: ['in_service'],                      to: 'completed' },
  no_show:    { from: ['confirmed'],                       to: 'no_show' },
  cancel:     { from: ['proposed', 'confirmed', 'rescheduled'], to: 'cancelled' },
};

/** Appointment booking_status → work_items.status 映射（§5.4 底部）*/
export const BOOKING_TO_ITEM_STATUS: Record<BookingStatus, WorkItemStatus> = {
  proposed:    'scheduled',
  confirmed:   'scheduled',
  rescheduled: 'scheduled',
  checked_in:  'in_progress',
  in_service:  'in_progress',
  completed:   'resolved',
  no_show:     'waiting_customer',
  cancelled:   'cancelled',
};

// ── 公共 API ────────────────────────────────────────────────────────────────

export interface TransitionResult {
  valid: boolean;
  toStatus?: WorkItemStatus;
  toBookingStatus?: BookingStatus;
  error?: string;
}

/**
 * 验证 Work Order 状态流转
 */
export function validateWorkOrderTransition(
  currentStatus: WorkItemStatus,
  action: WorkOrderAction,
): TransitionResult {
  const rule = WORK_ORDER_TRANSITIONS[action];
  if (!rule) {
    return { valid: false, error: `未知动作: ${action}` };
  }
  if (!rule.from.includes(currentStatus)) {
    return {
      valid: false,
      error: `当前状态 "${currentStatus}" 不允许执行 "${action}"（需要: ${rule.from.join(' | ')})`,
    };
  }
  return { valid: true, toStatus: rule.to };
}

/**
 * 验证 Appointment 状态流转
 */
export function validateAppointmentTransition(
  currentBookingStatus: BookingStatus,
  action: AppointmentAction,
): TransitionResult {
  const rule = APPOINTMENT_TRANSITIONS[action];
  if (!rule) {
    return { valid: false, error: `未知动作: ${action}` };
  }
  if (!rule.from.includes(currentBookingStatus)) {
    return {
      valid: false,
      error: `当前预约状态 "${currentBookingStatus}" 不允许执行 "${action}"（需要: ${rule.from.join(' | ')})`,
    };
  }
  const toBookingStatus = rule.to;
  const toStatus = BOOKING_TO_ITEM_STATUS[toBookingStatus];
  return { valid: true, toStatus, toBookingStatus };
}

/**
 * 获取 Work Order 当前可用动作
 */
export function getAvailableWorkOrderActions(currentStatus: WorkItemStatus): WorkOrderAction[] {
  const actions: WorkOrderAction[] = [];
  for (const [action, rule] of Object.entries(WORK_ORDER_TRANSITIONS)) {
    if (rule.from.includes(currentStatus)) {
      actions.push(action as WorkOrderAction);
    }
  }
  return actions;
}

/**
 * 获取 Appointment 当前可用动作
 */
export function getAvailableAppointmentActions(currentBookingStatus: BookingStatus): AppointmentAction[] {
  const actions: AppointmentAction[] = [];
  for (const [action, rule] of Object.entries(APPOINTMENT_TRANSITIONS)) {
    if (rule.from.includes(currentBookingStatus)) {
      actions.push(action as AppointmentAction);
    }
  }
  return actions;
}
