/**
 * Interaction Platform Service — 实时互动中枢
 *
 * 提供 conversation, interaction, routing, inbox, presence 的 REST API
 * 以及 /ws/workspace WebSocket（坐席工作台实时通道）
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import conversationRoutes from './routes/conversations';
import interactionRoutes from './routes/interactions';
import inboxRoutes from './routes/inbox';
import presenceRoutes from './routes/presence';
import queueRoutes from './routes/queues';
import eventRoutes from './routes/events';
import workspaceWsRoutes, { workspaceWebsocket } from './routes/workspace-ws';
import engagementRoutes from './routes/engagement';
import mockSocialRoutes from './routes/mock-social';
import pluginRoutes from './routes/plugins';
import routingMgmtRoutes from './routes/routing-mgmt';

export function createApp() {
  const app = new Hono();

  app.use('*', cors({
    origin: (origin) => origin ?? '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }));

  app.get('/health', (c) => c.json({
    status: 'ok',
    service: 'interaction-platform',
    modules: [
      'conversations',
      'interactions',
      'inbox',
      'presence',
      'queues',
      'events',
      'workspace-ws',
      'engagement',
      'mock-social',
      'plugins',
      'routing-mgmt',
    ],
  }));

  app.route('/api/conversations', conversationRoutes);
  app.route('/api/interactions', interactionRoutes);
  app.route('/api/inbox', inboxRoutes);
  app.route('/api/presence', presenceRoutes);
  app.route('/api/queues', queueRoutes);
  app.route('/api/events', eventRoutes);
  app.route('/api/engagement', engagementRoutes);
  app.route('/api/mock-social', mockSocialRoutes);
  app.route('/api/plugins', pluginRoutes);
  app.route('/api/routing', routingMgmtRoutes);
  app.route('/', workspaceWsRoutes);

  return app;
}

const PORT = Number(process.env.INTERACTION_PLATFORM_PORT ?? 18022);

const entryFile = process.argv[1]?.replaceAll('\\', '/');
if (entryFile && import.meta.url.endsWith(entryFile)) {
  const app = createApp();
  console.log(`[interaction-platform] Starting on port ${PORT}...`);
  Bun.serve({
    port: PORT,
    fetch: app.fetch,
    websocket: workspaceWebsocket,
  });
  console.log(`[interaction-platform] http://0.0.0.0:${PORT}`);
}
