/**
 * workflow-policy.ts — Workflow Run 状态流转��函数
 */
import type { WorkflowRunStatus } from "../types.js";

interface WorkflowTransitionResult {
  valid: boolean;
  toStatus?: WorkflowRunStatus;
  error?: string;
}

/**
 * 验证 Workflow Run 状态流转是否合法
 */
export function validateWorkflowRunTransition(
  currentStatus: WorkflowRunStatus,
  event: 'advance' | 'wait_signal' | 'wait_child' | 'signal_received' | 'child_done' | 'complete' | 'fail' | 'cancel',
): WorkflowTransitionResult {
  switch (event) {
    case 'wait_signal':
      if (currentStatus !== 'running') return { valid: false, error: `只有 running 可以进入 waiting_signal` };
      return { valid: true, toStatus: 'waiting_signal' };

    case 'wait_child':
      if (currentStatus !== 'running') return { valid: false, error: `只有 running 可以进入 waiting_child` };
      return { valid: true, toStatus: 'waiting_child' };

    case 'signal_received':
      if (currentStatus !== 'waiting_signal') return { valid: false, error: `只有 waiting_signal 可以接收信号` };
      return { valid: true, toStatus: 'running' };

    case 'child_done':
      if (currentStatus !== 'waiting_child') return { valid: false, error: `只有 waiting_child 可以恢复` };
      return { valid: true, toStatus: 'running' };

    case 'advance':
      if (currentStatus !== 'running') return { valid: false, error: `只有 running 可以前进` };
      return { valid: true, toStatus: 'running' };

    case 'complete':
      if (currentStatus !== 'running') return { valid: false, error: `只有 running 可以完成` };
      return { valid: true, toStatus: 'completed' };

    case 'fail':
      return { valid: true, toStatus: 'failed' };

    case 'cancel':
      if (currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'cancelled') {
        return { valid: false, error: `已终结的 workflow 不能取消` };
      }
      return { valid: true, toStatus: 'cancelled' };

    default:
      return { valid: false, error: `未知事件: ${event}` };
  }
}
