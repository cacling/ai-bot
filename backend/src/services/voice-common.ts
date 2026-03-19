/**
 * voice-common.ts — voice.ts（入呼）和 outbound.ts（外呼）的共享工具函数
 *
 * 抽取以下重复逻辑：
 * - sendSkillDiagram：发送 skill 时序图更新（含高亮）
 * - runEmotionAnalysis：异步情绪分析 + 推送
 * - triggerHandoff：转人工分析 + 推送（含超时兜底）
 * - setupGlmCloseHandlers：GLM WebSocket close/error 处理
 */

import { extractMermaidFromContent, stripMermaidMarkers, extractStateNames, extractTransitions, highlightMermaidProgress } from '../services/mermaid';
import { getSkillMermaid } from '../engine/skills';
import { translateMermaid } from '../services/translate-lang';
import { analyzeHandoff } from '../agent/card/handoff-analyzer';
import { analyzeEmotion } from '../agent/card/emotion-analyzer';
import { analyzeProgress } from '../agent/card/progress-tracker';
import { logger } from './logger';
import { sessionBus } from './session-bus';
import { t } from './i18n';
import type { VoiceSessionState, HandoffContext } from './voice-session';
import type NodeWebSocket from 'ws';

// ── Types ──────────────────────────────────────────────────────────────────────

interface WsSender { send(data: string): void }
interface WsClient extends WsSender { close(): void }

// ── Skill Diagram ──────────────────────────────────────────────────────────────

/**
 * 读取 SKILL.md 中的 Mermaid 时序图，翻译 + 高亮后推送给前端和 session bus。
 * @param toolName 需要高亮的工具名（null 表示不高亮）
 */
export async function sendSkillDiagram(
  ws: WsSender,
  userPhone: string,
  skillName: string,
  toolName: string | null,
  lang: 'zh' | 'en',
  sessionId: string,
  channel: string,
): Promise<void> {
  try {
    const rawMermaid = getSkillMermaid(skillName);
    if (!rawMermaid) return;
    const translated = await translateMermaid(rawMermaid, lang);
    const mermaid = stripMermaidMarkers(translated);
    ws.send(JSON.stringify({ type: 'skill_diagram_update', skill_name: skillName, mermaid }));
    sessionBus.publish(userPhone, { source: 'voice', type: 'skill_diagram_update', skill_name: skillName, mermaid, msg_id: crypto.randomUUID() });
  } catch (e) {
    logger.warn(channel, 'skill_diagram_error', { session: sessionId, skill: skillName, error: String(e) });
  }
}

// ── Emotion Analysis ───────────────────────────────────────────────────────────

/**
 * 异步运行情绪分析并将结果推送给前端 + session bus。不阻塞调用方。
 */
export function runEmotionAnalysis(
  ws: WsSender,
  userPhone: string,
  transcript: string,
  recentTurns: { role: string; text: string }[],
): void {
  analyzeEmotion(transcript, recentTurns)
    .then(emotion => {
      try { ws.send(JSON.stringify({ type: 'emotion_update', text: transcript, emotion })); } catch {}
      sessionBus.publish(userPhone, { source: 'voice', type: 'emotion_update', label: emotion.label, emoji: emotion.emoji, color: emotion.color, msg_id: crypto.randomUUID() });
    })
    .catch(() => {});
}

// ── Progress Tracking ─────────────────────────────────────────────────────────

/**
 * 异步运行流程进度追踪：根据对话上下文判断当前处于哪个流程节点，推送高亮更新。
 * 不阻塞调用方。
 */
export function runProgressTracking(
  ws: WsSender,
  userPhone: string,
  skillName: string,
  recentTurns: { role: string; text: string }[],
  lang: 'zh' | 'en',
  sessionId: string,
  channel: string,
): void {
  logger.info(channel, 'progress_tracking_start', { session: sessionId, skill: skillName, turnsCount: recentTurns.length });
  const rawMermaid = getSkillMermaid(skillName);
  if (!rawMermaid) {
    logger.warn(channel, 'progress_tracking_skip', { session: sessionId, reason: 'no_mermaid' });
    return;
  }
  const stateNames = extractStateNames(rawMermaid);
  if (stateNames.length === 0) {
    logger.warn(channel, 'progress_tracking_skip', { session: sessionId, reason: 'no_states' });
    return;
  }
  const transitions = extractTransitions(rawMermaid);
  logger.info(channel, 'progress_tracking_states', { session: sessionId, states: stateNames, count: stateNames.length, transitionCount: transitions.length });

  analyzeProgress(recentTurns, stateNames, transitions)
    .then(async (stateName) => {
      if (!stateName) {
        logger.warn(channel, 'progress_tracking_no_match', { session: sessionId });
        return;
      }
      logger.info(channel, 'progress_tracked', { session: sessionId, state: stateName });
      const translated = await translateMermaid(rawMermaid, lang);
      const highlighted = highlightMermaidProgress(translated, stateName);
      const same = highlighted === translated;
      const mermaid = stripMermaidMarkers(highlighted);
      // 输出带高亮行的 mermaid 片段，用于调试渲染问题
      const hlLines = mermaid.split('\n').filter(l => l.includes(':::'));
      logger.info(channel, 'progress_highlight_result', { session: sessionId, state: stateName, highlightApplied: !same, mermaidLen: mermaid.length, hlLines });
      try { ws.send(JSON.stringify({ type: 'skill_diagram_update', skill_name: skillName, mermaid })); } catch {}
      sessionBus.publish(userPhone, { source: 'voice', type: 'skill_diagram_update', skill_name: skillName, mermaid, msg_id: crypto.randomUUID() });
    })
    .catch((err) => {
      logger.error(channel, 'progress_tracking_error', { session: sessionId, error: String(err) });
    });
}

