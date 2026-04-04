import { serve } from '@hono/node-server';
import { createWorkers } from './worker.js';
import { getTemporalClient } from './client.js';
import { registerSchedules } from './schedules/register.js';
import { api } from './routes/index.js';
import { API_PORT } from './config.js';

async function main() {
  // 启动所有 Task Queue 的 Worker
  const workers = await createWorkers();
  const workerPromises = workers.map((w) => w.run());
  console.log(`Temporal Workers started on ${workers.length} task queues`);

  // 注册 Schedules（幂等）
  const client = await getTemporalClient();
  await registerSchedules(client);

  // 启动 HTTP API
  serve({ fetch: api.fetch, port: API_PORT });
  console.log(`Temporal Orchestrator API listening on :${API_PORT}`);

  // 任一 Worker 异常退出时整个进程退出
  await Promise.race(workerPromises);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
