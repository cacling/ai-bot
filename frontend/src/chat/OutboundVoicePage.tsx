/**
 * OutboundVoicePage — 语音外呼机器人页面
 *
 * 与 VoiceChatPage（入呼）的核心区别：
 * 1. 连接建立前，先选择任务类型（催收/营销）和具体案件/任务
 * 2. 连接后机器人先开口说开场白（后端触发 response.create）
 * 3. WS 端点为 /ws/outbound?task=collection&id=C001
 */

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Square, Phone, Headset } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { nowTime } from '../App';
import type { ActiveDiagram } from '../shared/DiagramPanel';
import { T, type Lang } from '../i18n';
import { broadcastUserSwitch } from './userSync';
import type { OutboundTask } from './outboundData';
import { useVoiceEngine, type VoiceMessage, type HandoffContext } from './hooks/useVoiceEngine';

// ── 类型 ──────────────────────────────────────────────────────────────────────

export type TaskType = 'collection' | 'marketing';

// ── 消息气泡（memo 防止流式更新时全部重渲染）──────────────────────────────────

const OutboundBubble = memo(function OutboundBubble({ msg }: { msg: VoiceMessage }) {
  return (
    <div className={`flex w-full mb-4 ${msg.role === 'bot' ? 'justify-start' : 'justify-end'}`}>
      {msg.role === 'bot' && (
        <div className="flex-shrink-0 mr-3">
          <div className="w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center">
            <Phone size={16} />
          </div>
        </div>
      )}
      <div className={`flex flex-col ${msg.role === 'bot' ? 'items-start' : 'items-end'} max-w-[82%]`}>
        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
          msg.role === 'bot'
            ? 'bg-background text-foreground rounded-tl-none shadow-sm border border-border'
            : 'bg-primary text-primary-foreground rounded-tr-none shadow-sm'
        }`}>
          {msg.role === 'bot' ? (
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
            </div>
          ) : (
            <span className={msg.text === '...' ? 'text-primary-foreground/50 italic' : ''}>{msg.text}</span>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground mt-1 px-1">{msg.time}</span>
      </div>
      {msg.role === 'user' && (
        <div className="flex-shrink-0 ml-3">
          <div className="w-8 h-8 bg-muted text-muted-foreground rounded-full flex items-center justify-center text-xs font-medium">
            客
          </div>
        </div>
      )}
    </div>
  );
});

// ── 主组件 ────────────────────────────────────────────────────────────────────

interface OutboundVoicePageProps {
  onDiagramUpdate?: (diagram: ActiveDiagram) => void;
  lang?: Lang;
  taskType?: TaskType;
  tasks?: OutboundTask[];
  selectedId?: string;
  onSelectedIdChange?: (id: string) => void;
}

export function OutboundVoicePage({ onDiagramUpdate, lang = 'zh', taskType = 'collection', tasks = [], selectedId = 'C001', onSelectedIdChange }: OutboundVoicePageProps = {}) {
  const t = T[lang];

  // ── 共享 Hook ──
  const {
    connState, setConnState,
    messages, setMessages,
    errorMsg, setErrorMsg,
    handoffCtx, setHandoffCtx,
    wsRef, messagesEndRef,
    pendingUserIdRef, botMsgIdRef, botTextRef,
    transferToBotRef, disconnectRef, connectRef,
    upsertMsg, nextMsgId,
    playChunk, stopPlayback, stopMic,
    connectWs, disconnect, reset,
  } = useVoiceEngine('idle');

  // ── 页面特有状态 ──
  const micReadyRef = useRef(false);
  const prevLangRef = useRef(lang);

  // 当前外呼任务对应的客户手机号
  const selectedPhone = tasks.find(t => t.id === selectedId)?.phone ?? '';

  // 切换任务类型或案件时，断开当前通话并清空对话
  useEffect(() => {
    disconnectRef.current();
    setMessages([]);
    setErrorMsg('');
    setHandoffCtx(null);
    if (selectedPhone) broadcastUserSwitch(selectedPhone);
  }, [taskType, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── GLM 事件处理 ───────────────────────────────────────────────────────────
  const handleGlmEvent = useCallback((msg: Record<string, unknown>) => {
    const type = (msg.type as string) ?? '';

    if (type === 'session.created' || type === 'session.updated') {
      setConnState('ringing');
      return;
    }

    if (type === 'input_audio_buffer.speech_started') {
      setConnState('listening');
      if (connState !== 'responding') stopPlayback();
      botMsgIdRef.current = null; botTextRef.current = '';
      const id = nextMsgId();
      pendingUserIdRef.current = id;
      upsertMsg({ id, role: 'user', text: '...', time: nowTime() });
      return;
    }

    if (type === 'input_audio_buffer.speech_stopped') {
      setConnState('thinking');
      return;
    }

    if (type.includes('transcription')) {
      const transcript = (msg.transcript ?? msg.delta ?? '') as string;
      if (transcript && pendingUserIdRef.current != null) {
        upsertMsg({ id: pendingUserIdRef.current, role: 'user', text: transcript, time: nowTime() });
      }
      return;
    }

    if (type === 'response.audio_transcript.delta' && msg.delta != null) {
      setConnState('responding');
      const delta = msg.delta as string;
      if (!botMsgIdRef.current) {
        const id = nextMsgId();
        botMsgIdRef.current = id; botTextRef.current = delta;
        upsertMsg({ id, role: 'bot', text: delta, time: nowTime() });
      } else {
        botTextRef.current += delta;
        upsertMsg({ id: botMsgIdRef.current, role: 'bot', text: botTextRef.current, time: nowTime() });
      }
      return;
    }

    if (type === 'response.audio.delta' && msg.delta) {
      setConnState('responding');
      playChunk(msg.delta as string);
      return;
    }

    // 非中文模式：后端翻译 + TTS 生成的分句音频
    if (type === 'tts_override') {
      setConnState('responding');
      const text = (msg.text ?? '') as string;
      if (text) {
        if (!botMsgIdRef.current) {
          const id = nextMsgId();
          botMsgIdRef.current = id;
          botTextRef.current = text;
          upsertMsg({ id, role: 'bot', text, time: nowTime() });
        } else {
          botTextRef.current += text;
          upsertMsg({ id: botMsgIdRef.current, role: 'bot', text: botTextRef.current, time: nowTime() });
        }
      }
      if (msg.audio) playChunk(msg.audio as string);
      return;
    }

    if (type === 'response.done') {
      if (!micReadyRef.current) {
        micReadyRef.current = true;
      }
      setConnState('listening');
      botMsgIdRef.current = null; botTextRef.current = '';
      pendingUserIdRef.current = null;
      return;
    }

    if (type === 'skill_diagram_update') {
      onDiagramUpdate?.({ skill_name: msg.skill_name as string, mermaid: msg.mermaid as string, nodeTypeMap: msg.node_type_map as Record<string, string> | undefined });
      return;
    }

    if (type === 'transfer_to_human') {
      stopMic();
      setConnState('transferred');
      setHandoffCtx(msg.context as HandoffContext);
      return;
    }

    // 转回机器人
    if (type === 'transfer_to_bot') {
      transferToBotRef.current = true;
      setHandoffCtx(null);
      disconnectRef.current();
      return;
    }

    // 坐席消息：播放 TTS 音频并显示文字气泡
    if (type === 'agent_audio') {
      const text = (msg.text ?? msg.original_text ?? '') as string;
      if (text) upsertMsg({ id: nextMsgId(), role: 'bot', text, time: nowTime() });
      if (msg.audio) playChunk(msg.audio as string);
      return;
    }

    // 坐席消息（TTS 失败降级）
    if (type === 'agent_message') {
      const text = (msg.text ?? '') as string;
      if (text) upsertMsg({ id: nextMsgId(), role: 'bot', text, time: nowTime() });
      return;
    }

    if (type === 'error') {
      console.error('[GLM outbound error]', msg);
      const errText = (msg.message ?? (msg.error as Record<string, unknown>)?.message ?? JSON.stringify(msg)) as string;
      setErrorMsg(errText);
      disconnectRef.current();
    }
  }, [upsertMsg, playChunk, stopPlayback, onDiagramUpdate, connState, stopMic]);

  // ── 开始外呼 ───────────────────────────────────────────────────────────────
  const startCall = useCallback(async () => {
    micReadyRef.current = false;
    const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/outbound?task=${taskType}&id=${selectedId}&lang=${lang}&phone=${selectedPhone}`;
    await connectWs(wsUrl, handleGlmEvent, { micGateRef: micReadyRef, micDeniedLabel: t.outbound_mic_denied });
  }, [taskType, selectedId, handleGlmEvent, connectWs, lang, selectedPhone, t]);

  useEffect(() => { connectRef.current = startCall; }, [startCall]);

  // 语言切换时：若通话进行中，自动断开并以新语言重连
  useEffect(() => {
    if (lang === prevLangRef.current) return;
    prevLangRef.current = lang;
    const inCall = connState !== 'idle' && connState !== 'connecting';
    if (inCall) {
      disconnect();
      setTimeout(() => { connectRef.current(); }, 300);
    }
  }, [lang, connState, disconnect]);

  const handleReset = () => {
    reset();
    setConnState('idle');
  };

  const isInCall = connState !== 'idle' && connState !== 'connecting' && connState !== 'transferred' && connState !== 'ended';

  const statusColor =
    connState === 'ringing'    ? 'text-primary' :
    connState === 'listening'  ? 'text-destructive'  :
    connState === 'responding' ? 'text-primary':
    connState === 'thinking'   ? 'text-primary' :
    connState === 'transferred'? 'text-muted-foreground':
    'text-muted-foreground';

  // ── 渲染 ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col w-full max-w-md self-stretch gap-2">



    <div className="flex-1 min-h-0 bg-muted rounded-3xl shadow-xl overflow-hidden flex flex-col border border-border">

      {/* Header — 仅保留标题 */}
      <div className="bg-primary px-4 py-3 flex items-center rounded-b-xl shadow-sm z-10 relative flex-shrink-0">
        <Phone size={18} className="text-primary-foreground mr-2 flex-shrink-0" />
        <h1 className="text-sm font-semibold text-primary-foreground tracking-wide">{t.outbound_bot_name}</h1>
      </div>

      {/* 对话记录 */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <Phone size={24} className="text-primary" />
            </div>
            <p className={`text-sm font-medium ${statusColor}`}>{t.outbound_state[connState]}</p>
          </div>
        ) : (
          <>
            {messages.length > 0 && (
              <div className="flex justify-center mb-6">
                <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  {new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric' })}
                </span>
              </div>
            )}

            {messages.map(msg => (
              <OutboundBubble key={msg.id} msg={msg} />
            ))}

            {/* 思考中 */}
            {connState === 'thinking' && (
              <div className="flex w-full mb-4 justify-start items-center space-x-3">
                <div className="w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center flex-shrink-0">
                  <Phone size={16} />
                </div>
                <div className="bg-background px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center space-x-1.5 border border-border">
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            {/* 转人工状态提示 */}
            {handoffCtx && (
              <div className="mx-1 mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent border border-border text-sm text-muted-foreground">
                <Headset size={15} className="flex-shrink-0" />
                <span className="font-medium">{t.outbound_handoff_title}</span>
                <span className="text-muted-foreground text-xs">
                  · {t.outbound_transfer_reason[handoffCtx.transfer_reason] ?? handoffCtx.transfer_reason}
                </span>
              </div>
            )}

            {errorMsg && (
              <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg text-center mb-2">{errorMsg}</p>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* 控制区（固定高度，防止动画导致布局跳动） */}
      <div className="bg-background border-t border-border px-6 flex flex-col items-center justify-center shrink-0 h-[160px] overflow-hidden">
        <p className={`text-sm font-medium transition-colors ${statusColor}`}>
          {t.outbound_state[connState]}
        </p>

        <div className="relative flex items-center justify-center w-28 h-28 my-1">
          {connState === 'ringing' && (
            <>
              <span className="absolute inset-0 m-auto w-28 h-28 rounded-full bg-primary opacity-15 animate-ping" />
              <span className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-primary opacity-20 animate-ping" style={{ animationDelay: '0.2s' }} />
            </>
          )}
          {connState === 'responding' && (
            <span className="absolute inset-0 m-auto w-24 h-24 rounded-full bg-primary opacity-15 animate-ping" />
          )}
          {connState === 'listening' && (
            <span className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-destructive opacity-15 animate-pulse" />
          )}

          {connState === 'idle' ? (
            <Button
              onClick={startCall}
              className="relative w-16 h-16 rounded-full shadow-lg transition-all duration-200"
            >
              <Phone size={26} />
            </Button>
          ) : connState === 'connecting' ? (
            <Button disabled className="relative w-16 h-16 rounded-full shadow-lg bg-muted text-muted-foreground cursor-not-allowed">
              <div className="w-6 h-6 border-2 border-background border-t-transparent rounded-full animate-spin" />
            </Button>
          ) : connState === 'transferred' ? (
            <Button
              onClick={() => { disconnect(); setConnState('ended'); }}
              variant="destructive"
              className="relative w-16 h-16 rounded-full shadow-lg transition-all duration-200 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Square size={22} fill="currentColor" />
            </Button>
          ) : connState === 'ended' ? (
            <Button disabled className="relative w-16 h-16 rounded-full shadow-lg bg-muted text-muted-foreground cursor-not-allowed">
              <Phone size={26} />
            </Button>
          ) : (
            <Button
              onClick={() => { disconnect(); setConnState('ended'); }}
              variant="destructive"
              className="relative w-16 h-16 rounded-full shadow-lg transition-all duration-200 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Square size={22} fill="currentColor" />
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {connState === 'idle'
            ? t.outbound_hint_idle
            : isInCall || connState === 'transferred'
            ? t.outbound_hint_active
            : '\u00A0'}
        </p>
      </div>
    </div>
    </div>
  );
}
