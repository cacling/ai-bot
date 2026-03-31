/**
 * engine-stubs.ts — Skills engine functions for km_service
 *
 * Self-contained implementations of skill cache/metadata functions.
 * runAgent proxies to the main backend via HTTP.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { eq, and } from 'drizzle-orm';
import { db, skillRegistry, skillWorkflowSpecs } from './db';
import { logger } from './logger';
import { BIZ_SKILLS_DIR as SKILLS_DIR } from './paths';
import { extractPrimaryMermaidBlock } from './skill-markdown';

// Re-export workflow types/compiler for dynamic imports
export { compileWorkflow } from './skill-workflow-compiler';
export type { WorkflowSpec, CompileResult } from './skill-workflow-types';

// ── Skill Cache ──────────────────────────────────────────────────────────────

interface SkillEntry {
  name: string;
  description: string;
  channels: string[];
  triggerKeywords: string[];
}

const DEFAULT_CHANNELS: string[] = ['online'];

function parseChannels(content: string): string[] {
  const match = content.match(/^\s*channels:\s*\[([^\]]*)\]/m);
  if (!match) return DEFAULT_CHANNELS;
  const items = match[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  return items.length ? items : DEFAULT_CHANNELS;
}

interface SkillCache {
  entries: SkillEntry[];
  toolSkillMap: Record<string, string>;
  skillToolNames: Map<string, string[]>;
  skillMermaid: Map<string, string>;
  toolToSkills: Map<string, string[]>;
  skillReferenceFiles: Map<string, string[]>;
}

function buildCache(): SkillCache {
  const entries: SkillEntry[] = [];
  const skillToolNames = new Map<string, string[]>();
  const skillMermaid = new Map<string, string>();
  const toolToSkills = new Map<string, string[]>();
  const skillReferenceFiles = new Map<string, string[]>();

  try {
    const rows = db.select().from(skillRegistry).all()
      .filter(r => r.published_version != null);

    for (const row of rows) {
      const channels: string[] = row.channels ? JSON.parse(row.channels) : DEFAULT_CHANNELS;
      const triggerKeywords: string[] = row.trigger_keywords ? JSON.parse(row.trigger_keywords) : [];
      entries.push({ name: row.id, description: row.description || row.id, channels, triggerKeywords });

      const tools: string[] = row.tool_names ? JSON.parse(row.tool_names) : [];
      skillToolNames.set(row.id, tools);
      for (const toolName of tools) {
        const skills = toolToSkills.get(toolName) ?? [];
        if (!skills.includes(row.id)) skills.push(row.id);
        toolToSkills.set(toolName, skills);
      }

      if (row.mermaid) skillMermaid.set(row.id, row.mermaid);
      const refs: string[] = row.reference_files ? JSON.parse(row.reference_files) : [];
      skillReferenceFiles.set(row.id, refs);
    }
  } catch (e) {
    logger.warn('skills', 'build_cache_error', { error: String(e) });
  }

  const toolSkillMap: Record<string, string> = {};
  for (const [toolName, skills] of toolToSkills) {
    if (skills.length === 1) toolSkillMap[toolName] = skills[0];
  }

  return { entries, toolSkillMap, skillToolNames, skillMermaid, toolToSkills, skillReferenceFiles };
}

// ── Metadata extraction ──────────────────────────────────────────────────────

export function extractSkillMetadata(content: string) {
  const descMatch = content.match(/^description:\s*(.+)$/m);
  const modeMatch = content.match(/^\s*mode:\s*(.+)$/m);
  const tagsMatch = content.match(/^\s*tags:\s*\[([^\]]*)\]/m);
  const mermaid = extractPrimaryMermaidBlock(content);

  const triggerSection = content.match(/## 触发条件\s*\n([\s\S]*?)(?=\n##|\n---|\Z)/);
  const triggerKeywords: string[] = [];
  if (triggerSection) {
    for (const m of triggerSection[1].matchAll(/^[-–*]\s+(.+)$/gm)) {
      const line = m[1].trim();
      if (line.startsWith('>') || line.startsWith('**分流')) continue;
      const quoted = line.match(/[""]([^""]+)[""]|"([^"]+)"/);
      triggerKeywords.push(quoted ? (quoted[1] ?? quoted[2]) : line);
    }
  }

  const toolNames: string[] = [];
  for (const m of content.matchAll(/%% tool:(\w+)/g)) {
    if (!toolNames.includes(m[1])) toolNames.push(m[1]);
  }

  const tags: string[] = [];
  if (tagsMatch) {
    for (const t of tagsMatch[1].split(',')) {
      const trimmed = t.trim().replace(/^["']|["']$/g, '');
      if (trimmed) tags.push(trimmed);
    }
  }

  return {
    description: descMatch?.[1]?.trim() ?? '',
    channels: parseChannels(content),
    mode: modeMatch?.[1]?.trim() ?? 'inbound',
    triggerKeywords,
    toolNames,
    mermaid,
    tags,
  };
}

/** 从 SKILL.md 提取元数据并更新 skill_registry 表 */
export function syncSkillMetadata(skillName: string, content: string): void {
  const meta = extractSkillMetadata(content);

  const refsDir = join(SKILLS_DIR, skillName, 'references');
  let refFiles: string[] = [];
  try {
    if (existsSync(refsDir)) {
      refFiles = readdirSync(refsDir).filter(f => f.endsWith('.md'));
    }
  } catch { /* ignore */ }

  const now = new Date().toISOString();
  db.update(skillRegistry).set({
    description: meta.description,
    channels: JSON.stringify(meta.channels),
    mode: meta.mode,
    trigger_keywords: meta.triggerKeywords.length > 0 ? JSON.stringify(meta.triggerKeywords) : null,
    tool_names: meta.toolNames.length > 0 ? JSON.stringify(meta.toolNames) : null,
    mermaid: meta.mermaid,
    tags: meta.tags.length > 0 ? JSON.stringify(meta.tags) : null,
    reference_files: refFiles.length > 0 ? JSON.stringify(refFiles) : null,
    updated_at: now,
  }).where(eq(skillRegistry.id, skillName)).run();

  logger.info('skills', 'metadata_synced', { skill: skillName, tools: meta.toolNames.length, refs: refFiles.length });
}

