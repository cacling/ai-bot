/**
 * glm-realtime-controller.ts — 统一 GLM-Realtime 事件循环
 *
 * 封装 outbound.ts 和 voice.ts 共享的 ~60% 代码：
 * GLM 连接、session.update、事件分发、TTS 覆盖、工具管道、handoff、close。
 * 通过 GlmSessionHooks 注入 handler 特定行为。
 */

import NodeWebSocket from 'ws';
import { logger } from './logger';
import { sessionBus } from './session-bus';
import { VoiceSessionState, TRANSFER_PHRASE_RE } from './voice-session';
import { TtsOverride } from './tts-override';
import { callMcpTool } from './mcp-client';
import { translateText } from './translate-lang';
import { sendSkillDiagram, runEmotionAnalysis, setupGlmCloseHandlers } from './voice-common';
import { preprocessToolCall, postprocessToolResult, inferSkillName } from './tool-call-middleware';
import { t } from './i18n';

// ── Config ────────────────────────────────────────────────────────────────────

const ZHIPU_API_KEY      = process.env.ZHIPU_API_KEY ?? '';
const GLM_REALTIME_URL   = process.env.GLM_REALTIME_URL ?? 'wss://open.bigmodel.cn/api/paas/v4/realtime';
const GLM_REALTIME_MODEL = process.env.GLM_REALTIME_MODEL ?? 'glm-realtime-flash';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GlmSessionConfig {
  channel: 'voice' | 'outbound';
  sessionId: string;
  userPhone: string;
  lang: 'zh' | 'en';
  systemPrompt: string;
  tools: Array<Record<string, unknown>>;
  voiceName: string;
  /** VAD interrupt_response 设置 */
  vadInterruptResponse?: boolean;
}

export interface ToolCallCtx {
  toolName: string;
  toolArgs: Record<string, unknown>;
  callId: string;
}

export interface GlmSessionHooks {
  /** session.updated 后额外动作（outbound 发 skill diagram，voice 不做） */
  onSessionReady?(ws: WsSend, glmWs: NodeWebSocket): Promise<void>;

  /** 工具执行前拦截，返回 string 表示短路（voice 用于 get_skill_instructions） */
  onBeforeToolCall?(ctx: ToolCallCtx): Promise<string | null>;

  /** 工具参数注入（outbound 补 task_id/customer_name 等） */
  enrichToolArgs?(toolName: string, args: Record<string, unknown>): void;

  /** SOP Guard 检查（voice 有，outbound 无） */
  sopCheck?(toolName: string): string | null;
  sopRecord?(toolName: string, result: { success: boolean; hasData: boolean }): void;

  /** Mock 工具路由（voice 有，outbound 无） */
  mockToolCall?(name: string, args: Record<string, unknown>): { result: string; success: boolean } | null;

  /** 当前活跃 skill 名（进度追踪用） */
  getActiveSkillName?(): string | null;
  setActiveSkillName?(name: string): void;

  /** bot 完整回复后回调（进度追踪、合规检查） */
  onBotReply?(transcript: string): void;

  /** GLM 事件前置拦截（voice 的 muteNextResponse / toolProcessing / bargeIn 等） */
  onGlmEvent?(msg: any, ws: WsSend): 'handled' | 'pass';

  /** 连接关闭时回调（voice 输出 metrics、取消 agent 订阅） */
  onClose?(): void;
}

export type WsSend = { send(data: string): void };
type WsClient = WsSend & { close(): void };
type HandoffFn = (ws: WsSend, reason: string, toolArgs: Record<string, unknown>) => void;

// ── Controller ────────────────────────────────────────────────────────────────

export class GlmRealtimeController {
  private glmWs: InstanceType<typeof NodeWebSocket> | null = null;
  private ws: WsClient | null = null;
  private tts!: TtsOverride;

  constructor(
    private config: GlmSessionConfig,
    readonly state: VoiceSessionState,
    private hooks: GlmSessionHooks,
    private doTriggerHandoff: HandoffFn,
    private getPendingHandoff: () => Promise<void> | null,
  ) {}

