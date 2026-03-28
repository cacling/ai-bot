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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { generateText } from 'ai';
import { z } from 'zod';
import { chatModel } from '../../../engine/llm';
// Edits now write directly to .versions/ files via PUT /api/files/content
import { logger } from '../../../services/logger';
import { requireRole } from '../../../services/auth';

import { BIZ_SKILLS_DIR as SKILLS_DIR } from '../../../services/paths';

const CLARIFY_FORCE_CHOICE_TURN = 3;
const CLARIFY_BLOCK_TURN = 4;

// ── 构建技能索引 ──────────────────────────────────────────────────────────────

function loadSkillIndex(): Array<{ name: string; path: string; summary: string }> {
  const skills: Array<{ name: string; path: string; summary: string }> = [];
  try {
    const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const dir of dirs) {
      const skillMd = join(SKILLS_DIR, dir.name, 'SKILL.md');
      if (existsSync(skillMd)) {
        const content = readFileSync(skillMd, 'utf-8');
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

function listSkillReferences(skillName: string): string[] {
  const refDir = join(SKILLS_DIR, skillName, 'references');
  try {
    return readdirSync(refDir).filter(name => name.endsWith('.md'));
  } catch {
    return [];
  }
}

async function readSkillContent(skillName: string, fileName = 'SKILL.md'): Promise<string> {
  const path = join(SKILLS_DIR, skillName, fileName);
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return `Error: 文件不存在 ${path}`;
  }
}

async function readReferenceContent(skillName: string, refName: string): Promise<string> {
  const path = join(SKILLS_DIR, skillName, 'references', refName);
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return `Error: 文件不存在 ${path}`;
  }
}

type ClarifyStatus = 'need_clarify' | 'ready' | 'blocked';
type ClarifyPhase = 'scope_check' | 'target_confirm' | 'change_confirm' | 'impact_confirm' | 'ready' | 'blocked';

const clarifyOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().default(''),
});

const clarifySummarySchema = z.object({
  target_skill: z.string().nullable().default(null),
  change_type: z.enum(['wording', 'param', 'flow', 'branch', 'new_step', 'capability_boundary']).default('wording'),
  change_summary: z.string().default(''),
  affected_area: z.array(z.string()).default([]),
  unchanged_area: z.array(z.string()).default([]),
  related_docs: z.array(z.string()).default([]),
  acceptance_signal: z.string().default(''),
  risk_level: z.enum(['low', 'medium', 'high']).default('low'),
});

const clarifyEvidenceSchema = z.object({
  explicit: z.array(z.string()).default([]),
  inferred: z.array(z.string()).default([]),
  repo_observations: z.array(z.string()).default([]),
});

const clarifyImpactSchema = z.object({
  needs_reference_update: z.boolean().default(false),
  needs_workflow_change: z.boolean().default(false),
  needs_channel_review: z.boolean().default(false),
  needs_human_escalation_review: z.boolean().default(false),
  out_of_scope_reason: z.string().default(''),
});

const clarifyHandoffSchema = z.object({
  ready_for_edit: z.boolean().default(false),
  target_files: z.array(z.string()).default([]),
  edit_invariants: z.array(z.string()).default([]),
});

const clarifyResponseSchema = z.object({
  status: z.enum(['need_clarify', 'ready', 'blocked']),
  phase: z.enum(['scope_check', 'target_confirm', 'change_confirm', 'impact_confirm', 'ready', 'blocked']).default('scope_check'),
  question: z.string().default(''),
  options: z.array(clarifyOptionSchema).default([]),
  missing: z.array(z.string()).default([]),
  summary: clarifySummarySchema.default({
    target_skill: null,
    change_type: 'wording',
    change_summary: '',
    affected_area: [],
    unchanged_area: [],
    related_docs: [],
    acceptance_signal: '',
    risk_level: 'low',
  }),
  evidence: clarifyEvidenceSchema.default({
    explicit: [],
    inferred: [],
    repo_observations: [],
  }),
  impact: clarifyImpactSchema.default({
    needs_reference_update: false,
    needs_workflow_change: false,
    needs_channel_review: false,
    needs_human_escalation_review: false,
    out_of_scope_reason: '',
  }),
  handoff: clarifyHandoffSchema.default({
    ready_for_edit: false,
    target_files: [],
    edit_invariants: [],
  }),
  message: z.string().optional(),
});

type ClarifyPayload = z.infer<typeof clarifyResponseSchema>;

interface ClarifySession {
  id: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  lastClarify: ClarifyPayload | null;
  latestInstruction: string;
  createdAt: number;
}

interface ClarifyRepoSnapshot {
  skill_name: string;
  references: string[];
  tool_refs: string[];
  skill_excerpt: string;
  matched_reference: {
    name: string;
    excerpt: string;
  } | null;
}

