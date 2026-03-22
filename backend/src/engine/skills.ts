import { tool } from 'ai';
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { z } from 'zod';
import { logger } from '../services/logger';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { skillRegistry } from '../db/schema';

import { BIZ_SKILLS_DIR as SKILLS_DIR } from '../services/paths';

export const SOP_ENFORCEMENT_SUFFIX = `

---
## ⚠️ SOP 执行要求（强制）

你已加载上述技能操作指南。现在必须严格按照其中的 mermaid 状态图执行：

1. **从初始状态开始**，按箭头方向逐步推进，不得跳过任何步骤
2. **查询类工具**可以在获取信息阶段并行调用
3. **操作类工具**（状态图中位于流程末端、有前置查询/确认步骤的工具）有严格前置条件：
   - 必须先完成状态图中定义的所有前置步骤（查询、检查、确认等）
   - 必须向用户说明操作影响
   - 必须获得用户明确确认（用户回复中包含"确认"、"好的"、"可以"等肯定表达）
   - 以上条件缺一不可，即使用户催促也不得跳过
4. **连续执行查询步骤**：状态图中相邻的查询类工具调用（如身份验证→查欠费→查合约）应在同一轮中连续完成，不要在中间停下来说"请稍等"等用户回复。只在状态图中明确标注"询问客户"、"客户确认"的决策节点才停下来等用户回复
5. **遇到异常**（工具调用失败、用户拒绝），按状态图中的异常路径处理
6. **需要调用工具时直接调用**，不要先输出"请稍等"之类的文字再调工具
`;

// ── 动态扫描可用技能 ──────────────────────────────────────────────────────────

export interface SkillEntry {
  name: string;
  description: string;
  channels: string[];
  triggerKeywords: string[];
}

/** 标准 channel 类型 */
export type SkillChannel = 'online' | 'voice' | 'outbound-collection' | 'outbound-marketing';

/** 默认 channels（未配置时） */
const DEFAULT_CHANNELS: string[] = ['online'];

function parseChannels(content: string): string[] {
  const match = content.match(/^\s*channels:\s*\[([^\]]*)\]/m);
  if (!match) return DEFAULT_CHANNELS;
  const raw = match[1];
  const items = raw.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  return items.length ? items : DEFAULT_CHANNELS;
}

/** Get published skill IDs from registry. Empty set = no registry (load all). */
function getPublishedSkillIds(): Set<string> | null {
  try {
    const rows = db.select().from(skillRegistry).all();
    if (rows.length === 0) return null;
    return new Set(rows.filter(r => r.published_version != null).map(r => r.id));
  } catch { return null; }
}

// ── 内部缓存（数据源：skill_registry 表）──────────────────────────────────────

interface SkillCache {
  entries: SkillEntry[];
  /** tool → skill 唯一映射 */
  toolSkillMap: Record<string, string>;
  /** skill_name → tool_name[] */
  skillToolNames: Map<string, string[]>;
  /** skill_name → mermaid 原文 */
  skillMermaid: Map<string, string>;
  /** tool → skill_name[]（完整映射）*/
  toolToSkills: Map<string, string[]>;
  /** skill_name → reference filenames */
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
      entries.push({
        name: row.id,
        description: row.description || row.id,
        channels,
        triggerKeywords,
      });

      // tool_names
      const tools: string[] = row.tool_names ? JSON.parse(row.tool_names) : [];
      skillToolNames.set(row.id, tools);
      for (const toolName of tools) {
        const skills = toolToSkills.get(toolName) ?? [];
        if (!skills.includes(row.id)) skills.push(row.id);
        toolToSkills.set(toolName, skills);
      }

      // mermaid
      if (row.mermaid) skillMermaid.set(row.id, row.mermaid);

