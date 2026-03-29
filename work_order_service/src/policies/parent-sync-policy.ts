/**
 * parent-sync-policy.ts — 子项状态变更驱动父单状态的纯函数策略
 *
 * 从 appointment-service.ts 抽离，增加 verification_mode 感知和多预约 cancel 判断
 */
import type { AppointmentAction, BookingStatus, WorkItemStatus, VerificationMode } from "../types.js";

/** 有效（未终结）的预约状态 */
const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  'proposed', 'confirmed', 'rescheduled', 'checked_in', 'in_service',
];

/**
 * 根据预约动作推导父工单应进入的状态
 *
 * @param action 预约动作
 * @param _toBookingStatus 预约目标 booking_status（保留参数，未来扩展用）
 * @param verificationMode 父工单的 verification_mode（仅 complete 时使用）
 * @returns 父工单下一状态，null 表示不需要更新
 */
export function deriveParentStatusFromAppointment(
  action: AppointmentAction,
  _toBookingStatus: string,
  verificationMode?: VerificationMode | null,
): WorkItemStatus | null {
  switch (action) {
    case 'confirm':
      return 'scheduled';
    case 'check_in':
    case 'start':
      return 'in_progress';
    case 'complete':
      // verification_mode 感知：none → resolved，其余 → waiting_verification
      return verificationMode === 'none' ? 'resolved' : 'waiting_verification';
    case 'no_show':
      return 'waiting_customer';
    case 'cancel':
      // cancel 的实际处理由 shouldRevertParentOnCancel 决定
      // 这里返回 'open' 作为默认值，调用方应优先使用 shouldRevertParentOnCancel
      return 'open';
    case 'reschedule':
      return 'scheduled';
    default:
      return null;
  }
}

/**
 * 取消预约时，根据兄弟预约状态决定是否回退父单
 *
 * @param siblingBookingStatuses 同父的其他预约的 booking_status（不含当前被 cancel 的预约）
 * @returns 父单应进入的状态，null 表示不回退（仍有有效预约）
 */
export function shouldRevertParentOnCancel(
  siblingBookingStatuses: BookingStatus[],
): WorkItemStatus | null {
  const hasActive = siblingBookingStatuses.some(s => ACTIVE_BOOKING_STATUSES.includes(s));
  return hasActive ? null : 'open';
}

/**
 * Task 完成后判断父单是否应自动推进
 *
 * @param siblingTaskStatuses 同父的所有 task 的 work_items.status
 * @returns true 表示所有 task 均已终结，父单可推进
 */
export function shouldAutoAdvanceParent(
  siblingTaskStatuses: WorkItemStatus[],
): boolean {
  const terminalStatuses: WorkItemStatus[] = ['resolved', 'closed', 'cancelled'];
  return siblingTaskStatuses.length > 0 && siblingTaskStatuses.every(s => terminalStatuses.includes(s));
}
