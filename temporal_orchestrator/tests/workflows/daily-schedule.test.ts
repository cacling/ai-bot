import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

describe('DailyScheduleWorkflow + SchedulePublishWorkflow', () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  }, 60_000);

  afterAll(async () => {
    await testEnv?.teardown();
  });

  const defaultActivities = {
    // WFM activities
    createPlan: async () => ({ id: 1, name: 'Test Plan', status: 'draft' }),
    generateSchedule: async () => ({ planId: 1, status: 'generated' }),
    validatePublish: async () => ({ results: [{ date: '2026-04-04', valid: true, errors: [] }] }),
    publishPlan: async () => ({ planId: 1, status: 'published', versionNo: 2 }),
    notifyAgents: async () => ({ ok: true }),
    // Other activities needed by bundled workflows
    notifyWorkbench: async () => ({ delivered: true }),
    notifySmsReminder: async () => ({ sent: true }),
    getCallbackTask: async () => ({ task_id: 'CB-001', status: 'pending' }),
    updateCallbackStatus: async () => ({ ok: true }),
    triggerOutboundCall: async () => ({ delivered: true }),
    createHandoffCase: async () => ({ ok: true, case_id: 'HOF-001' }),
    updateHandoffStatus: async () => ({ ok: true }),
    createAppointment: async () => ({ ok: true }),
    startWorkflowRun: async () => ({ ok: true }),
    getOutboundTask: async () => ({ id: 'T-001', status: 'pending' }),
    updateOutboundTaskStatus: async () => ({ ok: true }),
    checkAllowedHours: async () => ({ allowed: true }),
    checkDnd: async () => false,
    initiateOutboundCall: async () => ({ session_id: 'sess-001' }),
    enqueuePipelineJobs: async () => ({ jobs: [] }),
    runPipelineStage: async () => ({ status: 'completed' }),
    markPipelineJobStatus: async () => ({ ok: true }),
    createGovernanceTask: async () => ({ ok: true }),
    scanExpiredAssets: async () => [],
    scanPendingDocVersions: async () => [],
    scanExpiredRegressionWindows: async () => [],
    closeRegressionWindow: async () => ({ ok: true }),
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

  it('auto-publish: no errors + autoPublish=true → published', async () => {
    let published = false;
    let notified = false;
    const worker = await createWorkerWithMocks('test-wfm-auto', {
      publishPlan: async () => {
        published = true;
        return { planId: 1, status: 'published', versionNo: 2 };
      },
      notifyAgents: async () => {
        notified = true;
        return { ok: true };
      },
    });

    const result = await worker.runUntil(
      testEnv.client.workflow.execute('dailyScheduleWorkflow', {
        workflowId: 'test-wfm-auto-1',
        taskQueue: 'test-wfm-auto',
        args: [{
          date: '2026-04-04',
          planName: 'Test Auto',
          autoPublish: true,
          notifyAgents: true,
        }],
      }),
    );

    expect(result.publishStatus).toBe('published');
    expect(published).toBe(true);
    expect(notified).toBe(true);
  });

  it('manual approval: validation errors → awaiting_approval', async () => {
    const worker = await createWorkerWithMocks('test-wfm-manual', {
      validatePublish: async () => ({
        results: [{ date: '2026-04-04', valid: false, errors: ['Coverage gap at 14:00'] }],
      }),
    });

    const result = await worker.runUntil(
      testEnv.client.workflow.execute('dailyScheduleWorkflow', {
        workflowId: 'test-wfm-manual-1',
        taskQueue: 'test-wfm-manual',
        args: [{
          date: '2026-04-04',
          planName: 'Test Manual',
          autoPublish: true,
          notifyAgents: true,
        }],
      }),
    );

    expect(result.publishStatus).toBe('awaiting_approval');
  });

  it('schedule publish: approve signal → published', async () => {
    let published = false;
    const worker = await createWorkerWithMocks('test-wfm-approve', {
      publishPlan: async () => {
        published = true;
        return { planId: 1, status: 'published', versionNo: 2 };
      },
    });

    const handle = await testEnv.client.workflow.start('schedulePublishWorkflow', {
      workflowId: 'test-wfm-approve-1',
      taskQueue: 'test-wfm-approve',
      args: [{
        planId: '1',
        versionNo: 1,
        requestedBy: 'test',
      }],
    });

    await testEnv.sleep('1m');
    await handle.signal('manualApproved', { approvedBy: 'admin' });

    const result = await worker.runUntil(handle.result());

    expect(result.publishStatus).toBe('published');
    expect(published).toBe(true);
  });

  it('schedule publish: timeout → expired', async () => {
    const worker = await createWorkerWithMocks('test-wfm-timeout');

    const result = await worker.runUntil(
      testEnv.client.workflow.execute('schedulePublishWorkflow', {
        workflowId: 'test-wfm-timeout-1',
        taskQueue: 'test-wfm-timeout',
        args: [{
          planId: '1',
          versionNo: 1,
          requestedBy: 'test',
        }],
      }),
    );

    expect(result.publishStatus).toBe('expired');
  });
});