interface ClarifyCapabilitySignal {
  suggests_new_capability: boolean;
  labels: string[];
  matching_registered_tools: string[];
}

interface ClarifyRuntimeContext {
  likely_target_skill: string | null;
  target_skill_confidence: 'low' | 'medium' | 'high';
  candidate_options: Array<{ id: string; label: string; description: string }>;
  repo_snapshot: ClarifyRepoSnapshot | null;
  capability: ClarifyCapabilitySignal;
}

const clarifySessions = new Map<string, ClarifySession>();

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of clarifySessions.entries()) {
    if (now - session.createdAt > 3600_000) clarifySessions.delete(id);
  }
}, 300_000);

function stripJsonFences(text: string): string {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function normalizeClarifyResponse(rawText: string): ClarifyPayload {
  const cleaned = stripJsonFences(rawText);
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  if (typeof parsed.is_complete === 'boolean') {
    const intent = (parsed.parsed_intent as Record<string, unknown> | undefined) ?? {};
    const targetSkill = typeof intent.target_skill === 'string' ? intent.target_skill : null;
    const changeType = typeof intent.change_type === 'string' ? intent.change_type : 'wording';
    const details = typeof intent.details === 'string' ? intent.details : '';
    const riskLevel = intent.risk_level === 'medium' || intent.risk_level === 'high' ? intent.risk_level : 'low';
    const missing = Array.isArray(parsed.missing_items) ? parsed.missing_items.filter((item): item is string => typeof item === 'string') : [];
    return clarifyResponseSchema.parse({
      status: parsed.is_complete ? 'ready' : 'need_clarify',
      phase: parsed.is_complete ? 'ready' : (targetSkill ? 'change_confirm' : 'target_confirm'),
      question: typeof parsed.clarify_question === 'string' ? parsed.clarify_question : '',
      missing,
      summary: {
        target_skill: targetSkill,
        change_type: changeType,
        change_summary: details,
        affected_area: [],
        unchanged_area: [],
        related_docs: [],
        acceptance_signal: '',
        risk_level: riskLevel,
      },
      handoff: {
        ready_for_edit: !!parsed.is_complete,
        target_files: targetSkill ? [`skills/biz-skills/${targetSkill}/SKILL.md`] : [],
        edit_invariants: [],
      },
    });
  }

  return clarifyResponseSchema.parse(parsed);
}

function toLegacyParsedIntent(payload: ClarifyPayload) {
  return {
    target_skill: payload.summary.target_skill,
    change_type: payload.summary.change_type === 'capability_boundary' ? 'new_step' : payload.summary.change_type,
    details: payload.summary.change_summary,
    risk_level: payload.summary.risk_level,
  };
}

function buildClarifyContext(session: ClarifySession | null): string {
  return JSON.stringify({
    session_id: session?.id ?? null,
    current_phase: session?.lastClarify?.phase ?? 'scope_check',
    last_status: session?.lastClarify?.status ?? null,
    last_summary: session?.lastClarify?.summary ?? null,
  }, null, 2);
}

function buildClarifyAssistantNote(payload: ClarifyPayload): string {
  if (payload.status === 'ready') return `READY\n${JSON.stringify(payload.summary)}`;
  if (payload.status === 'blocked') return `BLOCKED\n${payload.message ?? payload.question}`;
  return payload.question || '需要继续澄清';
}

function buildEditInstructionFromSession(session: ClarifySession): string {
  const summary = session.lastClarify?.summary;
  const handoff = session.lastClarify?.handoff;
  if (!summary || !handoff?.ready_for_edit) return session.latestInstruction;

  return [
    '请根据以下已澄清需求生成精确替换方案：',
    JSON.stringify({
      target_skill: summary.target_skill,
      change_type: summary.change_type,
      change_summary: summary.change_summary,
      affected_area: summary.affected_area,
      unchanged_area: summary.unchanged_area,
      related_docs: summary.related_docs,
      acceptance_signal: summary.acceptance_signal,
      risk_level: summary.risk_level,
      target_files: handoff.target_files,
      edit_invariants: handoff.edit_invariants,
    }, null, 2),
  ].join('\n');
}

function readSkillContentSync(skillName: string, fileName = 'SKILL.md'): string | null {
  const path = join(SKILLS_DIR, skillName, fileName);
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

function countUserTurns(history: Array<{ role: 'user' | 'assistant'; content: string }>): number {
  return history.filter(item => item.role === 'user').length;
}

function normalizeSingleQuestion(question: string): string {
  const firstLine = question.split('\n').map(line => line.trim()).find(Boolean) ?? '';
  if (!firstLine) return '';

  const zhIdx = firstLine.indexOf('？');
  const enIdx = firstLine.indexOf('?');
  const cutAt = [zhIdx, enIdx].filter(idx => idx >= 0).sort((a, b) => a - b)[0];
  if (cutAt !== undefined) return firstLine.slice(0, cutAt + 1).trim();

  const sentenceIdx = firstLine.indexOf('。');
  if (sentenceIdx >= 0) return firstLine.slice(0, sentenceIdx + 1).trim();

  return firstLine;
}

function buildClarifyTextFingerprint(session: ClarifySession | null, instruction: string): string {
  return [
    session?.latestInstruction ?? '',
    instruction,
    ...(session?.lastClarify?.evidence.explicit ?? []),
    ...(session?.lastClarify?.evidence.inferred ?? []),
  ].join(' ').toLowerCase();
}

function scoreSkillCandidate(text: string, skill: { name: string; summary: string }): number {
  let score = 0;
  if (text.includes(skill.name.toLowerCase())) score += 10;

  const skillTokens = skill.name.toLowerCase().split(/[-_\s]+/).filter(Boolean);
  for (const token of skillTokens) {
    if (token.length >= 3 && text.includes(token)) score += 2;
  }

  const summaryTokens = skill.summary.toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/).filter(token => token.length >= 2);
  for (const token of summaryTokens.slice(0, 20)) {
    if (text.includes(token)) score += 1;
  }

  return score;
}

function buildScoredSkillCandidates(skillIndex: Array<{ name: string; path: string; summary: string }>, text: string) {
  return skillIndex
    .map(skill => ({ skill, score: scoreSkillCandidate(text, skill) }))
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));
}

