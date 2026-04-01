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
import { generateText, streamText, tool } from 'ai';
import { z } from 'zod';
import { getSkillCreatorModels, type SkillCreatorProvider } from '../llm';
import { logger } from '../logger';
import { analyzeImage, trimWhitespace, generateOverview, generateTiles, resizeImage, toDataUrl, fromDataUrl, type ImageStrategy } from './image-processor';
import { createNewSkillVersion, createVersionFrom, getSkillRegistry } from './version-manager';
import { refreshSkillsCache, syncSkillMetadata } from '../engine-stubs';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { BIZ_SKILLS_DIR as SKILLS_DIR, TECH_SKILLS_DIR, SKILLS_ROOT } from '../paths';
import { db } from '../db';
import { testCases } from '../db';
import { getToolsOverview, getToolDetail } from '../mcp/tools-overview';
import { runValidation } from '../../skills/tech-skills/skill-creator-spec/scripts/run_validation';
import type { ValidationCheck, ValidationResult } from '../../skills/tech-skills/skill-creator-spec/scripts/types';

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface Session {
  id: string;
  skill_id: string | null; // null = 新建
  version_no: number | null; // 编辑模式下操作的版本号
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
  assets: Array<{ filename: string; content: string }>;
  description: string;
  test_cases?: Array<{
    input: string;
    assertions: Array<{ type: string; value: string }>;
    persona_id?: string;
  }>;
}

const PHASE_VALUES = ['interview', 'draft', 'confirm', 'done'] as const;
const ASSERTION_TYPE_VALUES = ['contains', 'not_contains', 'tool_called', 'tool_not_called', 'tool_called_before', 'tool_called_any_of', 'skill_loaded', 'regex', 'response_mentions_all', 'response_mentions_any', 'response_has_next_step'] as const;
const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const REFERENCE_FILE_RE = /^[a-z0-9]+(-[a-z0-9]+)*\.md$/;

const phaseSchema = z.enum(PHASE_VALUES);
const assertionSchema = z.object({
  type: z.enum(ASSERTION_TYPE_VALUES),
  value: z.string().min(1),
});
const testCaseSchema = z.object({
  input: z.string().min(1),
  assertions: z.array(assertionSchema).min(1),
  persona_id: z.string().optional().nullable(),
});
const referenceSchema = z.object({
  filename: z.string().regex(REFERENCE_FILE_RE),
  content: z.string().min(1),
});
const assetSchema = z.object({
  filename: z.string().regex(REFERENCE_FILE_RE),
  content: z.string().min(1),
});
const llmDraftSchema = z.object({
  skill_name: z.string().regex(SKILL_NAME_RE),
  skill_md: z.string().min(1),
  references: z.array(referenceSchema).default([]),
  assets: z.array(assetSchema).default([]),
  description: z.string().min(1),
  test_cases: z.array(testCaseSchema).optional().transform(arr => arr?.slice(0, 5)),
});
const llmResponseSchema = z.object({
  reply: z.string().min(1),
  phase: phaseSchema,
  draft: llmDraftSchema.nullable().optional().default(null),
});

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

/** 读取指定版本的 SKILL.md（从 .versions/ 快照目录） */
function readVersionedSkillContent(skillName: string, versionNo: number): string | null {
  const mdPath = join(SKILLS_ROOT, '.versions', skillName, `v${versionNo}`, 'SKILL.md');
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
const AUTO_REVIEW_MAX_ATTEMPTS = 2;
const AUTO_REVIEW_HISTORY_WINDOW = 8;
const AUTO_REVIEW_MESSAGE_LIMIT = 1200;
const AUTO_REVIEW_ISSUE_LIMIT = 12;

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

/**
 * 检测并截断 LLM 输出中的重复循环。
 * 当连续行与前面的行高度重复时，截断并附加提示。
 */
function truncateRepetition(text: string, maxRepeat = 5): string {
  const lines = text.split('\n');
  const seen = new Map<string, number>(); // normalized line → count
  let cutIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    // 只检测表格行（以 | 开头）
    const line = lines[i].trim();
    if (!line.startsWith('|') || line.startsWith('|---') || line.startsWith('| 升级路径') || line.startsWith('| 触发条件')) continue;

    // 标准化：去掉具体文字差异，只保留结构
    const normalized = line.replace(/[^|]/g, '').length > 2 ? line.slice(0, 30) : line;
    const count = (seen.get(normalized) ?? 0) + 1;
    seen.set(normalized, count);

    if (count > maxRepeat) {
      cutIndex = i;
      break;
    }
  }

  if (cutIndex > 0) {
    logger.warn('skill-creator', 'repetition_truncated', { at_line: cutIndex, total_lines: lines.length });
    return lines.slice(0, cutIndex).join('\n') + '\n| frontline | 其他非标需求 | 转人工客服评估 |\n';
  }
  return text;
}

/** 读取 SKILL.md 并去掉 YAML frontmatter，返回纯 prompt 正文 */
function loadSkillPrompt(): string {
  const raw = readCached(join(SPEC_SKILL_DIR, 'SKILL.md'));
  return raw.replace(/^---[\s\S]*?---\s*/, '');
}

/** 按阶段加载编写规范（减少 token 消耗，提升注意力集中度） */
function loadBizSkillSpec(phase: Phase): string {
  const refsDir = join(SPEC_SKILL_DIR, 'references');
  switch (phase) {
    case 'interview':
      // 访谈阶段只需概览（目录结构、章节顺序、frontmatter）
      return readCached(join(refsDir, 'spec-overview.md'));
    case 'draft':
      // 生成阶段需要完整编写规范 + 示例
      return [
        readCached(join(refsDir, 'spec-overview.md')),
        readCached(join(refsDir, 'spec-writing.md')),
        readCached(join(refsDir, 'spec-example.md')),
      ].filter(Boolean).join('\n\n---\n\n');
    case 'confirm':
      // 确认阶段只需检查清单
      return readCached(join(refsDir, 'spec-checklist.md'));
    case 'done':
      return '';
  }
}

// ── System Prompt 组装（仅注入 3 个动态变量）──────────────────────────────────

function buildSystemPrompt(session: Session, skillIndex: Array<{ name: string; description: string }>): string {
  const prompt = loadSkillPrompt();

  // 1. 运行时上下文（JSON）
  // 编辑模式下，优先从指定版本快照读取 SKILL.md；无版本号时回退到主目录
  const existingSkill = session.skill_id
    ? (session.version_no
        ? readVersionedSkillContent(session.skill_id, session.version_no)
        : readSkillContent(session.skill_id))
    : null;

  const context = JSON.stringify({
    mode: session.skill_id ? 'edit' : 'create',
    phase: session.phase,
    skill_id: session.skill_id,
    version_no: session.version_no,
    existing_skill: existingSkill,
    existing_refs: session.skill_id ? listSkillReferences(session.skill_id) : [],
  }, null, 2);

  // 2. 编写规范（按阶段按需加载）
  const spec = loadBizSkillSpec(session.phase) || '（规范文件未找到，请按通用 Markdown 技能格式生成）';

  // 3. 已有技能列表
  const skillIndexText = skillIndex.length
    ? skillIndex.map(s => `- **${s.name}**: ${s.description}`).join('\n')
    : '（暂无已有技能）';

  // 4. 能力落地检查详细步骤（interview 阶段注入，其他阶段省略）
  const refsDir = join(SPEC_SKILL_DIR, 'references');
  const capabilityCheck = session.phase === 'interview'
    ? readCached(join(refsDir, 'interview-capability-check.md'))
    : '';

  // 5. Few-shot 示例（interview + draft 阶段注入）
  const fewShot = (session.phase === 'interview' || session.phase === 'draft')
    ? readCached(join(refsDir, 'few-shot-examples.md'))
    : '';

  // 替换 5 个占位符
  return prompt
    .replace('{{CONTEXT}}', context)
    .replace('{{SPEC}}', spec)
    .replace('{{SKILL_INDEX}}', skillIndexText)
    .replace('{{CAPABILITY_CHECK}}', capabilityCheck)
    .replace('{{FEW_SHOT}}', fewShot);
}

function stripJsonFences(text: string): string {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function extractJsonCandidates(text: string): string[] {
  const cleaned = stripJsonFences(text);
  const candidates = [cleaned];
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const objectSlice = cleaned.slice(firstBrace, lastBrace + 1).trim();
    if (objectSlice && !candidates.includes(objectSlice)) candidates.push(objectSlice);
  }
  return candidates;
}

function dedupeReferences(references: Array<{ filename: string; content: string }>): Array<{ filename: string; content: string }> {
  const seen = new Set<string>();
  const deduped: Array<{ filename: string; content: string }> = [];
  for (const ref of references) {
    if (seen.has(ref.filename)) continue;
    seen.add(ref.filename);
    deduped.push(ref);
  }
  return deduped;
}