  /** Start the GLM connection and wire up event handlers */
  start(ws: WsClient): void {
    this.ws = ws;
    const { config, hooks } = this;
    const { channel, sessionId, lang, systemPrompt, tools, voiceName } = config;

    if (!ZHIPU_API_KEY) {
      ws.send(JSON.stringify({ type: 'error', message: 'ZHIPU_API_KEY not configured' }));
      ws.close();
      return;
    }

    this.tts = new TtsOverride({ lang, sessionId, channel, ws });

    const glmUrl = `${GLM_REALTIME_URL}?model=${GLM_REALTIME_MODEL}`;
    this.glmWs = new NodeWebSocket(glmUrl, {
      headers: { Authorization: `Bearer ${ZHIPU_API_KEY}` },
    });

    this.glmWs.on('open', async () => {
      logger.info(channel, 'glm_connected', { session: sessionId, model: GLM_REALTIME_MODEL });
      logger.info(channel, 'session_config', {
        session: sessionId,
        promptLen: systemPrompt.length,
        promptHead: systemPrompt.slice(0, 150),
        toolCount: tools.length,
        toolNames: tools.map((t: any) => t.name),
      });
      this.glmWs!.send(JSON.stringify({
        event_id: crypto.randomUUID(),
        client_timestamp: Date.now(),
        type: 'session.update',
        session: {
          beta_fields: { chat_mode: 'audio' },
          modalities: ['text', 'audio'],
          instructions: systemPrompt,
          voice: voiceName,
          input_audio_format: 'pcm',
          output_audio_format: 'mp3',
          turn_detection: {
            type: 'server_vad',
            silence_duration_ms: Number(process.env.VAD_SILENCE_MS ?? 2000),
            threshold: Number(process.env.VAD_THRESHOLD ?? 0.8),
            interrupt_response: config.vadInterruptResponse ?? false,
          },
          temperature: 0.2,
          tools,
        },
      }));
    });

    this.glmWs.on('message', (data: Buffer) => this.onGlmMessage(data));
    setupGlmCloseHandlers(this.glmWs, ws, this.getPendingHandoff, sessionId, channel);
  }

  /** Forward client audio/data to GLM */
  forwardToGlm(data: string | Buffer): void {
    if (this.glmWs?.readyState === NodeWebSocket.OPEN) {
      this.glmWs.send(typeof data === 'string' ? data : data.toString());
    }
  }

  /** Clean up on client disconnect */
  close(): void {
    const { config, hooks } = this;
    hooks.onClose?.();
    logger.info(config.channel, 'client_disconnected', { session: config.sessionId });
    if (this.glmWs && this.glmWs.readyState !== NodeWebSocket.CLOSED) this.glmWs.close();
    this.glmWs = null;
    this.ws = null;
  }

  /** Handle client WS error */
  error(): void {
    logger.error(this.config.channel, 'client_ws_error', { session: this.config.sessionId });
    this.glmWs?.close();
    this.glmWs = null;
  }

  // ── Private: GLM message handler ──────────────────────────────────────────

  private async onGlmMessage(data: Buffer): Promise<void> {
    const { config, hooks, state, ws } = this;
    const { channel, sessionId, userPhone, lang } = config;
    if (!ws) return;
    const tts = this.tts;

    try {
      const text = data.toString();
      const msg = JSON.parse(text);

      logger.info(channel, 'glm_event', { session: sessionId, type: msg.type, preview: text.slice(0, 200) });

      // ── Pre-hook: handler-specific event interception ──
      if (hooks.onGlmEvent?.(msg, ws) === 'handled') return;

      // ── session.updated → trigger bot opening ──
      if (msg.type === 'session.updated') {
        logger.info(channel, 'trigger_bot_opening', { session: sessionId });
        this.glmWs!.send(JSON.stringify({
          event_id: crypto.randomUUID(),
          client_timestamp: Date.now(),
          type: 'response.create',
        }));
        await hooks.onSessionReady?.(ws, this.glmWs!);
      }

      // ── VAD events ──
      if (msg.type === 'input_audio_buffer.speech_started') {
        logger.info(channel, 'vad_speech_started', { session: sessionId, ts: msg.client_timestamp });
      }
      if (msg.type === 'input_audio_buffer.speech_stopped') {
        logger.info(channel, 'vad_speech_stopped', { session: sessionId, ts: msg.client_timestamp });
      }
      if (msg.type === 'input_audio_buffer.committed') {
        logger.info(channel, 'vad_committed', { session: sessionId, ts: msg.client_timestamp });
      }
      if (msg.type === 'conversation.item.input_audio_transcription.failed') {
        logger.info(channel, 'transcription_failed', { session: sessionId, ts: msg.client_timestamp });
      }

      // ── User transcription completed ──
      if (msg.type === 'conversation.item.input_audio_transcription.completed') {
        const transcript = (msg.transcript ?? '') as string;
        logger.info(channel, 'vad_transcription', { session: sessionId, transcript: transcript.slice(0, 100), len: transcript.length, ts: msg.client_timestamp });
        state.muteNextResponse = false;
        if (transcript) {
          state.addUserTurn(transcript);
          state.markUserEnd();
          const umId = crypto.randomUUID();
          sessionBus.publish(userPhone, { source: 'voice', type: 'user_message', text: transcript, msg_id: umId });
          runEmotionAnalysis(ws, userPhone, transcript, state.turns.slice(-5));
        }
      }

      // ── Audio delta: first pack latency + TTS interception ──
      if (msg.type === 'response.audio.delta') {
        const latency = state.markFirstAudioPack();
        if (latency !== null) {
          logger.info(channel, 'first_pack_latency', { session: sessionId, latency_ms: latency });
        }
        if (tts.active) return;
      }

      // ── TTS override: intercept transcript delta ──
      if (tts.active && msg.type === 'response.audio_transcript.delta') {
        const delta = (msg.delta ?? '') as string;
        if (delta) tts.onDelta(delta);
        return;
      }

      // ── Bot reply complete ──
      if (msg.type === 'response.audio_transcript.done') {
        const transcript = (msg.transcript ?? '') as string;
        logger.info(channel, 'bot_reply', { session: sessionId, transcript: transcript.slice(0, 200), turnCount: state.turns.length });
        if (transcript) {
          if (tts.active) tts.flushRemainder();
          state.addAssistantTurn(transcript);
          sessionBus.publish(userPhone, { source: 'voice', type: 'response', text: transcript, msg_id: crypto.randomUUID() });
          if (!state.transferTriggered && TRANSFER_PHRASE_RE.test(transcript)) {
            logger.info(channel, 'transfer_detected_via_speech', { session: sessionId });
            this.doTriggerHandoff(ws, 'user_request', {});
          }
          hooks.onBotReply?.(transcript);
        }
        if (tts.active) return;
      }

      // ── response.done ──
      if (msg.type === 'response.done') {
        const output = msg.response?.output ?? [];
        const outputTypes = (output as any[]).map((o: any) => o.type).join(',');
        logger.info(channel, 'response_done', { session: sessionId, outputTypes, outputCount: (output as any[]).length, status: msg.response?.status });
        if (state.transferTriggered && !state.farewellDone) {
          state.farewellDone = true;
        }
      }

      // ── Tool call ──
      if (msg.type === 'response.function_call_arguments.done') {
        await this.handleToolCall(msg);
        return;
      }

      // ── GLM error ──
      if (msg.type === 'error') {
        this.handleGlmError(msg);
        return;
      }

      // ── Passthrough ──
      ws.send(text);
    } catch (e) {
      logger.warn(channel, 'glm_message_error', { session: sessionId, error: String(e) });
    }
  }

