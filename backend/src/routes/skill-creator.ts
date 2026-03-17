/**
 * skill-creator.ts — 技能创建/编辑对话引擎
 *
 * 仿照 Anthropic skill-creator 的阶段感知型 workflow:
 *   capture → interview → draft → confirm → done
 *
 * POST /api/skill-creator/chat   — 多轮对话
 * POST /api/skill-creator/save   — 将 draft 写入磁盘
 */

import { Hono } from 'hono';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { skillCreatorModel } from '../agent/llm';
import { logger } from '../logger';
import { saveSkillWithVersion } from '../compliance/version-manager';
import { refreshSkillsCache } from '../agent/skills';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

import { BIZ_SKILLS_DIR as SKILLS_DIR } from '../config/paths';

// ── 会话存储 ──────────────────────────────────────────────────────────────────

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
}

const sessions = new Map<string, Session>();

// 定期清理过期会话（1小时）
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.created_at > 3600_000) sessions.delete(id);
  }
}, 300_000);

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

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
  try {
    return readFileSync(mdPath, 'utf-8');
  } catch {
    return null;
  }
}

function listSkillReferences(skillName: string): string[] {
  const refDir = join(SKILLS_DIR, skillName, 'references');
  try {
    return readdirSync(refDir).filter(f => f.endsWith('.md'));
  } catch {
    return [];
  }
}

function readSkillReference(skillName: string, refName: string): string | null {
  const refPath = join(SKILLS_DIR, skillName, 'references', refName);
  try {
    return readFileSync(refPath, 'utf-8');
  } catch {
    return null;
  }
}

// ── SKILL.md 范例模板（嵌入 system prompt）─────────────────────────────────────

const SKILL_EXAMPLE = `---
name: bill-inquiry
description: 电信账单查询技能，处理月账单查询、费用明细解读、欠费催缴、发票申请等问题
metadata:
  version: "1.0.0"
  tags: ["bill", "billing", "invoice", "fee"]
---
# 账单查询 Skill

你是一名电信账单专家。帮助用户查询和解读话费账单，解答计费疑问。

## 何时使用此 Skill
- 用户询问本月/上月话费金额
- 用户对账单某项费用有疑问（为什么多了这笔钱？）

## 处理流程

### 账单查询流程
1. 先用 \`query_subscriber(phone=...)\` 确认用户身份和账号状态
2. 调用 \`query_bill(phone=..., month=...)\` 获取账单明细
3. 参考本 Skill 的计费规则：\`get_skill_reference("bill-inquiry", "billing-rules.md")\`
4. 向用户解释各费用项含义
5. 如有异常费用，主动分析原因并给出建议

## 回复规范
- 每项费用都给出具体金额，避免含糊
- 回复结尾可主动推荐用户订阅账单提醒

## 重要提醒
- 账单数据通过 MCP 工具获取，不得凭空捏造
- 计费规则以参考文档为准`;

// ── System Prompt ──────────────────────────────────────────────────────────────