// ── Cache lifecycle ──────────────────────────────────────────────────────────

let _cache: SkillCache = buildCache();
let _lastScan = Date.now();
const _mtimeMap = new Map<string, number>();

function reconcileWithDisk(): void {
  try {
    const rows = db.select().from(skillRegistry).all()
      .filter(r => r.published_version != null);
    const publishedIds = new Set(rows.map(r => r.id));

    for (const row of rows) {
      const mdPath = join(SKILLS_DIR, row.id, 'SKILL.md');
      if (!existsSync(mdPath)) {
        db.update(skillRegistry).set({
          channels: null, mode: null, trigger_keywords: null,
          tool_names: null, mermaid: null, tags: null, reference_files: null,
          updated_at: new Date().toISOString(),
        }).where(eq(skillRegistry.id, row.id)).run();
        _mtimeMap.delete(row.id);
        continue;
      }
      try {
        const stat = statSync(mdPath);
        const mtime = stat.mtimeMs;
        const lastMtime = _mtimeMap.get(row.id);
        if (lastMtime === undefined || mtime > lastMtime) {
          const content = readFileSync(mdPath, 'utf-8');
          syncSkillMetadata(row.id, content);
          _mtimeMap.set(row.id, mtime);
        }
      } catch { /* ignore */ }
    }

    try {
      const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'));
      for (const dir of dirs) {
        if (publishedIds.has(dir.name)) continue;
        const mdPath = join(SKILLS_DIR, dir.name, 'SKILL.md');
        if (!existsSync(mdPath)) continue;
        try {
          const content = readFileSync(mdPath, 'utf-8');
          const meta = extractSkillMetadata(content);
          db.insert(skillRegistry).values({
            id: dir.name,
            published_version: 1,
            latest_version: 1,
            description: meta.description,
          }).onConflictDoUpdate({
            target: skillRegistry.id,
            set: { published_version: 1, updated_at: new Date().toISOString() },
          }).run();
          syncSkillMetadata(dir.name, content);
        } catch (e) {
          logger.warn('skills', 'reconcile_auto_publish_error', { skill: dir.name, error: String(e) });
        }
      }
    } catch { /* ignore */ }
  } catch (e) {
    logger.warn('skills', 'reconcile_error', { error: String(e) });
  }
}

