import { Hono } from 'hono';
import { installPlugin, uninstallPlugin, listInstalledPlugins } from '../../package-plane/plugin-package-manager';
import { discoverPluginAt } from '../../package-plane/manifest-discovery';
import { checkPluginCompatibility } from '../../package-plane/compatibility-governor';
import { loadPlugin } from '../../runtime-plane/runtime-loader';
import { db } from '../../db';
import { enablement } from '../../db/schema';
import { eq } from 'drizzle-orm';

export const pluginRoutes = new Hono();

// POST /api/plugins/install — Install a plugin from a local path
pluginRoutes.post('/install', async (c) => {
  const body = await c.req.json<{ source: string }>();
  if (!body.source) {
    return c.json({ error: 'source is required' }, 400);
  }

  const result = await installPlugin({ source: body.source });
  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  // Run compatibility check
  let compatibility = null;
  if (result.metadata) {
    compatibility = await checkPluginCompatibility(result.metadata);
  }

  return c.json({
    ok: true,
    pluginId: result.pluginId,
    compatibility,
  });
});

// GET /api/plugins — List installed plugins
pluginRoutes.get('/', async (c) => {
  const items = await listInstalledPlugins();
  return c.json({ items });
});

// GET /api/plugins/:id/compatibility — Get compatibility report
pluginRoutes.get('/:id/compatibility', async (c) => {
  const pluginId = c.req.param('id');
  const plugins = await listInstalledPlugins();
  const plugin = plugins.find(p => p.id === pluginId);
  if (!plugin) {
    return c.json({ error: `Plugin '${pluginId}' not found` }, 404);
  }

  const metadata = await discoverPluginAt(
    plugin.source.replace('local:', ''),
  );
  if (!metadata) {
    return c.json({ error: 'Cannot read plugin metadata' }, 500);
  }

  const report = await checkPluginCompatibility(metadata);
  return c.json(report);
});

// POST /api/plugins/:id/enable
pluginRoutes.post('/:id/enable', async (c) => {
  const pluginId = c.req.param('id');
  await db.update(enablement)
    .set({ enabled: true, updatedAt: new Date(Date.now()) })
    .where(eq(enablement.pluginId, pluginId));
  return c.json({ ok: true, pluginId, enabled: true });
});

// POST /api/plugins/:id/disable
pluginRoutes.post('/:id/disable', async (c) => {
  const pluginId = c.req.param('id');
  await db.update(enablement)
    .set({ enabled: false, updatedAt: new Date(Date.now()) })
    .where(eq(enablement.pluginId, pluginId));
  return c.json({ ok: true, pluginId, enabled: false });
});

// POST /api/plugins/:id/load — Load plugin runtime
pluginRoutes.post('/:id/load', async (c) => {
  const pluginId = c.req.param('id');
  const body = await c.req.json<{ mode?: string }>().catch(() => ({}));
  const mode = (body.mode ?? 'full') as 'setup-only' | 'setup-runtime' | 'full';

  const plugins = await listInstalledPlugins();
  const plugin = plugins.find(p => p.id === pluginId);
  if (!plugin) {
    return c.json({ error: `Plugin '${pluginId}' not found` }, 404);
  }

  const sourcePath = plugin.source.replace('local:', '');
  const metadata = await discoverPluginAt(sourcePath);
  if (!metadata) {
    return c.json({ error: 'Cannot read plugin metadata' }, 500);
  }

  const result = await loadPlugin(metadata, mode);
  if (!result.success) {
    return c.json({ error: result.error }, 500);
  }

  return c.json({ ok: true, pluginId, mode });
});

// DELETE /api/plugins/:id — Uninstall plugin
pluginRoutes.delete('/:id', async (c) => {
  const pluginId = c.req.param('id');
  const result = await uninstallPlugin(pluginId);
  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }
  return c.json({ ok: true });
});
