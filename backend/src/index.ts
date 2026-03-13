import { Hono } from 'hono';
import { cors } from 'hono/cors';
import chatRoutes from './routes/chat';
import chatWsRoutes from './routes/chat-ws';
import agentWsRoutes from './routes/agent-ws';
import filesRoutes from './routes/files';
import voiceRoutes, { voiceWebsocket } from './routes/voice';
import outboundRoutes from './routes/outbound';
import mockDataRoutes from './routes/mock-data';
import { logger } from './logger';
import { runAgent } from './agent/runner';

const app = new Hono();

// CORS: allow Vite dev server
app.use(
  '*',
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

app.get('/health', (c) => c.json({ status: 'ok' }));

// Mount chat routes: POST /api/chat, DELETE /api/sessions/:id
app.route('/api', chatRoutes);
app.route('/api', mockDataRoutes);

// Mount files routes: GET /api/files/tree, GET /api/files/content, PUT /api/files/content
app.route('/api/files', filesRoutes);

// Mount voice WebSocket route: GET /ws/voice
app.route('/', voiceRoutes);

// Mount outbound WebSocket route: GET /ws/outbound
app.route('/', outboundRoutes);

// Mount online chat WebSocket route: GET /ws/chat
app.route('/', chatWsRoutes);

// Mount agent workstation WebSocket route: GET /ws/agent
app.route('/', agentWsRoutes);

const PORT = Number(process.env.PORT ?? 8000);

logger.info('server', 'starting', {
  port: PORT,
  skills_dir: process.env.SKILLS_DIR ?? '(default)',
  node_env: process.env.NODE_ENV ?? 'development',
});

// Warmup: make a lightweight LLM call at startup to avoid cold-start latency on first request
// Waits up to 30s for the MCP server to become available before warmup
(async () => {
  const TELECOM_MCP_URL = process.env.TELECOM_MCP_URL ?? 'http://localhost:8003/mcp';
  // Poll until MCP server is reachable
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(TELECOM_MCP_URL, { method: 'GET', signal: AbortSignal.timeout(1000) });
      if (res.ok || res.status === 405) break; // 405 = POST expected, server is up
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  logger.info('server', 'warmup_start', {});
  try {
    await runAgent('你好', []);
    logger.info('server', 'warmup_done', {});
  } catch (err) {
    logger.warn('server', 'warmup_failed', { error: String(err) });
  }
})();

export default {
  port: PORT,
  fetch: app.fetch,
  websocket: voiceWebsocket,
};
