import { Hono } from 'hono';
import { getPluginDiagnostics, getRecentDiagnostics } from '../diagnostics';
import { listRuntimeInstances } from '../../runtime-plane/runtime-loader';
import { getRegistry } from '../../runtime-plane/runtime-registry';

export const diagnosticRoutes = new Hono();

// GET /api/diagnostics — Recent diagnostics across all plugins
diagnosticRoutes.get('/', async (c) => {
  const limit = Number(c.req.query('limit') ?? 100);
  const items = await getRecentDiagnostics(limit);
  return c.json({ items });
});

// GET /api/diagnostics/plugins/:id — Diagnostics for a specific plugin
diagnosticRoutes.get('/plugins/:id', async (c) => {
  const pluginId = c.req.param('id');
  const limit = Number(c.req.query('limit') ?? 50);
  const items = await getPluginDiagnostics(pluginId, limit);
  return c.json({ items });
});

// GET /api/diagnostics/runtime — Runtime health snapshot
diagnosticRoutes.get('/runtime', (c) => {
  const instances = listRuntimeInstances();
  const registry = getRegistry();

  return c.json({
    registryVersion: registry.version,
    loadedPlugins: instances.map(i => ({
      pluginId: i.pluginId,
      mode: i.mode,
      loadedAt: i.loadedAt,
    })),
    registeredChannels: registry.channels.length,
    registeredSetups: registry.channelSetups.length,
  });
});
