/**
 * voice-session.ts — 语音会话状态跟踪
 *
 * 被 voice.ts（入呼）和 outbound.ts（外呼）共用。
 * 管理对话轮次、工具调用记录、首包时延、打断/冷场检测等可观测指标。
 */

// ── 类型 ──────────────────────────────────────────────────────────────────────

export interface TurnRecord   { role: 'user' | 'assistant'; text: string; ts: number; }
export interface ToolRecord   { tool: string; args: Record<string, unknown>; result_summary: string; success: boolean; ts: number; }

export interface HandoffContext {
  user_phone:            string;
  session_id:            string;
  timestamp:             string;
  transfer_reason:       string;
  customer_intent:       string;
  main_issue:            string;
  business_object:       string[];
  confirmed_information: string[];
  actions_taken:         string[];
  current_status:        string;
  handoff_reason:        string;
  next_action:           string;
  priority:              string;
  risk_flags:            string[];
  session_summary:       string;
}

// ── 转人工话术检测（从 SKILL 加载短语，构建正则） ──────────────────────────────

import { readFileSync } from 'fs';
import { TECH_SKILLS_DIR } from '../services/paths';

function buildTransferPhraseRE(): RegExp {
  const fallback = /转接人工|为您转接|转人工客服|正在为您转接|transfer(?:ring)?\s*(?:you\s*)?to\s*(?:a\s*)?human|connecting\s*you\s*to\s*an?\s*agent/i;
  try {
    const raw = readFileSync(`${TECH_SKILLS_DIR}/transfer-detection/SKILL.md`, 'utf-8');
    // 提取 "- xxx" 列表项中的短语
    const phrases: string[] = [];
    const listRe = /^-\s+(.+)$/gm;
    let match;
    let inSection = false;
    for (const line of raw.split('\n')) {
      if (/^###\s+(中文短语|英文短语)/.test(line)) { inSection = true; continue; }
      if (/^##/.test(line) && inSection) { inSection = false; continue; }
      if (inSection && (match = /^-\s+(.+)$/.exec(line))) {
        phrases.push(match[1].trim());
      }
    }
    if (phrases.length === 0) return fallback;
    // 构建正则：中文短语直接匹配，英文短语转为灵活正则
    const escaped = phrases.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(escaped.join('|'), 'i');
  } catch {
    return fallback;
  }
}

export const TRANSFER_PHRASE_RE = buildTransferPhraseRE();

// ── 会话状态 ──────────────────────────────────────────────────────────────────

export class VoiceSessionState {
  turns: TurnRecord[]  = [];
  toolCalls: ToolRecord[] = [];
  consecutiveToolFails  = 0;
  currentBotAccum       = '';    // 累积当前 bot 回复
  collectedSlots: Record<string, unknown> = {};
  transferTriggered     = false; // 防止重复触发转人工
  farewellDone          = false; // 告别语播完后为 true，之后才拦截 GLM 响应
  muteNextResponse      = false; // 转写失败时标记，拦截 GLM 对噪音的回应

  // ── 可观测指标字段 ─────────────────────────────────────────────────────────
  sessionStartTs        = Date.now();
  lastUserEndTs         = 0;        // 用户说完时间戳
  firstPackLatencies: number[] = []; // 每轮首包响应时延
  private _awaitingFirstPack = false;
  bargeInCount          = 0;        // 打断次数
  silenceCount          = 0;        // 冷场次数
  silenceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly phone: string, readonly sessionId: string) {}

  addUserTurn(text: string)      { this.turns.push({ role: 'user',      text, ts: Date.now() }); }
  addAssistantTurn(text: string) { this.turns.push({ role: 'assistant', text, ts: Date.now() }); this.currentBotAccum = ''; }

  recordTool(tool: string, args: Record<string, unknown>, result: string, success: boolean) {
    this.toolCalls.push({ tool, args, result_summary: result.slice(0, 300), success, ts: Date.now() });
    this.consecutiveToolFails = success ? 0 : this.consecutiveToolFails + 1;
    // 从参数里提取槽位
    if (args.phone)      this.collectedSlots.phone      = args.phone;
    if (args.service_id) this.collectedSlots.service_id = args.service_id;
    if (args.plan_id)    this.collectedSlots.plan_id    = args.plan_id;
    if (args.issue_type) this.collectedSlots.issue_type = args.issue_type;
  }

  /** 用户说完时调用 — 开始计时首包时延和冷场检测 */
  markUserEnd() {
    this.lastUserEndTs = Date.now();
    this._awaitingFirstPack = true;
    // 冷场检测：5 秒内无首包音频则记为一次冷场
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      if (this._awaitingFirstPack) {
        this.silenceCount++;
      }
    }, 5000);
  }

  /** 收到机器人首个音频 chunk 时调用 — 记录首包时延 */
  markFirstAudioPack(): number | null {
    if (!this._awaitingFirstPack || this.lastUserEndTs === 0) return null;
    this._awaitingFirstPack = false;
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    const latency = Date.now() - this.lastUserEndTs;
    this.firstPackLatencies.push(latency);
    return latency;
  }

  /** 检测到打断时调用 */
  markBargeIn() { this.bargeInCount++; }

  /** 会话结束时输出汇总指标 */
  getMetrics() {
    const fpLatencies = this.firstPackLatencies;
    return {
      total_turns: this.turns.length,
      total_tool_calls: this.toolCalls.length,
      tool_success_count: this.toolCalls.filter(t => t.success).length,
      transfer_triggered: this.transferTriggered,
      barge_in_count: this.bargeInCount,
      silence_count: this.silenceCount,
      first_pack_latency_avg_ms: fpLatencies.length > 0
        ? Math.round(fpLatencies.reduce((a, b) => a + b, 0) / fpLatencies.length)
        : null,
      first_pack_latency_p95_ms: fpLatencies.length > 0
        ? fpLatencies.sort((a, b) => a - b)[Math.floor(fpLatencies.length * 0.95)]
        : null,
      session_duration_ms: Date.now() - this.sessionStartTs,
    };
  }
}
