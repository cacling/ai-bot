/**
 * VoiceChatPage — GLM-Realtime 语音客服页面
 *
 * 音频链路：
 *   麦克风 → AudioContext(16kHz) → ScriptProcessorNode → Int16 PCM → base64
 *   → WS → 后端代理 → GLM-Realtime
 *
 *   GLM-Realtime → 后端代理 → WS → base64 MP3 → MediaSource → <audio> → 扬声器
 */

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Mic, Square, Bot, User, Headset } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { nowTime } from '../App';
import type { ActiveDiagram } from '../shared/DiagramPanel';
import { T, type Lang } from '../i18n';
import type { TestPersona } from './testPersonas';
import { broadcastUserSwitch } from './userSync';
import { useVoiceEngine, type VoiceMessage, type HandoffContext, type EmotionResult } from './hooks/useVoiceEngine';

// ── 常量 ──────────────────────────────────────────────────────────────────────

const EMOTION_CLASS: Record<string, string> = {
  gray:   'text-muted-foreground bg-muted',
  green:  'text-primary           bg-primary/10',
  amber:  'text-muted-foreground  bg-accent',
  orange: 'text-muted-foreground  bg-accent',
  red:    'text-destructive       bg-destructive/10',
};

// ── 消息气泡（memo 防止流式更新时全部重渲染）──────────────────────────────────

