/**
 * voice.ts — GLM-Realtime WebSocket 代理路由（含 MCP 工具调用 + 转人工）
 */

import { Hono } from 'hono';
import { createBunWebSocket } from 'hono/bun';
import NodeWebSocket from 'ws';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { analyzeHandoff } from '../skills/handoff-analyzer';
import { analyzeEmotion } from '../skills/emotion-analyzer';
import { textToSpeech } from '../skills/tts';
import { translateText } from '../skills/translate-lang';
import { logger } from '../logger';
import { sessionBus } from '../session-bus';
import { getLangs } from '../lang-session';

// ── 配置 ──────────────────────────────────────────────────────────────────────

// Resolve skills directory (mirrors logic in skills.ts)
const SKILLS_DIR = resolve(
  process.env.SKILLS_DIR
    ? resolve(process.cwd(), process.env.SKILLS_DIR)
    : resolve(import.meta.dir, '../..', 'skills')
);

/** Tool → skill name mapping: used to send skill_diagram_update to the frontend */
const SKILL_TOOL_MAP: Record<string, string> = {
  diagnose_network: 'fault-diagnosis',
  diagnose_app: 'telecom-app',
};

/** Extract a ```mermaid ... ``` block from markdown. When lang='en', prefers the block after <!-- lang:en -->, falls back to first block. */
function extractMermaidFromContent(markdown: string, lang: 'zh' | 'en' = 'zh'): string | null {
  if (lang === 'en') {
    const enMatch = markdown.match(/<!--\s*lang:en\s*-->\s*```mermaid\n([\s\S]*?)```/);
    if (enMatch) return enMatch[1].trim();
  }
  const match = markdown.match(/```mermaid\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

/**
 * Wrap the line annotated with `%% tool:<toolName>` inside a mermaid `rect` block.
 * Always rebuilds from rawMermaid so only the current tool's step is highlighted.
 */
function highlightMermaidTool(rawMermaid: string, toolName: string): string {
  const HIGHLIGHT_COLOR = 'rgba(255, 200, 0, 0.35)';
  const marker = `%% tool:${toolName}`;
  return rawMermaid
    .split('\n')
    .map((line) => {
      if (!line.includes(marker)) return line;
      const indent = line.match(/^(\s*)/)?.[1] ?? '';
      return `${indent}rect ${HIGHLIGHT_COLOR}\n${indent}  ${line.trimStart()}\n${indent}end`;
    })
    .join('\n');
}

const ZHIPU_API_KEY      = process.env.ZHIPU_API_KEY ?? '';
const GLM_REALTIME_URL   = process.env.GLM_REALTIME_URL ?? 'wss://open.bigmodel.cn/api/paas/v4/realtime';
const GLM_REALTIME_MODEL = process.env.GLM_REALTIME_MODEL ?? 'glm-realtime-flash';
const TELECOM_MCP_URL    = process.env.TELECOM_MCP_URL ?? 'http://localhost:8003/mcp';
const DEFAULT_PHONE      = '13800000001';

// ── 语音 system prompt ────────────────────────────────────────────────────────
const VOICE_PROMPT_TEMPLATE =
  readFileSync(resolve(import.meta.dir, '../agent/inbound-base-system-prompt.md'), 'utf-8') +
  '\n\n' +
  readFileSync(resolve(import.meta.dir, '../agent/inbound-voice-system-prompt.md'), 'utf-8');

const ENGLISH_LANG_INSTRUCTION = `

---

**LANGUAGE REQUIREMENT (MANDATORY)**
You MUST respond ONLY in English for this entire conversation. All spoken responses must be in English. Do not switch to Chinese under any circumstances, even if the user speaks Chinese.
When calling tools that accept a \`lang\` parameter (such as diagnose_network, diagnose_app), always pass \`lang: "en"\` to receive English diagnostic output.`;

function buildVoicePrompt(phone: string, lang: 'zh' | 'en' = 'zh'): string {
  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const base = VOICE_PROMPT_TEMPLATE
    .replace('{{PHONE}}', phone)
    .replace('{{CURRENT_DATE}}', today);
  return lang === 'en' ? base + ENGLISH_LANG_INSTRUCTION : base;
}

// ── 会话状态跟踪 ──────────────────────────────────────────────────────────────
interface TurnRecord   { role: 'user' | 'assistant'; text: string; ts: number; }
interface ToolRecord   { tool: string; args: Record<string, unknown>; result_summary: string; success: boolean; ts: number; }
interface HandoffContext {
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

export const TRANSFER_PHRASE_RE = /转接人工|为您转接|转人工客服|正在为您转接/;

export class VoiceSessionState {
  turns: TurnRecord[]  = [];
  toolCalls: ToolRecord[] = [];
  consecutiveToolFails  = 0;
  currentBotAccum       = '';    // 累积当前 bot 回复
  collectedSlots: Record<string, unknown> = {};
  transferTriggered     = false; // 防止重复触发转人工

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

}

// ── 工具名中文映射（用于 handoff 卡片显示） ────────────────────────────────────
const TOOL_LABEL: Record<string, string> = {
  query_subscriber: '查询账户信息',
  query_bill:       '查询账单',
  query_plans:      '查询套餐',
  cancel_service:   '退订业务',
  diagnose_network: '网络诊断',
  diagnose_app: 'App问题诊断',
};

// ── GLM 工具定义 ──────────────────────────────────────────────────────────────
// 格式：Realtime API 扁平格式；不传 tool_choice（GLM 不支持该字段）
const VOICE_TOOLS = [
  {
    type: 'function',
    name: 'query_subscriber',
    description: '查询用户的账户信息，包括套餐、余额、流量使用情况、已订增值业务',
    parameters: {
      type: 'object',
      properties: { phone: { type: 'string', description: '用户手机号' } },
      required: ['phone'],
    },
  },
  {
    type: 'function',
    name: 'query_bill',
    description: '查询用户的账单和费用明细',
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: '用户手机号' },
        month: { type: 'string', description: '账单月份，格式 YYYY-MM，不填则返回最近3个月' },
      },
      required: ['phone'],
    },
  },
  {
    type: 'function',
    name: 'query_plans',
    description: '查询可用套餐列表，或查询指定套餐详情',
    parameters: {
      type: 'object',
      properties: { plan_id: { type: 'string', description: '套餐 ID，不填则返回全部套餐' } },
    },
  },
  {
    type: 'function',
    name: 'cancel_service',
    description: '退订用户已开通的增值业务',
    parameters: {
      type: 'object',
      properties: {
        phone:      { type: 'string', description: '用户手机号' },
        service_id: { type: 'string', description: '要退订的业务ID，如 video_pkg、sms_100' },
      },
      required: ['phone', 'service_id'],
    },
  },
  {
    type: 'function',
    name: 'diagnose_network',
    description: '诊断用户的网络故障问题',
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: '用户手机号' },
        issue_type: {
          type: 'string',
          enum: ['no_signal', 'slow_data', 'call_drop', 'no_network'],
          description: '故障类型：no_signal=无信号，slow_data=网速慢，call_drop=通话中断，no_network=无法上网',
        },
      },
      required: ['phone', 'issue_type'],
    },
  },
  {
    type: 'function',
    name: 'diagnose_app',
    description: '诊断营业厅 App 问题，涵盖账号被锁、登录失败、设备不兼容、可疑活动等安全类场景',
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: '用户手机号' },
        issue_type: {
          type: 'string',
          enum: ['app_locked', 'login_failed', 'device_incompatible', 'suspicious_activity'],
          description: '故障类型：app_locked=App被锁定，login_failed=登录失败，device_incompatible=设备不兼容，suspicious_activity=可疑活动',
        },
      },
      required: ['phone', 'issue_type'],
    },
  },
  {
    type: 'function',
    name: 'transfer_to_human',
    description: '将用户转接给人工客服。触发条件：用户明确要求人工、连续两轮无法识别意图、用户情绪激烈或投诉、高风险操作需人工确认、工具连续失败、身份校验未通过、置信度不足。',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          enum: ['user_request', 'unrecognized_intent', 'emotional_complaint', 'high_risk_operation', 'tool_failure', 'identity_verify_failed', 'low_confidence'],
          description: '转人工原因',
        },
        current_intent:     { type: 'string', description: '用户当前意图，如"退订业务"、"投诉网络" 等' },
        risk_tags:          { type: 'array', items: { type: 'string' }, description: '风险标签，如 ["complaint","high_value"]' },
        recommended_action: { type: 'string', description: '推荐坐席的下一步动作' },
      },
      required: ['reason', 'current_intent'],
    },
  },
];