function normalizeDraft(draft: z.infer<typeof llmDraftSchema>): Draft {
  return {
    skill_name: draft.skill_name,
    description: draft.description,
    skill_md: draft.skill_md,
    references: dedupeReferences(draft.references.map(ref => ({
      filename: ref.filename,
      content: ref.content,
    }))),
    assets: dedupeReferences(draft.assets.map(a => ({
      filename: a.filename,
      content: a.content,
    }))),
    test_cases: draft.test_cases?.map(tc => ({
      input: tc.input,
      assertions: tc.assertions.map(a => ({ type: a.type, value: a.value })),
      persona_id: tc.persona_id ?? undefined,
    })),
  };
}

function parseSkillCreatorResponse(rawText: string, session: Session): { reply: string; phase: Phase; draft: Draft | null } {
  let parsedValue: unknown = null;
  let lastError = '';

  for (const candidate of extractJsonCandidates(rawText)) {
    try {
      parsedValue = JSON.parse(candidate);
      break;
    } catch (err) {
      lastError = String(err);
    }
  }

  if (parsedValue === null) {
    logger.warn('skill-creator', 'response_parse_fallback', {
      session_id: session.id,
      error: lastError,
      text_preview: rawText.slice(0, 200),
    });
    return { reply: stripJsonFences(rawText), phase: session.phase, draft: null };
  }

  const validated = llmResponseSchema.safeParse(parsedValue);
  if (!validated.success) {
    logger.warn('skill-creator', 'response_schema_invalid', {
      session_id: session.id,
      issues: validated.error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
      text_preview: rawText.slice(0, 200),
    });

    // 宽容恢复：即使 schema 校验失败，也尝试从原始 JSON 中提取 reply/phase/draft
    const raw = parsedValue as Record<string, unknown>;
    const reply = typeof raw.reply === 'string' ? raw.reply : stripJsonFences(rawText);
    const phase = PHASE_VALUES.includes(raw.phase as Phase) ? (raw.phase as Phase) : session.phase;

    // 尝试单独解析 draft（schema 失败可能只是 test_cases 超限等小问题）
    let draft: Draft | null = null;
    if (raw.draft && typeof raw.draft === 'object') {
      const draftValidated = llmDraftSchema.safeParse(raw.draft);
      if (draftValidated.success) {
        draft = normalizeDraft(draftValidated.data);
        logger.info('skill-creator', 'response_draft_recovered', { session_id: session.id, phase });
      }
    }

    return { reply, phase, draft };
  }

  let phase = validated.data.phase;
  let draft = validated.data.draft ? normalizeDraft(validated.data.draft) : null;

  if (phase === 'interview') {
    draft = null;
  }

  if ((phase === 'draft' || phase === 'confirm') && !draft) {
    logger.warn('skill-creator', 'response_missing_draft', {
      session_id: session.id,
      phase,
    });
    phase = session.phase;
  }



  return {
    reply: validated.data.reply,
    phase,
    draft,
  };
}

type ParsedSkillCreatorResponse = ReturnType<typeof parseSkillCreatorResponse>;

// ── Draft 自动校验 ──────────────────────────────────────────────────────────

function validateDraft(draft: Draft): ValidationResult {
  return runValidation({
    skill_name: draft.skill_name,
    skill_md: draft.skill_md,
    references: draft.references.map(r => ({ filename: r.filename })),
    assets: draft.assets.map(a => ({ filename: a.filename })),
    registered_tools: getToolsOverview().map(t => t.name),
  });
}

function shouldReviewDraft(parsed: ParsedSkillCreatorResponse): parsed is ParsedSkillCreatorResponse & { draft: Draft } {
  return !!parsed.draft && (parsed.phase === 'draft' || parsed.phase === 'confirm');
}

function collectValidationIssues(validation: ValidationResult | null): ValidationCheck[] {
  if (!validation) return [];
  return [...validation.errors, ...validation.warnings];
}

function truncateForInternalReview(text: string, limit = AUTO_REVIEW_MESSAGE_LIMIT): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n...(truncated)`;
}

function formatConversationForInternalReview(history: Session['history']): string {
  const recent = history.slice(-AUTO_REVIEW_HISTORY_WINDOW);
  if (recent.length === 0) return '（无历史对话）';
  return recent.map(item => `${item.role === 'user' ? '用户' : '助手'}:\n${truncateForInternalReview(item.content)}`).join('\n\n---\n\n');
}

function formatValidationForInternalReview(validation: ValidationResult): string {
  const issues = collectValidationIssues(validation).slice(0, AUTO_REVIEW_ISSUE_LIMIT);
  if (issues.length === 0) return '（无结构化校验问题）';
  return issues.map((issue, index) => {
    const location = issue.location ? ` @ ${issue.location}` : '';
    return `${index + 1}. [${issue.severity}] ${issue.rule}${location}: ${issue.message}`;
  }).join('\n');
}

function buildInternalReviewMessage(session: Session, parsed: ParsedSkillCreatorResponse, validation: ValidationResult, attempt: number): string {
  const candidate = JSON.stringify({
    reply: parsed.reply,
    phase: parsed.phase,
    draft: parsed.draft,
  }, null, 2);

  return `你现在执行一次内部 reviewer gate（第 ${attempt} 次修正尝试）。

目标：
1. 审查候选草稿是否完整覆盖已确认需求，且做到“不多做也不少做”
2. 检查工具语义是否真实匹配，避免把“引导 / 人工 / 解释”写成“系统执行”
3. 修复下方结构化校验中列出的问题，并尽量一并消化 warning
4. 编辑模式下，遵守最小改动原则，不要无故重写未受影响部分

输出要求：
- 只返回一个合法 JSON 对象，不要输出审查笔记、步骤说明或代码围栏
- 如果你能修好，就直接返回修正后的最终 JSON
- 如果问题根源是关键信息缺失且无法安全假设，不要硬写草稿；改为提出 1 个最关键的澄清问题，phase 设为 "interview"，draft 设为 null
- 不要把“问题清单”直接暴露给用户；用户只应看到修正版，或一个明确的问题

【运行时模式】
${session.skill_id ? 'edit' : 'create'}

【最近对话摘要】
${formatConversationForInternalReview(session.history)}

【候选输出 JSON】
${candidate}

【结构化校验结果】
${formatValidationForInternalReview(validation)}`;
}

async function autoReviewAndRepairDraft(params: {
  session: Session;
  parsed: ParsedSkillCreatorResponse;
  model: import('ai').LanguageModelV1;
  skillIndex: Array<{ name: string; description: string }>;
  tools: Record<string, unknown>;
}): Promise<{ parsed: ParsedSkillCreatorResponse; validation: ValidationResult | null; attempts: number }> {
  let current = params.parsed;

  if (!shouldReviewDraft(current)) {
    return { parsed: current, validation: null, attempts: 0 };
  }

  let attempts = 0;
  let validation = validateDraft(current.draft);

  while (collectValidationIssues(validation).length > 0 && attempts < AUTO_REVIEW_MAX_ATTEMPTS) {
    attempts += 1;
    logger.info('skill-creator', 'auto_review_attempt_start', {
      session_id: params.session.id,
      attempt: attempts,
      phase: current.phase,
      errors: validation.errors.length,
      warnings: validation.warnings.length,
    });

    const reviewSession: Session = {
      ...params.session,
      phase: 'draft',
    };
    const reviewSystemPrompt = buildSystemPrompt(reviewSession, params.skillIndex);
    const { text } = await generateText({
      model: params.model,
      system: reviewSystemPrompt,
      messages: [{ role: 'user', content: buildInternalReviewMessage(params.session, current, validation, attempts) }],
      tools: params.tools as Record<string, unknown> as import('ai').ToolSet,
      maxSteps: 5,
      maxTokens: 16384,
      temperature: 0.15,
    });

    const repaired = parseSkillCreatorResponse(truncateRepetition(text), params.session);
    const needsDraftButMissingDraft = (repaired.phase === 'draft' || repaired.phase === 'confirm') && !repaired.draft;
    if (needsDraftButMissingDraft) {
      logger.warn('skill-creator', 'auto_review_invalid_response', {
        session_id: params.session.id,
        attempt: attempts,
        phase: repaired.phase,
      });
      break;
    }

    current = repaired;
    if (!shouldReviewDraft(current)) {
      logger.info('skill-creator', 'auto_review_exit_without_draft', {
        session_id: params.session.id,
        attempt: attempts,
        phase: current.phase,
      });
      return { parsed: current, validation: null, attempts };
    }

    validation = validateDraft(current.draft);
    logger.info('skill-creator', 'auto_review_attempt_done', {
      session_id: params.session.id,
      attempt: attempts,
      phase: current.phase,
      valid: validation.valid,
      errors: validation.errors.length,
      warnings: validation.warnings.length,
    });
  }

  if (shouldReviewDraft(current)) {
    validation = validateDraft(current.draft);
    if (!validation.valid) {
      current = { ...current, phase: 'draft' };
    }
    return { parsed: current, validation, attempts };
  }

  return { parsed: current, validation: null, attempts };
}

// ── 图片解析（调用视觉模型）─────────────────────────────────────────────────

// ── Vision prompt 模板 ─────────────────────────────────────────────────────

// ── 语言相关辅助 + Prompt 模板加载 ──────────────────────────────────────────

type OutputLang = 'zh' | 'en';

const LANG_VARS: Record<OutputLang, Record<string, string>> = {
  zh: {
    DESC_LANG: '用中文描述',
    LABEL_LANG: '中文标签',
    NODE_RULE: '节点 ID 使用英文 snake_case（如 check_balance），转换标签用中文显示（如 "查询余额"）',
    TRANSLATE_HINT: '中文翻译',
  },
  en: {
    DESC_LANG: 'Describe in English',
    LABEL_LANG: 'English labels',
    NODE_RULE: 'Node IDs use English snake_case (e.g. check_balance), transition labels in English',
    TRANSLATE_HINT: 'English translation',
  },
};

const PROMPTS_DIR = join(import.meta.dir ?? __dirname, 'prompts');

function loadPrompt(name: string): string {
  return readFileSync(join(PROMPTS_DIR, `${name}.md`), 'utf-8');
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

function buildVisionPromptSingle(lang: OutputLang = 'zh'): string {
  return fillTemplate(loadPrompt('vision-single'), LANG_VARS[lang]);
}

function buildVisionPromptOverview(lang: OutputLang = 'zh'): string {
  return fillTemplate(loadPrompt('vision-overview'), LANG_VARS[lang]);
}

function buildTilePrompt(index: number, total: number, lang: OutputLang = 'zh'): string {
  return fillTemplate(loadPrompt('vision-tile'), {
    ...LANG_VARS[lang],
    TILE_INDEX: String(index + 1),
    TILE_TOTAL: String(total),
  });
}

function buildPairMergePrompt(tileTexts: string[], startIdx: number, lang: OutputLang = 'zh'): string {
  const tilesSection = tileTexts.map((t, i) => `### 切片 ${startIdx + i + 1}\n${t}`).join('\n\n');
  return fillTemplate(loadPrompt('vision-pair-merge'), {
    ...LANG_VARS[lang],
    TILES_SECTION: tilesSection,
  });
}

