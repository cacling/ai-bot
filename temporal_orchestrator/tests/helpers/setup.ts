import { TestWorkflowEnvironment } from '@temporalio/testing';
import { type Worker } from '@temporalio/worker';
import { afterAll, beforeAll } from 'vitest';

let testEnv: TestWorkflowEnvironment;

beforeAll(async () => {
  testEnv = await TestWorkflowEnvironment.createTimeSkipping();
}, 60_000);

afterAll(async () => {
  await testEnv?.teardown();
});

export function getTestEnv(): TestWorkflowEnvironment {
  return testEnv;
}

/**
 * Helper to create a Worker for testing with mocked activities.
 * Usage:
 *   const worker = await createTestWorker(env, {
 *     getCallbackTask: async () => ({ ... }),
 *     updateCallbackStatus: async () => ({ success: true }),
 *   });
 */
export async function createTestWorker(
  env: TestWorkflowEnvironment,
  activities: Record<string, (...args: unknown[]) => unknown>,
  taskQueue = 'test',
): Promise<Worker> {
  const { bundleWorkflowCode, Worker: TestWorker } = await import('@temporalio/worker');
  const workflowBundle = await bundleWorkflowCode({
    workflowsPath: new URL('../../src/workflows/index.ts', import.meta.url).pathname,
  });

  return TestWorker.create({
    connection: env.nativeConnection,
    namespace: env.namespace,
    workflowBundle,
    activities,
    taskQueue,
  });
}
