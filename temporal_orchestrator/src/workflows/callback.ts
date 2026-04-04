import {
  proxyActivities,
  defineSignal,
  setHandler,
  sleep,
  continueAsNew,
} from '@temporalio/workflow';

import type { CallbackInput, CallbackResult } from '../types.js';
import type * as outboundActivities from '../activities/outbound.js';
import type * as notifyActivities from '../activities/notify.js';

const { getCallbackTask, updateCallbackStatus, triggerOutboundCall } =
  proxyActivities<typeof outboundActivities>({
    startToCloseTimeout: '30s',
    retry: { maximumAttempts: 3 },
  });

const { notifySmsReminder } = proxyActivities<typeof notifyActivities>({
  startToCloseTimeout: '30s',
  retry: { maximumAttempts: 2 },
});

// ─── Signals ───
export const callbackCompletedSignal = defineSignal('callbackCompleted');
export const callbackRescheduledSignal = defineSignal<[{ newTime: string }]>('callbackRescheduled');
export const callbackCancelledSignal = defineSignal('callbackCancelled');

export async function callbackWorkflow(input: CallbackInput): Promise<CallbackResult> {
  const { callbackTaskId, phone } = input;
  let { preferredTime } = input;

  // 读取最新状态
  await getCallbackTask(callbackTaskId);
  await updateCallbackStatus(callbackTaskId, 'in_progress');

  // Signal 驱动的状态机
  let finalStatus: CallbackResult['finalStatus'] | null = null;
  let newPreferredTime: string | null = null;

  setHandler(callbackCompletedSignal, () => {
    finalStatus = 'completed';
  });

  setHandler(callbackRescheduledSignal, ({ newTime }) => {
    newPreferredTime = newTime;
  });

  setHandler(callbackCancelledSignal, () => {
    finalStatus = 'cancelled';
  });

  // 计算等待时间
  const targetMs = new Date(preferredTime).getTime();
  const nowMs = Date.now();
  const reminderLeadMs = 15 * 60 * 1000; // 15 分钟提前提醒

  // 等到 preferredTime - 15min（如果还有时间的话）
  const msUntilReminder = targetMs - reminderLeadMs - nowMs;
  if (msUntilReminder > 0) {
    await sleep(msUntilReminder);

    // 检查是否在等待期间收到了 signal
    if (finalStatus === 'cancelled') {
      await updateCallbackStatus(callbackTaskId, 'cancelled');
      return { callbackTaskId, finalStatus: 'cancelled' };
    }
    if (newPreferredTime) {
      await updateCallbackStatus(callbackTaskId, 'rescheduled');
      await continueAsNew<typeof callbackWorkflow>({
        ...input,
        preferredTime: newPreferredTime,
      });
    }

    // 发送提前提醒短信（best-effort）
    await notifySmsReminder(phone, 'callback_reminder');
  }

  // 等到 preferredTime
  const msUntilCall = targetMs - Date.now();
  if (msUntilCall > 0) {
    await sleep(msUntilCall);
  }

  // 再次检查 signal
  if (finalStatus === 'cancelled') {
    await updateCallbackStatus(callbackTaskId, 'cancelled');
    return { callbackTaskId, finalStatus: 'cancelled' };
  }
  if (newPreferredTime) {
    await updateCallbackStatus(callbackTaskId, 'rescheduled');
    await continueAsNew<typeof callbackWorkflow>({
      ...input,
      preferredTime: newPreferredTime,
    });
  }

  // 触发回拨
  await triggerOutboundCall(callbackTaskId);

  // 等待完成 signal（最长 2 小时超时）
  const callTimeoutMs = 2 * 60 * 60 * 1000;
  const deadline = Date.now() + callTimeoutMs;

  while (!finalStatus && Date.now() < deadline) {
    await sleep('1m');

    if (newPreferredTime) {
      await updateCallbackStatus(callbackTaskId, 'rescheduled');
      await continueAsNew<typeof callbackWorkflow>({
        ...input,
        preferredTime: newPreferredTime,
      });
    }
  }

  if (finalStatus === 'completed') {
    await updateCallbackStatus(callbackTaskId, 'completed');
    return { callbackTaskId, finalStatus: 'completed' };
  }

  if (finalStatus === 'cancelled') {
    await updateCallbackStatus(callbackTaskId, 'cancelled');
    return { callbackTaskId, finalStatus: 'cancelled' };
  }

  // 超时未收到结果 — 标记完成（回拨已触发，结果未知）
  await updateCallbackStatus(callbackTaskId, 'completed');
  return { callbackTaskId, finalStatus: 'completed' };
}