function buildFinalMergePrompt(overviewText: string, partialMerges: string[], lang: OutputLang = 'zh'): string {
  const partsSection = partialMerges.map((t, i) => `### 区域 ${i + 1}\n${t}`).join('\n\n');
  return fillTemplate(loadPrompt('vision-final-merge'), {
    ...LANG_VARS[lang],
    OVERVIEW: overviewText,
    PARTS_SECTION: partsSection,
  });
}

// ── 进度事件 ───────────────────────────────────────────────────────────────

export interface VisionProgressEvent {
  step: 'trim' | 'overview' | 'slice' | 'merge' | 'render';
  current: number;
  total: number;
  elapsed_ms: number;
  eta_ms: number;
  stage_label: string;
  detail_label: string;
  overall_percent: number;
  /** 基于图片面积的整体预估总耗时（毫秒），前端用于线性 ETA */
  estimated_total_ms: number;
}

// ── 基于图片面积的线性时间估算 ─────────────────────────────────────────────
// 基准：15081×10429 (157M px) ≈ 533s；公式 = BASE + RATE × megapixels
const ETA_BASE_S = 30;
const ETA_RATE_S_PER_MP = 3.2;
const TIMEOUT_MULTIPLIER = 3;

function estimateTotalMs(width: number, height: number): number {
  const mp = (width * height) / 1_000_000;
  return Math.round((ETA_BASE_S + ETA_RATE_S_PER_MP * mp) * 1000);
}

class VisionTimeoutError extends Error {
  constructor(elapsedMs: number, timeoutMs: number, stage: string) {
    const elapsedS = Math.round(elapsedMs / 1000);
    const timeoutS = Math.round(timeoutMs / 1000);
    super(`VISION_TIMEOUT: 图片处理超时（已耗时 ${elapsedS}s，超时阈值 ${timeoutS}s，阶段 ${stage}）。建议上传小于 8000×6000 的图片。`);
    this.name = 'VisionTimeoutError';
  }
}



// 各阶段权重（用于计算 overall_percent）
const STAGE_WEIGHTS = { trim: 5, overview: 15, slice: 60, merge: 15, render: 5 };

function buildProgressEvent(
  step: VisionProgressEvent['step'],
  current: number,
  total: number,
  startTs: number,
  sliceCurrent?: number,
  sliceTotal?: number,
  detailLabel?: string,
  estimatedTotalMs: number = 0,
): VisionProgressEvent {
  const elapsed_ms = Date.now() - startTs;

  // 阶段标签
  const labels: Record<string, string> = {
    trim: '预处理图片',
    overview: '生成总览',
    slice: sliceTotal ? `分片识别 ${sliceCurrent}/${sliceTotal}` : '分片识别',
    merge: '合并结果',
    render: '生成最终结果',
  };

  // 计算总进度百分比
  let percent = 0;
  const stages: VisionProgressEvent['step'][] = ['trim', 'overview', 'slice', 'merge', 'render'];
  const currentIdx = stages.indexOf(step);
  for (let i = 0; i < currentIdx; i++) {
    percent += STAGE_WEIGHTS[stages[i]];
  }
  // 当前阶段内部进度
  if (step === 'slice' && sliceTotal && sliceCurrent) {
    percent += STAGE_WEIGHTS.slice * (sliceCurrent / sliceTotal);
  } else if (current > 0 && total > 0) {
    percent += STAGE_WEIGHTS[step] * Math.min(current / total, 1);
  }

  const overall_percent = Math.round(Math.min(percent, 100));

  // ETA 估算：进度 > 5% 时才有意义
  const eta_ms = overall_percent > 5
    ? Math.round(elapsed_ms / (overall_percent / 100) - elapsed_ms)
    : 0;

  return {
    step,
    current,
    total,
    elapsed_ms,
    eta_ms,
    stage_label: labels[step] ?? step,
    detail_label: detailLabel ?? labels[step] ?? step,
    overall_percent,
    estimated_total_ms: estimatedTotalMs,
  };
}

// ── vision 结果解析 ──────────────────────────────────────────────────────

export interface ParsedVisionResult {
  summary: string;
  description: string;
  mermaid: string;
}

function parseVisionResult(text: string): ParsedVisionResult {
  // 提取 mermaid 代码块
  const mermaidMatch = text.match(/```mermaid\s*\n([\s\S]*?)```/);
  const mermaid = mermaidMatch ? mermaidMatch[1].trim() : '';

  // 提取流程描述段落（## 流程描述 到下一个 ## 或 ``` 之间）
  const descMatch = text.match(/##\s*流程描述\s*\n([\s\S]*?)(?=\n##\s|\n```mermaid|$)/);
  const description = descMatch ? descMatch[1].trim() : text.replace(/```mermaid[\s\S]*?```/g, '').trim();

  // 摘要：取描述第一段（到第一个空行或前 200 字）
  const firstPara = description.split(/\n\s*\n/)[0] ?? '';
  const summary = firstPara.length > 200 ? firstPara.slice(0, 200) + '…' : firstPara;

  return { summary, description, mermaid };
}

// ── 单图 vision 调用 ──────────────────────────────────────────────────────

/** LLM 返回内容过短，视为无效输出 */
class VisionOutputError extends Error {
  constructor(tag: string, length: number) {
    super(`LLM 输出质量异常（${tag}：仅 ${length} 字符），可能模型未正确识别图片内容`);
    this.name = 'VisionOutputError';
  }
}

/** 每步 LLM 调用的最小有效输出长度 */
const MIN_OUTPUT_LENGTH: Record<string, number> = {
  overview: 30,
  tile: 20,
  pair: 30,
  final: 50,
};

async function callVisionModel(
  imageDataUrl: string,
  prompt: string,
  label?: string,
  provider: SkillCreatorProvider = 'qwen',
  signal?: AbortSignal,
): Promise<string> {
  const callTs = Date.now();
  const imageSize = Math.round(imageDataUrl.length / 1024);
  const tag = label ?? 'vision';
  logger.info('skill-creator', 'llm_vision_call_start', { tag, prompt_length: prompt.length, image_base64_kb: imageSize, provider });
  try {
    const { text, usage } = await generateText({
      model: getSkillCreatorModels(provider).visionModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: imageDataUrl },
            { type: 'text', text: prompt },
          ],
        },
      ],
      temperature: 0.2,
      abortSignal: signal,
    });
    logger.info('skill-creator', 'llm_vision_call_done', {
      tag, duration_ms: Date.now() - callTs, result_length: text.length,
      input_tokens: usage?.promptTokens, output_tokens: usage?.completionTokens,
    });
    // 输出质量校验
    const category = tag.startsWith('tile') ? 'tile' : tag;
    const minLen = MIN_OUTPUT_LENGTH[category] ?? 20;
    if (text.trim().length < minLen) {
      logger.warn('skill-creator', 'llm_vision_output_too_short', { tag, length: text.trim().length, min: minLen });
      throw new VisionOutputError(tag, text.trim().length);
    }
    return text;
  } catch (err) {
    logger.error('skill-creator', 'llm_vision_call_error', { tag, duration_ms: Date.now() - callTs, error: String(err) });
    throw err;
  }
}

// ── parseFlowchartImage — 支持大图分片 ──────────────────────────────────────

