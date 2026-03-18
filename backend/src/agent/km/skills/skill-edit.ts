/**
 * skill-edit.ts — 自然语言配置编辑 + 智能需求澄清
 *
 * POST /api/skill-clarify  — 多轮需求澄清（判断完整性 → 返回澄清问题或 ready）
 * POST /api/skill-edit     — LLM 解析需求 → 定位文件 → 生成 Diff 预览
 * POST /api/skill-edit/apply — 确认写入
 */

import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { generateText } from 'ai';
import { chatModel } from '../../../engine/llm';
// Edits now write directly to .versions/ files via PUT /api/files/content
import { logger } from '../../../services/logger';
import { requireRole } from '../../../services/auth';

import { BIZ_SKILLS_DIR as SKILLS_DIR } from '../../../services/paths';

// ── 构建技能索引 ──────────────────────────────────────────────────────────────

function loadSkillIndex(): Array<{ name: string; path: string; summary: string }> {
  const skills: Array<{ name: string; path: string; summary: string }> = [];
  try {
    const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const dir of dirs) {
      const skillMd = join(SKILLS_DIR, dir.name, 'SKILL.md');
      if (existsSync(skillMd)) {
        // 读取前 200 字符作为摘要
        const content = require('fs').readFileSync(skillMd, 'utf-8') as string;
        const summary = content.slice(0, 200).replace(/\n/g, ' ');
        skills.push({
          name: dir.name,
          path: `skills/biz-skills/${dir.name}/SKILL.md`,
          summary,
        });
      }
    }
  } catch { /* ignore */ }
  return skills;
}

const skillEdit = new Hono();

// ── POST /api/skill-clarify ──────────────────────────────────────────────────

const CLARIFY_SYSTEM = `你是智能需求澄清器。用户是业务人员，要修改客服机器人的业务技能配置。
你需要分析用户需求，检查是否缺少以下关键信息：
- 修改的目标模块/技能名称
- 具体要改的内容（话术、参数、流程步骤、转人工条件等）
- 变更类型（话术口径修改、流程节点变更、参数调整、新增步骤）
- 异常情况处理（如果涉及流程变更）
- 是否需要同步修改关联的文档

输出严格 JSON 格式（不要代码围栏）：
{
  "is_complete": boolean,
  "missing_items": ["缺少的信息描述"],
  "clarify_question": "向用户提出的澄清问题（如完整则为空字符串）",
  "parsed_intent": {
    "target_skill": "目标技能名",
    "change_type": "wording|param|flow|branch|new_step",
    "details": "解析出的具体修改内容",
    "risk_level": "low|medium|high"
  }
}`;

skillEdit.post('/clarify', async (c) => {
  const body = await c.req.json<{
    instruction: string;
    history?: Array<{ role: string; content: string }>;
  }>();

  if (!body.instruction) {
    return c.json({ error: 'instruction 不能为空' }, 400);
  }

  const skillIndex = loadSkillIndex();
  const messages = [
    ...(body.history ?? []).map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user' as const, content: body.instruction },
  ];

  try {
    const { text } = await generateText({
      model: chatModel,
      system: CLARIFY_SYSTEM + `\n\n可用技能列表:\n${JSON.stringify(skillIndex, null, 2)}`,
      messages,
      temperature: 0,
    });

    // 解析 JSON
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.is_complete) {
      return c.json({ status: 'ready', parsed_intent: parsed.parsed_intent });
    } else {
      return c.json({
        status: 'need_clarify',
        question: parsed.clarify_question,
        missing: parsed.missing_items,
      });
    }
  } catch (err) {
    logger.error('skill-edit', 'clarify_error', { error: String(err) });
    return c.json({ error: `澄清失败: ${String(err)}` }, 500);
  }
});

// ── POST /api/skill-edit ─────────────────────────────────────────────────────

