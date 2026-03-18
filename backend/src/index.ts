import { Hono } from 'hono';
import { cors } from 'hono/cors';
import chatRoutes from './chat/chat';
import chatWsRoutes from './chat/chat-ws';
import agentWsRoutes from './agent/chat/agent-ws';
import filesRoutes from './agent/km/skills/files';
import skillsRoutes from './agent/km/skills/skills';
import voiceRoutes, { voiceWebsocket } from './chat/voice';
import outboundRoutes from './chat/outbound';
import mockDataRoutes from './chat/mock-data';
import complianceRoutes from './agent/card/compliance';
import skillVersionsRoute from './agent/km/skills/skill-versions';
import sandboxRoutes from './agent/km/skills/sandbox';
import skillEditRoutes from './agent/km/skills/skill-edit';
import canaryRoutes from './agent/km/skills/canary';
import changeRequestRoutes from './agent/km/skills/change-requests';
import testCaseRoutes from './agent/km/skills/test-cases';
import skillCreatorRoutes from './agent/km/skills/skill-creator';
import kmRoutes from './agent/km/kms';
import mcpRoutes from './agent/km/mcp';
import { logger } from './services/logger';
import { runAgent } from './engine/runner';

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

// Mount skills routes: GET /api/skills
app.route('/api/skills', skillsRoutes);

// Mount compliance routes: GET/POST/DELETE /api/compliance/keywords, POST /api/compliance/check
app.route('/api/compliance', complianceRoutes);

// Mount skill version routes: GET/POST /api/skill-versions
app.route('/api/skill-versions', skillVersionsRoute);

// Mount sandbox routes: POST/PUT/GET/DELETE /api/sandbox
app.route('/api/sandbox', sandboxRoutes);

// Mount skill-edit routes: POST /api/skill-edit/clarify, /api/skill-edit, /api/skill-edit/apply
app.route('/api/skill-edit', skillEditRoutes);

// Mount canary routes: POST/GET/DELETE /api/canary
app.route('/api/canary', canaryRoutes);

// Mount change-request routes: GET/POST /api/change-requests
app.route('/api/change-requests', changeRequestRoutes);

// Mount test-case routes: GET/POST/DELETE /api/test-cases
app.route('/api/test-cases', testCaseRoutes);

// Mount skill-creator routes: POST /api/skill-creator/chat, /api/skill-creator/save
app.route('/api/skill-creator', skillCreatorRoutes);

// Mount knowledge management routes: /api/km/*
app.route('/api/km', kmRoutes);

// Mount MCP management routes: /api/mcp/*
app.route('/api/mcp', mcpRoutes);

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
  // Poll until at least one MCP server is reachable
  const MCP_CHECK_URL = process.env.TELECOM_MCP_URL ?? 'http://127.0.0.1:18003/mcp';
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(MCP_CHECK_URL, { method: 'GET', signal: AbortSignal.timeout(1000) });
      if (res.ok || res.status === 405) break;
    } catch { /* not ready yet */ }
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