// ── MCP 工具调用 ──────────────────────────────────────────────────────────────
async function callMcpTool(
  sessionId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string; success: boolean }> {
  const client = new Client({ name: 'voice-agent', version: '1.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(TELECOM_MCP_URL)));
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as Array<{ type: string; text: string }>)
      .filter(c => c.type === 'text').map(c => c.text).join('\n');
    logger.info('voice', 'mcp_tool_result', { session: sessionId, tool: name, preview: text.slice(0, 200) });
    return { text, success: true };
  } catch (e) {
    const msg = `工具调用失败: ${String(e)}`;
    logger.error('voice', 'mcp_tool_error', { session: sessionId, tool: name, error: String(e) });
    return { text: JSON.stringify({ error: msg }), success: false };
  } finally {
    await client.close().catch(() => {});
  }
}

// ── Bun WebSocket 适配器 ──────────────────────────────────────────────────────
export const { upgradeWebSocket, websocket: voiceWebsocket } = createBunWebSocket();

// ── 路由 ──────────────────────────────────────────────────────────────────────
const voice = new Hono();

voice.get(
  '/ws/voice',
  upgradeWebSocket((c) => {
    const userPhone = c.req.query('phone') ?? DEFAULT_PHONE;
    const lang      = (c.req.query('lang') ?? 'zh') as 'zh' | 'en';
    const sessionId = crypto.randomUUID();
    let glmWs: InstanceType<typeof NodeWebSocket> | null = null;
    const state = new VoiceSessionState(userPhone, sessionId);
    let pendingHandoff: Promise<void> | null = null;
    let unsubscribeAgent: (() => void) | null = null;

    // ── 转人工触发器（工具调用路径 / 语音检测路径共用） ──────────────────────
    function triggerHandoff(
      ws: { send: (data: string) => void },
      reason: string,
      toolArgs: Record<string, unknown> = {},
    ) {
      if (state.transferTriggered) return;
      state.transferTriggered = true;

      // 从工具调用历史推断真实意图（用于超时 fallback）
      const toolFreq = state.toolCalls.reduce<Record<string, number>>((acc, tc) => {
        acc[tc.tool] = (acc[tc.tool] ?? 0) + 1; return acc;
      }, {});
      const topTool = Object.entries(toolFreq).sort((a, b) => b[1] - a[1])[0]?.[0];
      const inferredIntent = (toolArgs.current_intent as string)
        ?? (topTool ? TOOL_LABEL[topTool] : undefined)
        ?? '用户咨询';
      const toolNames = [...new Set(state.toolCalls.map(tc => TOOL_LABEL[tc.tool] ?? tc.tool))].join('、');
      const inferredSummary = `用户本次咨询${inferredIntent}，机器人${toolNames ? `已查询${toolNames}` : '暂未执行查询'}，最终要求转人工客服处理。`;

      const fallback = {
        customer_intent:       inferredIntent,
        main_issue:            `${inferredIntent}相关问题，AI 分析未完成，请查看对话记录`,
        business_object:       [] as string[],
        confirmed_information: Object.entries(state.collectedSlots).map(([k, v]) => `${k}: ${v}`),
        actions_taken:         state.toolCalls.slice(-5).map(tc => {
          const label = TOOL_LABEL[tc.tool] ?? tc.tool;
          if (!tc.success) return `${label}（失败）`;
          const noData = /没找到|未找到|不存在|没有.*记录|无记录|null|not.?found/i.test(tc.result_summary);
          return `${label}（${noData ? '无数据' : '成功'}）`;
        }),
        current_status:        '处理中',
        handoff_reason:        reason,
        next_action:           (toolArgs.recommended_action as string) ?? '请主动问候用户，了解具体需求',
        priority:              '中',
        risk_flags:            (toolArgs.risk_tags as string[]) ?? [],
        session_summary:       inferredSummary,
      };

      const agentLang = getLangs(userPhone).agent;
      const analysisWithTimeout = Promise.race([
        analyzeHandoff(state.turns, state.toolCalls, agentLang),
        new Promise<typeof fallback>(resolve => setTimeout(() => resolve(fallback), 20000)),
      ]);

      pendingHandoff = analysisWithTimeout
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
          logger.info('voice', 'transfer_to_human_done', { session: sessionId, intent: ctx.customer_intent, via: reason });
          try { ws.send(JSON.stringify({ type: 'transfer_to_human', context: ctx })); } catch {}
          sessionBus.publish(userPhone, { source: 'voice', type: 'handoff_card', data: ctx as Record<string, unknown>, msg_id: crypto.randomUUID() });
        });
    }

    return {
      // ── 前端连接建立 ──────────────────────────────────────────────────────
      onOpen(_evt, ws) {
        logger.info('voice', 'client_connected', { session: sessionId, phone: userPhone });

        if (!ZHIPU_API_KEY) {
          ws.send(JSON.stringify({ type: 'error', message: 'ZHIPU_API_KEY 未配置' }));
          ws.close();
          return;
        }

        const glmUrl = `${GLM_REALTIME_URL}?model=${GLM_REALTIME_MODEL}`;
        glmWs = new NodeWebSocket(glmUrl, {
          headers: { Authorization: `Bearer ${ZHIPU_API_KEY}` },
        });

        glmWs.on('open', () => {
          logger.info('voice', 'glm_connected', { session: sessionId, model: GLM_REALTIME_MODEL });
          glmWs!.send(JSON.stringify({
            event_id: crypto.randomUUID(),
            client_timestamp: Date.now(),
            type: 'session.update',
            session: {
              beta_fields: { chat_mode: 'audio' },
              modalities: ['text', 'audio'],
              instructions: buildVoicePrompt(userPhone, lang),
              voice: 'tongtong',
              input_audio_format: 'pcm',
              output_audio_format: 'mp3',
              turn_detection: {
                type: 'server_vad',
                silence_duration_ms: 1500,
                threshold: 0.6,
                interrupt_response: false,  // 防止 VAD 把机器人回声误判为用户说话后打断自己
              },
              temperature: 0.2,
              tools: VOICE_TOOLS,
            },
          }));
        });

        // GLM → 前端：拦截工具调用和转人工，其余透传
        glmWs.on('message', async (data: Buffer) => {
          try {
            const text = data.toString();
            const msg  = JSON.parse(text);

            logger.info('voice', 'glm_event', { session: sessionId, type: msg.type, preview: text.slice(0, 200) });

            // ── 用户语音转写完成 → 记录用户话语 + 异步情绪分析 ──────────
            if (msg.type === 'conversation.item.input_audio_transcription.completed') {
              const transcript = (msg.transcript ?? '') as string;
              if (transcript) {
                state.addUserTurn(transcript);
                // 同步给坐席工作台
                const umId = crypto.randomUUID();
                logger.info('voice', 'bus_publish_user_message', { session: sessionId, phone: userPhone, preview: transcript.slice(0, 40), msg_id: umId });
                sessionBus.publish(userPhone, { source: 'voice', type: 'user_message', text: transcript, msg_id: umId });
                // 并行情绪分析，完成后推给前端；不阻塞语音回复
                analyzeEmotion(transcript, state.turns.slice(-5))
                  .then(emotion => {
                    try { ws.send(JSON.stringify({ type: 'emotion_update', text: transcript, emotion })); } catch {}
                    sessionBus.publish(userPhone, { source: 'voice', type: 'emotion_update', label: emotion.label, emoji: emotion.emoji, color: emotion.color, msg_id: crypto.randomUUID() });
                  })
                  .catch(() => {});
              }
            }

            // ── bot 回复完整文本 → 记录助手话语 + 检测转人工兜底 ──────────
            if (msg.type === 'response.audio_transcript.done') {
              const transcript = (msg.transcript ?? '') as string;
              if (transcript) {
                state.addAssistantTurn(transcript);
                // 同步给坐席工作台
                const respId = crypto.randomUUID();
                logger.info('voice', 'bus_publish_response', { session: sessionId, phone: userPhone, preview: transcript.slice(0, 40), msg_id: respId, turn: state.turns.length });
                sessionBus.publish(userPhone, { source: 'voice', type: 'response', text: transcript, msg_id: respId });
                // GLM-Realtime Flash 有时说告别语但不调用工具，在此兜底检测
                if (
                  !state.transferTriggered &&
                  TRANSFER_PHRASE_RE.test(transcript)
                ) {
                  logger.info('voice', 'transfer_detected_via_speech', { session: sessionId, transcript });
                  triggerHandoff(ws, 'user_request');
                }
              }
            }

            // ── 拦截工具调用（MCP 工具 + 转人工） ────────────────────────
            if (msg.type === 'response.function_call_arguments.done') {
              const toolName = msg.name as string;
              const toolArgs = JSON.parse(msg.arguments ?? '{}') as Record<string, unknown>;
              logger.info('voice', 'tool_called', { session: sessionId, tool: toolName });

              // ── 转人工（工具调用路径） ─────────────────────────────────────
              if (toolName === 'transfer_to_human') {
                const reason = (toolArgs.reason ?? 'user_request') as string;
                logger.info('voice', 'transfer_to_human_tool_called', { session: sessionId, reason });

                // 立即回复 GLM 工具结果，让它说告别语
                try {
                  glmWs!.send(JSON.stringify({
                    event_id: crypto.randomUUID(),
                    client_timestamp: Date.now(),
                    type: 'conversation.item.create',
                    item: { type: 'function_call_output', call_id: msg.call_id, output: '{"ok":true}' },
                  }));
                  glmWs!.send(JSON.stringify({
                    event_id: crypto.randomUUID(),
                    client_timestamp: Date.now(),
                    type: 'response.create',
                  }));
                } catch (e) {
                  logger.warn('voice', 'transfer_glm_send_error', { session: sessionId, error: String(e) });
                }

                // 触发 SiliconFlow 深度分析并推卡片（triggerHandoff 内部设 transferTriggered = true）
                triggerHandoff(ws, reason, toolArgs);
                return;
              }

              // ── MCP 工具调用 ──────────────────────────────────────────────
              logger.info('voice', 'tool_call_start', { session: sessionId, tool: toolName, args: toolArgs });
              const { text: result, success } = await callMcpTool(sessionId, toolName, toolArgs);
              state.recordTool(toolName, toolArgs, result, success);

              // 若该工具对应某个 skill，推送高亮版 skill_diagram_update 给前端
              if (SKILL_TOOL_MAP[toolName]) {
                const skillName = SKILL_TOOL_MAP[toolName];
                try {
                  const skillPath = resolve(SKILLS_DIR, skillName, 'SKILL.md');
                  if (existsSync(skillPath)) {
                    const rawMermaid = extractMermaidFromContent(readFileSync(skillPath, 'utf-8'), lang);
                    if (rawMermaid) {
                      const mermaid = highlightMermaidTool(rawMermaid, toolName);
                      ws.send(JSON.stringify({ type: 'skill_diagram_update', skill_name: skillName, mermaid }));
                      sessionBus.publish(userPhone, { source: 'voice', type: 'skill_diagram_update', skill_name: skillName, mermaid, msg_id: crypto.randomUUID() });
                    }
                  }
                } catch (e) {
                  logger.warn('voice', 'skill_diagram_error', { session: sessionId, skill: skillName, error: String(e) });
                }
              }

              glmWs!.send(JSON.stringify({
                event_id: crypto.randomUUID(),
                client_timestamp: Date.now(),
                type: 'conversation.item.create',
                item: { type: 'function_call_output', call_id: msg.call_id, output: result },
              }));
              glmWs!.send(JSON.stringify({
                event_id: crypto.randomUUID(),
                client_timestamp: Date.now(),
                type: 'response.create',
              }));
              return; // 不透传给前端
            }

            // 其余事件正常透传
            ws.send(text);
          } catch (e) {
            logger.warn('voice', 'glm_message_error', { session: sessionId, error: String(e) });
          }
        });

        glmWs.on('close', async (code: number, reason: Buffer) => {
          logger.info('voice', 'glm_closed', { session: sessionId, code, reason: reason?.toString('utf8') || '(none)' });
          // 若 SiliconFlow 分析仍在进行（最多 8 秒），等待完成后再关闭前端 WS
          if (pendingHandoff) {
            try { await pendingHandoff; } catch {}
          }
          try { ws.close(); } catch {}
        });

        glmWs.on('error', (err: Error) => {
          logger.error('voice', 'glm_ws_error', { session: sessionId, error: err.message });
          try { ws.send(JSON.stringify({ type: 'error', message: `GLM 连接错误: ${err.message}` })); ws.close(); } catch {}
        });

        // Subscribe to agent messages and play TTS to customer
        unsubscribeAgent = sessionBus.subscribe(userPhone, async (event) => {
          if (event.source === 'agent' && event.type === 'transfer_to_bot') {
            logger.info('voice', 'transfer_to_bot', { session: sessionId });
            try { ws.send(JSON.stringify({ type: 'transfer_to_bot' })); } catch { /* ws closed */ }
            return;
          }

          if (event.source !== 'agent' || event.type !== 'agent_message') return;
          const agentText = event.text as string;
          if (!agentText?.trim()) return;

          const { agent: agentLang, customer: customerLang } = getLangs(userPhone);
          let textForTts = agentText;

          // Translate agent message to customer language if needed
          if (agentLang !== customerLang) {
            try {
              textForTts = await translateText(agentText, customerLang);
              logger.info('voice', 'agent_message_translated', { session: sessionId, from: agentLang, to: customerLang, preview: textForTts.slice(0, 40) });
            } catch (e) {
              logger.warn('voice', 'agent_message_translate_error', { session: sessionId, error: String(e) });
            }
          }

          // Convert to speech and send to customer
          try {
            const audio = await textToSpeech(textForTts, customerLang);
            logger.info('voice', 'agent_tts_done', { session: sessionId, lang: customerLang, chars: textForTts.length });
            try { ws.send(JSON.stringify({ type: 'agent_audio', audio, text: textForTts, original_text: agentText })); } catch { /* ws closed */ }
          } catch (e) {
            logger.error('voice', 'agent_tts_error', { session: sessionId, error: String(e) });
            // Fallback: send text only so customer can read it
            try { ws.send(JSON.stringify({ type: 'agent_message', text: textForTts, original_text: agentText })); } catch { /* ws closed */ }
          }
        });
      },

      onMessage(evt, _ws) {
        if (glmWs?.readyState === NodeWebSocket.OPEN) {
          glmWs.send(evt.data.toString());
        }
      },

      onClose() {
        logger.info('voice', 'client_disconnected', { session: sessionId });
        unsubscribeAgent?.();
        unsubscribeAgent = null;
        if (glmWs && glmWs.readyState !== NodeWebSocket.CLOSED) glmWs.close();
        glmWs = null;
      },

      onError() {
        logger.error('voice', 'client_ws_error', { session: sessionId });
        glmWs?.close();
        glmWs = null;
      },
    };
  })
);

export default voice;
