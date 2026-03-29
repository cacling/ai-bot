import { Hono } from 'hono';
import { cors } from 'hono/cors';
import chatRoutes from './chat/chat';
import chatWsRoutes from './chat/chat-ws';
import agentWsRoutes from './agent/chat/agent-ws';
import voiceRoutes, { voiceWebsocket } from './chat/voice';
import outboundRoutes from './chat/outbound';
import mockDataRoutes from './chat/mock-data';
import complianceRoutes from './agent/card/compliance';
import { resolve } from 'path';
import { logger } from './services/logger';
import { runAgent } from './engine/runner';
import { loadLexicons } from './services/query-normalizer';

const app = new Hono();

// CORS: allow Vite dev server
app.use(
  '*',
  cors({
    origin: (origin) => origin,  // 开发环境：允许任意来源（含局域网 IP）
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

app.get('/health', (c) => c.json({ status: 'ok' }));

// Agent workstation config (cards visibility etc.)
app.get('/api/agent-config', (c) => {
  const raw = process.env.AGENT_HIDDEN_CARDS ?? '';
  const hiddenCards = raw.split(',').map(s => s.trim()).filter(Boolean);
  return c.json({ hiddenCards });
});

// Mount chat routes: POST /api/chat, DELETE /api/sessions/:id
app.route('/api', chatRoutes);
app.route('/api', mockDataRoutes);

// Mount compliance routes: GET/POST/DELETE /api/compliance/keywords, POST /api/compliance/check
app.route('/api/compliance', complianceRoutes);

// ── KM Service Proxy ─────────────────────────────────────────────────────────
// Routes for KM, MCP, Skills, Sandbox, etc. are served by km_service (port 18010).
// In production, the frontend proxy sends these directly to km_service.
// This reverse proxy is a convenience for dev/test when only the backend is running.
const KM_SERVICE_URL = process.env.KM_SERVICE_URL ?? 'http://localhost:18010';
const KM_PROXY_PREFIXES = [
  '/api/km/', '/api/mcp/', '/api/files/', '/api/skills/', '/api/skill-versions/',
  '/api/sandbox/', '/api/skill-edit/', '/api/canary/', '/api/change-requests/',
  '/api/test-cases/', '/api/skill-creator/',
];

// Exact root paths (e.g. GET /api/skills) + wildcard sub-paths (e.g. GET /api/skills/:id/files)
for (const prefix of KM_PROXY_PREFIXES) {
  const root = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  app.all(root, proxyToKm);
  app.all(`${root}/*`, proxyToKm);
}

async function proxyToKm(c: import('hono').Context) {
  try {
    const url = new URL(c.req.url);
    const targetUrl = `${KM_SERVICE_URL}${url.pathname}${url.search}`;
    const headers = new Headers(c.req.raw.headers);
    headers.delete('host');
    const res = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : c.req.raw.body,
      // @ts-expect-error duplex needed for streaming request body
      duplex: 'half',
    });
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  } catch (e) {
    return c.json({ error: `km_service unreachable: ${String(e)}` }, 502);
  }
}

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

// Initialize Query Normalizer dictionaries
loadLexicons(resolve(import.meta.dir, 'services/query-normalizer/dictionaries'));

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