async function parseFlowchartImage(
  imageInput: Buffer | string,
  onProgress?: (event: VisionProgressEvent) => void,
  lang: OutputLang = 'zh',
  provider: SkillCreatorProvider = 'qwen',
  /** 外部取消信号（用户点取消 / SSE 断开时触发） */
  externalSignal?: AbortSignal,
): Promise<string> {
  const visionStartTs = Date.now();
  // 统一转为 Buffer
  const buffer = typeof imageInput === 'string' ? fromDataUrl(imageInput) : imageInput;

  const analysis = await analyzeImage(buffer);
  logger.info('skill-creator', 'image_analysis', {
    width: analysis.width,
    height: analysis.height,
    strategy: analysis.strategy,
    tileCount: analysis.tileCount,
  });

  // ── direct: 小图直接处理 ──
  if (analysis.strategy === 'direct') {
    const dataUrl = toDataUrl(buffer);
    const text = await callVisionModel(dataUrl, buildVisionPromptSingle(lang), 'direct', provider, externalSignal);
    logger.info('skill-creator', 'image_parsed', { strategy: 'direct', result_length: text.length });
    return text;
  }

  // ── resize: 中图缩放后处理 ──
  if (analysis.strategy === 'resize') {
    const resized = await resizeImage(buffer, 2048);
    const dataUrl = toDataUrl(resized);
    const text = await callVisionModel(dataUrl, buildVisionPromptSingle(lang), 'resize', provider, externalSignal);
    logger.info('skill-creator', 'image_parsed', { strategy: 'resize', result_length: text.length });
    return text;
  }

  // ── tile: 大图分片处理 ──
  const totalSteps = analysis.tileCount + 2; // overview + tiles + merge
  const estimatedTotalMs = estimateTotalMs(analysis.width, analysis.height);
  const timeoutMs = estimatedTotalMs * TIMEOUT_MULTIPLIER;
  logger.info('skill-creator', 'vision_eta', {
    megapixels: Math.round((analysis.width * analysis.height) / 1_000_000),
    estimated_total_s: Math.round(estimatedTotalMs / 1000),
    timeout_s: Math.round(timeoutMs / 1000),
  });

  // 组合信号：超时 + 外部取消（任一触发即中止全部 LLM 调用）
  const timeoutAbort = AbortSignal.timeout(timeoutMs);
  const combinedAbort = externalSignal
    ? AbortSignal.any([timeoutAbort, externalSignal])
    : timeoutAbort;

  /** 检查中止状态，每步入口调用 */
  const checkAborted = (stage: string) => {
    if (combinedAbort.aborted) {
      const reason = externalSignal?.aborted ? 'user_cancel' : 'timeout';
      logger.warn('skill-creator', 'vision_aborted', { stage, reason, elapsed_ms: Date.now() - visionStartTs });
      if (reason === 'user_cancel') {
        throw new Error('用户已取消图片处理');
      }
      throw new VisionTimeoutError(Date.now() - visionStartTs, timeoutMs, stage);
    }
  };

  // 创建临时目录保存中间产物（调试 + 测试可读取）
  const cacheId = `vision-${Date.now().toString(36)}`;
  const cacheDir = join(SKILLS_ROOT, '..', 'data', 'vision-cache', cacheId);
  mkdirSync(cacheDir, { recursive: true });
  logger.info('skill-creator', 'vision_cache_dir', { path: cacheDir });

  // Step 1: 裁白边
  onProgress?.(buildProgressEvent('trim', 0, totalSteps, visionStartTs, undefined, undefined, '裁剪空白区域并检查尺寸', estimatedTotalMs));
  let trimmed: Buffer;
  const trimStartTs = Date.now();
  try {
    trimmed = await trimWhitespace(buffer);
    logger.info('skill-creator', 'image_trimmed', {
      original: `${analysis.width}x${analysis.height}`,
      original_size_kb: Math.round(buffer.length / 1024),
      trimmed_size_kb: Math.round(trimmed.length / 1024),
      duration_ms: Date.now() - trimStartTs,
    });
  } catch (err) {
    logger.warn('skill-creator', 'trim_failed_fallback_to_original', { error: String(err), duration_ms: Date.now() - trimStartTs });
    trimmed = buffer;
  }

  // Step 2: 总览
  onProgress?.(buildProgressEvent('overview', 1, totalSteps, visionStartTs, undefined, undefined, '生成缩略图，识别整体结构', estimatedTotalMs));
  const overviewResizeTs = Date.now();
  const overviewBuf = await generateOverview(trimmed, 1024);
  writeFileSync(join(cacheDir, 'overview.jpg'), overviewBuf);
  logger.info('skill-creator', 'overview_thumbnail', { size_kb: Math.round(overviewBuf.length / 1024), resize_ms: Date.now() - overviewResizeTs });
  const overviewDataUrl = toDataUrl(overviewBuf);
  const overviewLlmTs = Date.now();
  const overviewText = await callVisionModel(overviewDataUrl, buildVisionPromptOverview(lang), 'overview', provider, combinedAbort);
  writeFileSync(join(cacheDir, 'overview.md'), overviewText);
  logger.info('skill-creator', 'overview_parsed', { result_length: overviewText.length, llm_ms: Date.now() - overviewLlmTs, total_overview_ms: Date.now() - overviewResizeTs });
  checkAborted('after_overview');

  // Step 3: 切片
  const tileGenTs = Date.now();
  const tiles = await generateTiles(trimmed, analysis.rows, analysis.cols, {
    maxTileSide: 2048,
    overlap: 0.15,
  });
  logger.info('skill-creator', 'tiles_generated', {
    count: tiles.length, rows: analysis.rows, cols: analysis.cols,
    tile_sizes_kb: tiles.map(t => Math.round(t.length / 1024)),
    duration_ms: Date.now() - tileGenTs,
  });

  // 过滤过小的切片（< 60KB 内容极少，跳过独立 LLM 调用以节省时间）
  const MIN_TILE_SIZE = 60 * 1024;
  const effectiveTiles: Buffer[] = [];
  const skippedTiles: number[] = [];
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i].length < MIN_TILE_SIZE && tiles.length > 2) {
      skippedTiles.push(i + 1);
      logger.info('skill-creator', 'tile_skipped_small', { tile: i + 1, size_kb: Math.round(tiles[i].length / 1024) });
    } else {
      effectiveTiles.push(tiles[i]);
    }
  }
  if (skippedTiles.length > 0) {
    logger.info('skill-creator', 'tiles_after_filter', { original: tiles.length, effective: effectiveTiles.length, skipped: skippedTiles });
  }

  // 保存切片图片（含跳过的，用于调试）
  for (let i = 0; i < tiles.length; i++) {
    writeFileSync(join(cacheDir, `tile-${i + 1}.jpg`), tiles[i]);
  }
  const slicePhaseTs = Date.now();
  let sliceCompleted = 0;
  logger.info('skill-creator', 'slice_phase_start', { total_tiles: effectiveTiles.length, strategy: 'all_parallel' });

  const tileResults = await Promise.allSettled(
    effectiveTiles.map((tile, idx) => {
      const dataUrl = toDataUrl(tile);
      return callVisionModel(dataUrl, buildTilePrompt(idx, effectiveTiles.length, lang), `tile-${idx + 1}/${effectiveTiles.length}`, provider, combinedAbort)
        .then(text => {
          writeFileSync(join(cacheDir, `tile-${idx + 1}.md`), text);
          sliceCompleted++;
          onProgress?.(buildProgressEvent('slice', 1 + sliceCompleted, totalSteps, visionStartTs, sliceCompleted, effectiveTiles.length, `正在解析切片 ${sliceCompleted}/${effectiveTiles.length}`, estimatedTotalMs));
          logger.info('skill-creator', 'tile_parsed', { tile: idx + 1, total: effectiveTiles.length, result_length: text.length, completed: sliceCompleted, elapsed_since_start_ms: Date.now() - slicePhaseTs });
          return text;
        });
    }),
  );

  // 统计切片结果：容忍少量失败（≤ 1/3），超过则整体失败
  const tileTexts: string[] = [];
  const failedTiles: number[] = [];
  for (let i = 0; i < tileResults.length; i++) {
    const r = tileResults[i];
    if (r.status === 'fulfilled') {
      tileTexts.push(r.value);
    } else {
      failedTiles.push(i + 1);
      tileTexts.push(`[切片 ${i + 1} 解析失败，已跳过]`);
      logger.warn('skill-creator', 'tile_failed', { tile: i + 1, error: String(r.reason) });
    }
  }
  const maxAllowedFails = Math.floor(effectiveTiles.length / 3);
  if (failedTiles.length > maxAllowedFails) {
    throw new Error(`过多切片解析失败（${failedTiles.length}/${effectiveTiles.length} 失败，切片: ${failedTiles.join(',')}），请重试或上传更清晰的图片`);
  }
  if (failedTiles.length > 0) {
    logger.warn('skill-creator', 'slice_partial_failure', { failed: failedTiles, total: effectiveTiles.length, allowed: maxAllowedFails });
  }
  logger.info('skill-creator', 'slice_phase_done', { total_tiles: effectiveTiles.length, succeeded: effectiveTiles.length - failedTiles.length, failed: failedTiles.length, total_slice_ms: Date.now() - slicePhaseTs });
  checkAborted('after_slice');

  // Step 4: 两步合并 — 先相邻切片 pairwise merge，再全局 final merge
  const mergePhaseTs = Date.now();
  onProgress?.(buildProgressEvent('merge', totalSteps - 1, totalSteps, visionStartTs, undefined, undefined, `正在合并 ${effectiveTiles.length} 个区域的识别结果`, estimatedTotalMs));

  // Step 4a: Pairwise merge — 将相邻 2-3 个切片并行合并为局部流程
  const pairSize = effectiveTiles.length <= 4 ? 2 : 3;
  const totalPairs = Math.ceil(tileTexts.length / pairSize);
  logger.info('skill-creator', 'pair_merge_start', { pair_size: pairSize, total_pairs: totalPairs, strategy: 'all_parallel', input_tile_lengths: tileTexts.map(t => t.length) });

  // 构建 pair 分组
  const pairGroups: { idx: number; tiles: string[]; startOffset: number }[] = [];
  for (let i = 0; i < tileTexts.length; i += pairSize) {
    pairGroups.push({ idx: Math.floor(i / pairSize) + 1, tiles: tileTexts.slice(i, i + pairSize), startOffset: i });
  }

  // 全并行执行 pair merge
  const pairResults = await Promise.allSettled(
    pairGroups.map(async ({ idx: pairIdx, tiles: pairTiles, startOffset }) => {
      if (pairTiles.length === 1) {
        logger.info('skill-creator', 'pair_skipped_single', { pair: pairIdx });
        return pairTiles[0];
      }
      const pairPrompt = buildPairMergePrompt(pairTiles, startOffset, lang);
      const pairTs = Date.now();
      logger.info('skill-creator', 'pair_merge_llm_start', { pair: pairIdx, input_tiles: pairTiles.length, prompt_length: pairPrompt.length, input_lengths: pairTiles.map(t => t.length) });
      const { text: pairResult, usage: pairUsage } = await generateText({
        model: getSkillCreatorModels(provider).model,
        messages: [{ role: 'user', content: pairPrompt }],
        temperature: 0.2,
        maxTokens: 4096,
        abortSignal: combinedAbort,
      });
      // pair merge 输出质量校验
      if (pairResult.trim().length < MIN_OUTPUT_LENGTH.pair) {
        throw new VisionOutputError(`pair-${pairIdx}`, pairResult.trim().length);
      }
      writeFileSync(join(cacheDir, `pair-${pairIdx}.md`), pairResult);
      logger.info('skill-creator', 'pair_merged', {
        pair: pairIdx, input_tiles: pairTiles.length, result_length: pairResult.length, llm_ms: Date.now() - pairTs,
        input_tokens: pairUsage?.promptTokens, output_tokens: pairUsage?.completionTokens,
      });
      return pairResult;
    }),
  );

  // pair merge 容错：至少需要 50% 成功
  const partialMerges: string[] = [];
  const failedPairs: number[] = [];
  for (let i = 0; i < pairResults.length; i++) {
    const r = pairResults[i];
    if (r.status === 'fulfilled') {
      partialMerges.push(r.value);
    } else {
      failedPairs.push(i + 1);
      // 回退到原始 tile 文本拼接
      const fallback = pairGroups[i].tiles.join('\n\n---\n\n');
      partialMerges.push(fallback);
      logger.warn('skill-creator', 'pair_merge_failed_fallback', { pair: i + 1, error: String(r.reason) });
    }
  }
  if (failedPairs.length > Math.ceil(pairGroups.length / 2)) {
    throw new Error(`过多合并失败（${failedPairs.length}/${pairGroups.length}），请重试`);
  }
  logger.info('skill-creator', 'pair_merge_phase_done', { total_pairs: partialMerges.length, failed: failedPairs.length, pair_merge_ms: Date.now() - mergePhaseTs });
  checkAborted('after_pair_merge');

  // Step 4b: Final merge — 总览 + 各局部合并 → 完整流程图
  const finalPrompt = buildFinalMergePrompt(overviewText, partialMerges, lang);
  const finalMergeTs = Date.now();
  logger.info('skill-creator', 'final_merge_llm_start', { prompt_length: finalPrompt.length, partial_merge_lengths: partialMerges.map(p => p.length), overview_length: overviewText.length });
  const { text: mergedText, usage: finalUsage } = await generateText({
    model: getSkillCreatorModels(provider).model,
    messages: [{ role: 'user', content: finalPrompt }],
    temperature: 0.2,
    maxTokens: 8192,
    abortSignal: combinedAbort,
  });
  if (mergedText.trim().length < MIN_OUTPUT_LENGTH.final) {
    throw new VisionOutputError('final_merge', mergedText.trim().length);
  }
  writeFileSync(join(cacheDir, 'merged.md'), mergedText);
  logger.info('skill-creator', 'final_merge_done', {
    result_length: mergedText.length, llm_ms: Date.now() - finalMergeTs,
    input_tokens: finalUsage?.promptTokens, output_tokens: finalUsage?.completionTokens,
  });
  onProgress?.(buildProgressEvent('render', totalSteps, totalSteps, visionStartTs, undefined, undefined, '正在生成 Mermaid 流程图与中文说明', estimatedTotalMs));

  const totalDurationMs = Date.now() - visionStartTs;
  logger.info('skill-creator', 'image_parsed', {
    strategy: 'tile',
    tiles: tiles.length,
    pair_merges: partialMerges.length,
    overview_length: overviewText.length,
    merge_length: mergedText.length,
    cache_dir: cacheDir,
    total_duration_ms: totalDurationMs,
    total_duration_min: (totalDurationMs / 60000).toFixed(1),
  });

  return mergedText;
}

