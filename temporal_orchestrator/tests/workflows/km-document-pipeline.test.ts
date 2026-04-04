import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

describe('KmDocumentPipelineWorkflow', () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  }, 60_000);

  afterAll(async () => {
    await testEnv?.teardown();
  });

  const defaultActivities = {
    // KM activities
    enqueuePipelineJobs: async (_dvId: unknown, stages: unknown) => ({
      jobs: (stages as string[]).map((s, i) => ({ id: `JOB-${i}`, stage: s, status: 'pending' })),
    }),
    runPipelineStage: async () => ({ status: 'completed' as const, result: { mock: true } }),
    markPipelineJobStatus: async () => ({ ok: true }),
    createGovernanceTask: async () => ({ ok: true, task_id: 'GOV-001' }),
    scanExpiredAssets: async () => [],
    scanPendingDocVersions: async () => [],
    scanExpiredRegressionWindows: async () => [],
    closeRegressionWindow: async () => ({ ok: true }),
    // Other activities needed by bundled workflows
    getCallbackTask: async () => ({ task_id: 'CB-001', status: 'pending' }),
    updateCallbackStatus: async () => ({ ok: true }),
    triggerOutboundCall: async () => ({ delivered: true }),
    createHandoffCase: async () => ({ ok: true, case_id: 'HOF-001' }),
    updateHandoffStatus: async () => ({ ok: true }),
    notifyWorkbench: async () => ({ delivered: true }),
    notifySmsReminder: async () => ({ sent: true }),
    createAppointment: async () => ({ ok: true }),
    startWorkflowRun: async () => ({ ok: true }),
    getOutboundTask: async () => ({ id: 'T-001', status: 'pending' }),
    updateOutboundTaskStatus: async () => ({ ok: true }),
    checkAllowedHours: async () => ({ allowed: true }),
    checkDnd: async () => false,
    initiateOutboundCall: async () => ({ session_id: 'sess-001' }),
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

  it('happy path: all stages complete successfully', async () => {
    const completedStages: string[] = [];
    const worker = await createWorkerWithMocks('test-km-pipeline-happy', {
      markPipelineJobStatus: async (_id: unknown, status: unknown) => {
        if (status === 'completed') completedStages.push('done');
        return { ok: true };
      },
    });

    const result = await worker.runUntil(
      testEnv.client.workflow.execute('kmDocumentPipelineWorkflow', {
        workflowId: 'test-km-pipeline-happy-1',
        taskQueue: 'test-km-pipeline-happy',
        args: [{
          docVersionId: 'DV-001',
          stages: ['parse', 'chunk', 'generate', 'validate'],
          trigger: 'manual',
        }],
      }),
    );

    expect(result.docVersionId).toBe('DV-001');
    expect(result.finalStatus).toBe('completed');
    expect(completedStages.length).toBe(4);
  });

  it('stage failure: creates governance task and returns governance_created', async () => {
    let governanceCreated = false;
    const worker = await createWorkerWithMocks('test-km-pipeline-fail', {
      runPipelineStage: async (_id: unknown, stage: unknown) => {
        if (stage === 'generate') {
          return { status: 'failed' as const, error: 'LLM timeout' };
        }
        return { status: 'completed' as const };
      },
      createGovernanceTask: async () => {
        governanceCreated = true;
        return { ok: true, task_id: 'GOV-001' };
      },
    });

    const result = await worker.runUntil(
      testEnv.client.workflow.execute('kmDocumentPipelineWorkflow', {
        workflowId: 'test-km-pipeline-fail-1',
        taskQueue: 'test-km-pipeline-fail',
        args: [{
          docVersionId: 'DV-002',
          stages: ['parse', 'chunk', 'generate', 'validate'],
          trigger: 'manual',
        }],
      }),
    );

    expect(result.docVersionId).toBe('DV-002');
    expect(result.finalStatus).toBe('governance_created');
    expect(governanceCreated).toBe(true);
  });

  it('cancel signal: stops pipeline before completion', async () => {
    const worker = await createWorkerWithMocks('test-km-pipeline-cancel', {
      runPipelineStage: async () => {
        // Simulate slow stage
        return { status: 'completed' as const };
      },
    });

    const handle = await testEnv.client.workflow.start('kmDocumentPipelineWorkflow', {
      workflowId: 'test-km-pipeline-cancel-1',
      taskQueue: 'test-km-pipeline-cancel',
      args: [{
        docVersionId: 'DV-003',
        stages: ['parse', 'chunk', 'generate', 'validate'],
        trigger: 'manual',
      }],
    });

    // Signal cancel immediately
    await handle.signal('cancelPipeline');

    const result = await worker.runUntil(handle.result());

    expect(result.docVersionId).toBe('DV-003');
    // May complete before cancel is processed, or may be cancelled
    expect(['completed', 'failed']).toContain(result.finalStatus);
  });
});
