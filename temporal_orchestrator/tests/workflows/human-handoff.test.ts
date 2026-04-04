import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

describe('HumanHandoffWorkflow', () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  }, 60_000);

  afterAll(async () => {
    await testEnv?.teardown();
  });

  async function createWorkerWithMocks(
    taskQueue: string,
    activityOverrides: Record<string, (...args: unknown[]) => unknown> = {},
  ) {
    const { bundleWorkflowCode } = await import('@temporalio/worker');
    const workflowBundle = await bundleWorkflowCode({
      workflowsPath: new URL('../../src/workflows/index.ts', import.meta.url).pathname,
    });

    const defaultActivities = {
      getCallbackTask: async () => ({ task_id: 'CB-001', status: 'pending' }),
      updateCallbackStatus: async () => ({ ok: true }),
      triggerOutboundCall: async () => ({ delivered: true }),
      notifySmsReminder: async () => ({ sent: true }),
      createHandoffCase: async () => ({ ok: true, case_id: 'HOF-001' }),
      updateHandoffStatus: async () => ({ ok: true }),
      notifyWorkbench: async () => ({ delivered: true }),
      createAppointment: async () => ({ ok: true, appointment_id: 'APT-001' }),
      startWorkflowRun: async () => ({ ok: true, run_id: 'RUN-001' }),
    };

    return Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      workflowBundle,
      activities: { ...defaultActivities, ...activityOverrides },
      taskQueue,
    });
  }

  it('happy path: accepted then resolved', async () => {
    const handoffUpdates: string[] = [];
    const worker = await createWorkerWithMocks('test-handoff-happy', {
      updateHandoffStatus: async (_id: unknown, status: unknown) => {
        handoffUpdates.push(status as string);
        return { ok: true };
      },
    });

    const handle = await testEnv.client.workflow.start('humanHandoffWorkflow', {
      workflowId: 'test-handoff-happy-1',
      taskQueue: 'test-handoff-happy',
      args: [{
        handoffId: 'HO-001',
        phone: '13900000001',
        sourceSkill: 'collection',
        queueName: 'default',
        reason: '客户要求转人工',
      }],
    });

    // Wait for workflow to start and register signal handlers
    await testEnv.sleep('30s');

    // Accept
    await handle.signal('accepted', { assignee: 'agent-001' });
    await testEnv.sleep('30s');

    // Query status
    const status = await handle.query('getHandoffStatus');
    expect(status.status).toBe('accepted');
    expect(status.assignee).toBe('agent-001');

    // Resolve
    await handle.signal('resolved', { resolution: '已处理客户投诉' });

    const result = await handle.result();
    expect(result.handoffId).toBe('HO-001');
    expect(result.finalStatus).toBe('resolved');
    expect(handoffUpdates).toContain('resolved');

    await worker.shutdown();
  });

  it('resume AI: returns resumed_ai status', async () => {
    const worker = await createWorkerWithMocks('test-handoff-resume');

    const handle = await testEnv.client.workflow.start('humanHandoffWorkflow', {
      workflowId: 'test-handoff-resume-1',
      taskQueue: 'test-handoff-resume',
      args: [{
        handoffId: 'HO-002',
        phone: '13900000002',
        sourceSkill: 'collection',
        queueName: 'default',
        reason: '需要查询账单',
      }],
    });

    await testEnv.sleep('30s');
    await handle.signal('accepted', { assignee: 'agent-002' });
    await testEnv.sleep('30s');
    await handle.signal('resumeAi', { context: '客户账单问题已说明' });

    const result = await handle.result();
    expect(result.finalStatus).toBe('resumed_ai');

    await worker.shutdown();
  });

  it('SLA timeout: escalates after 4 hours', async () => {
    const handoffUpdates: string[] = [];
    const notifyEvents: string[] = [];
    const worker = await createWorkerWithMocks('test-handoff-sla', {
      updateHandoffStatus: async (_id: unknown, status: unknown) => {
        handoffUpdates.push(status as string);
        return { ok: true };
      },
      notifyWorkbench: async (payload: unknown) => {
        const p = payload as { event_type: string };
        notifyEvents.push(p.event_type);
        return { delivered: true };
      },
    });

    const handle = await testEnv.client.workflow.start('humanHandoffWorkflow', {
      workflowId: 'test-handoff-sla-1',
      taskQueue: 'test-handoff-sla',
      args: [{
        handoffId: 'HO-003',
        phone: '13900000003',
        sourceSkill: 'collection',
        queueName: 'default',
        reason: '复杂投诉',
      }],
    });

    // 跳过 4+ 小时触发 SLA 超时
    await testEnv.sleep('5h');

    const result = await handle.result();
    expect(result.finalStatus).toBe('closed_without_resume');
    expect(handoffUpdates).toContain('escalated');
    expect(notifyEvents).toContain('handoff_sla_expired');

    await worker.shutdown();
  });
});
