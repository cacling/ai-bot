/**
 * skill-creator.ts — 技能创建/编辑对话引擎
 *
 * 参照 Anthropic skill-creator 的设计理念：
 * 所有业务逻辑（流程、判断、规范、写作原则）全部在
 * tech-skills/skill-creator-spec/SKILL.md 中定义，
 * 本文件只负责：
 *   1. 读取 SKILL.md（完整的 system prompt）
 *   2. 注入 3 个动态变量（运行时上下文、编写规范、已有技能列表）
 *   3. 调用 LLM、解析输出、管理会话
 *   4. 保存 draft 到磁盘
 *
 * POST /api/skill-creator/chat   — 多轮对话
 * POST /api/skill-creator/save   — 将 draft 写入磁盘
 */

import { Hono } from 'hono';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { skillCreatorModel } from '../../../engine/llm';
import { logger } from '../../../logger';
import { saveSkillWithVersion } from './version-manager';
import { refreshSkillsCache } from '../../../engine/skills';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { BIZ_SKILLS_DIR as SKILLS_DIR, TECH_SKILLS_DIR } from '../../../services/paths';
import { db } from '../../../db';
import { testCases } from '../../../db/schema';

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface Session {
  id: string;
  skill_id: string | null; // null = 新建
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  phase: Phase;
  draft: Draft | null;
  created_at: number;
}

type Phase = 'interview' | 'draft' | 'confirm' | 'done';

interface Draft {
  skill_name: string;
  skill_md: string;
  references: Array<{ filename: string; content: string }>;
  description: string;
  test_cases?: Array<{
    input: string;
    assertions: Array<{ type: string; value: string }>;
    phone?: string;
  }>;
}

// ── 会话存储 ──────────────────────────────────────────────────────────────────

const sessions = new Map<string, Session>();

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.created_at > 3600_000) sessions.delete(id);
  }
}, 300_000);

// ── Biz-Skills 辅助函数 ─────────────────────────────────────────────────────

function loadSkillIndex(): Array<{ name: string; description: string }> {
  const result: Array<{ name: string; description: string }> = [];
  try {
    const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const dir of dirs) {
      const mdPath = join(SKILLS_DIR, dir.name, 'SKILL.md');
      if (existsSync(mdPath)) {
        const content = readFileSync(mdPath, 'utf-8');
        const descMatch = content.match(/^description:\s*(.+)$/m);
        result.push({
          name: dir.name,
          description: descMatch?.[1]?.trim() ?? '',
        });
      }
    }
  } catch { /* ignore */ }
  return result;
}

function readSkillContent(skillName: string): string | null {
  const mdPath = join(SKILLS_DIR, skillName, 'SKILL.md');
  try { return readFileSync(mdPath, 'utf-8'); } catch { return null; }
}

function listSkillReferences(skillName: string): string[] {
  const refDir = join(SKILLS_DIR, skillName, 'references');
  try { return readdirSync(refDir).filter(f => f.endsWith('.md')); } catch { return []; }
}

function readSkillReference(skillName: string, refName: string): string | null {
  const refPath = join(SKILLS_DIR, skillName, 'references', refName);
  try { return readFileSync(refPath, 'utf-8'); } catch { return null; }
}

// ── Tech-Skills 加载（带缓存）────────────────────────────────────────────────

interface CacheEntry { content: string; ts: number }
const _cache = new Map<string, CacheEntry>();
const CACHE_TTL = 300_000;

function readCached(path: string): string {
  const now = Date.now();
  const cached = _cache.get(path);
  if (cached && now - cached.ts < CACHE_TTL) return cached.content;
  try {
    const content = readFileSync(path, 'utf-8');
    _cache.set(path, { content, ts: now });
    return content;
  } catch { return ''; }
}

const SPEC_SKILL_DIR = join(TECH_SKILLS_DIR, 'skill-creator-spec');

/** 读取 SKILL.md 并去掉 YAML frontmatter，返回纯 prompt 正文 */
function loadSkillPrompt(): string {
  const raw = readCached(join(SPEC_SKILL_DIR, 'SKILL.md'));
  return raw.replace(/^---[\s\S]*?---\s*/, '');
}

function loadBizSkillSpec(): string {
  return readCached(join(SPEC_SKILL_DIR, 'references', 'biz-skill-spec.md'));
}

// ── System Prompt 组装（仅注入 3 个动态变量）──────────────────────────────────

function buildSystemPrompt(session: Session, skillIndex: Array<{ name: string; description: string }>): string {
  const prompt = loadSkillPrompt();

  // 1. 运行时上下文（JSON）
  const context = JSON.stringify({
    mode: session.skill_id ? 'edit' : 'create',
    phase: session.phase,
    skill_id: session.skill_id,
    existing_skill: session.skill_id ? readSkillContent(session.skill_id) : null,
    existing_refs: session.skill_id ? listSkillReferences(session.skill_id) : [],
  }, null, 2);

  // 2. 编写规范
  const spec = loadBizSkillSpec() || '（规范文件未找到，请按通用 Markdown 技能格式生成）';

  // 3. 已有技能列表
  const skillIndexText = skillIndex.length
    ? skillIndex.map(s => `- **${s.name}**: ${s.description}`).join('\n')
    : '（暂无已有技能）';

  // 替换 3 个占位符
  return prompt
    .replace('{{CONTEXT}}', context)
    .replace('{{SPEC}}', spec)
    .replace('{{SKILL_INDEX}}', skillIndexText);
}

// ── POST /api/skill-creator/chat ──────────────────────────────────────────────

const skillCreator = new Hono();