function ensureFresh(): SkillCache {
  if (Date.now() - _lastScan > 30_000) {
    reconcileWithDisk();
    _cache = buildCache();
    _lastScan = Date.now();
  }
  return _cache;
}

/** 强制刷新技能缓存 */
export function refreshSkillsCache(): void {
  reconcileWithDisk();
  _cache = buildCache();
  _lastScan = Date.now();
}

/** 获取 tool→skill[] 完整映射 */
export function getToolToSkillsMap(): Map<string, string[]> {
  return ensureFresh().toolToSkills;
}

/** 获取单个技能的 Mermaid 状态图 */
export function getSkillMermaid(skillName: string): string | null {
  return ensureFresh().skillMermaid.get(skillName) ?? null;
}

/** 获取所有已发布的技能列表 */
export function getAvailableSkills() {
  return ensureFresh().entries;
}

/** 获取单个技能的 SKILL.md 完整内容 */
export function getSkillContent(skillName: string): string | null {
  const mdPath = join(SKILLS_DIR, skillName, 'SKILL.md');
  try { return readFileSync(mdPath, 'utf-8'); } catch { return null; }
}

// ── Constants ────────────────────────────────────────────────────────────────

export const SOP_ENFORCEMENT_SUFFIX = `

---
⚠️ **SOP 执行要求**：你必须严格按照上述操作指南中的步骤顺序执行，不得跳步、遗漏或自行发挥。每一步都要确认完成后再进入下一步。
`;

// ── runAgent proxy ───────────────────────────────────────────────────────────

const BACKEND_BASE = process.env.BACKEND_URL ?? 'http://localhost:18001';

interface AgentResult {
  text: string;
  card?: { type: string; data?: unknown } | null;
  toolRecords?: Array<{ tool: string; args?: Record<string, unknown>; result?: unknown }>;
  transferData?: unknown;
  skill_diagram?: { skill_name?: string; mermaid?: string; active_node?: string } | null;
}

/**
 * Proxy runAgent to the main backend.
 * Accepts the same positional arguments as the real runAgent in backend.
 */
export async function runAgent(
  message: string,
  history: Array<{ role: string; content: string }>,
  phone?: string,
  lang?: string,
  onDiagramUpdate?: unknown,
  onTextDelta?: unknown,
  subscriberName?: string,
  planName?: string,
  subscriberGenderOrOverrideDir?: string,
  overrideDirOrOptions?: string | Record<string, unknown>,
  options?: Record<string, unknown>,
): Promise<AgentResult> {
  // Normalize arguments: the caller may pass 10 or 11 args
  let overrideSkillsDir: string | undefined;
  let opts: Record<string, unknown> = {};
  if (typeof overrideDirOrOptions === 'string') {
    overrideSkillsDir = overrideDirOrOptions;
    opts = (options as Record<string, unknown>) ?? {};
  } else if (typeof overrideDirOrOptions === 'object' && overrideDirOrOptions !== null) {
    overrideSkillsDir = subscriberGenderOrOverrideDir;
    opts = overrideDirOrOptions;
  }

  try {
    const res = await fetch(`${BACKEND_BASE}/api/sandbox/run-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history,
        phone: phone ?? '13800000001',
        lang: lang ?? 'zh',
        subscriberName,
        planName,
        overrideSkillsDir,
        ...opts,
      }),
    });
    if (!res.ok) {
      return { text: `Backend error: ${res.status} ${res.statusText}` };
    }
    return await res.json() as AgentResult;
  } catch (e) {
    logger.error('engine-stubs', 'runAgent_proxy_error', { error: String(e) });
    return { text: `runAgent proxy failed: ${String(e)}` };
  }
}