// ── POST /api/skill-creator/chat ──────────────────────────────────────────────

const skillCreator = new Hono();

skillCreator.post('/chat', async (c) => {
  const reqStartTs = Date.now();

  // ── 解析请求（支持 JSON 和 multipart/form-data） ──
  const contentType = c.req.header('content-type') ?? '';
  let message = '';
  let sessionId: string | undefined;
  let skillId: string | null | undefined;
  let versionNo: number | undefined;
  let enableThinking = false;
  let imageBuffer: Buffer | null = null;
  let imageBase64: string | undefined;
  let lang: OutputLang = 'zh';
  let provider: SkillCreatorProvider = 'qwen';

  if (contentType.includes('multipart/form-data')) {
    const form = await c.req.parseBody();
    message = (form.message as string) ?? '';
    sessionId = (form.session_id as string) || undefined;
    skillId = (form.skill_id as string) || null;
    versionNo = form.version_no ? Number(form.version_no) : undefined;
    enableThinking = form.enable_thinking === 'true' || form.enable_thinking === '1';
    lang = (form.lang as string) === 'en' ? 'en' : 'zh';
    provider = (form.provider as string) === 'openai' ? 'openai' : 'qwen';
    const file = form.image as File | undefined;
    if (file && file.size > 0) {
      imageBuffer = Buffer.from(await file.arrayBuffer());
    }
  } else {
    const body = await c.req.json<{
      message: string;
      session_id?: string;
      skill_id?: string | null;
      version_no?: number;
      enable_thinking?: boolean;
      image?: string;
      lang?: string;
      provider?: string;
    }>();
    message = body.message ?? '';
    sessionId = body.session_id;
    skillId = body.skill_id;
    versionNo = body.version_no;
    enableThinking = !!body.enable_thinking;
    lang = body.lang === 'en' ? 'en' : 'zh';
    provider = body.provider === 'openai' ? 'openai' : 'qwen';
    imageBase64 = body.image;
    if (imageBase64) {
      try { imageBuffer = fromDataUrl(imageBase64); } catch { /* keep as base64 fallback */ }
    }
  }

  const hasImage = !!imageBuffer || !!imageBase64;

  logger.info('skill-creator', 'chat_request_start', {
    session_id: sessionId ?? '(new)',
    skill_id: skillId ?? null,
    version_no: versionNo ?? null,
    enable_thinking: enableThinking,
    provider,
    has_image: hasImage,
    image_size: imageBuffer ? imageBuffer.length : 0,
    message_preview: message.slice(0, 80),
  });

  if (!message.trim() && !hasImage) {
    return c.json({ error: 'message 或 image 不能为空' }, 400);
  }

  // ── 图片解析（非流式模式：同步处理；流式模式：延迟到 SSE 流中处理） ──
  let imageDescription: string | null = null;
  const imageInput: Buffer | string | null = imageBuffer ?? imageBase64 ?? null;

  // 非流式模式下同步处理图片（流式模式在 SSE 流中处理以支持实时进度推送）
  if (hasImage && !enableThinking) {
    try {
      const visionStartTs = Date.now();
      logger.info('skill-creator', 'vision_start', { session_id: sessionId ?? '(new)' });
      imageDescription = await parseFlowchartImage(imageInput!, undefined, lang, provider);
      logger.info('skill-creator', 'image_parsed', {
        result_length: imageDescription.length,
        duration_ms: Date.now() - visionStartTs,
      });
    } catch (err) {
      logger.error('skill-creator', 'image_parse_error', { error: String(err), duration_ms: Date.now() - reqStartTs });
      return c.json({ error: `图片解析失败: ${String(err)}` }, 500);
    }
  }

  // 构造最终消息（注入图片解析结果）
  let finalMessage = message.trim();
  if (imageDescription) {
    const imageContext = `\n\n---\n**[用户上传了一张流程图，以下是 AI 视觉模型的解析结果]**\n\n${imageDescription}\n---\n`;
    finalMessage = finalMessage
      ? `${finalMessage}\n${imageContext}`
      : `我上传了一张手绘流程图，请根据以下解析结果帮我完善需求：${imageContext}`;
  }

  let session: Session;
  if (sessionId && sessions.has(sessionId)) {
    session = sessions.get(sessionId)!;
  } else {
    const id = `sc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    session = {
      id,
      skill_id: skillId ?? null,
      version_no: versionNo ?? null,
      history: [],
      phase: 'interview',
      draft: null,
      created_at: Date.now(),
    };
    sessions.set(id, session);
  }

  session.history.push({ role: 'user', content: finalMessage });

  const skillIndex = loadSkillIndex();
  const systemPrompt = buildSystemPrompt(session, skillIndex);

  logger.info('skill-creator', 'prompt_built', {
    session_id: session.id,
    phase: session.phase,
    history_turns: session.history.length,
    system_prompt_len: systemPrompt.length,
    skill_index_count: skillIndex.length,
    duration_ms: Date.now() - reqStartTs,
  });

  const skillTools = {
    read_skill: tool({
      description: '读取已有业务技能的 SKILL.md 内容',
      parameters: z.object({ skill_name: z.string().describe('技能名称（kebab-case）') }),
      execute: async ({ skill_name }) => {
        logger.info('skill-creator', 'tool_call', { tool: 'read_skill', args: { skill_name }, session_id: session.id });
        // 当读取的是当前编辑的技能且有版本号时，从版本快照读取而非发布版
        const result = (skill_name === session.skill_id && session.version_no
          ? readVersionedSkillContent(skill_name, session.version_no)
          : readSkillContent(skill_name)) ?? `技能 "${skill_name}" 不存在`;
        logger.info('skill-creator', 'tool_result', { tool: 'read_skill', result_len: result.length, session_id: session.id });
        return result;
      },
    }),
    read_reference: tool({
      description: '读取业务技能的参考文档',
      parameters: z.object({
        skill_name: z.string().describe('技能名称'),
        ref_name: z.string().describe('参考文档文件名'),
      }),
      execute: async ({ skill_name, ref_name }) => {
        logger.info('skill-creator', 'tool_call', { tool: 'read_reference', args: { skill_name, ref_name }, session_id: session.id });
        const result = readSkillReference(skill_name, ref_name) ?? `参考文档 "${ref_name}" 不存在`;
        logger.info('skill-creator', 'tool_result', { tool: 'read_reference', result_len: result.length, session_id: session.id });
        return result;
      },
    }),
    list_skills: tool({
      description: '列出所有已有业务技能及其参考文档',
      parameters: z.object({}),
      execute: async () => {
        logger.info('skill-creator', 'tool_call', { tool: 'list_skills', session_id: session.id });
        const result = JSON.stringify(skillIndex.map(s => ({ ...s, references: listSkillReferences(s.name) })));
        logger.info('skill-creator', 'tool_result', { tool: 'list_skills', result_len: result.length, skill_count: skillIndex.length, session_id: session.id });
        return result;
      },
    }),
    list_mcp_tools: tool({
      description: '列出系统中所有已注册的 MCP 工具（含名称、描述、来源服务、状态、关联技能）。用于工具可行性检查，判断流程中需要的工具是否已存在。',
      parameters: z.object({}),
      execute: async () => {
        logger.info('skill-creator', 'tool_call', { tool: 'list_mcp_tools', session_id: session.id });
        try {
          const items = getToolsOverview();
          const result = JSON.stringify(items.map(t => ({
            name: t.name,
            description: t.description,
            source: t.source,
            status: t.status,
            skills: t.skills,
          })));
          logger.info('skill-creator', 'tool_result', { tool: 'list_mcp_tools', result_len: result.length, tool_count: items.length, session_id: session.id });
          return result;
        } catch (err) {
          logger.warn('skill-creator', 'tool_error', { tool: 'list_mcp_tools', error: String(err), session_id: session.id });
          return JSON.stringify({ error: '工具列表暂时不可用，请继续对话', items: [] });
        }
      },
    }),
    get_mcp_tool_detail: tool({
      description: '查看指定 MCP 工具的详细信息，包括参数 schema 和返回示例。用于确认工具的语义是否匹配流程步骤的需求。',
      parameters: z.object({
        tool_name: z.string().describe('工具名称（snake_case）'),
      }),
      execute: async ({ tool_name }) => {
        logger.info('skill-creator', 'tool_call', { tool: 'get_mcp_tool_detail', args: { tool_name }, session_id: session.id });
        try {
          const detail = getToolDetail(tool_name);
          if (!detail) {
            logger.info('skill-creator', 'tool_result', { tool: 'get_mcp_tool_detail', found: false, session_id: session.id });
            return JSON.stringify({ found: false, message: `工具 "${tool_name}" 未注册。可能需要新建。` });
          }
          const result = JSON.stringify({
            found: true,
            name: detail.name,
            description: detail.description,
            source: detail.source,
            status: detail.status,
            inputSchema: detail.inputSchema,
            responseExample: detail.responseExample,
            skills: detail.skills,
          });
          logger.info('skill-creator', 'tool_result', { tool: 'get_mcp_tool_detail', found: true, result_len: result.length, session_id: session.id });
          return result;
        } catch (err) {
          logger.warn('skill-creator', 'tool_error', { tool: 'get_mcp_tool_detail', error: String(err), session_id: session.id });
          return JSON.stringify({ found: false, message: `查询失败: ${String(err)}` });
        }
      },
    }),
  };

  const models = getSkillCreatorModels(provider);
  const model = enableThinking ? models.thinkingModel : models.model;

  // ── 流式模式（thinking 开启时）──
  if (enableThinking) {
    try {
      const llmStartTs = Date.now();
      logger.info('skill-creator', 'llm_stream_start', {
        session_id: session.id,
        model: 'thinking',
        history_turns: session.history.length,
        elapsed_ms: llmStartTs - reqStartTs,
      });

      const result = streamText({
        model,
        system: systemPrompt,
        messages: session.history,
        tools: skillTools,
        maxSteps: 5,
        maxTokens: 16384,
        temperature: 0.3,
      });

      const encoder = new TextEncoder();
      // AbortController：用户取消或连接断开时中止所有进行中的 LLM 调用
      const visionAbort = new AbortController();
      const sseStream = new ReadableStream({
        async start(controller) {
          try {
            // 流式模式下在 SSE 中处理图片（支持实时进度推送）
            if (hasImage && !imageDescription && imageInput) {
              try {
                logger.info('skill-creator', 'vision_start_streaming', { session_id: session.id });
                imageDescription = await parseFlowchartImage(imageInput, (evt) => {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'vision_progress', ...evt })}\n\n`));
                }, lang, provider, visionAbort.signal);
                // 重新构造 finalMessage（因为之前 imageDescription 为 null）
                const imageContext = `\n\n---\n**[用户上传了一张流程图，以下是 AI 视觉模型的解析结果]**\n\n${imageDescription}\n---\n`;
                const origMessage = message.trim();
                session.history[session.history.length - 1] = {
                  role: 'user',
                  content: origMessage
                    ? `${origMessage}\n${imageContext}`
                    : `我上传了一张手绘流程图，请根据以下解析结果帮我完善需求：${imageContext}`,
                };
              } catch (err) {
                // 用户取消（abort）：静默关闭，不推错误
                if (visionAbort.signal.aborted && !(err instanceof VisionTimeoutError)) {
                  logger.info('skill-creator', 'vision_cancelled_by_user', { session_id: session.id });
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'error',
                    error: '图片处理已取消',
                    code: 'vision_cancelled',
                  })}\n\n`));
                  controller.close();
                  return;
                }
                const isTimeout = err instanceof VisionTimeoutError;
                const isQuality = err instanceof VisionOutputError;
                let errorMsg: string;
                let code: string;
                if (isTimeout) {
                  errorMsg = '图片处理超时，建议上传小于 8000×6000 的图片后重试';
                  code = 'vision_timeout';
                } else if (isQuality) {
                  errorMsg = `图片识别质量异常：${err.message}。建议上传更清晰的流程图`;
                  code = 'vision_quality';
                } else {
                  errorMsg = `图片解析失败: ${String(err)}`;
                  code = 'vision_error';
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errorMsg, code })}\n\n`));
                controller.close();
                return;
              }
            }
            // 推送图片解析结果（结构化：摘要 + 描述 + Mermaid）
            if (imageDescription) {
              const parsed = parseVisionResult(imageDescription);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'vision_result', text: imageDescription, ...parsed })}\n\n`));
            }

            let firstChunkTs = 0;
            let chunkCount = 0;
            let lastLogTs = Date.now();

            for await (const part of result.fullStream) {
              if (chunkCount === 0) {
                firstChunkTs = Date.now();
                logger.info('skill-creator', 'llm_first_chunk', {
                  session_id: session.id,
                  type: part.type,
                  time_to_first_chunk_ms: firstChunkTs - llmStartTs,
                });
              }
              chunkCount++;

              // 每 30 秒输出一次进度日志，防止长时间无输出不知道状态
              if (Date.now() - lastLogTs > 30_000) {
                logger.info('skill-creator', 'llm_stream_progress', {
                  session_id: session.id,
                  chunk_count: chunkCount,
                  elapsed_ms: Date.now() - llmStartTs,
                  last_chunk_type: part.type,
                });
                lastLogTs = Date.now();
              }

              if (part.type === 'reasoning') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'thinking', text: part.textDelta })}\n\n`));
              } else if (part.type === 'text-delta') {
                // Hold back raw draft text until internal review/repair completes.
              } else if (part.type === 'tool-call') {
                logger.info('skill-creator', 'llm_tool_call_request', {
                  session_id: session.id,
                  tool_name: (part as any).toolName,
                  step: chunkCount,
                  elapsed_ms: Date.now() - llmStartTs,
                });
              } else if (part.type === 'tool-result') {
                logger.info('skill-creator', 'llm_tool_call_done', {
                  session_id: session.id,
                  tool_name: (part as any).toolName,
                  elapsed_ms: Date.now() - llmStartTs,
                });
              } else if (part.type === 'step-finish') {
                logger.info('skill-creator', 'llm_step_finish', {
                  session_id: session.id,
                  step: chunkCount,
                  elapsed_ms: Date.now() - llmStartTs,
                });
              }
            }

            logger.info('skill-creator', 'llm_stream_end', {
              session_id: session.id,
              total_chunks: chunkCount,
              stream_duration_ms: Date.now() - llmStartTs,
            });

            // 流结束后，获取完整文本并解析
            let text = await result.text;
            const reasoning = await result.reasoning;

            // 检测并截断重复循环（LLM 生成表格时可能无限重复）
            text = truncateRepetition(text);

            const parsed = parseSkillCreatorResponse(text, session);
            const reviewed = await autoReviewAndRepairDraft({
              session,
              parsed,
              model,
              skillIndex,
              tools: skillTools,
            });
            const finalParsed = reviewed.parsed;
            const validation = reviewed.validation;

            logger.info('skill-creator', 'chat_stream_parsed', {
              session_id: session.id,
              text_length: text.length,
              parsed_phase: finalParsed.phase,
              has_draft: !!finalParsed.draft,
              draft_keys: finalParsed.draft ? Object.keys(finalParsed.draft) : [],
              reply_preview: finalParsed.reply?.substring(0, 100),
              auto_review_attempts: reviewed.attempts,
            });

            session.phase = finalParsed.phase ?? session.phase;
            if (finalParsed.draft) session.draft = finalParsed.draft;
            // 防止空回复污染历史（会导致后续轮次持续异常）
            if (finalParsed.reply) {
              session.history.push({ role: 'assistant', content: finalParsed.reply });
            } else {
              logger.warn('skill-creator', 'empty_reply_skipped', { session_id: session.id, reasoning_length: reasoning?.toString().length ?? 0 });
            }

            if (validation) {
              logger.info('skill-creator', 'draft_validation', {
                session_id: session.id,
                valid: validation.valid,
                errors: validation.errors.length,
                warnings: validation.warnings.length,
                error_details: validation.errors.map(e => ({ rule: e.rule, message: e.message, location: e.location })),
                warning_details: validation.warnings.map(w => ({ rule: w.rule, message: w.message })),
              });

              // 将校验结果注入会话历史，LLM 下一轮可自修复
              const issues = collectValidationIssues(validation);
              if (issues.length > 0) {
                const feedback = '【系统自动校验反馈】草稿存在以下问题，请在下一轮修复：\n'
                  + issues.map(i => `- [${i.severity}] ${i.message}`).join('\n');
                session.history.push({ role: 'user', content: feedback });
              }
            }

            // 发送最终结果事件
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'done',
              session_id: session.id,
              reply: finalParsed.reply,
              phase: session.phase,
              draft: session.draft,
              thinking: reasoning || null,
              validation: validation ?? undefined,
            })}\n\n`));

            logger.info('skill-creator', 'chat_stream', {
              session_id: session.id,
              phase: session.phase,
              has_reasoning: !!reasoning,
              total_duration_ms: Date.now() - reqStartTs,
              text_length: text.length,
              reasoning_length: reasoning?.toString().length ?? 0,
            });
          } catch (err) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: String(err) })}\n\n`));
            logger.error('skill-creator', 'chat_stream_error', {
              error: String(err),
              stack: (err as Error).stack?.slice(0, 500),
              elapsed_ms: Date.now() - reqStartTs,
            });
          } finally {
            controller.close();
          }
        },
        cancel() {
          // 客户端断开连接时中止所有进行中的 LLM 调用
          logger.info('skill-creator', 'sse_client_disconnected', { session_id: session?.id });
          visionAbort.abort();
        },
      });

      return new Response(sseStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',         // nginx/proxy 禁止缓冲
          'Content-Encoding': 'identity',     // 禁止压缩（压缩会导致缓冲）
        },
      });
    } catch (err) {
      logger.error('skill-creator', 'chat_error', { error: String(err) });
      return c.json({ error: `对话失败: ${String(err)}` }, 500);
    }
  }

  // ── 非流式模式（thinking 关闭时）──
  try {
    const llmStartTs = Date.now();
    logger.info('skill-creator', 'llm_generate_start', {
      session_id: session.id,
      model: 'non-thinking',
      history_turns: session.history.length,
      elapsed_ms: llmStartTs - reqStartTs,
    });

    const { text } = await generateText({
      model,
      system: systemPrompt,
      messages: session.history,
      tools: skillTools,
      maxSteps: 5,
      maxTokens: 16384,
      temperature: 0.3,
    });

    logger.info('skill-creator', 'llm_generate_done', {
      session_id: session.id,
      text_length: text.length,
      llm_duration_ms: Date.now() - llmStartTs,
    });

    const cleanedText = truncateRepetition(text);
    const parsed = parseSkillCreatorResponse(cleanedText, session);
    const reviewed = await autoReviewAndRepairDraft({
      session,
      parsed,
      model,
      skillIndex,
      tools: skillTools,
    });
    const finalParsed = reviewed.parsed;
    const validation = reviewed.validation;

    session.phase = finalParsed.phase ?? session.phase;
    if (finalParsed.draft) session.draft = finalParsed.draft;
    session.history.push({ role: 'assistant', content: finalParsed.reply });

    if (validation) {
      logger.info('skill-creator', 'draft_validation', {
        session_id: session.id,
        valid: validation.valid,
        errors: validation.errors.length,
        warnings: validation.warnings.length,
        error_details: validation.errors.map(e => ({ rule: e.rule, message: e.message, location: e.location })),
        warning_details: validation.warnings.map(w => ({ rule: w.rule, message: w.message })),
      });

      // 将校验结果注入会话历史，LLM 下一轮可自修复
      const issues = collectValidationIssues(validation);
      if (issues.length > 0) {
        const feedback = '【系统自动校验反馈】草稿存在以下问题，请在下一轮修复：\n'
          + issues.map(i => `- [${i.severity}] ${i.message}`).join('\n');
        session.history.push({ role: 'user', content: feedback });
      }
    }

    logger.info('skill-creator', 'chat', {
      session_id: session.id,
      phase: session.phase,
      has_draft: !!session.draft,
      auto_review_attempts: reviewed.attempts,
      total_duration_ms: Date.now() - reqStartTs,
    });

    const visionResult = imageDescription ? { text: imageDescription, ...parseVisionResult(imageDescription) } : null;
    return c.json({ session_id: session.id, reply: finalParsed.reply, phase: session.phase, draft: session.draft, thinking: null, vision_result: visionResult, validation: validation ?? undefined });
  } catch (err) {
    logger.error('skill-creator', 'chat_error', {
      error: String(err),
      stack: (err as Error).stack?.slice(0, 500),
      elapsed_ms: Date.now() - reqStartTs,
    });
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
    assets?: Array<{ filename: string; content: string }>;
    version_no?: number; // 指定写入的版本号（编辑模式下直接更新该版本，而非创建新版本）
    test_cases?: Array<{
      input: string;
      assertions: Array<{ type: string; value: string }>;
      persona_id?: string;
    }>;
  }>();

  if (!body.skill_name || !body.skill_md) {
    return c.json({ error: 'skill_name 和 skill_md 不能为空' }, 400);
  }

  if (!SKILL_NAME_RE.test(body.skill_name)) {
    return c.json({ error: 'skill_name 必须是 kebab-case 格式（如 my-skill）' }, 400);
  }

  const referencesValidation = z.array(referenceSchema).safeParse(body.references ?? []);
  if (!referencesValidation.success) {
    return c.json({ error: `references 非法: ${referencesValidation.error.issues[0]?.message ?? '未知错误'}` }, 400);
  }

  const assetsValidation = z.array(assetSchema).safeParse(body.assets ?? []);
  if (!assetsValidation.success) {
    return c.json({ error: `assets 非法: ${assetsValidation.error.issues[0]?.message ?? '未知错误'}` }, 400);
  }

  const duplicateRef = (() => {
    const seen = new Set<string>();
    for (const ref of referencesValidation.data) {
      if (seen.has(ref.filename)) return ref.filename;
      seen.add(ref.filename);
    }
    return null;
  })();
  if (duplicateRef) {
    return c.json({ error: `references 中存在重复文件名: ${duplicateRef}` }, 400);
  }

  const testCasesValidation = z.array(testCaseSchema).max(5).safeParse(body.test_cases ?? []);
  if (!testCasesValidation.success) {
    return c.json({ error: `test_cases 非法: ${testCasesValidation.error.issues[0]?.message ?? '未知错误'}` }, 400);
  }

  // ── 工具状态门禁：检查 SKILL.md 中引用的 MCP 工具 ──
  const toolAnnotations = body.skill_md.match(/%% tool:(\w+)/g) ?? [];
  const referencedTools = [...new Set(toolAnnotations.map(a => a.replace('%% tool:', '')))];

  const toolWarnings: Array<{ tool: string; status: string; message: string }> = [];
  if (referencedTools.length > 0) {
    const allTools = getToolsOverview();
    const toolMap = new Map(allTools.map(t => [t.name, t]));

    for (const toolName of referencedTools) {
      const info = toolMap.get(toolName);
      if (!info) {
        toolWarnings.push({ tool: toolName, status: 'missing', message: `工具 "${toolName}" 未注册，请在 MCP 管理中创建后再发布` });
      } else if (info.status === 'planned') {
        toolWarnings.push({ tool: toolName, status: 'planned', message: `工具 "${toolName}" 处于 planned 状态（来源: ${info.source}），运行时不可用` });
      } else if (info.status === 'disabled') {
        toolWarnings.push({ tool: toolName, status: 'disabled', message: `工具 "${toolName}" 已被禁用（来源: ${info.source}），运行时不可用` });
      }
      // available → 无 warning
    }
  }

  // ── 结构化校验门禁 ──
  const draftValidation = runValidation({
    skill_name: body.skill_name,
    skill_md: body.skill_md,
    references: referencesValidation.data.map(r => ({ filename: r.filename })),
    assets: assetsValidation.data.map(a => ({ filename: a.filename })),
    registered_tools: getToolsOverview().map(t => t.name),
  });
  if (!draftValidation.valid) {
    const errorSummary = draftValidation.errors.map(e => `[${e.rule}] ${e.message}`).join('; ');
    logger.warn('skill-creator', 'save_validation_failed', {
      skill: body.skill_name,
      errors: draftValidation.errors.length,
      warnings: draftValidation.warnings.length,
      error_details: draftValidation.errors.map(e => ({ rule: e.rule, message: e.message, location: e.location })),
    });
    return c.json({
      error: `技能校验未通过（${draftValidation.errors.length} 项错误）：${errorSummary}`,
      validation_errors: draftValidation.errors,
      validation_warnings: draftValidation.warnings,
    }, 422);
  }

  const reg = getSkillRegistry(body.skill_name);
  const isNew = !reg;

  try {
    // 创建新版本到 .versions/ 目录（不写 biz-skills/ 主目录）
    const refs = referencesValidation.data.map((r: { filename: string; content: string }) => ({
      filename: r.filename, content: r.content,
    }));

    const assets = assetsValidation.data.map((a: { filename: string; content: string }) => ({
      filename: a.filename, content: a.content,
    }));

    let savedVersionNo = 1; // tracks which version was actually saved
    if (isNew) {
      // 全新技能 → 创建 v1（写入 .versions/ 目录）
      savedVersionNo = 1;
      await createNewSkillVersion(
        body.skill_name, body.skill_md, refs,
        '通过技能创建器新建', 'skill-creator',
      );
      // 同时写入 biz-skills/ 主目录，确保技能列表能读到
      const skillDir = join(SKILLS_DIR, body.skill_name);
      if (!existsSync(skillDir)) mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, 'SKILL.md'), body.skill_md, 'utf-8');
      const refsDir = join(skillDir, 'references');
      if (refs.length > 0 && !existsSync(refsDir)) mkdirSync(refsDir, { recursive: true });
      for (const ref of refs) {
        writeFileSync(join(refsDir, ref.filename), ref.content, 'utf-8');
      }
      const assetsDir = join(skillDir, 'assets');
      if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });
      for (const asset of assets) {
        writeFileSync(join(assetsDir, asset.filename), asset.content, 'utf-8');
      }
    } else {
      const { writeVersionFile } = await import('./version-manager');

      if (body.version_no) {
        // 指定了版本号 → 直接更新该版本的文件（不创建新版本）
        savedVersionNo = body.version_no;
        await writeVersionFile(body.skill_name, body.version_no, 'SKILL.md', body.skill_md);
        for (const ref of refs) {
          await writeVersionFile(body.skill_name, body.version_no, `references/${ref.filename}`, ref.content);
        }
        for (const asset of assets) {
          await writeVersionFile(body.skill_name, body.version_no, `assets/${asset.filename}`, asset.content);
        }
        logger.info('skill-creator', 'save_to_version', { skill: body.skill_name, version_no: body.version_no });
      } else {
        // 未指定版本号 → 基于最新版本创建新版本（兼容旧行为）
        const latestVersion = reg.latest_version ?? 1;
        const { versionNo } = await createVersionFrom(
          body.skill_name, latestVersion, '通过技能创建器编辑', 'skill-creator',
        );
        savedVersionNo = versionNo;
        await writeVersionFile(body.skill_name, versionNo, 'SKILL.md', body.skill_md);
        for (const ref of refs) {
          await writeVersionFile(body.skill_name, versionNo, `references/${ref.filename}`, ref.content);
        }
        for (const asset of assets) {
          await writeVersionFile(body.skill_name, versionNo, `assets/${asset.filename}`, asset.content);
        }
      }
    }

    if (body.session_id && sessions.has(body.session_id)) {
      sessions.get(body.session_id)!.phase = 'done';
    }

    // 写入测试用例（如果 LLM 生成了）
    if (testCasesValidation.data.length) {
      for (const tc of testCasesValidation.data) {
        const keywords = tc.assertions.filter(a => a.type === 'contains').map(a => a.value);
        await db.insert(testCases).values({
          skill_name: body.skill_name,
          input_message: tc.input,
          expected_keywords: JSON.stringify(keywords.length ? keywords : ['_placeholder_']),
          assertions: JSON.stringify(tc.assertions),
          persona_id: tc.persona_id ?? null,
        });
      }
      logger.info('skill-creator', 'test_cases_saved', { skill: body.skill_name, count: testCasesValidation.data.length });
    }

    // 同步元数据到 DB
    syncSkillMetadata(body.skill_name, body.skill_md);
    refreshSkillsCache();

    // Compile workflow spec (non-blocking, warnings only)
    // savedVersionNo tracks the actual version that was saved above
    try {
      const { compileWorkflow } = await import('../engine-stubs');
      const compileResult = compileWorkflow(body.skill_md, body.skill_name, savedVersionNo);
      if (compileResult.spec) {
        const { skillWorkflowSpecs } = await import('../db');
        const { eq: eqSpec, and: andSpec } = await import('drizzle-orm');
        const specJson = JSON.stringify(compileResult.spec);
        db.delete(skillWorkflowSpecs)
          .where(andSpec(eqSpec(skillWorkflowSpecs.skill_id, body.skill_name), eqSpec(skillWorkflowSpecs.version_no, savedVersionNo)))
          .run();
        db.insert(skillWorkflowSpecs).values({
          skill_id: body.skill_name,
          version_no: savedVersionNo,
          status: 'draft',
          spec_json: specJson,
        }).run();
      }
      if (compileResult.warnings.length > 0) {
        logger.info('skill-creator', 'compile_warnings', { skill: body.skill_name, warnings: compileResult.warnings });
      }
    } catch (e) {
      logger.warn('skill-creator', 'compile_error', { skill: body.skill_name, error: String(e) });
    }

    const allToolsReady = toolWarnings.length === 0;
    logger.info('skill-creator', 'saved', {
      skill_name: body.skill_name, is_new: isNew,
      ref_count: refs.length, test_cases: testCasesValidation.data.length,
      tools_ready: allToolsReady, tool_warnings: toolWarnings.length,
    });

    return c.json({
      ok: true,
      skill_id: body.skill_name,
      is_new: isNew,
      test_cases_count: testCasesValidation.data.length,
      // 工具就绪状态
      tools_ready: allToolsReady,
      tool_warnings: toolWarnings,
    });
  } catch (err) {
    logger.error('skill-creator', 'save_error', { error: String(err) });
    return c.json({ error: `保存失败: ${String(err)}` }, 500);
  }
});

export default skillCreator;

// ── 导出纯函数供单元测试使用 ────────────────────────────────────────────────
export const _testOnly = {
  stripJsonFences,
  extractJsonCandidates,
  dedupeReferences,
  parseSkillCreatorResponse,
};