function buildTargetSkillOptions(skillIndex: Array<{ name: string; path: string; summary: string }>, text: string) {
  return buildScoredSkillCandidates(skillIndex, text)
    .slice(0, 3)
    .map(({ skill }) => ({
      id: skill.name,
      label: skill.name,
      description: skill.summary.slice(0, 60),
    }));
}

function resolveLikelyTargetSkill(skillIndex: Array<{ name: string; path: string; summary: string }>, text: string): {
  skillName: string | null;
  confidence: 'low' | 'medium' | 'high';
  options: Array<{ id: string; label: string; description: string }>;
} {
  const ranked = buildScoredSkillCandidates(skillIndex, text);
  const top = ranked[0];
  const runnerUp = ranked[1];
  if (!top || top.score <= 0) {
    return { skillName: null, confidence: 'low', options: [] };
  }

  const scoreGap = top.score - (runnerUp?.score ?? 0);
  const confidence = top.score >= 10 || scoreGap >= 6
    ? 'high'
    : top.score >= 6 || scoreGap >= 3
      ? 'medium'
      : 'low';

  return {
    skillName: confidence === 'low' ? null : top.skill.name,
    confidence,
    options: ranked.slice(0, 3).map(({ skill }) => ({
      id: skill.name,
      label: skill.name,
      description: skill.summary.slice(0, 60),
    })),
  };
}

function extractToolRefs(content: string): string[] {
  return mergeUnique(
    Array.from(content.matchAll(/%% tool:([a-zA-Z0-9_-]+)/g), match => match[1] ?? ''),
  );
}

function buildExcerpt(content: string, maxLength = 900): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function scoreReferenceCandidate(text: string, refName: string): number {
  const loweredRef = refName.toLowerCase();
  let score = 0;
  if (text.includes(loweredRef)) score += 8;

  const base = loweredRef.replace(/\.md$/i, '');
  const tokens = base.split(/[-_\s]+/).filter(token => token.length >= 3);
  for (const token of tokens) {
    if (text.includes(token)) score += 2;
  }

  if (/(reference|references|文档|规则|指引|policy|ref)/i.test(text) && loweredRef.endsWith('.md')) {
    score += 1;
  }

  return score;
}

function buildRepoSnapshot(skillName: string, instruction: string): ClarifyRepoSnapshot | null {
  const skillContent = readSkillContentSync(skillName);
  if (!skillContent) return null;

  const references = listSkillReferences(skillName);
  const loweredInstruction = instruction.toLowerCase();
  const matchedRef = references
    .map(ref => ({ ref, score: scoreReferenceCandidate(loweredInstruction, ref) }))
    .sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref))[0];

  const matchedReference = matchedRef && (matchedRef.score >= 4 || (references.length === 1 && /(reference|references|文档|规则|指引|policy|ref)/i.test(loweredInstruction)))
    ? readSkillContentSync(skillName, join('references', matchedRef.ref))
    : null;

  return {
    skill_name: skillName,
    references,
    tool_refs: extractToolRefs(skillContent),
    skill_excerpt: buildExcerpt(skillContent),
    matched_reference: matchedReference
      ? {
          name: matchedRef!.ref,
          excerpt: buildExcerpt(matchedReference, 600),
        }
      : null,
  };
}

