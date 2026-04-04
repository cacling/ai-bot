/**
 * WFM Service — 排班管理独立服务
 *
 * 提供活动/班次/合同/排班组/假勤/排班计划/规则等 REST API
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import wfmRoutes from './routes/index';

export function createApp() {
  const app = new Hono();

  app.use('*', cors({
    origin: (origin) => origin ?? '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }));

  app.get('/health', (c) => c.json({
    status: 'ok',
    service: 'wfm-service',
    modules: [
      'activities',
      'shifts',
      'contracts',
      'groups',
      'staff-skills',
      'leaves',
      'plans',
      'plan-edits',
      'staffing',
      'rules',
    ],
  }));

  app.route('/api/wfm', wfmRoutes);

  return app;
}

export function startServer(port = Number(process.env.WFM_SERVICE_PORT ?? 18023)) {
  const app = createApp();
  console.log(`[wfm-service] Starting on port ${port}...`);
  return serve({ fetch: app.fetch, port }, () => {
    console.log(`[wfm-service] http://0.0.0.0:${port}`);
  });
}

const entryFile = process.argv[1]?.replaceAll('\\', '/');
if (entryFile && import.meta.url.endsWith(entryFile)) {
  startServer();
}
