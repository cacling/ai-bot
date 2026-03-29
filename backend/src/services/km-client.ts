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
