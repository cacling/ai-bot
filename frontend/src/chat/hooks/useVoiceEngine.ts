/**
 * useVoiceEngine — 语音页面共享 Hook
 *
 * 抽取 VoiceChatPage 和 OutboundVoicePage 中 100% 相同的逻辑：
 * - 音频 refs（MediaSource、麦克风采集、WS 连接）
 * - MP3 流式播放（flushMp3Queue / playChunk / stopPlayback）
 * - 麦克风管理（stopMic）
 * - 消息状态管理（upsertMsg）
 * - WebSocket 连接建立 + 16kHz PCM 采集管道
 * - 断开连接 / 重置
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type React from 'react';
import { nowTime } from '../../App';
import { float32ToInt16, arrayBufferToBase64, base64ToUint8 } from '../../shared/audio';

// ── Shared Types ────────────────────────────────────────────────────────────────

export interface EmotionResult {
  label: string;
  emoji: string;
  color: string;
}

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

export interface VoiceMessage {
  id:      number;
  role:    'user' | 'bot' | 'agent' | 'handoff';
  text:    string;
  time:    string;
  emotion?:    EmotionResult;
  handoffCtx?: HandoffContext;
}

export type VoiceConnState =
  | 'disconnected' | 'connecting' | 'idle' | 'ringing'
  | 'listening'    | 'thinking'   | 'responding'
  | 'transferred'  | 'ended';

// ── Hook ────────────────────────────────────────────────────────────────────────

/**
 * @param disconnectedState 断开连接时设置的状态（入呼 'disconnected'，外呼 'idle'）
 */
export function useVoiceEngine(disconnectedState: VoiceConnState = 'disconnected') {
  const [connState,   setConnState]   = useState<VoiceConnState>(disconnectedState);
  const [messages,    setMessages]    = useState<VoiceMessage[]>([]);
  const [errorMsg,    setErrorMsg]    = useState('');
  const [handoffCtx,  setHandoffCtx]  = useState<HandoffContext | null>(null);

  // ── Refs ──
  const wsRef            = useRef<WebSocket | null>(null);
  const captureCtxRef    = useRef<AudioContext | null>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  const processorRef     = useRef<ScriptProcessorNode | null>(null);
  const pendingUserIdRef = useRef<number | null>(null);
  const botMsgIdRef      = useRef<number | null>(null);
  const botTextRef       = useRef<string>('');
  const msgIdCounter     = useRef(0);
  const messagesEndRef   = useRef<HTMLDivElement>(null);
  const disconnectRef    = useRef<() => void>(() => {});
  const transferToBotRef = useRef(false);
  const connectRef       = useRef<() => Promise<void>>(async () => {});

  // MP3 streaming
  const audioElemRef     = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef   = useRef<MediaSource | null>(null);
  const sourceBufferRef  = useRef<SourceBuffer | null>(null);
  const mp3QueueRef      = useRef<ArrayBuffer[]>([]);
  const sourceOpenRef    = useRef<boolean>(false);

  const nextMsgId = useCallback(() => ++msgIdCounter.current, []);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => () => disconnectRef.current(), []);

  // ── Message upsert (by ID) ──
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

  // ── MP3 Streaming Playback ──
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
    mp3QueueRef.current.push(bytes.buffer as ArrayBuffer);
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

  // ── Stop Mic (without closing WS — used when transferring to human) ──
  const stopMic = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    captureCtxRef.current?.close().catch(() => {});
    captureCtxRef.current = null;
    streamRef.current?.getTracks().forEach(tr => tr.stop());
    streamRef.current = null;
  }, []);

  // ── Disconnect ──
  const disconnect = useCallback(() => {
    stopMic();
    stopPlayback();
    wsRef.current?.close();
    wsRef.current = null;
    setConnState(disconnectedState);
  }, [stopPlayback, stopMic, disconnectedState]);

  useEffect(() => { disconnectRef.current = disconnect; }, [disconnect]);

  // ── Connect WebSocket + Mic Pipeline ──
  const connectWs = useCallback(async (
    wsUrl: string,
    onMessage: (msg: Record<string, unknown>) => void,
    options?: {
      /** Ref that gates mic audio sending (outbound waits for bot opening) */
      micGateRef?: React.MutableRefObject<boolean>;
      /** Error message when mic is denied */
      micDeniedLabel?: string;
    },
  ) => {
    setErrorMsg('');
    setConnState('connecting');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setErrorMsg(options?.micDeniedLabel ?? 'Microphone access denied');
      setConnState(disconnectedState);
      return;
    }
    streamRef.current = stream;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      const ctx = new AudioContext({ sampleRate: 16000 });
      captureCtxRef.current = ctx;
      const source    = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(2048, 1, 1);
      const mute = ctx.createGain();
      mute.gain.value = 0;
      processor.connect(mute);
      mute.connect(ctx.destination);
      processor.onaudioprocess = (e) => {
        if (options?.micGateRef && !options.micGateRef.current) return;
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
      try { onMessage(JSON.parse(e.data)); }
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
  }, [disconnect, disconnectedState]);

  // ── Reset ──
  const reset = useCallback(() => {
    disconnect();
    setMessages([]);
    setErrorMsg('');
    setHandoffCtx(null);
  }, [disconnect]);

  return {
    // State
    connState, setConnState,
    messages, setMessages,
    errorMsg, setErrorMsg,
    handoffCtx, setHandoffCtx,
    // Refs
    wsRef, messagesEndRef,
    pendingUserIdRef, botMsgIdRef, botTextRef,
    transferToBotRef, disconnectRef, connectRef,
    // Audio
    upsertMsg, nextMsgId,
    playChunk, stopPlayback, stopMic,
    // Connection
    connectWs, disconnect, reset,
  };
}
