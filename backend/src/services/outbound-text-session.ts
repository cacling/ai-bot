/**
 * outbound-text-session.ts — Text-mode outbound session (mode=text)
 *
 * Skips GLM-Realtime, uses generateText (Vercel AI SDK) for text-based conversation.
 * Enables E2E testing with existing chat-helpers infrastructure.
 *
 * WS protocol:
 *   Client → Server: { type: 'chat_message', message: '...' }
 *   Server → Client: { source: 'bot', type: 'response', text: '...', msg_id: '...' }
 *   Server → Client: { type: 'transfer_to_human', context: {...} }
 *   Server → Client: { type: 'error', message: '...' }
 */

import { generateText, jsonSchema, type CoreMessage } from 'ai';
import { chatModel } from '../engine/llm';
import { callMcpTool } from './mcp-client';
import { preprocessToolCall, postprocessToolResult } from './tool-call-middleware';
import { translateText } from './translate-lang';
import { logger } from './logger';
import { sessionBus } from './session-bus';
import { sendSkillDiagram, runProgressTracking, triggerHandoff } from './voice-common';
import { VoiceSessionState } from './voice-session';
import { t, OUTBOUND_TOOL_LABELS } from './i18n';

// ── Types ─────────────────────────────────────────────────────────────────────

type WsSend = { send(data: string): void };

export interface OutboundTextConfig {
  sessionId: string;
  userPhone: string;
  lang: 'zh' | 'en';
  systemPrompt: string;
  /** GLM-format tool definitions (converted to Vercel AI SDK format internally) */
  glmTools: Array<Record<string, unknown>>;
  taskParam: 'collection' | 'marketing';
  taskId: string;
  resolvedTask: Record<string, unknown>;
}

// ── Session ───────────────────────────────────────────────────────────────────

export class OutboundTextSession {
  private history: CoreMessage[] = [];
  private state: VoiceSessionState;
  private skillName: string;
  private tools: Record<string, unknown>;

  constructor(private config: OutboundTextConfig) {
    this.state = new VoiceSessionState(config.userPhone, config.sessionId);
    this.skillName = config.taskParam === 'collection' ? 'outbound-collection' : 'outbound-marketing';
    this.tools = this.buildTools();
  }

  /** WS onOpen: generate bot opening (no user message) */
  async start(ws: WsSend): Promise<void> {
    const { sessionId, userPhone, lang } = this.config;
    logger.info('outbound-text', 'session_start', { session: sessionId, phone: userPhone, lang });

    // Send skill diagram
    await sendSkillDiagram(ws, userPhone, this.skillName, null, lang, sessionId, 'outbound');

    // Generate opening
    try {
      const result = await generateText({
        model: chatModel,
        system: this.config.systemPrompt,
        messages: [{ role: 'user', content: '（客户已接听电话，请按照流程开始对话）' }],
        tools: this.tools as any,
        maxSteps: 5,
      });

      const text = result.text || '你好，请问是本人吗？';
      this.history.push({ role: 'user', content: '（客户已接听电话）' });
      this.history.push({ role: 'assistant', content: text });
      this.state.addAssistantTurn(text);

      const msgId = crypto.randomUUID();
      ws.send(JSON.stringify({ source: 'bot', type: 'response', text, msg_id: msgId }));
      sessionBus.publish(userPhone, { source: 'voice', type: 'response', text, msg_id: msgId });

      logger.info('outbound-text', 'opening_sent', { session: sessionId, text: text.slice(0, 100) });
    } catch (e) {
      logger.error('outbound-text', 'opening_error', { session: sessionId, error: String(e) });
      ws.send(JSON.stringify({ type: 'error', message: String(e) }));
    }
  }