const VoiceMessageBubble = memo(function VoiceMessageBubble({ msg, lang }: { msg: VoiceMessage; lang: Lang }) {
  const t = T[lang];

  if (msg.role === 'handoff') {
    return (
      <div className="mx-1 mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent border border-border text-sm text-muted-foreground">
        <Headset size={15} className="flex-shrink-0" />
        <span className="font-medium">{t.voice_handoff_title}</span>
        {msg.handoffCtx && (
          <span className="text-muted-foreground text-xs">
            · {t.voice_transfer_reason[msg.handoffCtx.transfer_reason] ?? msg.handoffCtx.transfer_reason}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex w-full mb-4 ${msg.role !== 'user' ? 'justify-start' : 'justify-end'}`}>
      {msg.role === 'bot' && (
        <div className="flex-shrink-0 mr-3">
          <div className="w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center">
            <Bot size={18} />
          </div>
        </div>
      )}
      {msg.role === 'agent' && (
        <div className="flex-shrink-0 mr-3">
          <div className="w-8 h-8 bg-accent text-accent-foreground rounded-full flex items-center justify-center">
            <Headset size={18} />
          </div>
        </div>
      )}
      <div className={`flex flex-col ${msg.role !== 'user' ? 'items-start' : 'items-end'} max-w-[82%]`}>
        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
          msg.role === 'bot'
            ? 'bg-background text-foreground rounded-tl-none shadow-sm border border-border'
            : msg.role === 'agent'
            ? 'bg-accent text-foreground rounded-tl-none shadow-sm border border-border'
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
          <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center">
            <User size={18} />
          </div>
        </div>
      )}
    </div>
  );
});

// ── 组件 ──────────────────────────────────────────────────────────────────────
interface VoiceChatPageProps {
  onDiagramUpdate?: (diagram: ActiveDiagram) => void;
  lang?: Lang;
  personas?: TestPersona[];
  selectedPhone?: string;
  onPhoneChange?: (phone: string) => void;
}

export function VoiceChatPage({ onDiagramUpdate, lang = 'zh', personas = [], selectedPhone, onPhoneChange }: VoiceChatPageProps = {}) {
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
  } = useVoiceEngine('disconnected');

  // ── 页面特有状态 ──
  const [selectedUserPhone, setSelectedUserPhone] = useState<string>(selectedPhone ?? (personas[0]?.context.phone as string) ?? '');
  const transferredRef    = useRef(false);
  const needResumeRef     = useRef(false);
  const prevLangRef       = useRef(lang);

  // 当 personas 列表从空变为有值时，设定默认选中用户
  useEffect(() => {
    if (personas.length > 0 && !selectedUserPhone) {
      setSelectedUserPhone((personas[0].context.phone as string) ?? '');
    }
  }, [personas, selectedUserPhone]);

  // 外部 selectedPhone prop 变化时，同步内部状态并重置对话
  useEffect(() => {
    if (selectedPhone !== undefined && selectedPhone !== selectedUserPhone) {
      setSelectedUserPhone(selectedPhone);
      setMessages([]);
      setHandoffCtx(null);
      setErrorMsg('');
    }
  }, [selectedPhone]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 处理 GLM 事件 ─────────────────────────────────────────────────────────
  const handleGlmEvent = useCallback((msg: Record<string, unknown>) => {
    const type = (msg.type as string) ?? '';

    // 会话就绪
    if (type === 'session.created' || type === 'session.updated') {
      setConnState('idle');
      return;
    }

    // VAD：用户开始说话
    if (type === 'input_audio_buffer.speech_started') {
      setConnState('listening');
      if (connState !== 'responding') stopPlayback();
      botMsgIdRef.current = null;
      botTextRef.current = '';
      const id = nextMsgId();
      pendingUserIdRef.current = id;
      upsertMsg({ id, role: 'user', text: '...', time: nowTime() });
      return;
    }

    // VAD：用户停止说话
    if (type === 'input_audio_buffer.speech_stopped') {
      if (!transferredRef.current) setConnState('thinking');
      return;
    }

    // 输入音频转写
    if (type.includes('transcription')) {
      const transcript = (msg.transcript ?? msg.delta ?? '') as string;
      if (transcript && pendingUserIdRef.current != null) {
        upsertMsg({ id: pendingUserIdRef.current, role: 'user', text: transcript, time: nowTime() });
      }
      return;
    }

    // Bot 音频字幕增量
    if (type === 'response.audio_transcript.delta' && msg.delta != null) {
      setConnState('responding');
      const delta = msg.delta as string;
      if (!botMsgIdRef.current) {
        const id = nextMsgId();
        botMsgIdRef.current = id;
        botTextRef.current = delta;
        upsertMsg({ id, role: 'bot', text: delta, time: nowTime() });
      } else {
        botTextRef.current += delta;
        upsertMsg({ id: botMsgIdRef.current, role: 'bot', text: botTextRef.current, time: nowTime() });
      }
      return;
    }

    // Bot 音频增量
    if (type === 'response.audio.delta' && msg.delta) {
      setConnState('responding');
      playChunk(msg.delta as string);
      return;
    }

    // 非中文模式：后端翻译 + TTS 生成的分句音频（替代 GLM 中文音频）
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

    // 本轮回复完成
    if (type === 'response.done') {
      setConnState('idle');
      botMsgIdRef.current = null;
      botTextRef.current = '';
      pendingUserIdRef.current = null;
      return;
    }

    // 情绪识别结果
    if (type === 'emotion_update') {
      const { text: transcript, emotion } = msg as { text: string; emotion: EmotionResult };
      setMessages(prev => prev.map(m =>
        m.role === 'user' && m.text === transcript ? { ...m, emotion } : m
      ));
      return;
    }

    // Skill 时序图推送
    if (type === 'skill_diagram_update') {
      onDiagramUpdate?.({ skill_name: msg.skill_name as string, mermaid: msg.mermaid as string, nodeTypeMap: msg.node_type_map as Record<string, string> | undefined, progressState: msg.progress_state as string | undefined });
      return;
    }

    // 转人工
    if (type === 'transfer_to_human') {
      transferredRef.current = true;
      const ctx = msg.context as HandoffContext;
      setConnState('transferred');
      setHandoffCtx(ctx);
      setMessages(prev => [...prev, { id: nextMsgId(), role: 'handoff', text: '', time: nowTime(), handoffCtx: ctx }]);
      return;
    }

    // 转回机器人
    if (type === 'transfer_to_bot') {
      transferToBotRef.current = true;
      needResumeRef.current = true;
      transferredRef.current = false;
      console.log('[VoiceChat] transfer_to_bot: needResumeRef=true, will reconnect with resume=true');
      setHandoffCtx(null);
      disconnectRef.current();
      return;
    }

    // 坐席消息：播放 TTS 音频并显示文字气泡
    if (type === 'agent_audio') {
      const text = (msg.text ?? msg.original_text ?? '') as string;
      if (text) upsertMsg({ id: nextMsgId(), role: 'agent', text, time: nowTime() });
      if (msg.audio) playChunk(msg.audio as string);
      return;
    }

    // 坐席消息（TTS 失败降级）
    if (type === 'agent_message') {
      const text = (msg.text ?? '') as string;
      if (text) upsertMsg({ id: nextMsgId(), role: 'agent', text, time: nowTime() });
      return;
    }

    // 错误
    if (type === 'error') {
      console.error('[GLM error]', msg);
      const errText = (msg.message ?? (msg.error as Record<string, unknown>)?.message ?? JSON.stringify(msg)) as string;
      setErrorMsg(errText);
      disconnectRef.current();
    }
  }, [upsertMsg, playChunk, stopPlayback, onDiagramUpdate, stopMic]);

  // ── 建立连接 ──────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    const resumeFlag = needResumeRef.current ? '&resume=true' : '';
    needResumeRef.current = false;
    console.log('[VoiceChat] connect: resumeFlag=', resumeFlag || '(none)', 'phone=', selectedUserPhone);
    const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/voice?lang=${lang}&phone=${selectedUserPhone}${resumeFlag}`;
    await connectWs(wsUrl, handleGlmEvent, { micDeniedLabel: t.outbound_mic_denied });
  }, [connectWs, handleGlmEvent, lang, selectedUserPhone, t]);

  useEffect(() => { connectRef.current = connect; }, [connect]);

  // 语言切换时：若语音通话进行中，自动断开并以新语言重连
  useEffect(() => {
    if (lang === prevLangRef.current) return;
    prevLangRef.current = lang;
    if (connState !== 'disconnected' && connState !== 'connecting') {
      disconnect();
      // 等断开完成后用新 lang 重连（connect 已通过 useCallback 绑定最新 lang）
      setTimeout(() => { connectRef.current(); }, 300);
    }
  }, [lang, connState, disconnect]);

  // ── UI 交互 ───────────────────────────────────────────────────────────────
  const handleMainBtn = () => {
    if (connState === 'disconnected') connect();
    else disconnect();
  };

  const handleReset = () => {
    reset();
    setHandoffCtx(null);
  };

  const handleManualTransfer = () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      event_id: crypto.randomUUID(),
      client_timestamp: Date.now(),
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: lang === 'zh' ? '请转人工客服' : 'Please transfer me to a human agent' }],
      },
    }));
    ws.send(JSON.stringify({
      event_id: crypto.randomUUID(),
      client_timestamp: Date.now(),
      type: 'response.create',
    }));
  };

  const isConnected = connState !== 'disconnected' && connState !== 'connecting' && connState !== 'transferred';

  const btnClass =
    connState === 'disconnected' ? 'bg-primary hover:bg-primary/90 shadow text-primary-foreground' :
    connState === 'connecting'   ? 'bg-muted cursor-not-allowed text-muted-foreground' :
    connState === 'transferred'  ? 'bg-destructive hover:bg-destructive/90 shadow text-destructive-foreground' :
                                   'bg-destructive hover:bg-destructive/90 shadow text-destructive-foreground';

  const statusColor =
    connState === 'listening'   ? 'text-destructive' :
    connState === 'responding'  ? 'text-primary' :
    connState === 'thinking'    ? 'text-primary' :
    connState === 'transferred' ? 'text-muted-foreground' :
    'text-muted-foreground';

  const voiceUserSelectorDisabled = connState !== 'disconnected';
  const voiceCurrentUser = personas.find(p => (p.context.phone as string) === selectedUserPhone) ?? personas[0];

  // ── 渲染 ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col w-full max-w-md self-stretch gap-2">



      {/* 对话框 */}
      <div className="flex-1 bg-muted rounded-3xl shadow-xl overflow-hidden flex flex-col border border-border min-h-0">

      {/* Header — 仅保留标题 */}
      <div className="bg-primary px-4 py-3 flex items-center rounded-b-xl shadow-sm z-10 relative flex-shrink-0">
        <Mic size={18} className="text-primary-foreground mr-2 flex-shrink-0" />
        <h1 className="text-sm font-semibold text-primary-foreground tracking-wide">{t.voice_bot_name}</h1>
      </div>

      {/* 对话记录 */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
            <Mic size={44} className="text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">{t.voice_empty_title}</p>
            <p className="text-xs text-muted-foreground">{t.voice_empty_subtitle}</p>
            {errorMsg && (
              <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg max-w-xs">{errorMsg}</p>
            )}
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-6">
              <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                {new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric' })}
              </span>
            </div>
            {messages.map(msg => (
              <VoiceMessageBubble key={msg.id} msg={msg} lang={lang} />
            ))}

            {/* 思考中动画（转人工后不显示） */}
            {connState === 'thinking' && (
              <div className="flex w-full mb-4 justify-start items-center space-x-3">
                <div className="w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center flex-shrink-0">
                  <Bot size={18} />
                </div>
                <div className="bg-background px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center space-x-1.5 border border-border">
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            {errorMsg && (
              <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg text-center mb-2">{errorMsg}</p>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* 语音控制区（固定高度，防止动画导致布局跳动） */}
      <div className="bg-background border-t border-border px-6 flex flex-col items-center justify-center shrink-0 h-[160px] overflow-hidden">
        {/* 状态文字 */}
        <p className={`text-sm font-medium transition-colors ${statusColor}`}>
          {t.voice_state[connState]}
        </p>

        {/* 主按钮 */}
        <div className="relative flex items-center justify-center w-28 h-28 my-1">
          {connState === 'listening' && (
            <>
              <span className="absolute inset-0 m-auto w-28 h-28 rounded-full bg-destructive opacity-15 animate-ping" />
              <span className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-destructive opacity-20 animate-ping" style={{ animationDelay: '0.2s' }} />
            </>
          )}
          {connState === 'responding' && (
            <span className="absolute inset-0 m-auto w-24 h-24 rounded-full bg-primary opacity-15 animate-ping" />
          )}
          {(connState === 'idle') && (
            <span className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-primary opacity-10 animate-pulse" />
          )}
          <Button
            onClick={handleMainBtn}
            disabled={connState === 'connecting'}
            className={`relative w-16 h-16 rounded-full shadow-lg transition-all duration-200 ${btnClass}`}
          >
            {connState === 'connecting' ? (
              <div className="w-6 h-6 border-2 border-background border-t-transparent rounded-full animate-spin" />
            ) : connState === 'disconnected' ? (
              <Mic size={28} />
            ) : (
              <Square size={22} fill="currentColor" />
            )}
          </Button>
        </div>

        {/* 底部说明 */}
        <p className="text-xs text-muted-foreground">
          {connState === 'disconnected'
            ? t.voice_hint_idle
            : isConnected
            ? t.voice_hint_active
            : '\u00A0'}
        </p>
      </div>

      </div>
    </div>
  );
}