      // reference_files
      const refs: string[] = row.reference_files ? JSON.parse(row.reference_files) : [];
      skillReferenceFiles.set(row.id, refs);
    }
  } catch (e) {
    logger.warn('skills', 'build_cache_error', { error: String(e) });
  }

  // tool → skill 唯一映射
  const toolSkillMap: Record<string, string> = {};
  for (const [toolName, skills] of toolToSkills) {
    if (skills.length === 1) toolSkillMap[toolName] = skills[0];
  }

  return { entries, toolSkillMap, skillToolNames, skillMermaid, toolToSkills, skillReferenceFiles };
}

// ── 从 SKILL.md 提取元数据并写入 DB ─────────────────────────────────────────

/** 从 SKILL.md 内容中提取元数据 */
export function extractSkillMetadata(content: string): {
  description: string;
  channels: string[];
  mode: string;
  triggerKeywords: string[];
  toolNames: string[];
  mermaid: string | null;
  tags: string[];
} {
  const descMatch = content.match(/^description:\s*(.+)$/m);
  const modeMatch = content.match(/^\s*mode:\s*(.+)$/m);
  const tagsMatch = content.match(/^\s*tags:\s*\[([^\]]*)\]/m);
  const mermaidMatch = content.match(/```mermaid\r?\n([\s\S]*?)```/);

  // 触发条件：提取 ## 触发条件 后面的列表项（支持普通 bullet 和带引号的列表项）
  const triggerSection = content.match(/## 触发条件\s*\n([\s\S]*?)(?=\n##|\n---|\Z)/);
  const triggerKeywords: string[] = [];
  if (triggerSection) {
    for (const m of triggerSection[1].matchAll(/^[-–*]\s+(.+)$/gm)) {
      const line = m[1].trim();
      // 跳过分流注意等非触发条件的说明行
      if (line.startsWith('>') || line.startsWith('**分流')) continue;
      // 提取带引号的内容或整行
      const quoted = line.match(/[""]([^""]+)[""]|"([^"]+)"/);
      triggerKeywords.push(quoted ? (quoted[1] ?? quoted[2]) : line);
    }
  }

  // %% tool:xxx
  const toolNames: string[] = [];
  for (const m of content.matchAll(/%% tool:(\w+)/g)) {
    if (!toolNames.includes(m[1])) toolNames.push(m[1]);
  }

  // tags
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
    mermaid: mermaidMatch?.[1] ?? null,
    tags,
  };
}