const CAPABILITY_RULES = [
  {
    label: '退款/退费',
    trigger: /(退款|退费|refund)/i,
    tool_keywords: ['refund', '退款', '退费'],
  },
  {
    label: '退订/取消',
    trigger: /(退订|取消业务|取消服务|cancel|unsubscribe|销户)/i,
    tool_keywords: ['cancel', 'unsubscribe', 'terminate', '退订', '取消'],
  },
  {
    label: '开通/办理',
    trigger: /(开通|办理|订购|subscribe|activate|升级套餐|变更套餐)/i,
    tool_keywords: ['activate', 'subscribe', 'order', '开通', '办理', 'plan'],
  },
  {
    label: '充值/支付',
    trigger: /(充值|支付|缴费|payment|recharge|扣款)/i,
    tool_keywords: ['payment', 'pay', 'recharge', 'charge', '充值', '支付'],
  },
  {
    label: '派单/工单',
    trigger: /(工单|派单|workorder|ticket|回访|callback)/i,
    tool_keywords: ['ticket', 'workorder', 'callback', 'task', '工单', '回访'],
  },
];

function analyzeCapabilityIntent(text: string): { suggestsNewCapability: boolean; labels: string[]; toolKeywords: string[] } {
  const loweredText = text.toLowerCase();
  const labels: string[] = [];
  const toolKeywords: string[] = [];

  for (const rule of CAPABILITY_RULES) {
    if (!rule.trigger.test(text)) continue;
    labels.push(rule.label);
    toolKeywords.push(...rule.tool_keywords);
  }

  const boundaryHint = /(新增|增加|接入|打通|自动|直接|实现|支持|系统能力|新工具|接口)/i.test(text);
  const suggestsNewCapability = boundaryHint && labels.length > 0;

  return {
    suggestsNewCapability,
    labels: mergeUnique(labels),
    toolKeywords: mergeUnique(toolKeywords.map(keyword => keyword.toLowerCase()).filter(keyword => loweredText.includes(keyword) || /[a-z]/.test(keyword))),
  };
}

let cachedToolsOverview: Array<{ name: string; description: string; status: string; skills: string[] }> | null = null;

async function loadToolsOverviewSafe(): Promise<Array<{ name: string; description: string; status: string; skills: string[] }>> {
  if (cachedToolsOverview && cachedToolsOverview.length > 0) return cachedToolsOverview;
  try {
    const mod = await import('../mcp/tools-overview');
    const overview = mod.getToolsOverview().map((tool: { name: string; description: string; status: string; skills: string[] }) => ({
      name: tool.name,
      description: tool.description,
      status: tool.status,
      skills: tool.skills,
    }));
    cachedToolsOverview = overview.length > 0 ? overview : null;
    return overview;
  } catch {
    return [];
  }
}

function matchRegisteredTools(
  toolsOverview: Array<{ name: string; description: string; status: string; skills: string[] }>,
  keywords: string[],
) {
  const loweredKeywords = keywords.map(keyword => keyword.toLowerCase()).filter(Boolean);
  if (loweredKeywords.length === 0) return [];

  return mergeUnique(
    toolsOverview
      .filter(tool => tool.status === 'available')
      .filter(tool => {
        const haystack = `${tool.name} ${tool.description}`.toLowerCase();
        return loweredKeywords.some(keyword => haystack.includes(keyword));
      })
      .map(tool => tool.name),
  );
}

async function buildClarifyRuntimeContext(params: {
  session: ClarifySession | null;
  instruction: string;
  skillIndex: Array<{ name: string; path: string; summary: string }>;
}): Promise<ClarifyRuntimeContext> {
  const textFingerprint = buildClarifyTextFingerprint(params.session, params.instruction);
  const targetCandidate = resolveLikelyTargetSkill(params.skillIndex, textFingerprint);
  const repoSnapshot = targetCandidate.skillName
    ? buildRepoSnapshot(targetCandidate.skillName, params.instruction)
    : null;
  const capabilityIntent = analyzeCapabilityIntent(`${params.instruction}\n${params.session?.latestInstruction ?? ''}`);
  const matchingTools = capabilityIntent.suggestsNewCapability
    ? matchRegisteredTools(await loadToolsOverviewSafe(), capabilityIntent.toolKeywords)
    : [];

  return {
    likely_target_skill: targetCandidate.skillName,
    target_skill_confidence: targetCandidate.confidence,
    candidate_options: targetCandidate.options,
    repo_snapshot: repoSnapshot,
    capability: {
      suggests_new_capability: capabilityIntent.suggestsNewCapability,
      labels: capabilityIntent.labels,
      matching_registered_tools: matchingTools,
    },
  };
}