  /** WS onMessage: process user message */
  async handleMessage(raw: string, ws: WsSend): Promise<void> {
    const { sessionId, userPhone, lang } = this.config;

    let payload: { type: string; message: string };
    try {
      payload = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }
    if (payload.type !== 'chat_message') return;

    const message = payload.message;
    logger.info('outbound-text', 'user_message', { session: sessionId, preview: message.slice(0, 60) });
    this.state.addUserTurn(message);
    this.history.push({ role: 'user', content: message });
    sessionBus.publish(userPhone, { source: 'voice', type: 'user_message', text: message, msg_id: crypto.randomUUID() });

    try {
      const result = await generateText({
        model: chatModel,
        system: this.config.systemPrompt,
        messages: this.history,
        tools: this.tools as any,
        maxSteps: 10,
      });

      const text = result.text || '';

      // Append response messages to history for multi-turn context
      if (result.response?.messages) {
        for (const msg of result.response.messages) {
          this.history.push(msg);
        }
      } else if (text) {
        this.history.push({ role: 'assistant', content: text });
      }

      if (text) {
        this.state.addAssistantTurn(text);
        const msgId = crypto.randomUUID();
        ws.send(JSON.stringify({ source: 'bot', type: 'response', text, msg_id: msgId }));
        sessionBus.publish(userPhone, { source: 'voice', type: 'response', text, msg_id: msgId });

        // Progress tracking
        runProgressTracking(ws, userPhone, this.skillName, this.state.turns.slice(-6), lang, sessionId, 'outbound');
      }

      logger.info('outbound-text', 'response_sent', { session: sessionId, text_len: text.length, steps: result.steps?.length ?? 0 });
    } catch (e) {
      logger.error('outbound-text', 'generate_error', { session: sessionId, error: String(e) });
      ws.send(JSON.stringify({ type: 'error', message: String(e) }));
    }
  }

  // ── Private: Build Vercel AI SDK tools from GLM definitions ───────────────

  private buildTools(): Record<string, unknown> {
    const { sessionId, userPhone, lang, taskId, resolvedTask, taskParam } = this.config;
    const tools: Record<string, unknown> = {};

    for (const glmTool of this.config.glmTools) {
      const name = glmTool.name as string;
      const description = glmTool.description as string;
      const parameters = glmTool.parameters as Record<string, unknown>;

      tools[name] = {
        description,
        parameters: jsonSchema(parameters as any),
        execute: async (args: Record<string, unknown>) => {
          logger.info('outbound-text', 'tool_call', { session: sessionId, tool: name, args });

          // transfer_to_human
          if (name === 'transfer_to_human') {
            logger.info('outbound-text', 'transfer_to_human', { session: sessionId, reason: args.reason });
            return { content: [{ type: 'text', text: '{"ok":true}' }] };
          }

          // Enrich args (same as voice mode)
          if (name === 'create_callback_task') {
            const customerName = (resolvedTask as Record<string, unknown>).customer_name as string ?? '';
            const productName  = (resolvedTask as Record<string, unknown>).product_name as string ?? '';
            if (!args.original_task_id) args.original_task_id = taskId;
            if (!args.callback_phone) args.callback_phone = userPhone;
            if (!args.customer_name) args.customer_name = customerName;
            if (!args.product_name) args.product_name = productName;
          } else if (name === 'send_followup_sms') {
            if (!args.phone) args.phone = userPhone;
          }

          // Preprocess
          const lastUserTurn = [...this.state.turns].reverse().find(turn => turn.role === 'user');
          preprocessToolCall({
            channel: 'outbound', toolName: name, toolArgs: args,
            userPhone, lang, activeSkillName: this.skillName,
            lastUserMessage: lastUserTurn?.text,
          });

          // MCP call
          const mcpResult = await callMcpTool(sessionId, name, args);
          this.state.recordTool(name, args, mcpResult.text, mcpResult.success);
          logger.info('outbound-text', 'mcp_result', { session: sessionId, tool: name, success: mcpResult.success, preview: mcpResult.text.slice(0, 200) });

          // Postprocess
          const conversationHistory = this.state.turns.map(turn => ({ role: turn.role, content: turn.text }));
          const processed = await postprocessToolResult({
            channel: 'outbound', toolName: name, toolArgs: args,
            toolResult: mcpResult.text, toolSuccess: mcpResult.success,
            userPhone, lang, activeSkillName: this.skillName,
            conversationHistory,
          });

          let output = processed.spokenText ?? mcpResult.text;
          if (!processed.spokenText && lang === 'en') {
            try { output = await translateText(mcpResult.text, 'en'); } catch { /* keep original */ }
          }

          return { content: [{ type: 'text', text: output }] };
        },
      };
    }

    return tools;
  }
}