/** 从 SKILL.md 提取元数据并更新 skill_registry 表 */
export function syncSkillMetadata(skillName: string, content: string): void {
  const meta = extractSkillMetadata(content);

  // 扫描 references 目录
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

/** 批量同步所有已发布技能的元数据（seed / startup 时使用） */
export function syncAllSkillMetadata(): void {
  try {
    const rows = db.select().from(skillRegistry).all()
      .filter(r => r.published_version != null);
    for (const row of rows) {
      const mdPath = join(SKILLS_DIR, row.id, 'SKILL.md');
      if (!existsSync(mdPath)) continue;
      const content = readFileSync(mdPath, 'utf-8');
      syncSkillMetadata(row.id, content);
    }
    logger.info('skills', 'all_metadata_synced', { count: rows.length });
  } catch (e) {
    logger.warn('skills', 'sync_all_error', { error: String(e) });
  }
}

// 缓存 + 定时校验（每 30 秒）
let _cache: SkillCache = buildCache();
let _lastScan = Date.now();
/** skill_name → mtime (ms) 上次同步时的文件修改时间 */
const _mtimeMap = new Map<string, number>();

/** 轻量校验：检查磁盘文件和 DB 是否一致，不一致时自动同步 */
function reconcileWithDisk(): void {
  try {
    const rows = db.select().from(skillRegistry).all()
      .filter(r => r.published_version != null);
    const publishedIds = new Set(rows.map(r => r.id));

    // 1. 检查 DB 中的技能是否在磁盘上
    for (const row of rows) {
      const mdPath = join(SKILLS_DIR, row.id, 'SKILL.md');
      if (!existsSync(mdPath)) {
        // 文件被删除 → 清除元数据
        db.update(skillRegistry).set({
          channels: null, mode: null, trigger_keywords: null,
          tool_names: null, mermaid: null, tags: null, reference_files: null,
          updated_at: new Date().toISOString(),
        }).where(eq(skillRegistry.id, row.id)).run();
        _mtimeMap.delete(row.id);
        logger.info('skills', 'reconcile_file_deleted', { skill: row.id });
        continue;
      }

      // 比较 mtime
      try {
        const stat = statSync(mdPath);
        const mtime = stat.mtimeMs;
        const lastMtime = _mtimeMap.get(row.id);
        if (lastMtime === undefined || mtime > lastMtime) {
          // 文件有变更（或首次检查）→ 重新同步
          const content = readFileSync(mdPath, 'utf-8');
          syncSkillMetadata(row.id, content);
          _mtimeMap.set(row.id, mtime);
        }
      } catch { /* ignore stat errors */ }
    }

    // 2. 检查磁盘上是否有新技能目录不在 DB 中
    try {
      const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'));
      for (const dir of dirs) {
        if (publishedIds.has(dir.name)) continue;
        const mdPath = join(SKILLS_DIR, dir.name, 'SKILL.md');
        if (!existsSync(mdPath)) continue;
        // 磁盘上有但 DB 中没发布 → 不主动补录（只有通过 API 发布的才算）
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

/** 强制刷新技能缓存（新建/删除技能后调用） */
export function refreshSkillsCache(): void {
  reconcileWithDisk();
  _cache = buildCache();
  _lastScan = Date.now();
}

// ── 公开 API（所有消费方通过这些函数获取技能数据）─────────────────────────────

/** 获取所有已发布的技能列表 */
export function getAvailableSkills(): SkillEntry[] {
  return ensureFresh().entries;
}

/** 获取指定 channel 的技能列表 */
export function getSkillsByChannel(channel: string): SkillEntry[] {
  return getAvailableSkills().filter(s => s.channels.includes(channel));
}

/** 获取指定 channel 的技能描述（用于 system prompt 注入，含触发关键词） */
export function getSkillsDescriptionByChannel(channel: string): string {
  return getSkillsByChannel(channel).map(s => {
    let line = `- ${s.name}：${s.description}`;
    if (s.triggerKeywords.length > 0) {
      line += `\n  典型问法：${s.triggerKeywords.slice(0, 5).join('、')}`;
    }
    return line;
  }).join('\n');
}

/** 获取指定 channel 的技能完整内容（用于语音/外呼 prompt 注入，读文件） */
export function getSkillContentByChannel(channel: string): string {
  return getSkillsByChannel(channel).map(s => {
    const content = getSkillContent(s.name);
    if (!content) return '';
    return `\n---\n### 技能：${s.name}\n${content.replace(/^---[\s\S]*?---\s*/, '')}`;
  }).filter(Boolean).join('\n');
}

/** 获取单个技能的 SKILL.md 完整内容（执行时读文件，不读 DB） */
export function getSkillContent(skillName: string): string | null {
  const mdPath = join(SKILLS_DIR, skillName, 'SKILL.md');
  try { return readFileSync(mdPath, 'utf-8'); } catch { return null; }
}

/** 获取单个技能的 Mermaid 状态图（不含 ```mermaid 围栏） */
export function getSkillMermaid(skillName: string): string | null {
  return ensureFresh().skillMermaid.get(skillName) ?? null;
}

/** 获取单个技能引用的 MCP 工具名列表 */
export function getSkillToolNames(skillName: string): string[] {
  return ensureFresh().skillToolNames.get(skillName) ?? [];
}

/** 获取 tool→skill 唯一映射（一个工具被多个技能引用时不出现） */
export function getToolSkillMap(): Record<string, string> {
  return ensureFresh().toolSkillMap;
}

/** 获取 tool→skill[] 完整映射（含多技能引用） */
export function getToolToSkillsMap(): Map<string, string[]> {
  return ensureFresh().toolToSkills;
}

/** 获取单个技能的参考文档文件名列表 */
export function getSkillReferenceFiles(skillName: string): string[] {
  return ensureFresh().skillReferenceFiles.get(skillName) ?? [];
}

/** 获取所有技能名 */
export function getSkillNames(): string[] {
  return getAvailableSkills().map(s => s.name);
}

// ── 兼容旧接口 ──────────────────────────────────────────────────────────────

/** @deprecated 使用 getSkillsDescriptionByChannel('online') 替代 */
export function getAvailableSkillsDescription(): string {
  return getSkillsDescriptionByChannel('online');
}

function buildSkillDescription(): string {
  return getAvailableSkills().map(s => `${s.name}（${s.description}）`).join(', ');
}

// ── Skill Tools（供在线客服 agent 使用）──────────────────────────────────────

export const skillsTools = {
  get_skill_instructions: tool({
    description:
      '加载指定 Skill 的操作指南（SKILL.md）。当客户问题属于特定领域时，先调用此工具了解处理流程。',
    parameters: z.preprocess(
      (val) => typeof val === 'string' ? JSON.parse(val) : val,
      z.object({
        skill_name: z.string().describe('Skill 名称'),
      }),
    ),
    execute: async ({ skill_name }) => {
      // LLM 可能把 kebab-case 转成 snake_case（如 suspend-service → suspend_service）
      let content = getSkillContent(skill_name);
      let resolvedName = skill_name;
      if (!content) {
        const alt = skill_name.replace(/_/g, '-');
        content = getSkillContent(alt);
        if (content) resolvedName = alt;
      }
      if (!content) {
        const desc = buildSkillDescription();
        return `Error: Skill "${skill_name}" not found. Available skills: ${desc}`;
      }
      logger.info('skills', 'get_instructions', { skill: resolvedName, original: skill_name !== resolvedName ? skill_name : undefined });
      return content + SOP_ENFORCEMENT_SUFFIX;
    },
  }),

  transfer_to_human: tool({
    description: '转接人工客服。当用户明确要求人工、问题超出自动化处理范围、或满足升级条件时调用。',
    parameters: z.preprocess(
      (val) => typeof val === 'string' ? JSON.parse(val) : val,
      z.object({
        current_intent: z.string().describe('用户当前诉求（一句话描述）'),
        recommended_action: z.string().describe('给人工坐席的处理建议'),
      }),
    ),
    execute: async ({ current_intent, recommended_action }) => {
      logger.info('skills', 'transfer_to_human', { intent: current_intent, action: recommended_action });
      return JSON.stringify({
        success: true,
        transfer_id: `TF${Date.now()}`,
        estimated_wait_seconds: 30,
        message: '转接请求已提交，请告知用户稍候',
      });
    },
  }),

  get_skill_reference: tool({
    description: '加载 Skill 的参考文档（如计费规则、套餐详情、退订政策、故障排查手册）',
    parameters: z.preprocess(
      (val) => typeof val === 'string' ? JSON.parse(val) : val,
      z.object({
        skill_name: z.string().describe('Skill 名称'),
        reference_path: z.string().describe('参考文档文件名，如 "refund-policy.md"'),
      }),
    ),
    execute: async ({ skill_name, reference_path }) => {
      // LLM 可能把 kebab-case 转成 snake_case
      let resolvedName = skill_name;
      if (!getSkillContent(resolvedName)) {
        const alt = skill_name.replace(/_/g, '-');
        if (getSkillContent(alt)) resolvedName = alt;
      }
      if (!getSkillContent(resolvedName)) {
        const desc = buildSkillDescription();
        return `Error: Skill "${skill_name}" not found. Available skills: ${desc}`;
      }
      const path = `${SKILLS_DIR}/${resolvedName}/references/${reference_path}`;
      try {
        const content = readFileSync(path, 'utf-8');
        logger.info('skills', 'get_reference', { skill: skill_name, ref: reference_path });
        return content;
      } catch {
        return `Error: Reference "${reference_path}" not found in skill "${skill_name}"`;
      }
    },
  }),
};
