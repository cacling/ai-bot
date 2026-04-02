import React, { useState, useRef, useEffect, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Bot,
  User,
  PlusCircle,
  Smile,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VoiceChatPage } from './chat/VoiceChatPage';
import { OutboundVoicePage, type TaskType } from './chat/OutboundVoicePage';
import { T, type Lang } from './i18n';
import { fetchTestPersonas, type TestPersona } from './chat/testPersonas';
import { broadcastUserSwitch } from './chat/userSync';
import { fetchOutboundTasks, type OutboundTask } from './chat/outboundData';
import { CardMessage, type CardData } from './chat/CardMessage';
import { clearSession } from './chat/api';

// Re-export for consumers that imported from App.tsx
export type { CardData } from './chat/CardMessage';

// ── 消息类型 ──────────────────────────────────────────────────────────────────
export interface TextMessage {
  id: number;
  sender: 'bot' | 'user';
  type: 'text';
  text: string;
  translated_text?: string; // 译文（当客户与坐席语言不同时存在）
  time: string;
  card?: CardData;
  _ms?: number; // 端到端响应耗时（ms），仅 bot 消息有值
}

export interface FaqMessage {
  id: number;
  sender: 'bot';
  type: 'faq';
  options: string[];
  title?: string;
  time: string;
  loading?: boolean; // 占位态（skeleton）
}

export type Message = TextMessage | FaqMessage;

// ── 消息气泡（提取到组件外 + memo，避免流式更新时所有气泡重新挂载）────────

interface MessageBubbleProps {
  msg: Message;
  isTyping: boolean;
  lang: Lang;
  onSend: (text: string) => void;
}