function inferDesiredPhase(payload: ClarifyPayload, bundledHint: boolean): ClarifyPhase {
  if (payload.status === 'blocked' || payload.summary.change_type === 'capability_boundary' || !!payload.impact.out_of_scope_reason) {
    return 'blocked';
  }
  if (bundledHint) return 'scope_check';
  if (!payload.summary.target_skill) return 'target_confirm';
  if (!payload.summary.change_summary || payload.summary.affected_area.length === 0) return 'change_confirm';

  const needsImpactReview = (
    payload.summary.unchanged_area.length === 0
    || !payload.summary.acceptance_signal
    || (payload.summary.risk_level !== 'low' && (
      payload.impact.needs_reference_update
      || payload.impact.needs_workflow_change
      || payload.impact.needs_channel_review
      || payload.impact.needs_human_escalation_review
      || payload.summary.related_docs.length === 0
    ))
  );

  return needsImpactReview ? 'impact_confirm' : 'ready';
}

function mergeUnique(values: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const value of values.map(v => v.trim()).filter(Boolean)) {
    if (seen.has(value)) continue;
    seen.add(value);
    merged.push(value);
  }
  return merged;
}

function applyClarifyGates(params: {
  payload: ClarifyPayload;
  session: ClarifySession | null;
  instruction: string;
  skillIndex: Array<{ name: string; path: string; summary: string }>;
  runtimeContext: ClarifyRuntimeContext;
}): ClarifyPayload {
  const payload = structuredClone(params.payload) as ClarifyPayload;
  const textFingerprint = buildClarifyTextFingerprint(params.session, params.instruction);
  const turnCount = countUserTurns(params.session?.history ?? []) + 1;
  const bundledHint = /(同时|顺便|另外|并且|再把|再加|一并|还有)/.test(textFingerprint);

  payload.question = normalizeSingleQuestion(payload.question);

  if (!payload.summary.target_skill && params.runtimeContext.likely_target_skill && params.runtimeContext.target_skill_confidence === 'high') {
    payload.evidence.inferred = mergeUnique([
      ...payload.evidence.inferred,
      `请求高置信指向技能 ${params.runtimeContext.likely_target_skill}`,
    ]);
  }

  if (params.runtimeContext.repo_snapshot) {
    const snapshot = params.runtimeContext.repo_snapshot;
    const repoFacts = [
      snapshot.tool_refs.length > 0
        ? `已读取 ${snapshot.skill_name}/SKILL.md，现有工具：${snapshot.tool_refs.join(', ')}`
        : `已读取 ${snapshot.skill_name}/SKILL.md，当前未标注工具节点`,
      snapshot.references.length > 0
        ? `已读取 ${snapshot.skill_name} 的 references 列表：${snapshot.references.join(', ')}`
        : `已读取 ${snapshot.skill_name} 的 references 列表：当前无 reference 文件`,
    ];
    if (snapshot.matched_reference) {
      repoFacts.push(`已读取 reference ${snapshot.matched_reference.name}`);
    }
    payload.evidence.repo_observations = mergeUnique([
      ...payload.evidence.repo_observations,
      ...repoFacts,
    ]);
  }

  if (params.runtimeContext.capability.suggests_new_capability) {
    payload.summary.risk_level = 'high';
    payload.handoff.edit_invariants = mergeUnique([
      ...payload.handoff.edit_invariants,
      '不要臆造未注册的新工具',
    ]);

    const capabilityLabel = params.runtimeContext.capability.labels.join('、') || '新增系统能力';
    if (params.runtimeContext.capability.matching_registered_tools.length === 0) {
      payload.impact.out_of_scope_reason = payload.impact.out_of_scope_reason
        || `当前没有找到支持${capabilityLabel}的已注册工具，这更像新增系统能力，不适合直接进入 skill edit。`;
    } else {
      payload.evidence.repo_observations = mergeUnique([
        ...payload.evidence.repo_observations,
        `工具概览中找到可能相关的已注册工具：${params.runtimeContext.capability.matching_registered_tools.join(', ')}`,
      ]);
      if (params.runtimeContext.repo_snapshot) {
        const missingInSkill = params.runtimeContext.capability.matching_registered_tools.filter(
          toolName => !params.runtimeContext.repo_snapshot!.tool_refs.includes(toolName),
        );
        if (missingInSkill.length > 0) {
          payload.missing = mergeUnique([
            ...payload.missing,
            '能力边界确认',
          ]);
          payload.evidence.repo_observations = mergeUnique([
            ...payload.evidence.repo_observations,
            `目标技能当前未引用这些相关工具：${missingInSkill.join(', ')}`,
          ]);
        }
      }
    }
  }

  if (payload.summary.target_skill) {
    const refs = listSkillReferences(payload.summary.target_skill);
    if (refs.length > 0) {
      payload.evidence.repo_observations = mergeUnique([
        ...payload.evidence.repo_observations,
        `目标技能 ${payload.summary.target_skill} 当前包含 ${refs.length} 个 reference：${refs.join(', ')}`,
      ]);
    }
    if (payload.handoff.target_files.length === 0) {
      payload.handoff.target_files = [`skills/biz-skills/${payload.summary.target_skill}/SKILL.md`];
    }
  }

  const desiredPhase = inferDesiredPhase(payload, bundledHint);
  if (desiredPhase === 'blocked') {
    payload.status = 'blocked';
    payload.phase = 'blocked';
    payload.handoff.ready_for_edit = false;
    payload.message = payload.message || payload.impact.out_of_scope_reason || '这次需求更像新增能力或超出普通技能编辑范围，建议先拆分或重新定义边界。';
    payload.question = payload.question || '这次需求超出了普通技能编辑范围，请先明确是要新增系统能力，还是只修改现有技能内容？';
    payload.missing = mergeUnique([...payload.missing, 'skill edit scope']);
    return payload;
  }

  if (desiredPhase !== 'ready') {
    payload.status = 'need_clarify';
    payload.phase = desiredPhase;
    payload.handoff.ready_for_edit = false;
  } else {
    payload.status = 'ready';
    payload.phase = 'ready';
    payload.handoff.ready_for_edit = true;
    payload.question = '';
    payload.missing = [];
  }

  if (payload.status === 'need_clarify') {
    const synthesizedMissing: string[] = [];
    if (bundledHint) synthesizedMissing.push('需要先确定这次优先处理哪一个改动包');
    if (!payload.summary.target_skill) synthesizedMissing.push('目标技能');
    if (!payload.summary.change_summary) synthesizedMissing.push('具体改动内容');
    if (payload.summary.affected_area.length === 0) synthesizedMissing.push('改动影响区域');
    if (payload.summary.unchanged_area.length === 0) synthesizedMissing.push('保持不变的范围');
    if (!payload.summary.acceptance_signal) synthesizedMissing.push('验收信号');
    if (payload.summary.risk_level !== 'low' && payload.summary.related_docs.length === 0) synthesizedMissing.push('关联文档影响');
    if (params.runtimeContext.capability.suggests_new_capability && params.runtimeContext.capability.matching_registered_tools.length > 0) {
      synthesizedMissing.push('能力边界确认');
    }
    payload.missing = mergeUnique([...payload.missing, ...synthesizedMissing]);
  }

  if (payload.phase === 'scope_check') {
    payload.question = payload.question || '你这次想先处理哪一类改动？';
    if (payload.options.length === 0) {
      payload.options = [
        { id: 'wording', label: '先改话术', description: '只改回复口径，不动流程' },
        { id: 'flow', label: '先改流程', description: '调整节点、分支或升级条件' },
        { id: 'docs', label: '先改文档', description: '先改 reference 或说明文档' },
      ];
    }
  }

  if (payload.phase === 'target_confirm' && payload.options.length === 0) {
    payload.options = buildTargetSkillOptions(params.skillIndex, textFingerprint);
    payload.question = payload.question || '为了继续，请先确认要修改哪个技能。';
  }

  if (payload.phase === 'change_confirm' && !payload.question) {
    payload.question = '这次具体要改哪一段内容？是改话术、改参数，还是改流程分支？';
  }

  if (payload.phase === 'impact_confirm' && !payload.question) {
    if (payload.summary.unchanged_area.length === 0) {
      payload.question = '这次修改里，哪些部分明确不要动？';
    } else if (!payload.summary.acceptance_signal) {
      payload.question = '改完以后，什么结果算改对了？';
    } else if (params.runtimeContext.capability.suggests_new_capability && params.runtimeContext.capability.matching_registered_tools.length > 0) {
      payload.question = `这次是要复用现有 ${params.runtimeContext.capability.matching_registered_tools[0]} 工具新增流程，还是只调整现有技能话术/转人工规则？`;
    } else {
      payload.question = '这次是否需要同步修改 reference、升级规则或其他渠道逻辑？';
    }
  }

  if (turnCount >= CLARIFY_FORCE_CHOICE_TURN && payload.status === 'need_clarify') {
    if (!payload.summary.target_skill) {
      payload.phase = 'target_confirm';
      payload.question = '为了继续，请先从下面候选技能里选一个。';
      payload.options = buildTargetSkillOptions(params.skillIndex, textFingerprint);
    } else if (turnCount >= CLARIFY_BLOCK_TURN && payload.phase !== 'ready') {
      payload.status = 'blocked';
      payload.phase = 'blocked';
      payload.handoff.ready_for_edit = false;
      payload.message = '需求澄清已超过 3 轮，仍未收敛到可安全编辑的范围。请明确给出要改的节点、保持不变的范围，或拆成更小的修改请求。';
      payload.question = '请先明确这次只改哪一个节点/分支，以及哪些部分不要动。';
      payload.options = [];
    }
  }

  if (payload.status === 'ready') {
    payload.evidence.inferred = payload.evidence.inferred.filter(Boolean);
  }

  return payload;
}

