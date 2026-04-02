import { Hono } from 'hono';
import { listChannels, listChannelSetups, getChannel } from '../../runtime-plane/runtime-registry';

export const channelRoutes = new Hono();

// GET /api/channels — List all registered channels (full runtime)
channelRoutes.get('/', (c) => {
  const channels = listChannels().map(ch => ({
    channelId: ch.channelId,
    pluginId: ch.pluginId,
    pluginName: ch.pluginName,
  }));
  return c.json({ items: channels });
});

// GET /api/channels/setups — List all channel setups (including setup-only)
channelRoutes.get('/setups', (c) => {
  const setups = listChannelSetups().map(s => ({
    channelId: s.channelId,
    pluginId: s.pluginId,
    pluginName: s.pluginName,
    enabled: s.enabled,
  }));
  return c.json({ items: setups });
});

// GET /api/channels/:id — Get a specific channel detail
channelRoutes.get('/:id', (c) => {
  const channelId = c.req.param('id');
  const channel = getChannel(channelId);
  if (!channel) {
    return c.json({ error: `Channel '${channelId}' not found` }, 404);
  }
  return c.json({
    channelId: channel.channelId,
    pluginId: channel.pluginId,
    pluginName: channel.pluginName,
  });
});
