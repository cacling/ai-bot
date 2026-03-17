import { tool } from 'ai';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { z } from 'zod';
import { logger } from '../logger';

import { BIZ_SKILLS_DIR as SKILLS_DIR } from '../services/paths';

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
  // 匹配 channels: ["online", "voice"] 或 channels: [online, voice]
  const match = content.match(/^\s*channels:\s*\[([^\]]*)\]/m);
  if (!match) return DEFAULT_CHANNELS;
  const raw = match[1];
  const items = raw.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  return items.length ? items : DEFAULT_CHANNELS;
}

function scanAvailableSkills(): SkillEntry[] {
  const entries: SkillEntry[] = [];
  try {
    const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('_'));
    for (const dir of dirs) {
      const mdPath = join(SKILLS_DIR, dir.name, 'SKILL.md');
      if (existsSync(mdPath)) {
        const content = readFileSync(mdPath, 'utf-8');
        const descMatch = content.match(/^description:\s*(.+)$/m);
        entries.push({
          name: dir.name,
          description: descMatch?.[1]?.trim() ?? dir.name,
          channels: parseChannels(content),
        });
      }
    }
  } catch { /* ignore */ }
  return entries;
}

// 缓存 + 定时刷新（每 30 秒）
let _cachedSkills: SkillEntry[] = scanAvailableSkills();
let _lastScan = Date.now();

function getAvailableSkills(): SkillEntry[] {
  if (Date.now() - _lastScan > 30_000) {
    _cachedSkills = scanAvailableSkills();
    _lastScan = Date.now();
  }
  return _cachedSkills;
}

/** 强制刷新技能缓存（新建/删除技能后调用） */
export function refreshSkillsCache(): void {
  _cachedSkills = scanAvailableSkills();
  _lastScan = Date.now();
}

// ── 按 channel 过滤 ─────────────────────────────────────────────────────────

/** 获取指定 channel 的技能列表 */
export function getSkillsByChannel(channel: string): SkillEntry[] {
  return getAvailableSkills().filter(s => s.channels.includes(channel));
}

/** 获取指定 channel 的技能描述（用于 system prompt 注入） */
export function getSkillsDescriptionByChannel(channel: string): string {
  return getSkillsByChannel(channel).map(s => `${s.description}→${s.name}`).join('；');
}

/** 获取指定 channel 的技能 SKILL.md 完整内容（用于语音/外呼 prompt 注入） */
export function getSkillContentByChannel(channel: string): string {
  const skills = getSkillsByChannel(channel);
  return skills.map(s => {
    const mdPath = join(SKILLS_DIR, s.name, 'SKILL.md');
    try {
      const content = readFileSync(mdPath, 'utf-8');
      // 去掉 YAML frontmatter，只保留正文
      return `\n---\n### 技能：${s.name}\n${content.replace(/^---[\s\S]*?---\s*/, '')}`;
    } catch { return ''; }
  }).filter(Boolean).join('\n');
}

// ── 兼容旧接口 ──────────────────────────────────────────────────────────────

/** @deprecated 使用 getSkillsDescriptionByChannel('online') 替代 */
export function getAvailableSkillsDescription(): string {
  return getSkillsDescriptionByChannel('online');
}

function getSkillNames(): string[] {
  return getAvailableSkills().map(s => s.name);
}

function buildSkillDescription(): string {
  const skills = getAvailableSkills();
  return skills.map(s => `${s.name}（${s.description}）`).join(', ');
}

// ── Skill Tools（供在线客服 agent 使用）──────────────────────────────────────

export const skillsTools = {
  get_skill_instructions: tool({
    description:
      '加载指定 Skill 的操作指南（SKILL.md）。当客户问题属于特定领域时，先调用此工具了解处理流程。',
    parameters: z.object({
      skill_name: z
        .string()
        .describe('Skill 名称'),
    }),
    execute: async ({ skill_name }) => {
      const available = getSkillNames();
      if (!available.includes(skill_name)) {
        const desc = buildSkillDescription();
        return `Error: Skill "${skill_name}" not found. Available skills: ${desc}`;
      }
      const t0 = performance.now();
      const path = `${SKILLS_DIR}/${skill_name}/SKILL.md`;
      try {
        const content = readFileSync(path, 'utf-8');
        logger.info('skills', 'get_instructions', { skill: skill_name, ms: Math.round(performance.now() - t0) });
        return content;
      } catch {
        logger.warn('skills', 'get_instructions_error', { skill: skill_name, path });
        return `Error: Skill "${skill_name}" not found at ${path}`;
      }
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
      skill_name: z
        .string()
        .describe('Skill 名称'),
      reference_path: z
        .string()
        .describe('参考文档文件名，如 "refund-policy.md" 或 "feature-comparison.md"'),
    }),
    execute: async ({ skill_name, reference_path }) => {
      const available = getSkillNames();
      if (!available.includes(skill_name)) {
        const desc = buildSkillDescription();
        return `Error: Skill "${skill_name}" not found. Available skills: ${desc}`;
      }
      const t0 = performance.now();
      const path = `${SKILLS_DIR}/${skill_name}/references/${reference_path}`;
      try {
        const content = readFileSync(path, 'utf-8');
        logger.info('skills', 'get_reference', { skill: skill_name, ref: reference_path, ms: Math.round(performance.now() - t0) });
        return content;
      } catch {
        logger.warn('skills', 'get_reference_error', { skill: skill_name, ref: reference_path, path });
        return `Error: Reference "${reference_path}" not found in skill "${skill_name}"`;
      }
    },
  }),
};
