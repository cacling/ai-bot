/**
 * Outbound Service — 外呼任务与营销活动管理服务
 *
 * 管理营销活动、外呼任务（催收+营销）、通话结果、测试 persona 等。
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import outboundRoutes from './routes/index';

export function createApp() {
  const app = new Hono();

  app.use('*', cors({
    origin: (origin) => origin ?? '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }));

  app.get('/health', (c) => c.json({
    status: 'ok',
    service: 'outbound-service',
    modules: ['campaigns', 'tasks', 'results', 'test-personas'],
  }));

  app.route('/api/outbound', outboundRoutes);

  return app;
}

export function startServer(port = Number(process.env.OUTBOUND_SERVICE_PORT ?? 18021)) {
  const app = createApp();
  console.log(`[outbound-service] Starting on port ${port}...`);
  return serve({ fetch: app.fetch, port }, () => {
    console.log(`[outbound-service] http://0.0.0.0:${port}`);
  });
}

const entryFile = process.argv[1]?.replaceAll('\\', '/');
if (entryFile && import.meta.url.endsWith(entryFile)) {
  startServer();
}