skillCreator.post('/chat', async (c) => {
  const body = await c.req.json<{
    message: string;
    session_id?: string;
    skill_id?: string | null;
  }>();

  if (!body.message?.trim()) {
    return c.json({ error: 'message 不能为空' }, 400);
  }

  let session: Session;
  if (body.session_id && sessions.has(body.session_id)) {
    session = sessions.get(body.session_id)!;
  } else {
    const id = `sc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    session = {
      id,
      skill_id: body.skill_id ?? null,
      history: [],
      phase: 'interview',
      draft: null,
      created_at: Date.now(),
    };
    sessions.set(id, session);
  }

  session.history.push({ role: 'user', content: body.message });

  const skillIndex = loadSkillIndex();
  const systemPrompt = buildSystemPrompt(session, skillIndex);

  try {
    const { text } = await generateText({
      model: skillCreatorModel,
      system: systemPrompt,
      messages: session.history,
      tools: {
        read_skill: tool({
          description: '读取已有业务技能的 SKILL.md 内容',
          parameters: z.object({ skill_name: z.string().describe('技能名称（kebab-case）') }),
          execute: async ({ skill_name }) => readSkillContent(skill_name) ?? `技能 "${skill_name}" 不存在`,
        }),
        read_reference: tool({
          description: '读取业务技能的参考文档',
          parameters: z.object({
            skill_name: z.string().describe('技能名称'),
            ref_name: z.string().describe('参考文档文件名'),
          }),
          execute: async ({ skill_name, ref_name }) => readSkillReference(skill_name, ref_name) ?? `参考文档 "${ref_name}" 不存在`,
        }),
        list_skills: tool({
          description: '列出所有已有业务技能及其参考文档',
          parameters: z.object({}),
          execute: async () => JSON.stringify(skillIndex.map(s => ({ ...s, references: listSkillReferences(s.name) }))),
        }),
      },
      maxSteps: 5,
      temperature: 0.3,
    });

    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    let parsed: { reply: string; phase: Phase; draft: Draft | null };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { reply: cleaned, phase: session.phase, draft: null };
    }

    session.phase = parsed.phase ?? session.phase;
    if (parsed.draft) session.draft = parsed.draft;
    session.history.push({ role: 'assistant', content: parsed.reply });

    logger.info('skill-creator', 'chat', { session_id: session.id, phase: session.phase, has_draft: !!session.draft });

    return c.json({ session_id: session.id, reply: parsed.reply, phase: session.phase, draft: session.draft });
  } catch (err) {
    logger.error('skill-creator', 'chat_error', { error: String(err) });
    return c.json({ error: `对话失败: ${String(err)}` }, 500);
  }
});

// ── POST /api/skill-creator/save ──────────────────────────────────────────────

skillCreator.post('/save', async (c) => {
  const body = await c.req.json<{
    session_id?: string;
    skill_name: string;
    skill_md: string;
    references?: Array<{ filename: string; content: string }>;
    test_cases?: Array<{
      input: string;
      assertions: Array<{ type: string; value: string }>;
      phone?: string;
    }>;
  }>();

  if (!body.skill_name || !body.skill_md) {
    return c.json({ error: 'skill_name 和 skill_md 不能为空' }, 400);
  }

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(body.skill_name)) {
    return c.json({ error: 'skill_name 必须是 kebab-case 格式（如 my-skill）' }, 400);
  }

  const skillDir = join(SKILLS_DIR, body.skill_name);
  const isNew = !existsSync(skillDir);

  try {
    if (isNew) {
      mkdirSync(skillDir, { recursive: true });
      mkdirSync(join(skillDir, 'references'), { recursive: true });
      mkdirSync(join(skillDir, 'scripts'), { recursive: true });
    }

    const skillMdPath = `skills/biz-skills/${body.skill_name}/SKILL.md`;
    const fullSkillMdPath = join(skillDir, 'SKILL.md');

    if (existsSync(fullSkillMdPath)) {
      await saveSkillWithVersion(skillMdPath, body.skill_md, isNew ? '通过技能创建器新建' : '通过技能创建器编辑', 'skill-creator');
    } else {
      writeFileSync(fullSkillMdPath, body.skill_md, 'utf-8');
    }

    if (body.references?.length) {
      const refDir = join(skillDir, 'references');
      if (!existsSync(refDir)) mkdirSync(refDir, { recursive: true });
      for (const ref of body.references) {
        writeFileSync(join(refDir, ref.filename), ref.content, 'utf-8');
      }
    }

    if (body.session_id && sessions.has(body.session_id)) {
      sessions.get(body.session_id)!.phase = 'done';
    }

    // 写入测试用例（如果 LLM 生成了）
    if (body.test_cases?.length) {
      for (const tc of body.test_cases) {
        const keywords = tc.assertions.filter(a => a.type === 'contains').map(a => a.value);
        await db.insert(testCases).values({
          skill_name: body.skill_name,
          input_message: tc.input,
          expected_keywords: JSON.stringify(keywords.length ? keywords : ['_placeholder_']),
          assertions: JSON.stringify(tc.assertions),
          phone: tc.phone ?? '13800000001',
        });
      }
      logger.info('skill-creator', 'test_cases_saved', { skill: body.skill_name, count: body.test_cases.length });
    }

    refreshSkillsCache();

    logger.info('skill-creator', 'saved', { skill_name: body.skill_name, is_new: isNew, ref_count: body.references?.length ?? 0, test_cases: body.test_cases?.length ?? 0 });

    return c.json({ ok: true, skill_id: body.skill_name, is_new: isNew, test_cases_count: body.test_cases?.length ?? 0 });
  } catch (err) {
    logger.error('skill-creator', 'save_error', { error: String(err) });
    return c.json({ error: `保存失败: ${String(err)}` }, 500);
  }
});

export default skillCreator;
