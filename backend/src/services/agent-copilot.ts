/**
 * agent-copilot.ts — Core service for the Agent Copilot card
 *
 * Combines keyword-based reply hints with LLM-powered conversation understanding
 * and RAG-powered knowledge base Q&A for human agents.
 *
 * Two main entry points:
 *   buildCopilotContext()  — auto-triggered on each customer message
 *   askKnowledgeBase()     — triggered by agent's manual question
 */

import { generateText } from 'ai';
import { chatModel } from '../engine/llm';
import {
  buildReplyHints as kmBuildReplyHints,
  buildCopilotContext as kmBuildCopilotContext,
  askKnowledgeBase as kmAskKnowledgeBase,
  type ReplyHints,
  type CopilotData,
  type KbAnswer,
} from './km-client';
import { logger } from './logger';

// ── Types ────────────────────────────────────────────────────────────────────

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

export interface KbAnswer {
  direct_answer: string;
  customer_facing_answer: string;
  cautions: string[];
  citations: Array<{ title: string; version: string }>;
  confidence: number;
  followup_suggestions: string[];
}

interface CopilotContextParams {
  message: string;
  phone: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  normalizedQuery?: string;
  intentHints?: string[];
}

interface KbAskParams {
  question: string;
  phone: string;
  conversationContext?: string;
}

// ── System prompts ───────────────────────────────────────────────────────────

const UNDERSTANDING_SYSTEM_PROMPT = `你是一个电信客服坐席辅助分析师。你的任务是分析客户与客服的对话，输出结构化的会话理解结果，帮助坐席快速理解当前局势。

你必须输出一个 JSON 对象，包含以下字段：
- current_summary: 一句话摘要当前客户问题（不超过50字）
- intent: 客户当前意图（如"查询套餐生效时间"、"投诉扣费异常"）
- risk_level: 风险等级（"low" | "medium" | "high"）
- emotion: 客户情绪（"平静" | "焦虑" | "不满" | "愤怒"）
- missing_slots: 当前缺失的关键信息列表（如["充值时间", "充值渠道"]）
- recommended_actions: 建议坐席下一步做什么（如["先核查充值到账状态", "确认号码当前状态"]）
- suggested_questions: 坐席可以主动问知识库的问题（2-3个，与当前场景相关）

只输出 JSON，不要输出其他内容。`;

const KB_ANSWER_SYSTEM_PROMPT = `你是一个电信客服知识库问答助手。坐席向你提问，你需要基于提供的知识片段回答。

你必须输出一个 JSON 对象，包含以下字段：
- direct_answer: 给坐席看的直接答案（解释性的，帮助坐席理解）
- customer_facing_answer: 建议给客户的话（可直接发送或稍作修改）
- cautions: 注意事项列表（如"不建议承诺具体恢复时间"）
- followup_suggestions: 继续追问建议（2-3个相关问题）

规则：
1. 如果知识片段不足以回答，在 direct_answer 中说明"当前暂无高置信答案"，并在 followup_suggestions 中建议补充哪些信息
2. 不要编造不在知识片段中的信息
3. customer_facing_answer 要用客服的口吻，礼貌专业

只输出 JSON，不要输出其他内容。`;

// ── buildCopilotContext ──────────────────────────────────────────────────────

export async function buildCopilotContext(params: CopilotContextParams): Promise<CopilotData | null> {
  const { message, phone, conversationHistory, normalizedQuery, intentHints } = params;
  const t0 = Date.now();

  try {
    // 1. Keyword-based reply hints (existing capability)
    const [hints, llmResult] = await Promise.all([
      buildReplyHints({ message, phone, normalizedQuery, intentHints }),
      generateConversationUnderstanding(message, conversationHistory ?? []),
    ]);

    // 2. Merge results
    const data = mergeCopilotData(hints, llmResult);

    logger.info('agent-copilot', 'context_built', {
      ms: Date.now() - t0,
      phone,
      hasHints: !!hints,
      confidence: data.summary.confidence.toFixed(2),
    });

    return data;
  } catch (err) {
    logger.error('agent-copilot', 'context_build_error', { error: String(err) });
    return null;
  }
}

// ── askKnowledgeBase ─────────────────────────────────────────────────────────

