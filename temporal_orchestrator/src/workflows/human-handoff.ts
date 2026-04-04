import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  sleep,
} from '@temporalio/workflow';

import type { HumanHandoffInput, HumanHandoffResult } from '../types.js';
import type * as outboundActivities from '../activities/outbound.js';
import type * as notifyActivities from '../activities/notify.js';

const { createHandoffCase, updateHandoffStatus } =
  proxyActivities<typeof outboundActivities>({
    startToCloseTimeout: '30s',
    retry: { maximumAttempts: 3 },
  });

const { notifyWorkbench } = proxyActivities<typeof notifyActivities>({
  startToCloseTimeout: '30s',
  retry: { maximumAttempts: 3 },
});

// ─── Signals ───
export const acceptedSignal = defineSignal<[{ assignee: string }]>('accepted');
export const resolvedSignal = defineSignal<[{ resolution: string }]>('resolved');
export const resumeAiSignal = defineSignal<[{ context: string }]>('resumeAi');
export const rejectResumeSignal = defineSignal<[{ reason: string }]>('rejectResume');

// ─── Query ───
export const getHandoffStatusQuery = defineQuery<HandoffStatus>('getHandoffStatus');

interface HandoffStatus {
  status: 'pending' | 'accepted' | 'resolved' | 'resumed_ai' | 'escalated';
  assignee: string | null;
  resumeReady: boolean;
  resolution: string | null;
}

const SLA_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 小时 SLA

export async function humanHandoffWorkflow(input: HumanHandoffInput): Promise<HumanHandoffResult> {
  const { handoffId, phone, sourceSkill, queueName, reason } = input;

  // 状态
  let status: HandoffStatus = {
    status: 'pending',
    assignee: null,
    resumeReady: false,
    resolution: null,
  };

  // Query handler
  setHandler(getHandoffStatusQuery, () => status);

  // 创建 handoff case（幂等）
  const { case_id } = await createHandoffCase({
    phone,
    sourceSkill,
    reason,
    queueName,
    idempotencyKey: handoffId,
  });

  // 通知坐席工作台
  await notifyWorkbench({
    handoff_id: handoffId,
    phone,
    event_type: 'handoff_created',
    payload: { case_id, source_skill: sourceSkill, reason, queue_name: queueName },
  });

  // Signal handlers
  setHandler(acceptedSignal, ({ assignee }) => {
    status = { ...status, status: 'accepted', assignee };
  });

  setHandler(resolvedSignal, ({ resolution }) => {
    status = { ...status, status: 'resolved', resolution };
  });

  setHandler(resumeAiSignal, ({ context }) => {
    status = { ...status, status: 'resumed_ai', resumeReady: true, resolution: context };
  });

  setHandler(rejectResumeSignal, () => {
    status = { ...status, resumeReady: false };
  });

  // 等待结果 — SLA 超时兜底
  const deadline = Date.now() + SLA_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep('1m');

    if (status.status === 'resolved') {
      await updateHandoffStatus(case_id, 'resolved');
      return { handoffId, finalStatus: 'resolved' };
    }

    if (status.status === 'resumed_ai') {
      await updateHandoffStatus(case_id, 'resumed_ai');
      return { handoffId, finalStatus: 'resumed_ai' };
    }
  }

  // SLA 超时 — 升级
  await updateHandoffStatus(case_id, 'escalated');
  await notifyWorkbench({
    handoff_id: handoffId,
    phone,
    event_type: 'handoff_sla_expired',
    payload: { case_id, sla_hours: 4 },
  });

  return { handoffId, finalStatus: 'closed_without_resume' };
}