  // ── Private: Tool call pipeline ───────────────────────────────────────────

  private async handleToolCall(msg: any): Promise<void> {
    const { config, hooks, state, ws } = this;
    const { channel, sessionId, userPhone, lang } = config;
    if (!ws || !this.glmWs) return;

    const toolName = msg.name as string;
    const toolArgs = JSON.parse(msg.arguments ?? '{}') as Record<string, unknown>;
    state.toolProcessing = true;
    logger.info(channel, 'tool_called', { session: sessionId, tool: toolName, args: toolArgs });

    // ── transfer_to_human ──
    if (toolName === 'transfer_to_human') {
      const reason = (toolArgs.reason ?? 'user_request') as string;
      const activeSkill = hooks.getActiveSkillName?.();
      if (activeSkill) {
        await sendSkillDiagram(ws, userPhone, activeSkill, null, lang, sessionId, channel);
      }
      try {
        this.glmWs!.send(JSON.stringify({ event_id: crypto.randomUUID(), client_timestamp: Date.now(), type: 'conversation.item.create', item: { type: 'function_call_output', call_id: msg.call_id, output: '{"ok":true}' } }));
        this.glmWs!.send(JSON.stringify({ event_id: crypto.randomUUID(), client_timestamp: Date.now(), type: 'response.create' }));
      } catch {}
      this.doTriggerHandoff(ws, reason, toolArgs);
      return;
    }

    // ── Before tool call hook (get_skill_instructions shortcircuit) ──
    const shortCircuit = await hooks.onBeforeToolCall?.({ toolName, toolArgs, callId: msg.call_id });
    if (shortCircuit !== null && shortCircuit !== undefined) {
      this.glmWs!.send(JSON.stringify({ event_id: crypto.randomUUID(), client_timestamp: Date.now(), type: 'conversation.item.create', item: { type: 'function_call_output', call_id: msg.call_id, output: shortCircuit } }));
      this.glmWs!.send(JSON.stringify({ event_id: crypto.randomUUID(), client_timestamp: Date.now(), type: 'response.create' }));
      state.toolProcessing = false;
      return;
    }

    // ── Enrich tool args ──
    hooks.enrichToolArgs?.(toolName, toolArgs);

    // ── Preprocess ──
    const currentSkillName = hooks.getActiveSkillName?.() ?? null;
    const lastUserTurn = [...state.turns].reverse().find(turn => turn.role === 'user');
    preprocessToolCall({
      channel, toolName, toolArgs,
      userPhone, lang, activeSkillName: currentSkillName,
      lastUserMessage: lastUserTurn?.text,
    });

    // ── SOP Guard check ──
    const rejection = hooks.sopCheck?.(toolName);
    if (rejection) {
      logger.warn(channel, 'sop_guard_blocked', { session: sessionId, tool: toolName });
      this.glmWs!.send(JSON.stringify({ event_id: crypto.randomUUID(), client_timestamp: Date.now(), type: 'conversation.item.create', item: { type: 'function_call_output', call_id: msg.call_id, output: JSON.stringify({ error: rejection }) } }));
      this.glmWs!.send(JSON.stringify({ event_id: crypto.randomUUID(), client_timestamp: Date.now(), type: 'response.create' }));
      state.toolProcessing = false;
      return;
    }

    // ── MCP / Mock tool call ──
    logger.info(channel, 'tool_call_start', { session: sessionId, tool: toolName, args: toolArgs });
    let result: string;
    let success: boolean;

    const mockResult = hooks.mockToolCall?.(toolName, toolArgs);
    if (mockResult) {
      result = mockResult.result;
      success = mockResult.success;
      logger.info(channel, 'mock_tool_used', { session: sessionId, tool: toolName });
    } else {
      const mcpResult = await callMcpTool(sessionId, toolName, toolArgs);
      result = mcpResult.text;
      success = mcpResult.success;
      if (success) {
        logger.info(channel, 'mcp_tool_ok', { session: sessionId, tool: toolName, preview: result.slice(0, 200) });
      } else {
        logger.warn(channel, 'mcp_tool_fail', { session: sessionId, tool: toolName, error: result });
      }
    }

    // ── Record ──
    hooks.sopRecord?.(toolName, { success, hasData: success && !result.includes('"found":false') });
    state.recordTool(toolName, toolArgs, result, success);
    logger.info(channel, 'mcp_result_raw', { session: sessionId, tool: toolName, success, resultPreview: result.slice(0, 200) });

    // ── Skill inference (if not already set) ──
    if (!hooks.getActiveSkillName?.()) {
      const inferred = inferSkillName(toolName, null);
      if (inferred) hooks.setActiveSkillName?.(inferred);
    }

    // ── Skill diagram ──
    const skillForDiagram = hooks.getActiveSkillName?.() ?? null;
    if (skillForDiagram) {
      await sendSkillDiagram(ws, userPhone, skillForDiagram, null, lang, sessionId, channel);
    }

    // ── Postprocess (text LLM spoken reply generation) ──
    const conversationHistory = state.turns.map(turn => ({ role: turn.role, content: turn.text }));
    const processed = await postprocessToolResult({
      channel, toolName, toolArgs, toolResult: result, toolSuccess: success,
      userPhone, lang,
      activeSkillName: skillForDiagram,
      conversationHistory,
    });

    let toolOutput: string;
    if (processed.spokenText) {
      toolOutput = processed.spokenText;
      logger.info(channel, 'processor_success', { session: sessionId, tool: toolName, skill: processed.skillName, chars: processed.spokenText.length });
    } else {
      toolOutput = result;
      if (lang === 'en') {
        try { toolOutput = await translateText(result, 'en'); } catch { /* keep original */ }
      }
      logger.warn(channel, 'processor_fallback', { session: sessionId, tool: toolName });
    }

    this.glmWs!.send(JSON.stringify({ event_id: crypto.randomUUID(), client_timestamp: Date.now(), type: 'conversation.item.create', item: { type: 'function_call_output', call_id: msg.call_id, output: toolOutput } }));
    this.glmWs!.send(JSON.stringify({ event_id: crypto.randomUUID(), client_timestamp: Date.now(), type: 'response.create' }));
    state.toolProcessing = false;
  }

  // ── Private: GLM error handling ───────────────────────────────────────────

  private handleGlmError(msg: any): void {
    const { config, ws } = this;
    const { channel, sessionId, userPhone, lang } = config;
    if (!ws) return;

    const errCode = msg.error?.code ?? '';
    const errMsg  = msg.error?.message ?? '';
    logger.warn(channel, 'glm_error', { session: sessionId, code: errCode, message: errMsg });

    const friendly = t('sensitive_content_error', lang);
    ws.send(JSON.stringify({ type: 'error', message: friendly }));

    sessionBus.publish(userPhone, {
      source: 'voice', type: 'compliance_alert',
      data: {
        source: 'model_filter',
        keywords: [`GLM-${errCode}`],
        text: t('sensitive_content_alert', lang) + ` [${errCode}] ${errMsg.slice(0, 80)}`,
      },
      msg_id: crypto.randomUUID(),
    });
  }
}
