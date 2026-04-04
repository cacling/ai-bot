import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  sleep,
  continueAsNew,
  startChild,
} from '@temporalio/workflow';

import type { OutboundTaskInput, OutboundTaskResult } from '../types.js';
import type * as outboundActivities from '../activities/outbound.js';
import type * as notifyActivities from '../activities/notify.js';

const {
  getOutboundTask,
  updateOutboundTaskStatus,
  checkAllowedHours,
  checkDnd,
  initiateOutboundCall,
} = proxyActivities<typeof outboundActivities>({
  startToCloseTimeout: '30s',
  retry: { maximumAttempts: 3 },
});

const { notifyWorkbench } = proxyActivities<typeof notifyActivities>({
  startToCloseTimeout: '30s',
  retry: { maximumAttempts: 3 },
});

// ─── Signals ───
interface CallResult {
  result: 'no_answer' | 'busy' | 'voicemail' | 'callback_request' |
          'transfer' | 'vulnerable' | 'dispute' | 'ptp' | 'converted';
  remark?: string;
  callbackTime?: string;
  ptpDate?: string;
}

export const callResultRecordedSignal = defineSignal<[CallResult]>('callResultRecorded');
export const handoffRequestedSignal = defineSignal<[{ reason: string }]>('handoffRequested');
export const taskCancelledSignal = defineSignal('taskCancelled');

// ─── Query ───
interface OutboundTaskStatus {
  taskId: string;
  retryCount: number;
  lastResult: string | null;
  status: 'waiting_hours' | 'calling' | 'waiting_result' | 'retrying' | 'completed' | 'cancelled';
}

export const getOutboundTaskStatusQuery = defineQuery<OutboundTaskStatus>('getOutboundTaskStatus');

const MAX_RETRIES = 5;
const RETRY_INTERVAL_MS = 30 * 60 * 1000; // 30 分钟
const RESULT_WAIT_TIMEOUT_MS = 60 * 60 * 1000; // 1 小时等待通话结果
const CONTINUE_AS_NEW_THRESHOLD = 80; // 事件数阈值

