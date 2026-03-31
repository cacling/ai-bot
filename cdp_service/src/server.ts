/**
 * CDP Service — 客户数据平台独立服务
 *
 * 提供客户主体统一、identity resolve、客户上下文供给的 REST API
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import cdpRoutes from './routes/index';

export function createApp() {
  const app = new Hono();

  app.use('*', cors({
    origin: (origin) => origin ?? '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }));

  app.get('/health', (c) => c.json({
    status: 'ok',
    service: 'cdp-service',
    modules: [
      'party',
      'identity',
      'contact-point',
      'customer-account',
      'service-subscription',
      'party-subscription-relation',
      'identity-link',
      'source-record-link',
      'resolution-case',
      'communication-preference',
      'consent-record',
      'customer-profile',
      'service-summary',
      'interaction-summary',
      'household',
      'customer-event',
    ],
  }));

  app.route('/api/cdp', cdpRoutes);

  return app;
}

export function startServer(port = Number(process.env.CDP_SERVICE_PORT ?? 18020)) {
  const app = createApp();
  console.log(`[cdp-service] Starting on port ${port}...`);
  return serve({ fetch: app.fetch, port }, () => {
    console.log(`[cdp-service] http://0.0.0.0:${port}`);
  });
}

const entryFile = process.argv[1]?.replaceAll('\\', '/');
if (entryFile && import.meta.url.endsWith(entryFile)) {
  startServer();
}