export async function askKnowledgeBase(params: KbAskParams): Promise<KbAnswer> {
  const { question, phone, conversationContext } = params;
  const t0 = Date.now();

  try {
    // 1. Retrieve top-k knowledge assets
    const knowledgeSnippets = await retrieveKnowledgeSnippets(question);

    if (knowledgeSnippets.length === 0) {
      return buildLowConfidenceAnswer();
    }

    // 2. Generate answer with LLM
    const snippetText = knowledgeSnippets
      .map((s, i) => `[知识${i + 1}] ${s.title}\n${s.content}`)
      .join('\n\n');

    const userPrompt = [
      conversationContext ? `当前对话背景：${conversationContext}\n` : '',
      `坐席提问：${question}\n`,
      `参考知识：\n${snippetText}`,
    ].join('\n');

    const { text: raw } = await generateText({
      model: chatModel,
      system: KB_ANSWER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 800,
      temperature: 0.3,
    });

    const parsed = safeParseJson<{
      direct_answer?: string;
      customer_facing_answer?: string;
      cautions?: string[];
      followup_suggestions?: string[];
    }>(raw);

    const confidence = knowledgeSnippets[0]?.confidence ?? 0;

    logger.info('agent-copilot', 'kb_answered', {
      ms: Date.now() - t0,
      phone,
      snippetCount: knowledgeSnippets.length,
      confidence: confidence.toFixed(2),
    });

    return {
      direct_answer: parsed?.direct_answer ?? '暂无答案',
      customer_facing_answer: parsed?.customer_facing_answer ?? '',
      cautions: parsed?.cautions ?? [],
      citations: knowledgeSnippets.map(s => ({ title: s.title, version: s.version })),
      confidence,
      followup_suggestions: parsed?.followup_suggestions ?? [],
    };
  } catch (err) {
    logger.error('agent-copilot', 'kb_ask_error', { error: String(err) });
    return buildLowConfidenceAnswer();
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

interface LlmUnderstanding {
  current_summary: string;
  intent: string;
  risk_level: string;
  emotion: string;
  missing_slots: string[];
  recommended_actions: string[];
  suggested_questions: string[];
}

async function generateConversationUnderstanding(
  message: string,
  history: Array<{ role: string; content: string }>,
): Promise<LlmUnderstanding | null> {
  try {
    const contextLines = history.slice(-6).map(
      h => `${h.role === 'user' ? '客户' : '客服'}：${h.content}`
    );

    const userPrompt = [
      contextLines.length > 0 ? `近期对话：\n${contextLines.join('\n')}\n` : '',
      `客户最新消息：「${message}」`,
    ].join('\n');

    const { text: raw } = await generateText({
      model: chatModel,
      system: UNDERSTANDING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 500,
      temperature: 0.2,
    });

    return safeParseJson<LlmUnderstanding>(raw);
  } catch (err) {
    logger.warn('agent-copilot', 'llm_understanding_error', { error: String(err) });
    return null;
  }
}

interface KnowledgeSnippet {
  title: string;
  version: string;
  content: string;
  confidence: number;
}

async function retrieveKnowledgeSnippets(query: string): Promise<KnowledgeSnippet[]> {
  // Reuse the existing keyword scoring from reply-copilot but retrieve top-3
  const assets = await db.select({
    assetId: kmAssets.id,
    title: kmAssets.title,
    versionId: kmAssetVersions.id,
    contentSnapshot: kmAssetVersions.content_snapshot,
    structuredSnapshot: kmAssetVersions.structured_snapshot_json,
  })
  .from(kmAssets)
  .innerJoin(kmAssetVersions, and(
    eq(kmAssetVersions.asset_id, kmAssets.id),
    eq(kmAssetVersions.version_no, kmAssets.current_version),
  ))
  .where(eq(kmAssets.status, 'online'));

  const withStructured = assets.filter(a => a.structuredSnapshot);
  if (withStructured.length === 0) return [];

  const queryText = query.toLowerCase();

  const scored = withStructured.map(a => {
    const structured = JSON.parse(a.structuredSnapshot!);
    let score = 0;

    // Scene label
    const label = (structured.scene?.label ?? '').toLowerCase();
    score += overlapScore(queryText, label) * 3;

    // Title
    score += overlapScore(queryText, (a.title ?? '').toLowerCase()) * 2;

    // Content Q + variants
    try {
      const content = JSON.parse(a.contentSnapshot ?? '{}');
      score += overlapScore(queryText, (content.q ?? '').toLowerCase()) * 2;
      const variants = Array.isArray(content.variants)
        ? content.variants.map((v: unknown) => String(v).toLowerCase())
        : [];
      const expandedQuestions = Array.isArray(structured.expanded_questions)
        ? structured.expanded_questions.map((v: unknown) => String(v).toLowerCase())
        : [];
      score += bestOverlapScore(queryText, variants.length > 0 ? variants : expandedQuestions) * 3;
    } catch { /* ignore */ }

    // Retrieval tags
    const tags: string[] = structured.retrieval_tags ?? [];
    for (const tag of tags) {
      if (queryText.includes(tag.toLowerCase())) score += 2;
    }

    // Agent answer
    const agentAnswer = (structured.agent_answer ?? '').toLowerCase();
    if (agentAnswer) score += overlapScore(queryText, agentAnswer) * 1;

    return { score, asset: a, structured };
  });

  scored.sort((a, b) => b.score - a.score);

  // Return top-3 with score > 1
  return scored
    .filter(s => s.score > 1)
    .slice(0, 3)
    .map(s => {
      const content = safeParseJson<{ q?: string; a?: string }>(s.asset.contentSnapshot ?? '{}');
      const agentAnswer = s.structured.agent_answer ?? content?.a ?? '';
      const sources = s.structured.sources ?? [];
      return {
        title: s.asset.title ?? s.structured.scene?.label ?? '未知',
        version: sources[0] ?? `v${s.asset.versionId?.slice(0, 8)}`,
        content: [
          agentAnswer,
          s.structured.reply_options?.map((o: { label: string; text: string }) => `${o.label}：${o.text}`).join('\n') ?? '',
          s.structured.caution_notes?.join('；') ?? '',
        ].filter(Boolean).join('\n'),
        confidence: Math.min(s.score / 10, 1),
      };
    });
}

function mergeCopilotData(hints: ReplyHints | null, llm: LlmUnderstanding | null): CopilotData {
  const scene = hints?.scene ?? { code: 'unknown', label: llm?.intent ?? '未知', risk: llm?.risk_level ?? 'low' };
  const confidence = hints?.confidence ?? 0;

  // Reply options: add source info
  const replyOptions = (hints?.reply_options ?? []).map(opt => ({
    label: opt.label,
    text: opt.text,
    source: hints?.sources?.[0] ?? '',
  }));

  return {
    summary: {
      current_summary: llm?.current_summary ?? '等待分析...',
      intent: llm?.intent ?? scene.label,
      scene,
      emotion: llm?.emotion ?? '平静',
      missing_slots: llm?.missing_slots ?? hints?.required_slots ?? [],
      recommended_actions: llm?.recommended_actions ?? hints?.next_actions ?? [],
      confidence,
      matched_sources_count: hints?.sources?.length ?? 0,
    },
    recommendations: {
      reply_options: replyOptions,
      recommended_terms: hints?.recommended_terms ?? [],
      forbidden_terms: hints?.forbidden_terms ?? [],
      next_actions: hints?.next_actions ?? [],
      sources: hints?.sources ?? [],
      asset_version_id: hints?.asset_version_id ?? '',
    },
    suggested_questions: llm?.suggested_questions ?? [],
  };
}

function buildLowConfidenceAnswer(): KbAnswer {
  return {
    direct_answer: '当前暂无高置信答案，建议先补充关键信息后再提问。',
    customer_facing_answer: '',
    cautions: ['当前信息不足，建议核实后再回复客户'],
    citations: [],
    confidence: 0,
    followup_suggestions: ['请尝试用更具体的问题描述', '可补充客户的手机号、时间等关键信息后重试'],
  };
}

// ── Utility ──────────────────────────────────────────────────────────────────

function safeParseJson<T>(raw: string): T | null {
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

function overlapScore(query: string, target: string): number {
  if (!target || !query) return 0;
  const queryBigrams = bigrams(query);
  const targetBigrams = bigrams(target);
  if (queryBigrams.size === 0 || targetBigrams.size === 0) return 0;
  let overlap = 0;
  for (const b of queryBigrams) {
    if (targetBigrams.has(b)) overlap++;
  }
  return overlap / Math.max(queryBigrams.size, 1);
}

function bestOverlapScore(query: string, targets: string[]): number {
  let best = 0;
  for (const target of targets) {
    best = Math.max(best, overlapScore(query, target));
  }
  return best;
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    set.add(s.slice(i, i + 2));
  }
  return set;
}
