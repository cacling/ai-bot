/**
 * VoiceChatPage — GLM-Realtime 语音客服页面
 *
 * 音频链路：
 *   麦克风 → AudioContext(16kHz) → ScriptProcessorNode → Int16 PCM → base64
 *   → WS → 后端代理 → GLM-Realtime
 *
 *   GLM-Realtime → 后端代理 → WS → base64 MP3 → MediaSource → <audio> → 扬声器
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Mic, Square, Bot, User, Headset } from 'lucide-react';
import { nowTime } from '../App';
import type { ActiveDiagram } from '../components/DiagramPanel';
import { T, type Lang } from '../i18n';
import type { MockUser } from '../mockUsers';
import { broadcastUserSwitch } from '../userSync';

// ── 类型 ──────────────────────────────────────────────────────────────────────
type ConnState =
  | 'disconnected'   // 未连接
  | 'connecting'     // 连接中
  | 'idle'           // 已连接，等待用户说话
  | 'listening'      // server_vad 检测到用户在说话
  | 'thinking'       // 用户停止说话，等待模型回复
  | 'responding'     // 模型正在输出音频/文字
  | 'transferred';   // 已转人工

interface EmotionResult {
  label: string;
  emoji: string;
  color: string;
}

interface VoiceMessage {
  id: number;
  role: 'user' | 'bot' | 'agent' | 'handoff';
  text: string;
  time: string;
  emotion?: EmotionResult;
  handoffCtx?: HandoffContext;
}

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

const EMOTION_CLASS: Record<string, string> = {
  gray:   'text-gray-500   bg-gray-100',
  green:  'text-green-600  bg-green-50',
  amber:  'text-amber-600  bg-amber-50',
  orange: 'text-orange-600 bg-orange-50',
  red:    'text-red-600    bg-red-50',
};

// ── 常量（仅保留非文字部分） ───────────────────────────────────────────────────

// ── 音频工具 ──────────────────────────────────────────────────────────────────
function float32ToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(bin);
}

function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ── 组件 ──────────────────────────────────────────────────────────────────────
interface VoiceChatPageProps {
  onDiagramUpdate?: (diagram: ActiveDiagram) => void;
  lang?: Lang;
  users?: MockUser[];
  selectedPhone?: string;
  onPhoneChange?: (phone: string) => void;
}

export function VoiceChatPage({ onDiagramUpdate, lang = 'zh', users = [], selectedPhone, onPhoneChange }: VoiceChatPageProps = {}) {
  const t = T[lang];
  const [connState, setConnState]       = useState<ConnState>('disconnected');
  const [messages, setMessages]         = useState<VoiceMessage[]>([]);
  const [errorMsg, setErrorMsg]         = useState<string>('');
  const [handoffCtx, setHandoffCtx]     = useState<HandoffContext | null>(null);
  const [selectedUserPhone, setSelectedUserPhone] = useState<string>(selectedPhone ?? users[0]?.phone ?? '');

  // ── refs ───────────────────────────────────────────────────────────────────
  const wsRef             = useRef<WebSocket | null>(null);
  const captureCtxRef     = useRef<AudioContext | null>(null);
  const streamRef         = useRef<MediaStream | null>(null);
  const processorRef      = useRef<ScriptProcessorNode | null>(null);
  const pendingUserIdRef  = useRef<number | null>(null);   // 当前用户话语的消息 ID
  const botMsgIdRef       = useRef<number | null>(null);   // 当前 bot 消息 ID
  const botTextRef        = useRef<string>('');            // 累积 bot 文字
  const msgIdCounter      = useRef(0);
  const nextMsgId         = useRef(() => ++msgIdCounter.current);
  const messagesEndRef    = useRef<HTMLDivElement>(null);
  const disconnectRef     = useRef<() => void>(() => {});  // 避免循环依赖
  const transferToBotRef  = useRef(false);
  const transferredRef    = useRef(false);  // 转人工后为 true，用于回调闭包内判断
  const needResumeRef     = useRef(false);  // 转回机器人时标记需要 resume=true 重连
  const connectRef        = useRef<() => Promise<void>>(async () => {});
  // MP3 流式播放
  const audioElemRef      = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef    = useRef<MediaSource | null>(null);
  const sourceBufferRef   = useRef<SourceBuffer | null>(null);
  const mp3QueueRef       = useRef<ArrayBuffer[]>([]);
  const sourceOpenRef     = useRef<boolean>(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 当 users 列表从空变为有值时，设定默认选中用户
  useEffect(() => {
    if (users.length > 0 && !selectedUserPhone) {
      setSelectedUserPhone(users[0].phone);
    }
  }, [users, selectedUserPhone]);

  // 外部 selectedPhone prop 变化时，同步内部状态并重置对话
  useEffect(() => {
    if (selectedPhone !== undefined && selectedPhone !== selectedUserPhone) {
      setSelectedUserPhone(selectedPhone);
      setMessages([]);
      setHandoffCtx(null);
      setErrorMsg('');
    }
  }, [selectedPhone]); // eslint-disable-line react-hooks/exhaustive-deps

  // 卸载时清理
  useEffect(() => () => disconnectRef.current(), []);

  // ── 消息更新（按 ID upsert）────────────────────────────────────────────────
  const upsertMsg = useCallback((msg: VoiceMessage) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === msg.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = msg;
        return next;
      }
      return [...prev, msg];
    });
  }, []);

  // ── MP3 流式播放 ──────────────────────────────────────────────────────────
  const flushMp3Queue = useCallback(() => {
    const sb = sourceBufferRef.current;
    if (!sb || sb.updating || mp3QueueRef.current.length === 0) return;
    sb.appendBuffer(mp3QueueRef.current.shift()!);
  }, []);

  const playChunk = useCallback((b64: string) => {
    const bytes = base64ToUint8(b64);
    if (bytes.length === 0) return;

    // 首次调用：初始化 MediaSource + Audio 元素
    if (!mediaSourceRef.current) {
      const ms = new MediaSource();
      const audio = new Audio();
      audio.src = URL.createObjectURL(ms);
      mediaSourceRef.current = ms;
      audioElemRef.current = audio;
      sourceOpenRef.current = false;

      ms.addEventListener('sourceopen', () => {
        const sb = ms.addSourceBuffer('audio/mpeg');
        sourceBufferRef.current = sb;
        sourceOpenRef.current = true;
        sb.addEventListener('updateend', flushMp3Queue);
        flushMp3Queue();
      }, { once: true });

      audio.play().catch(() => {});
    }

    mp3QueueRef.current.push(bytes.buffer);
    if (sourceOpenRef.current) flushMp3Queue();
  }, [flushMp3Queue]);

  const stopPlayback = useCallback(() => {
    audioElemRef.current?.pause();
    audioElemRef.current = null;
    if (mediaSourceRef.current?.readyState === 'open') {
      try { mediaSourceRef.current.endOfStream(); } catch {}
    }
    mediaSourceRef.current = null;
    sourceBufferRef.current = null;
    mp3QueueRef.current = [];
    sourceOpenRef.current = false;
  }, []);

  // ── 停止麦克风（不关闭 WS，用于转人工时保留连接）──────────────────────────
  const stopMic = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    captureCtxRef.current?.close().catch(() => {});
    captureCtxRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  // ── 处理 GLM 事件 ─────────────────────────────────────────────────────────
  const handleGlmEvent = useCallback((msg: Record<string, unknown>) => {
    const type = (msg.type as string) ?? '';

    // 会话就绪
    if (type === 'session.created' || type === 'session.updated') {
      setConnState('idle');
      return;
    }

    // VAD：用户开始说话
    // 机器人播音时不打断自己（回声消除不完美，VAD 可能误判）
    if (type === 'input_audio_buffer.speech_started') {
      setConnState('listening');
      if (connState !== 'responding') stopPlayback();
      botMsgIdRef.current = null;
      botTextRef.current = '';
      const id = nextMsgId.current();
      pendingUserIdRef.current = id;
      upsertMsg({ id, role: 'user', text: '...', time: nowTime() });
      return;
    }

    // VAD：用户停止说话
    if (type === 'input_audio_buffer.speech_stopped') {
      // 转人工后不显示机器人思考状态
      if (!transferredRef.current) setConnState('thinking');
      return;
    }

    // 输入音频转写（更新用户话语文字）
    if (type.includes('transcription')) {
      const transcript = (msg.transcript ?? msg.delta ?? '') as string;
      if (transcript && pendingUserIdRef.current != null) {
        upsertMsg({ id: pendingUserIdRef.current, role: 'user', text: transcript, time: nowTime() });
      }
      return;
    }

    // Bot 音频字幕增量（文字，不是 PCM）
    if (type === 'response.audio_transcript.delta' && msg.delta != null) {
      setConnState('responding');
      const delta = msg.delta as string;
      if (!botMsgIdRef.current) {
        const id = nextMsgId.current();
        botMsgIdRef.current = id;
        botTextRef.current = delta;
        upsertMsg({ id, role: 'bot', text: delta, time: nowTime() });
      } else {
        botTextRef.current += delta;
        upsertMsg({ id: botMsgIdRef.current, role: 'bot', text: botTextRef.current, time: nowTime() });
      }
      return;
    }

    // Bot 音频增量（base64 PCM，精确匹配避免误判 audio_transcript）
    if (type === 'response.audio.delta' && msg.delta) {
      setConnState('responding');
      playChunk(msg.delta as string);
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
      onDiagramUpdate?.({ skill_name: msg.skill_name as string, mermaid: msg.mermaid as string });
      return;
    }

    // 转人工
    if (type === 'transfer_to_human') {
      transferredRef.current = true;
      const ctx = msg.context as HandoffContext;
      setConnState('transferred');
      setHandoffCtx(ctx);
      // 把 banner 插入消息流，后续消息自然排在 banner 下方
      setMessages(prev => [...prev, { id: nextMsgId.current(), role: 'handoff', text: '', time: nowTime(), handoffCtx: ctx }]);
      return;
    }

    // 转回机器人
    if (type === 'transfer_to_bot') {
      transferToBotRef.current = true;
      needResumeRef.current = true;   // 标记：下次 connect 应携带 resume=true
      transferredRef.current = false;
      console.log('[VoiceChat] transfer_to_bot: needResumeRef=true, will reconnect with resume=true');
      setHandoffCtx(null);
      disconnectRef.current();
      return;
    }

    // 坐席消息：播放 TTS 音频并显示文字气泡
    if (type === 'agent_audio') {
      const text = (msg.text ?? msg.original_text ?? '') as string;
      if (text) upsertMsg({ id: nextMsgId.current(), role: 'agent', text, time: nowTime() });
      if (msg.audio) playChunk(msg.audio as string);
      return;
    }

    // 坐席消息（TTS 失败降级）：仅显示文字
    if (type === 'agent_message') {
      const text = (msg.text ?? '') as string;
      if (text) upsertMsg({ id: nextMsgId.current(), role: 'agent', text, time: nowTime() });
      return;
    }

    // 错误
    if (type === 'error') {
      console.error('[GLM error]', msg);
      setErrorMsg((msg.message ?? JSON.stringify(msg)) as string);
      disconnectRef.current();
    }
  }, [upsertMsg, playChunk, stopPlayback, onDiagramUpdate, stopMic]);

  // ── 断开连接 ──────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    captureCtxRef.current?.close().catch(() => {});
    captureCtxRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    stopPlayback();
    wsRef.current?.close();
    wsRef.current = null;
    setConnState('disconnected');
  }, [stopPlayback]);

  // 保持 ref 同步
  useEffect(() => { disconnectRef.current = disconnect; }, [disconnect]);

  // ── 建立连接 ──────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    // 在任何 await 之前捕获 resume 标志，避免异步后 ref 已被清除
    const resumeFlag = needResumeRef.current ? '&resume=true' : '';
    needResumeRef.current = false;
    console.log('[VoiceChat] connect: resumeFlag=', resumeFlag || '(none)', 'phone=', selectedUserPhone);

    setErrorMsg('');
    setConnState('connecting');

    // 申请麦克风权限
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setErrorMsg(t.outbound_mic_denied); // shared string with outbound page
      setConnState('disconnected');
      return;
    }
    streamRef.current = stream;

    // 连接后端 WebSocket 代理
    const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/voice?lang=${lang}&phone=${selectedUserPhone}${resumeFlag}`;
    console.log('[VoiceChat] ws connecting to:', wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // 建立 16kHz PCM 采集管道
      const ctx = new AudioContext({ sampleRate: 16000 });
      captureCtxRef.current = ctx;

      const source    = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(2048, 1, 1); // ~128ms @ 16kHz，必须是 2 的幂

      // 静音输出，防止麦克风回声
      const mute = ctx.createGain();
      mute.gain.value = 0;
      processor.connect(mute);
      mute.connect(ctx.destination);

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const pcm16 = float32ToInt16(e.inputBuffer.getChannelData(0));
        ws.send(JSON.stringify({
          event_id: crypto.randomUUID(),
          client_timestamp: Date.now(),
          type: 'input_audio_buffer.append',
          audio: arrayBufferToBase64(pcm16.buffer as ArrayBuffer),
        }));
      };

      source.connect(processor);
      processorRef.current = processor;
    };

    ws.onmessage = (e) => {
      try { handleGlmEvent(JSON.parse(e.data)); }
      catch { console.error('Failed to parse WS message', e.data); }
    };

    ws.onclose  = () => {
      disconnect();
      if (transferToBotRef.current) {
        transferToBotRef.current = false;
        connectRef.current();
      }
    };
    ws.onerror  = () => disconnect();
  }, [handleGlmEvent, disconnect, lang, selectedUserPhone]);

  useEffect(() => { connectRef.current = connect; }, [connect]);

  // ── UI 交互 ───────────────────────────────────────────────────────────────
  const handleMainBtn = () => {
    if (connState === 'disconnected') connect();
    else disconnect();
  };

  const handleReset = () => {
    disconnect();
    setMessages([]);
    setErrorMsg('');
    setHandoffCtx(null);
  };

  const handleManualTransfer = () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    // 向 GLM 注入一条用户消息，触发 transfer_to_human 工具调用
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
    connState === 'disconnected' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200 text-white' :
    connState === 'connecting'   ? 'bg-gray-300 cursor-not-allowed text-white' :
    connState === 'transferred'  ? 'bg-red-500 hover:bg-red-600 shadow-red-200 text-white' :
                                   'bg-red-500 hover:bg-red-600 shadow-red-200 text-white';

  const statusColor =
    connState === 'listening'   ? 'text-red-500' :
    connState === 'responding'  ? 'text-green-600' :
    connState === 'thinking'    ? 'text-blue-500' :
    connState === 'transferred' ? 'text-orange-500' :
    'text-gray-500';

  const voiceUserSelectorDisabled = connState !== 'disconnected';
  const voiceCurrentUser = users.find(u => u.phone === selectedUserPhone) ?? users[0];

  // ── 渲染 ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col w-full max-w-md self-stretch gap-2">



      {/* 对话框 */}
      <div className="flex-1 bg-[#F4F5F7] rounded-3xl shadow-xl overflow-hidden flex flex-col border border-gray-200 min-h-0">

      {/* Header — 仅保留标题 */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 flex items-center rounded-b-xl shadow-sm z-10 relative flex-shrink-0">
        <Mic size={18} className="text-white mr-2 flex-shrink-0" />
        <h1 className="text-sm font-semibold text-white tracking-wide">{t.voice_bot_name}</h1>
      </div>

      {/* 对话记录 */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
            <Mic size={44} className="text-gray-200" />
            <p className="text-sm font-medium text-gray-500">{t.voice_empty_title}</p>
            <p className="text-xs text-gray-400">{t.voice_empty_subtitle}</p>
            {errorMsg && (
              <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg max-w-xs">{errorMsg}</p>
            )}
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-6">
              <span className="text-xs text-gray-400 bg-gray-200/50 px-3 py-1 rounded-full">
                {new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric' })}
              </span>
            </div>
            {messages.map(msg => msg.role === 'handoff' ? (
              <div key={msg.id} className="mx-1 mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-700">
                <Headset size={15} className="flex-shrink-0" />
                <span className="font-medium">{t.voice_handoff_title}</span>
                {msg.handoffCtx && (
                  <span className="text-orange-400 text-xs">
                    · {t.voice_transfer_reason[msg.handoffCtx.transfer_reason] ?? msg.handoffCtx.transfer_reason}
                  </span>
                )}
              </div>
            ) : (
              <div key={msg.id} className={`flex w-full mb-4 ${msg.role !== 'user' ? 'justify-start' : 'justify-end'}`}>
                {msg.role === 'bot' && (
                  <div className="flex-shrink-0 mr-3">
                    <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                      <Bot size={18} />
                    </div>
                  </div>
                )}
                {msg.role === 'agent' && (
                  <div className="flex-shrink-0 mr-3">
                    <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center">
                      <Headset size={18} />
                    </div>
                  </div>
                )}
                <div className={`flex flex-col ${msg.role !== 'user' ? 'items-start' : 'items-end'} max-w-[82%]`}>
                  <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'bot'
                      ? 'bg-white text-gray-800 rounded-tl-none shadow-sm border border-gray-100'
                      : msg.role === 'agent'
                      ? 'bg-orange-50 text-gray-800 rounded-tl-none shadow-sm border border-orange-100'
                      : 'bg-blue-600 text-white rounded-tr-none shadow-sm'
                  }`}>
                    {msg.role === 'bot' ? (
                      <div className="markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                      </div>
                    ) : (
                      <span className={msg.text === '...' ? 'text-blue-200 italic' : ''}>{msg.text}</span>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-400 mt-1 px-1">{msg.time}</span>
                </div>
                {msg.role === 'user' && (
                  <div className="flex-shrink-0 ml-3">
                    <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center">
                      <User size={18} />
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* 思考中动画（转人工后不显示） */}
            {connState === 'thinking' && (
              <div className="flex w-full mb-4 justify-start items-center space-x-3">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <Bot size={18} />
                </div>
                <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center space-x-1.5 border border-gray-100">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            {errorMsg && (
              <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg text-center mb-2">{errorMsg}</p>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* 语音控制区 */}
      <div className="bg-white border-t border-gray-100 px-6 pt-3 pb-4 flex flex-col items-center space-y-2">
        {/* 状态文字 */}
        <p className={`text-sm font-medium transition-colors ${statusColor}`}>
          {t.voice_state[connState]}
        </p>

        {/* 主按钮 */}
        <div className="relative flex items-center justify-center">
          {connState === 'listening' && (
            <>
              <span className="absolute w-28 h-28 rounded-full bg-red-400 opacity-15 animate-ping" />
              <span className="absolute w-20 h-20 rounded-full bg-red-300 opacity-20 animate-ping" style={{ animationDelay: '0.2s' }} />
            </>
          )}
          {connState === 'responding' && (
            <span className="absolute w-24 h-24 rounded-full bg-green-400 opacity-15 animate-ping" />
          )}
          {(connState === 'idle') && (
            <span className="absolute w-20 h-20 rounded-full bg-blue-300 opacity-10 animate-pulse" />
          )}
          <button
            onClick={handleMainBtn}
            disabled={connState === 'connecting'}
            className={`relative w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 ${btnClass}`}
          >
            {connState === 'connecting' ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : connState === 'disconnected' ? (
              <Mic size={28} />
            ) : (
              <Square size={22} fill="white" />
            )}
          </button>
        </div>

        {/* 底部说明 */}
        <p className="text-xs text-gray-400">
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
