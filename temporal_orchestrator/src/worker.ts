import { Worker, bundleWorkflowCode, NativeConnection } from '@temporalio/worker';
import { TASK_QUEUES, TEMPORAL } from './config.js';

export async function createWorkers() {
  // 预编译 workflow bundle（一次编译，所有 Worker 共享）
  // 必须用 bundleWorkflowCode 因为项目用 tsx（非标准 loader）
  const workflowBundle = await bundleWorkflowCode({
    workflowsPath: new URL('./workflows/index.ts', import.meta.url).pathname,
  });

  const activities = await import('./activities/index.js');

  // 连接 Temporal Server
  const connection = await NativeConnection.connect({ address: TEMPORAL.address });

  // 为每个 Task Queue 创建一个 Worker 实例
  const workers = await Promise.all(
    Object.values(TASK_QUEUES).map((queue) =>
      Worker.create({
        workflowBundle,
        activities,
        taskQueue: queue,
        connection,
        namespace: TEMPORAL.namespace,
      })
    )
  );

  return workers;
}