export async function outboundTaskWorkflow(
  input: OutboundTaskInput & { retryCount?: number; lastResult?: string },
): Promise<OutboundTaskResult> {
  const { taskId, taskType, phone, sessionId } = input;
  let retryCount = input.retryCount ?? 0;
  let lastResult: string | null = input.lastResult ?? null;

  // 状态
  let callResult: CallResult | null = null;
  let handoffReason: string | null = null;
  let cancelled = false;
  let currentStatus: OutboundTaskStatus['status'] = 'waiting_hours';

  // Query handler
  setHandler(getOutboundTaskStatusQuery, () => ({
    taskId,
    retryCount,
    lastResult,
    status: currentStatus,
  }));

  // Signal handlers
  setHandler(callResultRecordedSignal, (result) => {
    callResult = result;
  });

  setHandler(handoffRequestedSignal, ({ reason }) => {
    handoffReason = reason;
  });

  setHandler(taskCancelledSignal, () => {
    cancelled = true;
  });

  // 读取任务信息
  await getOutboundTask(taskId);
  await updateOutboundTaskStatus(taskId, 'in_progress');

  // ─── 主循环 ───
  while (retryCount < MAX_RETRIES) {
    // 检查取消
    if (cancelled) {
      await updateOutboundTaskStatus(taskId, 'cancelled');
      return { taskId, finalStatus: 'cancelled' };
    }

    // 1. 检查合法外呼时段
    currentStatus = 'waiting_hours';
    const hours = await checkAllowedHours(taskType);
    if (!hours.allowed && hours.nextWindowAt) {
      const waitMs = new Date(hours.nextWindowAt).getTime() - Date.now();
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      // 跨天等待后 Continue-As-New 避免 history 过长
      if (retryCount > 0) {
        await continueAsNew<typeof outboundTaskWorkflow>({
          ...input,
          retryCount,
          lastResult: lastResult ?? undefined,
        });
      }
      continue;
    }

    // 2. 检查 DND
    const isDnd = await checkDnd(phone);
    if (isDnd) {
      await updateOutboundTaskStatus(taskId, 'dnd_blocked');
      return { taskId, finalStatus: 'cancelled' };
    }

    // 检查取消（在 DND 检查后）
    if (cancelled) {
      await updateOutboundTaskStatus(taskId, 'cancelled');
      return { taskId, finalStatus: 'cancelled' };
    }

    // 3. 发起外呼
    currentStatus = 'calling';
    await initiateOutboundCall(taskId, sessionId);

    // 4. 等待通话结果 Signal
    currentStatus = 'waiting_result';
    callResult = null;
    handoffReason = null;

    const resultDeadline = Date.now() + RESULT_WAIT_TIMEOUT_MS;
    while (!callResult && !handoffReason && !cancelled && Date.now() < resultDeadline) {
      await sleep('30s');
    }

    // 检查取消
    if (cancelled) {
      await updateOutboundTaskStatus(taskId, 'cancelled');
      return { taskId, finalStatus: 'cancelled' };
    }

    // 检查 handoff 请求
    if (handoffReason) {
      await startChild('humanHandoffWorkflow', {
        workflowId: `handoff/outbound-${taskId}`,
        args: [{
          handoffId: `outbound-${taskId}`,
          phone,
          sourceSkill: `outbound-${taskType}`,
          queueName: 'outbound',
          reason: handoffReason,
          taskId,
        }],
      });
      return { taskId, finalStatus: 'handoff' };
    }

    // 处理通话结果（signal handler mutates callResult; TS can't track that)
    const cr = callResult as CallResult | null;
    if (cr) {
      lastResult = cr.result;

      switch (cr.result) {
        case 'ptp':
        case 'converted':
          await updateOutboundTaskStatus(taskId, 'completed');
          return { taskId, finalStatus: 'completed' };

        case 'callback_request':
          if (cr.callbackTime) {
            await startChild('callbackWorkflow', {
              workflowId: `callback/outbound-${taskId}`,
              args: [{
                callbackTaskId: `CB-${taskId}`,
                originalTaskId: taskId,
                phone,
                preferredTime: cr.callbackTime,
              }],
            });
          }
          return { taskId, finalStatus: 'callback_scheduled' };

        case 'transfer':
        case 'vulnerable':
        case 'dispute':
          await startChild('humanHandoffWorkflow', {
            workflowId: `handoff/outbound-${taskId}-${retryCount}`,
            args: [{
              handoffId: `outbound-${taskId}-${retryCount}`,
              phone,
              sourceSkill: `outbound-${taskType}`,
              queueName: 'outbound',
              reason: `${cr.result}: ${cr.remark ?? ''}`,
              taskId,
            }],
          });
          return { taskId, finalStatus: 'handoff' };

        case 'no_answer':
        case 'busy':
        case 'voicemail':
          retryCount++;
          if (retryCount >= MAX_RETRIES) {
            await updateOutboundTaskStatus(taskId, 'max_retry_reached');
            await notifyWorkbench({
              event_type: 'outbound_max_retry',
              payload: { task_id: taskId, phone, retry_count: retryCount },
            });
            return { taskId, finalStatus: 'cancelled' };
          }
          // 等待重试间隔
          currentStatus = 'retrying';
          await sleep(RETRY_INTERVAL_MS);

          // Continue-As-New 避免 history 过长
          if (retryCount % 2 === 0 || retryCount > CONTINUE_AS_NEW_THRESHOLD) {
            await continueAsNew<typeof outboundTaskWorkflow>({
              ...input,
              retryCount,
              lastResult: lastResult ?? undefined,
            });
          }
          break;

        default:
          // 未知结果类型，视为需要重试
          retryCount++;
          currentStatus = 'retrying';
          await sleep(RETRY_INTERVAL_MS);
          break;
      }
    } else {
      // 超时未收到结果
      retryCount++;
      currentStatus = 'retrying';
      if (retryCount >= MAX_RETRIES) {
        await updateOutboundTaskStatus(taskId, 'max_retry_reached');
        return { taskId, finalStatus: 'cancelled' };
      }
      await sleep(RETRY_INTERVAL_MS);
    }
  }

  // 循环结束 — 不应到达
  await updateOutboundTaskStatus(taskId, 'max_retry_reached');
  return { taskId, finalStatus: 'cancelled' };
}
