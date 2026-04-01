/**
 * km-client.ts — HTTP client for km_service
 *
 * Proxies calls to the standalone KM microservice (port 18010).
 * Replaces direct imports from reply-copilot, agent-copilot, and tools-overview.
 */

import { logger } from './logger';

const KM_BASE = process.env.KM_SERVICE_URL ?? `http://localhost:${process.env.KM_SERVICE_PORT ?? 18010}`;

async function kmFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${KM_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    if (!res.ok) {
      logger.warn('km-client', 'fetch_error', { path, status: res.status });
      return null;
    }
    return await res.json() as T;
  } catch (e) {
    logger.warn('km-client', 'fetch_failed', { path, error: String(e) });
    return null;
  }
}

// ── Reply Copilot ───────────────────────────────────────────────────────────

export interface ReplyHints {
  scene: { code: string; label: string; risk: string };
  required_slots: string[];
  recommended_terms: string[];
  forbidden_terms: string[];
  reply_options: Array<{ label: string; text: string }>;
  next_actions: string[];
  sources: string[];
  confidence: number;
  asset_version_id: string;
}

export async function buildReplyHints(params: {
  message: string;
  phone: string;
  normalizedQuery?: string;
  intentHints?: string[];
}): Promise<ReplyHints | null> {
  return kmFetch<ReplyHints>('/api/km/reply-copilot/build', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ── Agent Copilot ───────────────────────────────────────────────────────────

export interface CopilotData {
  summary: {
    current_summary: string;
    intent: string;
    scene: { code: string; label: string; risk: string };
    emotion: string;
    missing_slots: string[];
    recommended_actions: string[];
    confidence: number;
    matched_sources_count: number;
  };
  recommendations: {
    reply_options: Array<{ label: string; text: string; source: string }>;
    recommended_terms: string[];
    forbidden_terms: string[];
    next_actions: string[];
    sources: string[];
    asset_version_id: string;
  };
  suggested_questions: string[];
}

export async function buildCopilotContext(params: {
  message: string;
  phone: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  normalizedQuery?: string;
  intentHints?: string[];
}): Promise<CopilotData | null> {
  return kmFetch<CopilotData>('/api/km/agent-copilot/context', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ── Knowledge Base Q&A ─────────────────────────────────────────────────────

export interface KbAnswer {
  answer: string;
  sources: string[];
  confidence: number;
}

export async function askKnowledgeBase(params: {
  question: string;
  phone?: string;
  conversation_summary?: string;
}): Promise<KbAnswer | null> {
  const result = await kmFetch<{ answer: KbAnswer }>('/api/km/agent-copilot/ask', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return result?.answer ?? null;
}

// ── Tools Overview ──────────────────────────────────────────────────────────

export interface ToolOverviewItem {
  name: string;
  description: string;
  source: string;
  source_type: 'mcp' | 'builtin' | 'local';
  status: 'available' | 'disabled' | 'planned';
  mocked: boolean;
  skills: string[];
  annotations?: string | null;
}

export interface ToolDetailItem extends ToolOverviewItem {
  inputSchema: Record<string, unknown> | null;
  responseExample: unknown | null;
}

/** Cached tools overview — refreshed every 30s */
let _toolsCache: ToolOverviewItem[] | null = null;
let _toolsCacheTs = 0;
let _toolsWarmupPromise: Promise<void> | null = null;

/**
 * Get tools overview.
 * On first call (cold start), awaits the initial fetch so callers never get an empty array.
 * Subsequent calls return from cache and refresh in background.
 */
export async function getToolsOverview(): Promise<ToolOverviewItem[]> {
  // Cache hit — return immediately, refresh in background if stale
  if (_toolsCache && Date.now() - _toolsCacheTs < 30_000) return _toolsCache;

  // Cold start — await the warmup so first session gets tools
  if (!_toolsCache) {
    if (!_toolsWarmupPromise) {
      _toolsWarmupPromise = warmToolsCache();
    }
    await _toolsWarmupPromise;
    _toolsWarmupPromise = null;
    return _toolsCache ?? [];
  }

  // Stale cache — return current, refresh in background
  kmFetch<{ items: ToolOverviewItem[] }>('/api/mcp/tools').then(data => {
    if (data?.items) {
      _toolsCache = data.items;
      _toolsCacheTs = Date.now();
    }
  });

  return _toolsCache;
}

/** Cached tool details — keyed by tool name */
const _toolDetailCache = new Map<string, { detail: ToolDetailItem; ts: number }>();

/**
 * Get full tool detail including inputSchema from km_service.
 * Falls back to overview data if detail endpoint is unavailable.
 */
export async function getToolDetail(toolName: string): Promise<ToolDetailItem | null> {
  // Check detail cache (30s TTL)
  const cached = _toolDetailCache.get(toolName);
  if (cached && Date.now() - cached.ts < 30_000) return cached.detail;

  // Fetch full detail from km_service
  const detail = await kmFetch<ToolDetailItem>(`/api/mcp/tools/${encodeURIComponent(toolName)}`);
  if (detail) {
    _toolDetailCache.set(toolName, { detail, ts: Date.now() });
    return detail;
  }

  // Fallback: return overview entry (with null schema) so callers still get basic info
  const overview = (await getToolsOverview()).find(t => t.name === toolName);
  if (!overview) return null;
  return { ...overview, inputSchema: null, responseExample: null };
}

/**
 * Synchronous cache-only access — returns whatever is in cache (may be []).
 * Use for hot paths that cannot await (e.g. sop-guard).
 * For cold-start-safe access, use the async getToolsOverview().
 */
export function getToolsOverviewSync(): ToolOverviewItem[] {
  // Trigger background refresh if stale
  if (!_toolsCache || Date.now() - _toolsCacheTs >= 30_000) {
    kmFetch<{ items: ToolOverviewItem[] }>('/api/mcp/tools').then(data => {
      if (data?.items) {
        _toolsCache = data.items;
        _toolsCacheTs = Date.now();
      }
    });
  }
  return _toolsCache ?? [];
}

/** Pre-warm the tools cache at startup */
export async function warmToolsCache(): Promise<void> {
  const data = await kmFetch<{ items: ToolOverviewItem[] }>('/api/mcp/tools');
  if (data?.items) {
    _toolsCache = data.items;
    _toolsCacheTs = Date.now();
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Skill Registry（TTL 30s 缓存）
// ══════════════════════════════════════════════════════════════════════════

export interface SkillRegistryRow {
  id: string;
  published_version: number | null;
  latest_version: number;
  description: string;
  channels: string | null;
  mode: string | null;
  trigger_keywords: string | null;
  tool_names: string | null;
  mermaid: string | null;
  tags: string | null;
  reference_files: string | null;
  updated_at: string | null;
}

let _skillRegistryCache: SkillRegistryRow[] | null = null;
let _skillRegistryCacheTs = 0;
const SKILL_CACHE_TTL = 30_000;

export async function getSkillRegistry(): Promise<SkillRegistryRow[]> {
  if (_skillRegistryCache && Date.now() - _skillRegistryCacheTs < SKILL_CACHE_TTL) {
    return _skillRegistryCache;
  }

  const data = await kmFetch<{ items: SkillRegistryRow[] }>('/api/internal/skills/registry');
  if (data?.items) {
    _skillRegistryCache = data.items;
    _skillRegistryCacheTs = Date.now();
    return data.items;
  }

  return _skillRegistryCache ?? [];
}

export function getSkillRegistrySync(): SkillRegistryRow[] {
  if (!_skillRegistryCache || Date.now() - _skillRegistryCacheTs >= SKILL_CACHE_TTL) {
    kmFetch<{ items: SkillRegistryRow[] }>('/api/internal/skills/registry').then(data => {
      if (data?.items) {
        _skillRegistryCache = data.items;
        _skillRegistryCacheTs = Date.now();
      }
    });
  }
  return _skillRegistryCache ?? [];
}

// ── Workflow Specs（per-skill 缓存）──────────────────────────────────────

export interface WorkflowSpecRow {
  skill_id: string;
  version_no: number;
  status: string;
  spec_json: string;
  created_at: string | null;
  updated_at: string | null;
}

const _specCache = new Map<string, { row: WorkflowSpecRow | null; ts: number }>();

export async function getWorkflowSpec(skillId: string): Promise<WorkflowSpecRow | null> {
  const cached = _specCache.get(skillId);
  if (cached && Date.now() - cached.ts < SKILL_CACHE_TTL) return cached.row;

  const data = await kmFetch<WorkflowSpecRow>(`/api/internal/skills/workflow-specs/${encodeURIComponent(skillId)}`);
  const row = data ?? null;
  _specCache.set(skillId, { row, ts: Date.now() });
  return row;
}

export function getWorkflowSpecSync(skillId: string): WorkflowSpecRow | null {
  const cached = _specCache.get(skillId);
  if (!cached || Date.now() - cached.ts >= SKILL_CACHE_TTL) {
    kmFetch<WorkflowSpecRow>(`/api/internal/skills/workflow-specs/${encodeURIComponent(skillId)}`).then(data => {
      _specCache.set(skillId, { row: data ?? null, ts: Date.now() });
    });
  }
  return cached?.row ?? null;
}

// ── Sync Metadata（写入）──────────────────────────────────────────────────

export async function syncSkillMetadata(skillId: string, metadata: Record<string, unknown>): Promise<boolean> {
  const result = await kmFetch<{ ok: boolean }>(`/api/internal/skills/registry/${encodeURIComponent(skillId)}/sync-metadata`, {
    method: 'POST',
    body: JSON.stringify(metadata),
  });
  if (result?.ok) {
    // 刷新缓存
    _skillRegistryCache = null;
    _skillRegistryCacheTs = 0;
  }
  return result?.ok ?? false;
}

export async function insertWorkflowSpec(spec: { skill_id: string; version_no: number; spec_json: string; status?: string }): Promise<boolean> {
  const result = await kmFetch<{ ok: boolean }>('/api/internal/skills/workflow-specs', {
    method: 'POST',
    body: JSON.stringify(spec),
  });
  if (result?.ok) {
    _specCache.delete(spec.skill_id);
  }
  return result?.ok ?? false;
}

// ══════════════════════════════════════════════════════════════════════════
// MCP Servers & Tool Bindings（TTL 60s 缓存）
// ══════════════════════════════════════════════════════════════════════════

export interface McpServerRow {
  id: string;
  name: string;
  description: string;
  transport: string;
  enabled: boolean;
  kind: string;
  url: string | null;
  status: string | null;
  disabled_tools: string | null;
  mock_rules: string | null;
  tools_json: string | null;
  [key: string]: unknown;
}

let _mcpServersCache: McpServerRow[] | null = null;
let _mcpServersCacheTs = 0;
const MCP_CACHE_TTL = 60_000;

export async function getMcpServers(): Promise<McpServerRow[]> {
  if (_mcpServersCache && Date.now() - _mcpServersCacheTs < MCP_CACHE_TTL) {
    return _mcpServersCache;
  }

  const data = await kmFetch<{ items: McpServerRow[] }>('/api/internal/mcp/servers-full');
  if (data?.items) {
    _mcpServersCache = data.items;
    _mcpServersCacheTs = Date.now();
    return data.items;
  }

  return _mcpServersCache ?? [];
}

export function getMcpServersSync(): McpServerRow[] {
  if (!_mcpServersCache || Date.now() - _mcpServersCacheTs >= MCP_CACHE_TTL) {
    kmFetch<{ items: McpServerRow[] }>('/api/internal/mcp/servers-full').then(data => {
      if (data?.items) {
        _mcpServersCache = data.items;
        _mcpServersCacheTs = Date.now();
      }
    });
  }
  return _mcpServersCache ?? [];
}

// ── MCP Tools（全量）──

export interface McpToolRow {
  id: string;
  name: string;
  description: string;
  input_schema: string | null;
  output_schema: string | null;
  mocked: boolean;
  disabled: boolean;
  mock_rules: string | null;
  server_id: string | null;
  annotations: string | null;
  [key: string]: unknown;
}

let _mcpToolsCache: McpToolRow[] | null = null;
let _mcpToolsCacheTs = 0;

export async function getMcpTools(): Promise<McpToolRow[]> {
  if (_mcpToolsCache && Date.now() - _mcpToolsCacheTs < MCP_CACHE_TTL) {
    return _mcpToolsCache;
  }

  const data = await kmFetch<{ items: McpToolRow[] }>('/api/internal/mcp/tools-full');
  if (data?.items) {
    _mcpToolsCache = data.items;
    _mcpToolsCacheTs = Date.now();
    return data.items;
  }

  return _mcpToolsCache ?? [];
}

export function getMcpToolsSync(): McpToolRow[] {
  if (!_mcpToolsCache || Date.now() - _mcpToolsCacheTs >= MCP_CACHE_TTL) {
    kmFetch<{ items: McpToolRow[] }>('/api/internal/mcp/tools-full').then(data => {
      if (data?.items) {
        _mcpToolsCache = data.items;
        _mcpToolsCacheTs = Date.now();
      }
    });
  }
  return _mcpToolsCache ?? [];
}

// ── Tool Bindings ──

export interface ToolBindingsData {
  implementations: Array<{
    id: string;
    tool_id: string;
    adapter_type: string;
    connector_id: string | null;
    handler_key: string | null;
    config: string | null;
    status: string;
    [key: string]: unknown;
  }>;
  connectors: Array<{
    id: string;
    name: string;
    type: string;
    config: string | null;
    status: string;
    [key: string]: unknown;
  }>;
}

let _bindingsCache: ToolBindingsData | null = null;
let _bindingsCacheTs = 0;

export async function getMcpToolBindings(): Promise<ToolBindingsData> {
  if (_bindingsCache && Date.now() - _bindingsCacheTs < MCP_CACHE_TTL) {
    return _bindingsCache;
  }

  const data = await kmFetch<ToolBindingsData>('/api/internal/mcp/tool-bindings');
  if (data) {
    _bindingsCache = data;
    _bindingsCacheTs = Date.now();
    return data;
  }

  return _bindingsCache ?? { implementations: [], connectors: [] };
}

export function getMcpToolBindingsSync(): ToolBindingsData {
  if (!_bindingsCache || Date.now() - _bindingsCacheTs >= MCP_CACHE_TTL) {
    getMcpToolBindings(); // trigger background refresh
  }
  return _bindingsCache ?? { implementations: [], connectors: [] };
}

// ── Cache Control ──

export function invalidateSkillCache(): void {
  _skillRegistryCache = null;
  _skillRegistryCacheTs = 0;
  _specCache.clear();
}

export function invalidateMcpCache(): void {
  _mcpServersCache = null;
  _mcpServersCacheTs = 0;
  _mcpToolsCache = null;
  _mcpToolsCacheTs = 0;
  _bindingsCache = null;
  _bindingsCacheTs = 0;
}

/** 预热全部缓存（启动时调用） */
export async function warmAllCaches(): Promise<void> {
  await Promise.all([
    warmToolsCache(),
    getSkillRegistry(),
    getMcpServers(),
    getMcpTools(),
    getMcpToolBindings(),
  ]);
}