function buildSystemPrompt(session: Session, skillIndex: Array<{ name: string; description: string }>) {
  const isNewSkill = session.skill_id === null;
  const modeLabel = isNewSkill ? '创建新技能' : `编辑已有技能「${session.skill_id}」`;

  // 编辑模式下，预加载现有 SKILL.md 内容供 LLM 参考
  let existingSkillContext = '';
  if (!isNewSkill && session.skill_id) {
    const content = readSkillContent(session.skill_id);
    if (content) {
      existingSkillContext = `\n\n### 当前技能内容（${session.skill_id}/SKILL.md）

以下是用户正在编辑的技能的完整内容，你已掌握该技能的所有信息，无需再问"你要改什么技能"：

\`\`\`markdown
${content}
\`\`\`

参考文档列表: ${listSkillReferences(session.skill_id).join(', ') || '无'}`;
    }
  }

  return `你是一个专业的技能创建教练（Skill Creator），帮助业务人员通过对话式交互${modeLabel}。

## 重要：模式已确定

${isNewSkill
  ? '用户通过「新建」按钮进入，你的任务是**创建新技能**。不要问用户"你想创建还是修改"，直接开始收集需求。'
  : `用户点击了已有技能「${session.skill_id}」进入，你的任务是**修改这个技能**。你已掌握它的完整内容（见下方），不要问用户"你想改哪个技能"，直接理解用户的修改需求。`}

## 你的工作方式

你按阶段推进对话，当前阶段是: **${session.phase}**

### 阶段说明

1. **interview（需求访谈）**: 直接从这里开始。${isNewSkill
  ? '逐步收集以下关键信息（每次只问 1-2 个问题，不要一次全问）：\n   - **目标与角色**: 这个技能让 AI 扮演什么角色、做什么事\n   - **触发条件**: 什么场景下应该使用此技能（用户会说什么话）\n   - **处理流程**: 具体的步骤流程、需要调用哪些工具（MCP tool）\n   - **边界与规范**: 回复规范、重要提醒、异常处理、转人工条件'
  : '用户会直接告诉你想改什么，理解需求后确认修改范围即可。如果用户描述已足够清晰，可以直接进入 draft 阶段。'}
2. **draft（生成草稿）**: 当信息足够时，生成完整的 SKILL.md ${isNewSkill ? '草稿，同时生成必要的 reference 文档' : '修改后的完整版本'}。
3. **confirm（确认）**: 展示草稿要点，询问用户是否满意，是否需要调整。
4. **done（完成）**: 用户确认后，告知可以点击保存。

### 输出格式

你的每次回复必须是严格的 JSON（不要代码围栏）：
{
  "reply": "你对用户说的话（支持 Markdown 格式）",
  "phase": "当前阶段",
  "draft": null 或 {
    "skill_name": "kebab-case-name",
    "description": "技能描述（用于 frontmatter）",
    "skill_md": "完整的 SKILL.md 文件内容（含 frontmatter）",
    "references": [{"filename": "xxx.md", "content": "文件内容"}]
  }
}

- 在 interview 阶段，draft 为 null
- 在 draft 和 confirm 阶段，draft 包含生成的内容
- 每次都要准确设置 phase，允许跳过阶段（比如用户信息很充分时可以直接到 draft）
- 用户在 confirm 阶段说"可以"/"没问题"/"好的"等肯定词时，phase 设为 done

### SKILL.md 格式规范

必须严格遵循以下结构：

\`\`\`
${SKILL_EXAMPLE}
\`\`\`

核心原则：
- frontmatter 必须包含 name、description、metadata（version + tags）
- 正文结构：角色定位 → 何时使用此 Skill → 处理流程 → 回复规范 → 重要提醒
- 处理流程中引用 MCP 工具用 \`tool_name(params)\` 格式
- 引用参考文档用 \`get_skill_reference("skill-name", "ref-file.md")\` 格式
- description 要具体，列出主要场景关键词，方便路由匹配

### 当前已有技能

${skillIndex.map(s => `- **${s.name}**: ${s.description}`).join('\n')}
${existingSkillContext}

### 写作原则（来自 Anthropic skill-creator 最佳实践）

- 解释"为什么"而不是堆 MUST/NEVER — 让模型理解任务本质
- 保持精瘦，每段指令都要为效果负责
- 不要对少量样例过拟合，从反馈中抽象一般规律
- 如果多个流程有重复步骤，考虑抽成独立子流程
- description 是触发层，正文是执行层，两者各司其职`;
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

  // 获取或创建会话
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

  // 追加用户消息
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
          description: '读取已有技能的 SKILL.md 内容',
          parameters: z.object({
            skill_name: z.string().describe('技能名称（kebab-case）'),
          }),
          execute: async ({ skill_name }) => {
            return readSkillContent(skill_name) ?? `技能 "${skill_name}" 不存在`;
          },
        }),
        read_reference: tool({
          description: '读取技能的参考文档',
          parameters: z.object({
            skill_name: z.string().describe('技能名称'),
            ref_name: z.string().describe('参考文档文件名'),
          }),
          execute: async ({ skill_name, ref_name }) => {
            return readSkillReference(skill_name, ref_name) ?? `参考文档 "${ref_name}" 不存在`;
          },
        }),
        list_skills: tool({
          description: '列出所有已有技能及其参考文档',
          parameters: z.object({}),
          execute: async () => {
            return JSON.stringify(
              skillIndex.map(s => ({
                ...s,
                references: listSkillReferences(s.name),
              })),
            );
          },
        }),
      },
      maxSteps: 5,
      temperature: 0.3,
    });

    // 解析 LLM 输出
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    let parsed: {
      reply: string;
      phase: Phase;
      draft: Draft | null;
    };

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // LLM 可能直接回复纯文本，包装一下
      parsed = { reply: cleaned, phase: session.phase, draft: null };
    }

    // 更新会话状态
    session.phase = parsed.phase ?? session.phase;
    if (parsed.draft) {
      session.draft = parsed.draft;
    }
    session.history.push({ role: 'assistant', content: parsed.reply });

    logger.info('skill-creator', 'chat', {
      session_id: session.id,
      phase: session.phase,
      has_draft: !!session.draft,
    });

    return c.json({
      session_id: session.id,
      reply: parsed.reply,
      phase: session.phase,
      draft: session.draft,
    });
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
  }>();

  if (!body.skill_name || !body.skill_md) {
    return c.json({ error: 'skill_name 和 skill_md 不能为空' }, 400);
  }

  // 校验 skill_name 格式
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(body.skill_name)) {
    return c.json({ error: 'skill_name 必须是 kebab-case 格式（如 my-skill）' }, 400);
  }

  const skillDir = join(SKILLS_DIR, body.skill_name);
  const isNew = !existsSync(skillDir);

  try {
    // 创建目录结构
    if (isNew) {
      mkdirSync(skillDir, { recursive: true });
      mkdirSync(join(skillDir, 'references'), { recursive: true });
      mkdirSync(join(skillDir, 'scripts'), { recursive: true });
    }

    // 写入 SKILL.md
    const skillMdPath = `skills/biz-skills/${body.skill_name}/SKILL.md`;
    const fullSkillMdPath = join(skillDir, 'SKILL.md');

    if (existsSync(fullSkillMdPath)) {
      // 已有文件，走版本管理
      await saveSkillWithVersion(
        skillMdPath,
        body.skill_md,
        isNew ? '通过技能创建器新建' : '通过技能创建器编辑',
        'skill-creator',
      );
    } else {
      // 新文件，直接写入
      writeFileSync(fullSkillMdPath, body.skill_md, 'utf-8');
    }

    // 写入参考文档
    if (body.references?.length) {
      const refDir = join(skillDir, 'references');
      if (!existsSync(refDir)) {
        mkdirSync(refDir, { recursive: true });
      }
      for (const ref of body.references) {
        const refPath = join(refDir, ref.filename);
        writeFileSync(refPath, ref.content, 'utf-8');
      }
    }

    // 清理会话
    if (body.session_id && sessions.has(body.session_id)) {
      const session = sessions.get(body.session_id)!;
      session.phase = 'done';
    }

    // 刷新技能缓存，让 agent 立即识别新技能
    refreshSkillsCache();

    logger.info('skill-creator', 'saved', {
      skill_name: body.skill_name,
      is_new: isNew,
      ref_count: body.references?.length ?? 0,
    });

    return c.json({
      ok: true,
      skill_id: body.skill_name,
      is_new: isNew,
    });
  } catch (err) {
    logger.error('skill-creator', 'save_error', { error: String(err) });
    return c.json({ error: `保存失败: ${String(err)}` }, 500);
  }
});

export default skillCreator;