const EDIT_SYSTEM = `你是技能配置编辑助手。用户用自然语言描述了一个修改需求。
你需要：
1. 阅读目标技能文件的当前内容
2. 找到需要修改的片段
3. 生成精确的替换方案

输出严格 JSON 格式（不要代码围栏）：
{
  "skill_path": "文件相对路径",
  "old_fragment": "文件中需要被替换的原文片段（必须精确匹配）",
  "new_fragment": "替换后的新内容",
  "explanation": "简要说明这次修改做了什么"
}

注意：old_fragment 必须是文件中真实存在的连续文本片段。`;

skillEdit.post('/', async (c) => {
  const body = await c.req.json<{
    instruction: string;
    target_skill?: string;
  }>();

  if (!body.instruction) {
    return c.json({ error: 'instruction 不能为空' }, 400);
  }

  const skillIndex = loadSkillIndex();

  try {
    const { text } = await generateText({
      model: chatModel,
      system: EDIT_SYSTEM + `\n\n可用技能列表:\n${JSON.stringify(skillIndex, null, 2)}`,
      messages: [{ role: 'user', content: body.instruction }],
      tools: {
        read_skill: {
          description: '读取指定技能文件的内容',
          parameters: {
            type: 'object' as const,
            properties: {
              skill_name: { type: 'string' as const, description: '技能名称' },
              file_name: { type: 'string' as const, description: '文件名，默认 SKILL.md' },
            },
            required: ['skill_name'],
          },
          execute: async (args: { skill_name: string; file_name?: string }) => {
            const path = join(SKILLS_DIR, args.skill_name, args.file_name ?? 'SKILL.md');
            try {
              return await readFile(path, 'utf-8');
            } catch {
              return `Error: 文件不存在 ${path}`;
            }
          },
        },
      },
      maxSteps: 3,
      temperature: 0,
    });

    // 解析结果
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const result = JSON.parse(cleaned);

    // 验证 old_fragment 存在于文件中
    if (result.skill_path && result.old_fragment) {
      const fullPath = resolve(
        import.meta.dir, '../../../..', result.skill_path,
      );
      try {
        const content = await readFile(fullPath, 'utf-8');
        if (!content.includes(result.old_fragment)) {
          return c.json({
            error: 'LLM 生成的 old_fragment 在文件中找不到，请重试',
            result,
          }, 422);
        }
      } catch {
        return c.json({ error: `文件不存在: ${result.skill_path}` }, 404);
      }
    }

    return c.json({
      skill_path: result.skill_path,
      diff: { old: result.old_fragment, new: result.new_fragment },
      explanation: result.explanation,
    });
  } catch (err) {
    logger.error('skill-edit', 'edit_error', { error: String(err) });
    return c.json({ error: `编辑失败: ${String(err)}` }, 500);
  }
});

// ── POST /api/skill-edit/apply ───────────────────────────────────────────────

skillEdit.post('/apply', requireRole('config_editor'), async (c) => {
  const body = await c.req.json<{
    skill_path: string;
    old_fragment: string;
    new_fragment: string;
    description?: string;
  }>();

  if (!body.skill_path || !body.old_fragment || body.new_fragment === undefined) {
    return c.json({ error: '参数不完整' }, 400);
  }

  const fullPath = resolve(import.meta.dir, '../../../..', body.skill_path);
  let content: string;
  try {
    content = await readFile(fullPath, 'utf-8');
  } catch {
    return c.json({ error: `文件不存在: ${body.skill_path}` }, 404);
  }

  if (!content.includes(body.old_fragment)) {
    return c.json({ error: '文件内容已变更，old_fragment 不匹配，请重新生成' }, 409);
  }

  const newContent = content.replace(body.old_fragment, body.new_fragment);

  // Write directly to the file (which is in .versions/)
  const { writeFile } = await import('node:fs/promises');
  await writeFile(fullPath, newContent, 'utf-8');

  logger.info('skill-edit', 'applied', { path: body.skill_path });
  return c.json({ ok: true });
});

export default skillEdit;
