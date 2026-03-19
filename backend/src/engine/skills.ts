import { tool } from 'ai';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { z } from 'zod';
import { logger } from '../services/logger';
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
4. **每个需要用户决策的节点**，停下来等待用户回复，不要替用户做决定
5. **遇到异常**（工具调用失败、用户拒绝），按状态图中的异常路径处理
6. **需要调用工具时直接调用**，不要先输出"请稍等"之类的文字再调工具
`;

// ── 动态扫描可用技能 ──────────────────────────────────────────────────────────

export interface SkillEntry {
  name: string;
  description: string;
  channels: string[];
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

// ── 内部缓存：技能内容（避免重复读文件）───────────────────────────────────────

interface SkillCache {
  entries: SkillEntry[];
  /** skill_name → SKILL.md 完整内容 */
  contents: Map<string, string>;
  /** tool → skill 唯一映射 */
  toolSkillMap: Record<string, string>;
  /** skill_name → tool_name[] */
  skillToolNames: Map<string, string[]>;
  /** skill_name → mermaid 原文（不含 ```mermaid 围栏）*/
  skillMermaid: Map<string, string>;
  /** tool → skill_name[]（一个工具被多个技能引用的完整映射）*/
  toolToSkills: Map<string, string[]>;
}

function buildCache(): SkillCache {
  const publishedIds = getPublishedSkillIds();
  const entries: SkillEntry[] = [];
  const contents = new Map<string, string>();
  const skillToolNames = new Map<string, string[]>();
  const skillMermaid = new Map<string, string>();
  const toolToSkills = new Map<string, string[]>();

  try {
    const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'));
    for (const dir of dirs) {
      if (publishedIds && !publishedIds.has(dir.name)) continue;
      const mdPath = join(SKILLS_DIR, dir.name, 'SKILL.md');
      if (!existsSync(mdPath)) continue;

      const content = readFileSync(mdPath, 'utf-8');
      contents.set(dir.name, content);

      // description + channels
      const descMatch = content.match(/^description:\s*(.+)$/m);
      entries.push({
        name: dir.name,
        description: descMatch?.[1]?.trim() ?? dir.name,
        channels: parseChannels(content),
      });

      // %% tool:xxx annotations
      const tools: string[] = [];
      for (const m of content.matchAll(/%% tool:(\w+)/g)) {
        const toolName = m[1];
        if (!tools.includes(toolName)) tools.push(toolName);
        const skills = toolToSkills.get(toolName) ?? [];
        if (!skills.includes(dir.name)) skills.push(dir.name);
        toolToSkills.set(toolName, skills);
      }
      skillToolNames.set(dir.name, tools);

      // mermaid
      const mermaidMatch = content.match(/```mermaid\r?\n([\s\S]*?)```/);
      if (mermaidMatch) skillMermaid.set(dir.name, mermaidMatch[1]);
    }
  } catch { /* ignore */ }

  // tool → skill 唯一映射
  const toolSkillMap: Record<string, string> = {};
  for (const [toolName, skills] of toolToSkills) {
    if (skills.length === 1) toolSkillMap[toolName] = skills[0];
  }

  return { entries, contents, toolSkillMap, skillToolNames, skillMermaid, toolToSkills };
}

// 缓存 + 定时刷新（每 30 秒）
let _cache: SkillCache = buildCache();
let _lastScan = Date.now();

function ensureFresh(): SkillCache {
  if (Date.now() - _lastScan > 30_000) {
    _cache = buildCache();
    _lastScan = Date.now();
  }
  return _cache;
}

/** 强制刷新技能缓存（新建/删除技能后调用） */
export function refreshSkillsCache(): void {
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

/** 获取指定 channel 的技能描述（用于 system prompt 注入） */
export function getSkillsDescriptionByChannel(channel: string): string {
  return getSkillsByChannel(channel).map(s => `- ${s.name}：${s.description}`).join('\n');
}

/** 获取指定 channel 的技能完整内容（用于语音/外呼 prompt 注入） */
export function getSkillContentByChannel(channel: string): string {
  const cache = ensureFresh();
  return getSkillsByChannel(channel).map(s => {
    const content = cache.contents.get(s.name);
    if (!content) return '';
    return `\n---\n### 技能：${s.name}\n${content.replace(/^---[\s\S]*?---\s*/, '')}`;
  }).filter(Boolean).join('\n');
}

/** 获取单个技能的 SKILL.md 完整内容 */
export function getSkillContent(skillName: string): string | null {
  return ensureFresh().contents.get(skillName) ?? null;
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
    parameters: z.object({
      skill_name: z.string().describe('Skill 名称'),
    }),
    execute: async ({ skill_name }) => {
      const content = getSkillContent(skill_name);
      if (!content) {
        const desc = buildSkillDescription();
        return `Error: Skill "${skill_name}" not found. Available skills: ${desc}`;
      }
      logger.info('skills', 'get_instructions', { skill: skill_name });
      return content + SOP_ENFORCEMENT_SUFFIX;
    },
  }),

  transfer_to_human: tool({
    description: '转接人工客服。当用户明确要求人工、问题超出自动化处理范围、或满足升级条件时调用。',
    parameters: z.object({
      current_intent: z.string().describe('用户当前诉求（一句话描述）'),
      recommended_action: z.string().describe('给人工坐席的处理建议'),
    }),
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
    parameters: z.object({
      skill_name: z.string().describe('Skill 名称'),
      reference_path: z.string().describe('参考文档文件名，如 "refund-policy.md"'),
    }),
    execute: async ({ skill_name, reference_path }) => {
      if (!getSkillContent(skill_name)) {
        const desc = buildSkillDescription();
        return `Error: Skill "${skill_name}" not found. Available skills: ${desc}`;
      }
      const path = `${SKILLS_DIR}/${skill_name}/references/${reference_path}`;
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