// ── Handoff (Transfer to Human) ────────────────────────────────────────────────

export interface HandoffConfig {
  /** 工具名 → 中文/英文标签映射 */
  toolLabels: Record<string, string>;
  /** 无法推断意图时的默认文本 */
  defaultIntent: string;
  /** 生成摘要文本 */
  buildSummary: (inferredIntent: string, toolNames: string) => string;
  /** 生成主要问题描述 */
  buildMainIssue: (inferredIntent: string) => string;
  /** 业务对象标签列表 */
  businessObject: string[];
  /** 生成单条工具执行记录 */
  buildActionLabel: (tc: { tool: string; success: boolean; result_summary: string }, label: string) => string;
  /** 默认下一步动作 */
  defaultNextAction: string;
  /** 默认优先级 */
  defaultPriority: string;
  /** 传给 analyzeHandoff 的语言参数 */
  analysisLang?: 'zh' | 'en';
  /** 日志 channel 名 */
  channel: string;
  /** 当前语言 */
  lang: 'zh' | 'en';
}

/**
 * 执行转人工流程：构建 fallback、调用深度分析（含 20 秒超时）、推送结果。
 * @returns 分析 Promise（用于 GLM close 时等待完成），若已触发过则返回 null
 */
export function triggerHandoff(
  state: VoiceSessionState,
  ws: WsSender,
  sessionId: string,
  reason: string,
  toolArgs: Record<string, unknown>,
  config: HandoffConfig,
): Promise<void> | null {
  if (state.transferTriggered) return null;
  state.transferTriggered = true;

  const { toolLabels, lang } = config;
  const sep = t('list_separator', lang);

  const toolFreq = state.toolCalls.reduce<Record<string, number>>((acc, tc) => {
    acc[tc.tool] = (acc[tc.tool] ?? 0) + 1; return acc;
  }, {});
  const topTool = Object.entries(toolFreq).sort((a, b) => b[1] - a[1])[0]?.[0];

  const inferredIntent = (toolArgs.current_intent as string)
    ?? (topTool ? toolLabels[topTool] : undefined)
    ?? config.defaultIntent;
  const toolNames = [...new Set(state.toolCalls.map(tc => toolLabels[tc.tool] ?? tc.tool))].join(sep);

  const fallback = {
    customer_intent:       inferredIntent,
    main_issue:            config.buildMainIssue(inferredIntent),
    business_object:       config.businessObject,
    confirmed_information: Object.entries(state.collectedSlots).map(([k, v]) => `${k}: ${v}`),
    actions_taken:         state.toolCalls.slice(-5).map(tc => config.buildActionLabel(tc, toolLabels[tc.tool] ?? tc.tool)),
    current_status:        t('status_in_progress', lang),
    handoff_reason:        reason,
    next_action:           (toolArgs.recommended_action as string) ?? config.defaultNextAction,
    priority:              config.defaultPriority,
    risk_flags:            (toolArgs.risk_tags as string[]) ?? [],
    session_summary:       config.buildSummary(inferredIntent, toolNames),
  };

  const analysisWithTimeout = Promise.race([
    analyzeHandoff(state.turns, state.toolCalls, config.analysisLang),
    new Promise<typeof fallback>(resolve => setTimeout(() => resolve(fallback), 20000)),
  ]);

  return analysisWithTimeout
    .catch(() => fallback)
    .then(analysis => {
      const ctx: HandoffContext = {
        user_phone:            state.phone,
        session_id:            state.sessionId,
        timestamp:             new Date().toISOString(),
        transfer_reason:       reason,
        customer_intent:       analysis.customer_intent,
        main_issue:            analysis.main_issue,
        business_object:       analysis.business_object,
        confirmed_information: analysis.confirmed_information,
        actions_taken:         analysis.actions_taken,
        current_status:        analysis.current_status,
        handoff_reason:        analysis.handoff_reason,
        next_action:           analysis.next_action,
        priority:              analysis.priority,
        risk_flags:            analysis.risk_flags,
        session_summary:       analysis.session_summary,
      };
      logger.info(config.channel, 'transfer_to_human_done', { session: sessionId, intent: ctx.customer_intent, via: reason });
      try { ws.send(JSON.stringify({ type: 'transfer_to_human', context: ctx })); } catch {}
      sessionBus.publish(state.phone, { source: 'voice', type: 'handoff_card', data: ctx as unknown as Record<string, unknown>, msg_id: crypto.randomUUID() });
    });
}

// ── GLM WebSocket Close/Error Handlers ─────────────────────────────────────────

/**
 * 为 GLM WebSocket 设置 close + error 处理器。
 * close 时等待 pendingHandoff 完成后再关闭前端 WS。
 */
export function setupGlmCloseHandlers(
  glmWs: InstanceType<typeof NodeWebSocket>,
  ws: WsClient,
  getPendingHandoff: () => Promise<void> | null,
  sessionId: string,
  channel: string,
): void {
  glmWs.on('close', async (code: number, reason: Buffer) => {
    logger.info(channel, 'glm_closed', { session: sessionId, code, reason: reason?.toString('utf8') || '(none)' });
    const pending = getPendingHandoff();
    if (pending) { try { await pending; } catch {} }
    try { ws.close(); } catch {}
  });

  glmWs.on('error', (err: Error) => {
    logger.error(channel, 'glm_ws_error', { session: sessionId, error: err.message });
    try { ws.send(JSON.stringify({ type: 'error', message: `GLM connection error: ${err.message}` })); ws.close(); } catch {}
  });
}
