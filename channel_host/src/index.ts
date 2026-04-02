// Load SDK compat layer + WebSocket proxy patch FIRST
import './runtime-plane/sdk-compat/_loader';

import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { pluginRoutes } from './control-plane/routes/plugins';
import { channelRoutes } from './control-plane/routes/channels';
import { accountRoutes } from './control-plane/routes/accounts';
import { diagnosticRoutes } from './control-plane/routes/diagnostics';
import { webhookRoutes } from './control-plane/routes/webhooks';
import { handleOutbound } from './bridge-plane/outbound-bridge';
import { db, migrateDb } from './db';

const app = new Hono();

app.use('*', honoLogger());

// Health check
app.get('/health', (c) =>
  c.json({ status: 'ok', service: 'channel-host', timestamp: Date.now() }),
);

// Control Plane API
app.route('/api/plugins', pluginRoutes);
app.route('/api/channels', channelRoutes);
app.route('/api/channels', accountRoutes);
app.route('/api/diagnostics', diagnosticRoutes);

// Webhook receiver (data plane)
app.route('/webhooks', webhookRoutes);

// Outbound API (receive send commands from ai-bot core)
app.post('/api/outbound/send', async (c) => {
  const body = await c.req.json();
  const result = await handleOutbound(body);
  return c.json(result, result.success ? 200 : 400);
});

const PORT = Number(process.env.CHANNEL_HOST_PORT ?? 18030);

// Initialize DB then start server
migrateDb();

console.log(`[channel-host] starting on port ${PORT}`);
export default {
  port: PORT,
  fetch: app.fetch,
};