const MessageBubble = memo(function MessageBubble({ msg, isTyping, lang, onSend }: MessageBubbleProps) {
  const isBot = msg.sender === 'bot';
  const t = T[lang];

  return (
    <div className={`flex w-full mb-4 ${isBot ? 'justify-start' : 'justify-end'}`}>
      {isBot && (
        <div className="flex-shrink-0 mr-3">
          <div className="w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center">
            <Bot size={18} />
          </div>
        </div>
      )}

      <div className={`flex flex-col ${isBot ? 'items-start' : 'items-end'} max-w-[82%]`}>
        {msg.type === 'text' && (
          <div className="flex flex-col mb-1 w-full">
            {(msg.translated_text?.trim() || msg.text?.trim()) && (
              <div
                className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isBot
                    ? 'bg-background text-foreground rounded-tl-none shadow-sm border border-border'
                    : 'bg-primary text-primary-foreground rounded-tr-none shadow-sm'
                }`}
              >
                {isBot ? (
                  <div className="markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.translated_text?.trim() || msg.text}</ReactMarkdown>
                  </div>
                ) : (msg.translated_text?.trim() || msg.text)}
              </div>
            )}
            {msg.card && msg.card.type !== 'handoff_card' && (
              <div className="mt-2 w-full">
                <CardMessage card={msg.card} lang={lang} />
              </div>
            )}
            <span className="text-[11px] text-muted-foreground mt-1 px-1">
              {msg.time}
              {msg.sender === 'bot' && msg._ms != null && (
                <span className="ml-1.5 text-muted-foreground/60">· {(msg._ms / 1000).toFixed(1)}s</span>
              )}
            </span>
          </div>
        )}

        {msg.type === 'faq' && (
          <div className="bg-background p-3 rounded-2xl rounded-tl-none shadow-sm border border-border w-full mb-1">
            <p className="text-sm text-muted-foreground mb-2 font-medium">{msg.title || t.chat_faq_hint}</p>
            {msg.loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-9 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {msg.options.map((opt, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    onClick={() => onSend(opt)}
                    disabled={isTyping}
                    className="w-full justify-between text-left px-3 py-2 text-sm text-primary hover:bg-accent rounded-lg h-auto"
                  >
                    <span>{opt}</span>
                    <ChevronRight size={14} />
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {!isBot && (
        <div className="flex-shrink-0 ml-3">
          <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center">
            <User size={18} />
          </div>
        </div>
      )}
    </div>
  );
});

// ── 常量 ──────────────────────────────────────────────────────────────────────

/** 初始 FAQ 占位消息的固定 ID，用于后续替换 */
const FAQ_PLACEHOLDER_ID = 2;

function makeInitialMessages(lang: Lang = 'zh'): Message[] {
  const t = T[lang];
  const now = new Date();
  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return [
    {
      id: 1,
      sender: 'bot',
      type: 'text',
      text: t.chat_greeting,
      time: fmt(new Date(now.getTime() - 2000)),
    },
    {
      id: FAQ_PLACEHOLDER_ID,
      sender: 'bot',
      type: 'faq',
      options: [],
      title: t.chat_faq_hint,
      time: fmt(now),
      loading: true,
    } as FaqMessage,
  ];
}

// Re-export for consumers that imported from App.tsx
export { sendChatMessageWS, DEFAULT_USER_PHONE } from './chat/api';

// ── 工具函数 ──────────────────────────────────────────────────────────────────
export function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type Tab = 'chat' | 'voice' | 'outbound';

// ── 主组件 ────────────────────────────────────────────────────────────────────
export default function App() {
  const [currentTab, setCurrentTab] = useState<Tab>('chat');
  const [lang, setLang] = useState<Lang>('zh');
  const [outboundTaskType, setOutboundTaskType] = useState<TaskType>('collection');
  const [outboundTasks, setOutboundTasks] = useState<OutboundTask[]>([]);
  const [collectionId,    setCollectionId]    = useState('C001');
  const [marketingId,     setMarketingId]     = useState('M001');
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [chatUserPhone, setChatUserPhone] = useState<string>('');
  const [allPersonas, setAllPersonas] = useState<TestPersona[]>([]);
  const [inboundPersonas, setInboundPersonas] = useState<TestPersona[]>([]);
  const [messages, setMessages] = useState<Message[]>(() => makeInitialMessages('zh'));
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [botMode, setBotMode] = useState<'bot' | 'human'>('bot');
  const [quickFaqs, setQuickFaqs] = useState<string[]>(() => T[lang].chat_faq);

  const t = T[lang];
  const langRef = useRef<Lang>(lang); // 用 ref 让 WS 建立时读取最新 lang，而不把 lang 加入 deps
  langRef.current = lang;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatWsRef = useRef<WebSocket | null>(null);
  const pendingBotIdRef = useRef<number | null>(null);
  const tSendRef = useRef<number>(0);
  const processedMsgIds = useRef(new Set<string>());
  const msgIdCounter = useRef(FAQ_PLACEHOLDER_ID);
  const nextMsgId = () => ++msgIdCounter.current;

  // ── 初始加载用户数据 ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchTestPersonas(undefined, lang).then(setAllPersonas).catch(console.error);
    fetchTestPersonas('inbound', lang).then(personas => {
      setInboundPersonas(personas);
      if (personas.length > 0) {
        setChatUserPhone((personas[0].context.phone as string) ?? '');
        // 新 sessionId 确保带真实 phone 的 WS 连接触发 greeting + suggestions
        setSessionId(crypto.randomUUID());
      }
    }).catch(console.error);
    fetchOutboundTasks().then(setOutboundTasks).catch(console.error);
  }, []);

  // ── Tab 切换时同步坐席侧当前用户 ────────────────────────────────────────────
  useEffect(() => {
    if (currentTab === 'outbound') {
      const phone = outboundTasks.find(t => t.id === (
        outboundTaskType === 'collection' ? collectionId : marketingId
      ))?.phone;
      if (phone) broadcastUserSwitch(phone);
    } else {
      if (chatUserPhone) broadcastUserSwitch(chatUserPhone);
    }
  }, [currentTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 持久 WebSocket 生命周期（随 session / phone 重建，lang 切换不重连）────────
  useEffect(() => {
    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${wsProto}//${location.host}/ws/chat?phone=${chatUserPhone}&sessionId=${sessionId}&lang=${langRef.current}`;
    const ws = new WebSocket(url);
    chatWsRef.current = ws;
    processedMsgIds.current.clear();

    ws.onmessage = (evt) => {
      // Guard: ignore events from a stale WS (React StrictMode double-invoke)
      if (chatWsRef.current !== ws) return;
      const msg = JSON.parse(evt.data as string) as { source?: string; type: string; msg_id?: string; [k: string]: unknown };
      // Dedup: skip if this msg_id was already processed
      if (msg.msg_id) {
        if (processedMsgIds.current.has(msg.msg_id)) return;
        processedMsgIds.current.add(msg.msg_id);
        if (processedMsgIds.current.size > 2000) processedMsgIds.current.clear();
      }

      if (msg.type === 'text_delta') {
        const id = pendingBotIdRef.current;
        if (id == null) return;
        setMessages(prev => prev.map(m =>
          m.id === id && m.type === 'text' ? { ...m, text: m.text + (msg.delta as string) } : m
        ));

      } else if (msg.type === 'response') {
        const id = pendingBotIdRef.current;
        if (id != null) {
          const elapsed = Math.round(performance.now() - tSendRef.current);
          setMessages(prev => prev.map(m =>
            m.id === id && m.type === 'text'
              ? { ...m, text: msg.text as string, translated_text: (msg.translated_text as string | undefined), card: (msg.card as TextMessage['card']) ?? undefined, _ms: elapsed }
              : m
          ));
          pendingBotIdRef.current = null;
        }
        setIsTyping(false);

      } else if (msg.type === 'agent_message') {
        // 坐席发来的消息 → 仅展示，不触发 AI 回复
        setMessages(prev => [
          ...prev,
          { id: nextMsgId(), sender: 'bot', type: 'text', text: msg.text as string, translated_text: (msg.translated_text as string | undefined), time: nowTime() } as TextMessage,
        ]);

      } else if (msg.type === 'transfer_to_human') {
        // Bot disabled — clear any stuck pending bubble and mark human mode
        setBotMode('human');
        const id = pendingBotIdRef.current;
        if (id != null) {
          setMessages(prev => prev.filter(m => m.id !== id));
          pendingBotIdRef.current = null;
        }
        setIsTyping(false);

      } else if (msg.type === 'transfer_to_bot') {
        setBotMode('bot');

      } else if (msg.type === 'suggestions') {
        const options = ((msg.options ?? []) as Array<{ label: string }>).map(o => o.label);
        if (options.length > 0) {
          setMessages(prev => {
            // 替换占位 FAQ（loading 态）而非追加
            const hasPlaceholder = prev.some(m => m.type === 'faq' && (m as FaqMessage).loading);
            if (hasPlaceholder) {
              return prev.map(m =>
                m.type === 'faq' && (m as FaqMessage).loading
                  ? { ...m, options, title: (msg.title as string | undefined) ?? (m as FaqMessage).title, loading: false } as FaqMessage
                  : m
              );
            }
            return [
              ...prev,
              {
                id: nextMsgId(),
                sender: 'bot',
                type: 'faq',
                options,
                title: msg.title as string | undefined,
                time: nowTime(),
              } as FaqMessage,
            ];
          });
          setQuickFaqs(options);
        }

      } else if (msg.type === 'error') {
        const id = pendingBotIdRef.current;
        if (id != null) {
          setMessages(prev => [
            ...prev.filter(m => m.id !== id),
            { id, sender: 'bot', type: 'text', text: `${T[langRef.current].agent_error_prefix}${msg.message as string}`, time: nowTime() } as TextMessage,
          ]);
          pendingBotIdRef.current = null;
        }
        setIsTyping(false);
      }
    };

    ws.onerror = () => setIsTyping(false);
    ws.onclose = () => { if (chatWsRef.current === ws) chatWsRef.current = null; };

    return () => ws.close();
  }, [sessionId, chatUserPhone]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 96)}px`;
  }, [inputValue]);

  const handleSend = (text = inputValue) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping || !chatWsRef.current) return;

    const userMsgId = nextMsgId();
    setInputValue('');

    if (botMode === 'human') {
      // Human agent mode: just show customer's message, no bot bubble
      setMessages(prev => [
        ...prev,
        { id: userMsgId, sender: 'user', type: 'text', text: trimmed, time: nowTime() } as TextMessage,
      ]);
      chatWsRef.current.send(JSON.stringify({ type: 'chat_message', message: trimmed }));
      return;
    }

    const botMsgId = nextMsgId();
    setMessages(prev => [
      ...prev,
      { id: userMsgId, sender: 'user', type: 'text', text: trimmed, time: nowTime() } as TextMessage,
      { id: botMsgId,  sender: 'bot',  type: 'text', text: '',       time: nowTime() } as TextMessage,
    ]);
    pendingBotIdRef.current = botMsgId;
    tSendRef.current = performance.now();
    setIsTyping(true);

    chatWsRef.current.send(JSON.stringify({ type: 'chat_message', message: trimmed }));
  };

  const handleReset = async () => {
    await clearSession(sessionId).catch(() => {});
    setSessionId(crypto.randomUUID());
    setMessages(makeInitialMessages(lang));
    setBotMode('bot');
    setInputValue('');
  };

  const handleChatUserChange = async (phone: string) => {
    await clearSession(sessionId).catch(() => {});
    setChatUserPhone(phone);
    setSessionId(crypto.randomUUID());
    setMessages(makeInitialMessages(lang));
    setBotMode('bot');
    broadcastUserSwitch(phone);
    setInputValue('');
  };

  const handleLangChange = (next: Lang) => {
    setLang(next);
    // 通知后端更新语言（不重连 WS，不清消息）
    if (chatWsRef.current?.readyState === WebSocket.OPEN) {
      chatWsRef.current.send(JSON.stringify({ type: 'set_lang', lang: next }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── 气泡子组件 ─────────────────────────────────────────────────────────────

  // ── 渲染 ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-muted font-sans text-foreground">
      {/* Tab Bar */}
      <nav className="bg-background border-b border-border shadow-sm flex-shrink-0">
        <div className="max-w-screen-xl mx-auto px-4 flex items-center h-12">
          {/* Lang switcher — left side */}
          <select
            value={lang}
            onChange={e => handleLangChange(e.target.value as Lang)}
            className="text-sm text-muted-foreground bg-transparent outline-none cursor-pointer"
          >
            <option value="zh">中文</option>
            <option value="en">EN</option>
          </select>

          {/* Context-specific selector — next to lang */}
          {currentTab !== 'outbound' ? (
            <select
              value={chatUserPhone}
              onChange={e => handleChatUserChange(e.target.value)}
              disabled={isTyping}
              className="ml-3 text-sm text-muted-foreground bg-transparent outline-none cursor-pointer"
            >
              {inboundPersonas.map(p => (
                <option key={p.id} value={(p.context.phone as string) ?? ''}>{(p.context.name as string) ?? p.label}</option>
              ))}
            </select>
          ) : (
            <select
              value={outboundTaskType === 'collection' ? collectionId : marketingId}
              onChange={e => {
                if (outboundTaskType === 'collection') setCollectionId(e.target.value);
                else setMarketingId(e.target.value);
              }}
              className="ml-3 text-sm text-muted-foreground bg-transparent outline-none cursor-pointer"
            >
              {outboundTasks.filter(t => t.task_type === outboundTaskType).map(t => (
                <option key={t.id} value={t.id}>{(t.data[lang]?.customer_name ?? t.id) as string}</option>
              ))}
            </select>
          )}

          {/* Tab buttons — right side */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 ml-auto">
            <Button
              variant={currentTab === 'chat' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setCurrentTab('chat')}
              className={currentTab === 'chat' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}
            >{t.tab_chat}</Button>
            <Button
              variant={currentTab === 'voice' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setCurrentTab('voice')}
              className={currentTab === 'voice' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}
            >{t.tab_voice}</Button>
            <Button
              variant={currentTab === 'outbound' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setCurrentTab('outbound')}
              className={currentTab === 'outbound' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}
            >{t.tab_outbound}</Button>
          </div>
        </div>

        {/* 二级菜单 — 语音外呼场景切换 */}
        {currentTab === 'outbound' && (
          <div className="border-t border-border px-4 flex items-center justify-end h-9">
            {([
              { key: 'collection',    label: t.outbound_task_collection },
              { key: 'marketing',     label: t.outbound_task_marketing  },
            ] as { key: TaskType; label: string }[]).map(item => (
              <Button
                key={item.key}
                variant="ghost"
                size="sm"
                onClick={() => setOutboundTaskType(item.key)}
                className={`px-4 h-full rounded-none border-b-2 ${
                  outboundTaskType === item.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                {item.label}
              </Button>
            ))}
          </div>
        )}
      </nav>

      {/* Voice Page */}
      {currentTab === 'voice' && (
        <div className="flex justify-center flex-1 p-4 gap-4 overflow-hidden">
          <VoiceChatPage lang={lang} personas={inboundPersonas} selectedPhone={chatUserPhone} onPhoneChange={handleChatUserChange} />
        </div>
      )}

      {/* Outbound Page */}
      {currentTab === 'outbound' && (
        <div className="flex justify-center flex-1 p-4 gap-4 overflow-hidden">
          <OutboundVoicePage
            lang={lang}
            taskType={outboundTaskType}
            tasks={outboundTasks}
            selectedId={outboundTaskType === 'collection' ? collectionId : marketingId}
            onSelectedIdChange={id => {
              if (outboundTaskType === 'collection') setCollectionId(id);
              else setMarketingId(id);
            }}
          />
        </div>
      )}

      {/* Chat Page */}
      {currentTab === 'chat' && (
        <div className="flex justify-center flex-1 p-4 gap-4 overflow-hidden">
          <div className="flex flex-col w-full max-w-md flex-shrink-0 gap-2">

            {/* Chat dialog */}
            <div className="flex-1 bg-muted rounded-3xl shadow-xl overflow-hidden flex flex-col border border-border min-h-0">

            {/* Header — 仅保留标题 */}
            <div className="bg-primary px-4 py-3 flex items-center rounded-b-xl shadow-sm z-10 relative flex-shrink-0">
              <Bot size={18} className="text-primary-foreground mr-2 flex-shrink-0" />
              <h1 className="text-sm font-semibold text-primary-foreground tracking-wide">{t.chat_bot_name}</h1>
            </div>

            {/* 消息区域 */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
              <div className="flex justify-center mb-6">
                <span className="text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                  {new Date().toLocaleDateString(t.chat_date_locale, { month: 'long', day: 'numeric' })}
                </span>
              </div>

              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} isTyping={isTyping} lang={lang} onSend={handleSend} />
              ))}

              {/* 打字指示器 */}
              {isTyping && (
                <div className="flex w-full mb-4 justify-start items-center space-x-3">
                  <div className="w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center flex-shrink-0">
                    <Bot size={18} />
                  </div>
                  <div className="bg-background px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center space-x-1.5 border border-border">
                    <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 快捷问题栏 */}
            <div className="bg-background/60 backdrop-blur-md border-t border-border px-3 py-2.5">
              <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide pb-1">
                {quickFaqs.map((faq, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    onClick={() => handleSend(faq)}
                    disabled={isTyping}
                    className="whitespace-nowrap px-3.5 py-1.5 text-muted-foreground text-xs rounded-full shadow-sm hover:border-primary hover:text-primary"
                  >
                    {faq}
                  </Button>
                ))}
              </div>
            </div>

            {/* 输入区域 */}
            <div className="bg-background p-3 pt-2 pb-5 sm:pb-3 border-t border-border">
              <div className="flex items-end space-x-2">
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary flex-shrink-0 mb-1">
                  <PlusCircle size={24} strokeWidth={1.5} />
                </Button>

                <div className="flex-1 bg-muted border border-border rounded-2xl flex items-end relative overflow-hidden focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-all">
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t.chat_placeholder}
                    disabled={isTyping}
                    className="w-full bg-transparent max-h-24 min-h-[40px] px-3 py-2.5 outline-none text-sm text-foreground resize-none scrollbar-hide disabled:opacity-60"
                    rows={1}
                  />
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground flex-shrink-0 mb-0.5">
                    <Smile size={20} strokeWidth={1.5} />
                  </Button>
                </div>

                <Button
                  variant={inputValue.trim() && !isTyping ? 'default' : 'secondary'}
                  size="icon"
                  onClick={() => handleSend()}
                  disabled={!inputValue.trim() || isTyping}
                  className={`rounded-full flex-shrink-0 mb-0.5 shadow-sm ${
                    inputValue.trim() && !isTyping
                      ? ''
                      : 'text-muted-foreground cursor-not-allowed'
                  }`}
                >
                  <Send size={20} />
                </Button>
              </div>
            </div>

            </div>{/* end chat dialog */}
          </div>{/* end flex-col wrapper */}
        </div>
      )}
    </div>
  );
}
