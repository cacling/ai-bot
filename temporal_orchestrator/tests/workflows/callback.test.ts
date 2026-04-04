import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

describe('CallbackWorkflow', () => {
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
      getCallbackTask: async () => ({
        task_id: 'CB-001',
        original_task_id: 'T-001',
        customer_name: '张三',
        callback_phone: '13900000001',
        preferred_time: new Date(Date.now() + 60_000).toISOString(),
        product_name: '宽带',
        status: 'pending',
      }),
      updateCallbackStatus: async () => ({ ok: true }),
      triggerOutboundCall: async () => ({ delivered: true }),
      notifySmsReminder: async () => ({ sent: true }),
      // HumanHandoff activities (needed because all activities are bundled)
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

  it('happy path: waits until preferred time then triggers call', async () => {
    const statusUpdates: string[] = [];
    const worker = await createWorkerWithMocks('test-callback-happy', {
      updateCallbackStatus: async (_id: unknown, status: unknown) => {
        statusUpdates.push(status as string);
        return { ok: true };
      },
    });

    const preferredTime = new Date(Date.now() + 30 * 60_000).toISOString(); // 30 min from now

    const result = await worker.runUntil(
      testEnv.client.workflow.execute('callbackWorkflow', {
        workflowId: 'test-callback-happy-1',
        taskQueue: 'test-callback-happy',
        args: [{
          callbackTaskId: 'CB-001',
          originalTaskId: 'T-001',
          phone: '13900000001',
          preferredTime,
        }],
      }),
    );

    expect(result.callbackTaskId).toBe('CB-001');
    expect(result.finalStatus).toBe('completed');
    expect(statusUpdates).toContain('in_progress');
    expect(statusUpdates).toContain('completed');
  });

  it('reschedule signal: continues as new with updated time', async () => {
    const worker = await createWorkerWithMocks('test-callback-reschedule');

    // Use a far-future preferred time so the workflow is sleeping when we signal
    const farFuture = new Date(Date.now() + 24 * 60 * 60_000).toISOString();

    const handle = await testEnv.client.workflow.start('callbackWorkflow', {
      workflowId: 'test-callback-reschedule-1',
      taskQueue: 'test-callback-reschedule',
      args: [{
        callbackTaskId: 'CB-002',
        originalTaskId: 'T-002',
        phone: '13900000002',
        preferredTime: farFuture,
      }],
    });

    // Let the workflow start and enter its sleep
    await testEnv.sleep('1m');

    // Send reschedule signal with a time that's just a few seconds away
    const newTime = new Date(Date.now() + 2 * 60_000).toISOString();
    await handle.signal('callbackRescheduled', { newTime });

    // Advance time past the new preferred time
    await testEnv.sleep('5m');

    // The workflow should have continued-as-new and eventually completed
    const result = await handle.result();
    expect(result.callbackTaskId).toBe('CB-002');
    expect(result.finalStatus).toBe('completed');

    await worker.shutdown();
  });

  it('cancel signal: stops workflow immediately', async () => {
    const statusUpdates: string[] = [];
    const worker = await createWorkerWithMocks('test-callback-cancel', {
      updateCallbackStatus: async (_id: unknown, status: unknown) => {
        statusUpdates.push(status as string);
        return { ok: true };
      },
    });

    const farFuture = new Date(Date.now() + 24 * 60 * 60_000).toISOString();

    const handle = await testEnv.client.workflow.start('callbackWorkflow', {
      workflowId: 'test-callback-cancel-1',
      taskQueue: 'test-callback-cancel',
      args: [{
        callbackTaskId: 'CB-003',
        originalTaskId: 'T-003',
        phone: '13900000003',
        preferredTime: farFuture,
      }],
    });

    await testEnv.sleep('1m');
    await handle.signal('callbackCancelled');

    const result = await handle.result();
    expect(result.finalStatus).toBe('cancelled');
    expect(statusUpdates).toContain('cancelled');

    await worker.shutdown();
  });
});
