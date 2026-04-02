/**
 * Channel Account REST routes
 */
import { Hono } from 'hono';
import {
  createAccount,
  getAccount,
  listAccountsByChannel,
  loginAccount,
  logoutAccount,
  getAccountStatus,
  deleteAccount,
} from '../channel-account';
import {
  startAccount,
  stopAccount,
  getConnectionStatus,
  listConnectionStatuses,
} from '../../runtime-plane/gateway-bridge';

export const accountRoutes = new Hono();

// POST /api/channels/:channelId/accounts — Create a channel account
accountRoutes.post('/:channelId/accounts', async (c) => {
  const channelId = c.req.param('channelId');
  const body = await c.req.json().catch(() => ({}));
  const { pluginId, config, secretRef } = body as Record<string, unknown>;

  if (!pluginId || typeof pluginId !== 'string') {
    return c.json({ error: 'pluginId is required' }, 400);
  }

  const account = await createAccount({
    channelId,
    pluginId,
    config: (config as Record<string, unknown>) ?? {},
    secretRef: secretRef as string | undefined,
  });

  return c.json(account, 201);
});

// GET /api/channels/:channelId/accounts — List accounts for a channel
accountRoutes.get('/:channelId/accounts', async (c) => {
  const channelId = c.req.param('channelId');
  const items = await listAccountsByChannel(channelId);
  return c.json({ items });
});

// GET /api/channels/:channelId/accounts/:id — Get account detail
accountRoutes.get('/:channelId/accounts/:id', async (c) => {
  const account = await getAccount(c.req.param('id'));
  if (!account) return c.json({ error: 'Account not found' }, 404);
  return c.json(account);
});

// POST /api/channels/:channelId/accounts/:id/login
accountRoutes.post('/:channelId/accounts/:id/login', async (c) => {
  const result = await loginAccount(c.req.param('id'));
  return c.json(result, result.success ? 200 : 400);
});

// POST /api/channels/:channelId/accounts/:id/logout
accountRoutes.post('/:channelId/accounts/:id/logout', async (c) => {
  const result = await logoutAccount(c.req.param('id'));
  return c.json(result, result.success ? 200 : 400);
});

// GET /api/channels/:channelId/accounts/:id/status
accountRoutes.get('/:channelId/accounts/:id/status', async (c) => {
  const status = await getAccountStatus(c.req.param('id'));
  if (!status) return c.json({ error: 'Account not found' }, 404);
  return c.json(status);
});

// DELETE /api/channels/:channelId/accounts/:id
accountRoutes.delete('/:channelId/accounts/:id', async (c) => {
  await deleteAccount(c.req.param('id'));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Gateway Bridge: live connection management
// ---------------------------------------------------------------------------

// POST /api/channels/:channelId/accounts/:id/start — Start Baileys connection
accountRoutes.post('/:channelId/accounts/:id/start', async (c) => {
  const channelId = c.req.param('channelId');
  const accountId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const config = body as Record<string, unknown>;

  const result = await startAccount(channelId, accountId, {
    authDir: config.authDir as string | undefined,
    verbose: config.verbose as boolean | undefined,
    sendReadReceipts: config.sendReadReceipts as boolean | undefined,
    debounceMs: config.debounceMs as number | undefined,
    mediaMaxMb: config.mediaMaxMb as number | undefined,
  });

  return c.json(result, result.success ? 200 : 400);
});

// POST /api/channels/:channelId/accounts/:id/stop — Stop Baileys connection
accountRoutes.post('/:channelId/accounts/:id/stop', async (c) => {
  const channelId = c.req.param('channelId');
  const accountId = c.req.param('id');
  const result = await stopAccount(channelId, accountId);
  return c.json(result, result.success ? 200 : 400);
});

// GET /api/channels/:channelId/accounts/:id/connection — Live connection status
accountRoutes.get('/:channelId/accounts/:id/connection', async (c) => {
  const status = await getConnectionStatus(c.req.param('channelId'), c.req.param('id'));
  if (!status) return c.json({ error: 'No connection found' }, 404);
  return c.json(status);
});

// GET /api/channels/:channelId/connections — List all live connections
accountRoutes.get('/:channelId/connections', async (c) => {
  const items = await listConnectionStatuses();
  const channelId = c.req.param('channelId');
  const filtered = channelId ? items.filter(i => i.channelId === channelId) : items;
  return c.json({ items: filtered });
});
