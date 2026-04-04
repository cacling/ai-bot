import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

describe('OutboundTaskWorkflow', () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  }, 60_000);

  afterAll(async () => {
    await testEnv?.teardown();
  });

  const defaultActivities = {
    // outbound activities
    getOutboundTask: async () => ({ id: 'T-001', status: 'pending', task_type: 'collection' }),
    updateOutboundTaskStatus: async () => ({ ok: true }),
    checkAllowedHours: async () => ({ allowed: true }),
    checkDnd: async () => false,
    initiateOutboundCall: async () => ({ session_id: 'sess-001', status: 'initiated' }),
    // notify activities
    notifyWorkbench: async () => ({ delivered: true }),
    notifySmsReminder: async () => ({ sent: true }),
    // callback/handoff activities (needed because all workflows are bundled)
    getCallbackTask: async () => ({ task_id: 'CB-001', status: 'pending' }),
    updateCallbackStatus: async () => ({ ok: true }),
    triggerOutboundCall: async () => ({ delivered: true }),
    createHandoffCase: async () => ({ ok: true, case_id: 'HOF-001' }),
    updateHandoffStatus: async () => ({ ok: true }),
    createAppointment: async () => ({ ok: true, appointment_id: 'APT-001' }),
    startWorkflowRun: async () => ({ ok: true, run_id: 'RUN-001' }),
  };

  async function createWorkerWithMocks(
    taskQueue: string,
    activityOverrides: Record<string, (...args: unknown[]) => unknown> = {},
  ) {
    const { bundleWorkflowCode } = await import('@temporalio/worker');
    const workflowBundle = await bundleWorkflowCode({
      workflowsPath: new URL('../../src/workflows/index.ts', import.meta.url).pathname,
    });

    return Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      workflowBundle,
      activities: { ...defaultActivities, ...activityOverrides },
      taskQueue,
    });
  }

  const baseInput = {
    taskId: 'T-001',
    taskType: 'collection' as const,
    phone: '13800000001',
    sessionId: 'sess-001',
    source: 'task_created' as const,
  };

  it('happy path: call result = ptp → completed', async () => {
    const statusUpdates: string[] = [];
    const worker = await createWorkerWithMocks('test-outbound-happy', {
      updateOutboundTaskStatus: async (_id: unknown, status: unknown) => {
        statusUpdates.push(status as string);
        return { ok: true };
      },
    });

    const handle = await testEnv.client.workflow.start('outboundTaskWorkflow', {
      workflowId: 'test-outbound-happy-1',
      taskQueue: 'test-outbound-happy',
      args: [baseInput],
    });

    // Wait for workflow to reach waiting_result state
    await testEnv.sleep('10s');

    // Send call result signal
    await handle.signal('callResultRecorded', { result: 'ptp', ptpDate: '2026-04-10' });

    const result = await worker.runUntil(handle.result());

    expect(result.taskId).toBe('T-001');
    expect(result.finalStatus).toBe('completed');
    expect(statusUpdates).toContain('in_progress');
    expect(statusUpdates).toContain('completed');
  });

  it('DND blocked: returns cancelled immediately', async () => {
    const statusUpdates: string[] = [];
    const worker = await createWorkerWithMocks('test-outbound-dnd', {
      checkDnd: async () => true,
      updateOutboundTaskStatus: async (_id: unknown, status: unknown) => {
        statusUpdates.push(status as string);
        return { ok: true };
      },
    });

    const result = await worker.runUntil(
      testEnv.client.workflow.execute('outboundTaskWorkflow', {
        workflowId: 'test-outbound-dnd-1',
        taskQueue: 'test-outbound-dnd',
        args: [baseInput],
      }),
    );

    expect(result.taskId).toBe('T-001');
    expect(result.finalStatus).toBe('cancelled');
    expect(statusUpdates).toContain('dnd_blocked');
  });

  it('retry exhaustion: no_answer x5 → max_retry_reached', async () => {
    let retryCount = 0;
    const worker = await createWorkerWithMocks('test-outbound-retry', {
      initiateOutboundCall: async () => {
        retryCount++;
        return { session_id: `sess-${retryCount}`, status: 'initiated' };
      },
    });

    const handle = await testEnv.client.workflow.start('outboundTaskWorkflow', {
      workflowId: 'test-outbound-retry-1',
      taskQueue: 'test-outbound-retry',
      args: [baseInput],
    });

    // Send no_answer for each retry attempt
    for (let i = 0; i < 5; i++) {
      await testEnv.sleep('15s'); // wait for call to start
      await handle.signal('callResultRecorded', { result: 'no_answer' });
      if (i < 4) {
        await testEnv.sleep('35m'); // wait past retry interval
      }
    }

    const result = await worker.runUntil(handle.result());

    expect(result.taskId).toBe('T-001');
    expect(result.finalStatus).toBe('cancelled');
  });

  it('handoff branch: transfer result → starts child humanHandoffWorkflow', async () => {
    const worker = await createWorkerWithMocks('test-outbound-handoff');

    const handle = await testEnv.client.workflow.start('outboundTaskWorkflow', {
      workflowId: 'test-outbound-handoff-1',
      taskQueue: 'test-outbound-handoff',
      args: [baseInput],
    });

    await testEnv.sleep('10s');
    await handle.signal('callResultRecorded', {
      result: 'transfer',
      remark: 'customer requested human agent',
    });

    const result = await worker.runUntil(handle.result());

    expect(result.taskId).toBe('T-001');
    expect(result.finalStatus).toBe('handoff');
  });

  it('cancel signal: stops workflow mid-retry', async () => {
    const statusUpdates: string[] = [];
    const worker = await createWorkerWithMocks('test-outbound-cancel', {
      updateOutboundTaskStatus: async (_id: unknown, status: unknown) => {
        statusUpdates.push(status as string);
        return { ok: true };
      },
    });

    const handle = await testEnv.client.workflow.start('outboundTaskWorkflow', {
      workflowId: 'test-outbound-cancel-1',
      taskQueue: 'test-outbound-cancel',
      args: [baseInput],
    });

    // Wait for workflow to start, then send no_answer to enter retry phase
    await testEnv.sleep('10s');
    await handle.signal('callResultRecorded', { result: 'no_answer' });

    // Wait a bit into the retry interval, then cancel
    await testEnv.sleep('5m');
    await handle.signal('taskCancelled');

    // Advance time past retry interval so the workflow loop can pick up the cancel
    await testEnv.sleep('30m');

    const result = await worker.runUntil(handle.result());

    expect(result.taskId).toBe('T-001');
    expect(result.finalStatus).toBe('cancelled');
    expect(statusUpdates).toContain('cancelled');
  });

  it('callback_request result: starts child callbackWorkflow', async () => {
    const worker = await createWorkerWithMocks('test-outbound-callback');

    const handle = await testEnv.client.workflow.start('outboundTaskWorkflow', {
      workflowId: 'test-outbound-callback-1',
      taskQueue: 'test-outbound-callback',
      args: [baseInput],
    });

    await testEnv.sleep('10s');
    await handle.signal('callResultRecorded', {
      result: 'callback_request',
      callbackTime: '2026-04-05T10:00:00+08:00',
    });

    const result = await worker.runUntil(handle.result());

    expect(result.taskId).toBe('T-001');
    expect(result.finalStatus).toBe('callback_scheduled');
  });
});
