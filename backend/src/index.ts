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
    allowHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    credentials: true,
  })
);

app.get('/health', (c) => c.json({ status: 'ok' }));

// ── Staff Auth ──────────────────────────────────────────────────────────────
import { staffAuthRoutes, staffSessionMiddleware, cleanExpiredSessions } from './services/staff-auth';
app.route('/api/staff-auth', staffAuthRoutes);
app.use('/api/*', staffSessionMiddleware);

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

// ── 技能测试 — Agent 调用接口 ────────────────────────────────────────────────
// km_service 的技能测试通过此接口调用 backend Agent 引擎
app.post('/api/test/run-agent', async (c) => {
  const body = await c.req.json<{
    message: string;
    history?: Array<{ role: string; content: string }>;
    phone?: string;
    lang?: 'zh' | 'en';
    subscriberName?: string;
    planName?: string;
    subscriberGender?: string;
    overrideSkillsDir?: string;
    useMock?: boolean;
    skillContent?: string;
    skillName?: string;
    sessionId?: string;
  }>();
  if (!body.message) return c.json({ error: 'message 不能为空' }, 400);

  try {
    logger.info('test', 'run_agent_start', {
      message_len: body.message.length,
      history_len: body.history?.length ?? 0,
      skill: body.skillName,
      override_dir: body.overrideSkillsDir,
    });
    const result = await runAgent(
      body.message,
      (body.history ?? []) as import('ai').CoreMessage[],
      body.phone ?? '13800000001',
      body.lang ?? 'zh',
      undefined, // onDiagramUpdate
      undefined, // onTextDelta
      body.subscriberName,
      body.planName,
      body.subscriberGender,
      body.overrideSkillsDir,
      {
        useMock: body.useMock !== false,
        skillContent: body.skillContent,
        skillName: body.skillName,
        sessionId: body.sessionId,
      },
    );
    logger.info('test', 'run_agent_done', {
      text_len: result.text.length,
      has_card: !!result.card,
      tool_count: result.toolRecords?.length ?? 0,
    });
    return c.json({
      text: result.text,
      card: result.card ?? null,
      skill_diagram: result.skill_diagram ?? null,
      toolRecords: result.toolRecords ?? [],
      transferData: result.transferData ?? null,
    });
  } catch (err) {
    logger.error('test', 'run_agent_error', { error: String(err) });
    return c.json({ error: `Agent 执行失败: ${String(err)}` }, 500);
  }
});

// ── KM Service Proxy ─────────────────────────────────────────────────────────
// Routes for KM, MCP, Skills, etc. are served by km_service (port 18010).
// In production, the frontend proxy sends these directly to km_service.
// This reverse proxy is a convenience for dev/test when only the backend is running.
import { mountKmProxy } from './services/km-proxy';
import { mountWorkOrderProxy } from './services/work-order-proxy';
import { mountCdpProxy } from './services/cdp-proxy';
mountKmProxy(app);
mountWorkOrderProxy(app);
mountCdpProxy(app);

// Mount voice WebSocket route: GET /ws/voice
app.route('/', voiceRoutes);

// Mount outbound WebSocket route: GET /ws/outbound
app.route('/', outboundRoutes);

// Mount online chat WebSocket route: GET /ws/chat
app.route('/', chatWsRoutes);

// Mount agent workstation WebSocket route: GET /ws/agent
app.route('/', agentWsRoutes);

const PORT = Number(process.env.BACKEND_PORT ?? 18472);

logger.info('server', 'starting', {
  port: PORT,
  skills_dir: process.env.SKILLS_DIR ?? '(default)',
  node_env: process.env.NODE_ENV ?? 'development',
});

// Initialize Query Normalizer dictionaries
loadLexicons(resolve(import.meta.dir, 'services/query-normalizer/dictionaries'));

// Pre-warm skill registry cache so getSkillRegistrySync() has data on first WS connection
import { getSkillRegistry } from './services/km-client';
getSkillRegistry().then(rows => {
  logger.info('server', 'skill_registry_warmed', { count: rows.length });
}).catch(err => {
  logger.warn('server', 'skill_registry_warmup_failed', { error: String(err) });
});

// Clean expired staff sessions on startup + hourly
cleanExpiredSessions();
setInterval(cleanExpiredSessions, 60 * 60 * 1000);

// Warmup: make a lightweight LLM call at startup to avoid cold-start latency on first request
// Waits up to 30s for the MCP server to become available before warmup
(async () => {
  // Poll until at least one MCP server is reachable
  const MCP_CHECK_URL = process.env.TELECOM_MCP_URL ?? `http://127.0.0.1:${process.env.MCP_INTERNAL_PORT ?? 18003}/mcp`;
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
