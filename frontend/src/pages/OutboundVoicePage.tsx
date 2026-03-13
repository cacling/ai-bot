/**
 * OutboundVoicePage — 语音外呼机器人页面
 *
 * 与 VoiceChatPage（入呼）的核心区别：
 * 1. 连接建立前，先选择任务类型（催收/营销）和具体案件/任务
 * 2. 连接后机器人先开口说开场白（后端触发 response.create）
 * 3. WS 端点为 /ws/outbound?task=collection&id=C001
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Square, Phone, Headset } from 'lucide-react';
import { nowTime } from '../App';
import type { ActiveDiagram } from '../components/DiagramPanel';
import { T, type Lang } from '../i18n';
import { broadcastUserSwitch } from '../userSync';
import type { OutboundTask } from '../outboundData';

// ── 类型 ──────────────────────────────────────────────────────────────────────

export type TaskType = 'collection' | 'marketing' | 'bank-marketing';

type ConnState =
  | 'idle'          // 未发起外呼（任务选择阶段）
  | 'connecting'    // 连接中
  | 'ringing'       // 已连接，机器人正在说开场白
  | 'listening'     // 等待客户回复
  | 'thinking'      // 等待模型回复
  | 'responding'    // 模型输出中
  | 'transferred'   // 已转人工
  | 'ended';        // 通话结束

interface VoiceMessage {
  id:      number;
  role:    'bot' | 'user';
  text:    string;
  time:    string;
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


// ── 音频工具（与 VoiceChatPage 相同）────────────────────────────────────────

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
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(bin);
}

function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

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
  const [connState,      setConnState]      = useState<ConnState>('idle');
  const [messages,       setMessages]       = useState<VoiceMessage[]>([]);
  const [errorMsg,       setErrorMsg]       = useState<string>('');
  const [handoffCtx,     setHandoffCtx]     = useState<HandoffContext | null>(null);

  // 当前外呼任务对应的客户手机号（用于 session bus 和坐席侧同步）
  const selectedPhone = tasks.find(t => t.id === selectedId)?.phone ?? '';

  const wsRef             = useRef<WebSocket | null>(null);
  const captureCtxRef     = useRef<AudioContext | null>(null);
  const streamRef         = useRef<MediaStream | null>(null);
  const processorRef      = useRef<ScriptProcessorNode | null>(null);
  const pendingUserIdRef  = useRef<number | null>(null);
  const botMsgIdRef       = useRef<number | null>(null);
  const botTextRef        = useRef<string>('');
  const msgIdCounter      = useRef(0);
  const nextMsgId         = useRef(() => ++msgIdCounter.current);
  const messagesEndRef    = useRef<HTMLDivElement>(null);
  const disconnectRef     = useRef<() => void>(() => {});
  const transferToBotRef  = useRef(false);
  const connectRef        = useRef<() => Promise<void>>(async () => {});
  const audioElemRef      = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef    = useRef<MediaSource | null>(null);
  const sourceBufferRef   = useRef<SourceBuffer | null>(null);
  const mp3QueueRef       = useRef<ArrayBuffer[]>([]);
  const sourceOpenRef     = useRef<boolean>(false);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => () => disconnectRef.current(), []);

  // 切换任务类型或案件时，断开当前通话并清空对话，同步坐席侧
  useEffect(() => {
    disconnectRef.current();
    setMessages([]);
    setErrorMsg('');
    setHandoffCtx(null);
    if (selectedPhone) broadcastUserSwitch(selectedPhone);
  }, [taskType, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const upsertMsg = useCallback((msg: VoiceMessage) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === msg.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = msg; return next; }
      return [...prev, msg];
    });
  }, []);

  // ── MP3 播放 ───────────────────────────────────────────────────────────────
  const flushMp3Queue = useCallback(() => {
    const sb = sourceBufferRef.current;
    if (!sb || sb.updating || mp3QueueRef.current.length === 0) return;
    sb.appendBuffer(mp3QueueRef.current.shift()!);
  }, []);

  const playChunk = useCallback((b64: string) => {
    const bytes = base64ToUint8(b64);
    if (bytes.length === 0) return;
    if (!mediaSourceRef.current) {
      const ms = new MediaSource();
      const audio = new Audio();
      audio.src = URL.createObjectURL(ms);
      mediaSourceRef.current = ms; audioElemRef.current = audio; sourceOpenRef.current = false;
      ms.addEventListener('sourceopen', () => {
        const sb = ms.addSourceBuffer('audio/mpeg');
        sourceBufferRef.current = sb; sourceOpenRef.current = true;
        sb.addEventListener('updateend', flushMp3Queue);
        flushMp3Queue();
      }, { once: true });
      audio.play().catch(() => {});
    }
    mp3QueueRef.current.push(bytes.buffer);
    if (sourceOpenRef.current) flushMp3Queue();
  }, [flushMp3Queue]);

  const stopPlayback = useCallback(() => {
    audioElemRef.current?.pause(); audioElemRef.current = null;
    if (mediaSourceRef.current?.readyState === 'open') { try { mediaSourceRef.current.endOfStream(); } catch {} }
    mediaSourceRef.current = null; sourceBufferRef.current = null;
    mp3QueueRef.current = []; sourceOpenRef.current = false;
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
      const id = nextMsgId.current();
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
        const id = nextMsgId.current();
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

    if (type === 'response.done') {
      setConnState('listening');
      botMsgIdRef.current = null; botTextRef.current = '';
      pendingUserIdRef.current = null;
      return;
    }

    if (type === 'skill_diagram_update') {
      onDiagramUpdate?.({ skill_name: msg.skill_name as string, mermaid: msg.mermaid as string });
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
      if (text) upsertMsg({ id: nextMsgId.current(), role: 'bot', text, time: nowTime() });
      if (msg.audio) playChunk(msg.audio as string);
      return;
    }

    // 坐席消息（TTS 失败降级）：仅显示文字
    if (type === 'agent_message') {
      const text = (msg.text ?? '') as string;
      if (text) upsertMsg({ id: nextMsgId.current(), role: 'bot', text, time: nowTime() });
      return;
    }

    if (type === 'error') {
      console.error('[GLM outbound error]', msg);
      setErrorMsg((msg.message ?? JSON.stringify(msg)) as string);
      disconnectRef.current();
    }
  }, [upsertMsg, playChunk, stopPlayback, onDiagramUpdate, connState, stopMic]);

  // ── 断开连接 ───────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    processorRef.current?.disconnect(); processorRef.current = null;
    captureCtxRef.current?.close().catch(() => {}); captureCtxRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;
    stopPlayback();
    wsRef.current?.close(); wsRef.current = null;
    setConnState('idle');
  }, [stopPlayback]);

  useEffect(() => { disconnectRef.current = disconnect; }, [disconnect]);

  // ── 开始外呼 ───────────────────────────────────────────────────────────────

  const startCall = useCallback(async () => {
    setErrorMsg('');
    setConnState('connecting');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setErrorMsg(t.outbound_mic_denied);
      setConnState('idle');
      return;
    }
    streamRef.current = stream;

    const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/outbound?task=${taskType}&id=${selectedId}&lang=${lang}&phone=${selectedPhone}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      const ctx = new AudioContext({ sampleRate: 16000 });
      captureCtxRef.current = ctx;
      const source    = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(2048, 1, 1);
      const mute = ctx.createGain(); mute.gain.value = 0;
      processor.connect(mute); mute.connect(ctx.destination);
      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const pcm16 = float32ToInt16(e.inputBuffer.getChannelData(0));
        ws.send(JSON.stringify({ event_id: crypto.randomUUID(), client_timestamp: Date.now(), type: 'input_audio_buffer.append', audio: arrayBufferToBase64(pcm16.buffer as ArrayBuffer) }));
      };
      source.connect(processor);
      processorRef.current = processor;
    };

    ws.onmessage = (e) => {
      try { handleGlmEvent(JSON.parse(e.data)); }
      catch { console.error('Failed to parse WS message', e.data); }
    };

    ws.onclose = () => {
      disconnect();
      if (transferToBotRef.current) {
        transferToBotRef.current = false;
        connectRef.current();
      }
    };
    ws.onerror = () => disconnect();
  }, [taskType, selectedId, handleGlmEvent, disconnect]);

  useEffect(() => { connectRef.current = startCall; }, [startCall]);

  const handleReset = () => {
    disconnect();
    setMessages([]);
    setErrorMsg('');
    setHandoffCtx(null);
    setConnState('idle');
  };

  const isInCall = connState !== 'idle' && connState !== 'connecting' && connState !== 'transferred' && connState !== 'ended';

  // 当前选中的任务信息（用于面板展示）
  const statusColor =
    connState === 'ringing'    ? 'text-blue-500' :
    connState === 'listening'  ? 'text-red-500'  :
    connState === 'responding' ? 'text-green-600':
    connState === 'thinking'   ? 'text-blue-500' :
    connState === 'transferred'? 'text-orange-500':
    'text-gray-500';

  // ── 渲染 ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col w-full max-w-md self-stretch gap-2">



    <div className="flex-1 min-h-0 bg-[#F4F5F7] rounded-3xl shadow-xl overflow-hidden flex flex-col border border-gray-200">

      {/* Header — 仅保留标题 */}
      <div className="bg-gradient-to-r from-violet-600 to-violet-500 px-4 py-3 flex items-center rounded-b-xl shadow-sm z-10 relative flex-shrink-0">
        <Phone size={18} className="text-white mr-2 flex-shrink-0" />
        <h1 className="text-sm font-semibold text-white tracking-wide">{t.outbound_bot_name}</h1>
      </div>

      {/* 对话记录 */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
            <div className="w-12 h-12 bg-violet-100 rounded-full flex items-center justify-center">
              <Phone size={24} className="text-violet-500" />
            </div>
            <p className={`text-sm font-medium ${statusColor}`}>{t.outbound_state[connState]}</p>
          </div>
        ) : (
          <>
            {messages.length > 0 && (
              <div className="flex justify-center mb-6">
                <span className="text-xs text-gray-400 bg-gray-200/50 px-3 py-1 rounded-full">
                  {new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric' })}
                </span>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex w-full mb-4 ${msg.role === 'bot' ? 'justify-start' : 'justify-end'}`}>
                {msg.role === 'bot' && (
                  <div className="flex-shrink-0 mr-3">
                    <div className="w-8 h-8 bg-violet-100 text-violet-600 rounded-full flex items-center justify-center">
                      <Phone size={16} />
                    </div>
                  </div>
                )}
                <div className={`flex flex-col ${msg.role === 'bot' ? 'items-start' : 'items-end'} max-w-[82%]`}>
                  <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'bot'
                      ? 'bg-white text-gray-800 rounded-tl-none shadow-sm border border-gray-100'
                      : 'bg-violet-600 text-white rounded-tr-none shadow-sm'
                  }`}>
                    {msg.role === 'bot' ? (
                      <div className="markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                      </div>
                    ) : (
                      <span className={msg.text === '...' ? 'text-violet-200 italic' : ''}>{msg.text}</span>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-400 mt-1 px-1">{msg.time}</span>
                </div>
                {msg.role === 'user' && (
                  <div className="flex-shrink-0 ml-3">
                    <div className="w-8 h-8 bg-gray-200 text-gray-600 rounded-full flex items-center justify-center text-xs font-medium">
                      客
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* 思考中 */}
            {connState === 'thinking' && (
              <div className="flex w-full mb-4 justify-start items-center space-x-3">
                <div className="w-8 h-8 bg-violet-100 text-violet-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <Phone size={16} />
                </div>
                <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center space-x-1.5 border border-gray-100">
                  <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            {/* 转人工状态提示（详细摘要仅在坐席侧展示） */}
            {handoffCtx && (
              <div className="mx-1 mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-700">
                <Headset size={15} className="flex-shrink-0" />
                <span className="font-medium">{t.outbound_handoff_title}</span>
                <span className="text-orange-400 text-xs">
                  · {t.outbound_transfer_reason[handoffCtx.transfer_reason] ?? handoffCtx.transfer_reason}
                </span>
              </div>
            )}

            {errorMsg && (
              <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg text-center mb-2">{errorMsg}</p>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* 控制区 */}
      <div className="bg-white border-t border-gray-100 px-6 pt-3 pb-4 flex flex-col items-center space-y-2">
        <p className={`text-sm font-medium transition-colors ${statusColor}`}>
          {t.outbound_state[connState]}
        </p>

        <div className="relative flex items-center justify-center">
          {connState === 'ringing' && (
            <>
              <span className="absolute w-28 h-28 rounded-full bg-violet-400 opacity-15 animate-ping" />
              <span className="absolute w-20 h-20 rounded-full bg-violet-300 opacity-20 animate-ping" style={{ animationDelay: '0.2s' }} />
            </>
          )}
          {connState === 'responding' && (
            <span className="absolute w-24 h-24 rounded-full bg-green-400 opacity-15 animate-ping" />
          )}
          {connState === 'listening' && (
            <span className="absolute w-20 h-20 rounded-full bg-red-300 opacity-15 animate-pulse" />
          )}

          {connState === 'idle' ? (
            <button
              onClick={startCall}
              className="relative w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 bg-violet-600 hover:bg-violet-700 shadow-violet-200 text-white"
            >
              <Phone size={26} />
            </button>
          ) : connState === 'connecting' ? (
            <button disabled className="relative w-16 h-16 rounded-full flex items-center justify-center shadow-lg bg-gray-300 text-white cursor-not-allowed">
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </button>
          ) : connState === 'transferred' ? (
            <button
              onClick={() => { disconnect(); setConnState('ended'); }}
              className="relative w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 bg-red-500 hover:bg-red-600 shadow-red-200 text-white"
            >
              <Square size={22} fill="white" />
            </button>
          ) : connState === 'ended' ? (
            <button disabled className="relative w-16 h-16 rounded-full flex items-center justify-center shadow-lg bg-gray-300 text-white cursor-not-allowed">
              <Phone size={26} />
            </button>
          ) : (
            <button
              onClick={() => { disconnect(); setConnState('ended'); }}
              className="relative w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 bg-red-500 hover:bg-red-600 shadow-red-200 text-white"
            >
              <Square size={22} fill="white" />
            </button>
          )}
        </div>

        <p className="text-xs text-gray-400">
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