const skillEdit = new Hono();

// ── POST /api/skill-clarify ──────────────────────────────────────────────────

const CLARIFY_SYSTEM = `你是技能管理场景下的“需求澄清控制器”，不是一次性 completeness classifier。

你的任务是把用户的修改请求推进到一个“可以安全编辑而不靠猜测”的状态。

工作规则：
1. 采用 phase 推进：scope_check -> target_confirm -> change_confirm -> impact_confirm -> ready；必要时可 blocked
2. 每轮只问 1 个最阻塞的问题，优先使用选择题
3. 发现 bundled request 时，先拆分或要求用户选优先级
4. 若 target skill 大概率明确，可调用 read_skill / list_skill_references / read_reference 获取证据
5. 必须区分：
   - explicit：用户明确说了什么
   - inferred：你推断了什么
   - repo_observations：你从仓库中读到了什么
6. 只有满足以下条件才允许 ready：
   - 已锁定一个目标技能
   - 已收敛为一个主要改动包
   - 已明确 changed area
   - 已明确 unchanged area，或至少给出可信边界
   - 已检查 related docs / workflow / escalation 影响
   - 该请求仍属于“编辑技能”，而不是“新增系统能力”
   - 已有至少一个 acceptance signal
7. 如果用户的请求本质上是能力边界变更、新工具需求、或多个无关改动混在一起且暂时无法拆开，返回 blocked，不要假装 ready

输出严格 JSON（不要代码围栏）：
{
  "status": "need_clarify | ready | blocked",
  "phase": "scope_check | target_confirm | change_confirm | impact_confirm | ready | blocked",
  "question": "本轮要问用户的唯一问题；ready 时可为空",
  "options": [{"id":"x","label":"展示给用户的短选项","description":"一句简短说明"}],
  "missing": ["仍缺什么"],
  "summary": {
    "target_skill": "string | null",
    "change_type": "wording | param | flow | branch | new_step | capability_boundary",
    "change_summary": "用户这次究竟要改什么",
    "affected_area": ["哪些节点/章节/文档会动"],
    "unchanged_area": ["哪些部分明确不动"],
    "related_docs": ["需要联动检查的 references"],
    "acceptance_signal": "什么结果算改对了",
    "risk_level": "low | medium | high"
  },
  "evidence": {
    "explicit": ["用户明确说过的话"],
    "inferred": ["模型推断但未明说的内容"],
    "repo_observations": ["从 read_skill/read_reference 得到的事实"]
  },
  "impact": {
    "needs_reference_update": true,
    "needs_workflow_change": false,
    "needs_channel_review": false,
    "needs_human_escalation_review": false,
    "out_of_scope_reason": ""
  },
  "handoff": {
    "ready_for_edit": false,
    "target_files": ["skills/biz-skills/x/SKILL.md"],
    "edit_invariants": ["哪些部分不要改"]
  },
  "message": "仅 blocked 时可用于解释原因"
}`;

skillEdit.post('/clarify', async (c) => {
  const body = await c.req.json<{
    instruction?: string;
    message?: string;
    session_id?: string;
    history?: Array<{ role: string; content: string }>;
  }>();

  const instruction = body.instruction?.trim() || body.message?.trim() || '';
  if (!instruction) {
    return c.json({ error: 'instruction 不能为空' }, 400);
  }

  const skillIndex = loadSkillIndex();
  const existingSession = body.session_id ? clarifySessions.get(body.session_id) ?? null : null;
  const runtimeContext = await buildClarifyRuntimeContext({
    session: existingSession,
    instruction,
    skillIndex,
  });
  const session = existingSession ?? {
    id: `se-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    history: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
    lastClarify: null,
    latestInstruction: '',
    createdAt: Date.now(),
  };

  const priorHistory = body.history?.length
    ? body.history.map(h => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      }))
    : session.history;

  const messages = [
    ...priorHistory,
    { role: 'user' as const, content: instruction },
  ];

  try {
    const { text } = await generateText({
      model: chatModel,
      system: CLARIFY_SYSTEM
        + `\n\n当前澄清上下文:\n${buildClarifyContext(existingSession)}`
        + `\n\n可用技能列表:\n${JSON.stringify(skillIndex, null, 2)}`
        + `\n\n自动仓库观察:\n${JSON.stringify(runtimeContext, null, 2)}`,
      messages,
      tools: {
        read_skill: {
          description: '读取指定技能的 SKILL.md 或其他文件，用于确认用户到底想改什么',
          parameters: {
            type: 'object' as const,
            properties: {
              skill_name: { type: 'string' as const, description: '技能名称' },
              file_name: { type: 'string' as const, description: '文件名，默认 SKILL.md' },
            },
            required: ['skill_name'],
          },
          execute: async (args: { skill_name: string; file_name?: string }) => readSkillContent(args.skill_name, args.file_name ?? 'SKILL.md'),
        },
        list_skill_references: {
          description: '列出目标技能当前已有的 reference 文件名，用于判断是否需要联动修改文档',
          parameters: {
            type: 'object' as const,
            properties: {
              skill_name: { type: 'string' as const, description: '技能名称' },
            },
            required: ['skill_name'],
          },
          execute: async (args: { skill_name: string }) => JSON.stringify(listSkillReferences(args.skill_name)),
        },
        read_reference: {
          description: '读取目标技能的 reference 文档内容',
          parameters: {
            type: 'object' as const,
            properties: {
              skill_name: { type: 'string' as const, description: '技能名称' },
              ref_name: { type: 'string' as const, description: 'reference 文件名' },
            },
            required: ['skill_name', 'ref_name'],
          },
          execute: async (args: { skill_name: string; ref_name: string }) => readReferenceContent(args.skill_name, args.ref_name),
        },
      },
      maxSteps: 4,
      temperature: 0,
    });

    const parsed = applyClarifyGates({
      payload: normalizeClarifyResponse(text),
      session: existingSession,
      instruction,
      skillIndex,
      runtimeContext,
    });
    const targetSkill = parsed.summary.target_skill;
    if (parsed.status === 'ready' && parsed.handoff.target_files.length === 0 && targetSkill) {
      parsed.handoff.target_files = [`skills/biz-skills/${targetSkill}/SKILL.md`];
    }
    if (parsed.status === 'ready') {
      parsed.handoff.ready_for_edit = true;
    }

    session.history = [...priorHistory, { role: 'user', content: instruction }, { role: 'assistant', content: buildClarifyAssistantNote(parsed) }];
    session.lastClarify = parsed;
    session.latestInstruction = instruction;
    session.createdAt = Date.now();
    clarifySessions.set(session.id, session);

    return c.json({
      session_id: session.id,
      status: parsed.status,
      phase: parsed.phase,
      question: parsed.question,
      missing: parsed.missing,
      missing_items: parsed.missing,
      options: parsed.options,
      summary: parsed.summary,
      evidence: parsed.evidence,
      impact: parsed.impact,
      handoff: parsed.handoff,
      message: parsed.message,
      parsed_intent: toLegacyParsedIntent(parsed),
    });
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
    instruction?: string;
    session_id?: string;
    target_skill?: string;
  }>();

  const session = body.session_id ? clarifySessions.get(body.session_id) ?? null : null;
  const instruction = body.instruction?.trim() || (session ? buildEditInstructionFromSession(session) : '');

  if (!instruction) {
    return c.json({ error: 'instruction 不能为空' }, 400);
  }

  const skillIndex = loadSkillIndex();

  try {
    const { text } = await generateText({
      model: chatModel,
      system: EDIT_SYSTEM + `\n\n可用技能列表:\n${JSON.stringify(skillIndex, null, 2)}`,
      messages: [{ role: 'user', content: instruction }],
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
          execute: async (args: { skill_name: string; file_name?: string }) => readSkillContent(args.skill_name, args.file_name ?? 'SKILL.md'),
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
      file_path: result.skill_path,
      old_fragment: result.old_fragment,
      new_fragment: result.new_fragment,
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
    file_path?: string;
    old_fragment: string;
    new_fragment: string;
    description?: string;
  }>();

  const skillPath = body.skill_path || body.file_path || '';

  if (!skillPath || !body.old_fragment || body.new_fragment === undefined) {
    return c.json({ error: '参数不完整' }, 400);
  }

  const { REPO_ROOT } = await import('../../../services/paths');
  const fullPath = resolve(REPO_ROOT, skillPath);
  let content: string;
  try {
    content = await readFile(fullPath, 'utf-8');
  } catch {
    return c.json({ error: `文件不存在: ${skillPath}` }, 404);
  }

  if (!content.includes(body.old_fragment)) {
    return c.json({ error: '文件内容已变更，old_fragment 不匹配，请重新生成' }, 409);
  }

  const newContent = content.replace(body.old_fragment, body.new_fragment);

  // Write directly to the file (which is in .versions/)
  const { writeFile } = await import('node:fs/promises');
  await writeFile(fullPath, newContent, 'utf-8');

  logger.info('skill-edit', 'applied', { path: skillPath });
  return c.json({ ok: true });
});

export default skillEdit;
