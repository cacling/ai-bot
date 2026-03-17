import React, { useState, useRef, useEffect } from 'react';
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
import { VoiceChatPage } from './pages/VoiceChatPage';
import { OutboundVoicePage, type TaskType } from './pages/OutboundVoicePage';
import { T, type Lang } from './i18n';
import { fetchMockUsers, fetchInboundUsers, type MockUser } from './mockUsers';
import { broadcastUserSwitch } from './userSync';
import { fetchOutboundTasks, type OutboundTask } from './outboundData';
import { CardMessage, type CardData } from './components/CardMessage';
import { clearSession } from './api/chat';

// Re-export for consumers that imported from App.tsx
export type { CardData } from './components/CardMessage';

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
  time: string;
}

export type Message = TextMessage | FaqMessage;

// ── 常量 ──────────────────────────────────────────────────────────────────────

function makeInitialMessages(lang: Lang = 'zh'): Message[] {
  const t = T[lang];
  const now = new Date();
  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const faqOptions = lang === 'zh'
    ? ['查询本月话费账单', '退订视频会员流量包', '帮我推荐一个适合重度用户的套餐', '我的手机网速非常慢怎么办？']
    : ['Check this month\'s bill', 'Unsubscribe from video data pack', 'Recommend a plan for heavy users', 'My mobile data is very slow'];
  return [
    {
      id: 1,
      sender: 'bot',
      type: 'text',
      text: t.chat_greeting,
      time: fmt(new Date(now.getTime() - 2000)),
    },
    {
      id: 2,
      sender: 'bot',
      type: 'faq',
      options: faqOptions,
      time: fmt(new Date(now.getTime() - 1000)),
    },
  ];
}

// Re-export for consumers that imported from App.tsx
export { sendChatMessageWS, DEFAULT_USER_PHONE } from './api/chat';

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
  const [allUsers, setAllUsers] = useState<MockUser[]>([]);
  const [inboundUsers, setInboundUsers] = useState<MockUser[]>([]);
  const [messages, setMessages] = useState<Message[]>(() => makeInitialMessages('zh'));
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [botMode, setBotMode] = useState<'bot' | 'human'>('bot');

  const t = T[lang];
  const langRef = useRef<Lang>(lang); // 用 ref 让 WS 建立时读取最新 lang，而不把 lang 加入 deps
  langRef.current = lang;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatWsRef = useRef<WebSocket | null>(null);
  const pendingBotIdRef = useRef<number | null>(null);
  const tSendRef = useRef<number>(0);
  const processedMsgIds = useRef(new Set<string>());
  const msgIdCounter = useRef(0);
  const nextMsgId = () => ++msgIdCounter.current;

  // ── 初始加载用户数据 ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchMockUsers().then(setAllUsers).catch(console.error);
    fetchInboundUsers().then(users => {
      setInboundUsers(users);
      if (users.length > 0) setChatUserPhone(users[0].phone);
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
  const MessageBubble = ({ msg }: { msg: Message }) => {
    const isBot = msg.sender === 'bot';

    return (
      <div className={`flex w-full mb-4 ${isBot ? 'justify-start' : 'justify-end'}`}>
        {isBot && (
          <div className="flex-shrink-0 mr-3">
            <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
              <Bot size={18} />
            </div>
          </div>
        )}

        <div className={`flex flex-col ${isBot ? 'items-start' : 'items-end'} max-w-[82%]`}>
          {/* 文本消息 */}
          {msg.type === 'text' && (
            <div className="flex flex-col mb-1 w-full">
              {/* 只有文本非空时才渲染气泡；有译文时直接显示译文替换原文 */}
              {(msg.translated_text?.trim() || msg.text?.trim()) && (
                <div
                  className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isBot
                      ? 'bg-white text-gray-800 rounded-tl-none shadow-sm border border-gray-100'
                      : 'bg-blue-600 text-white rounded-tr-none shadow-sm'
                  }`}
                >
                  {isBot ? (
                    <div className="markdown-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.translated_text?.trim() || msg.text}</ReactMarkdown>
                    </div>
                  ) : (msg.translated_text?.trim() || msg.text)}
                </div>
              )}
              {/* 结构化卡片（handoff_card 仅坐席侧展示） */}
              {msg.card && msg.card.type !== 'handoff_card' && (
                <div className="mt-2 w-full">
                  <CardMessage card={msg.card} lang={lang} />
                </div>
              )}
              <span className="text-[11px] text-gray-400 mt-1 px-1">
                {msg.time}
                {msg.sender === 'bot' && msg._ms != null && (
                  <span className="ml-1.5 text-gray-300">· {(msg._ms / 1000).toFixed(1)}s</span>
                )}
              </span>
            </div>
          )}

          {/* 快捷选项卡片 */}
          {msg.type === 'faq' && (
            <div className="bg-white p-3 rounded-2xl rounded-tl-none shadow-sm border border-gray-100 w-full mb-1">
              <p className="text-sm text-gray-500 mb-2 font-medium">{t.chat_faq_hint}</p>
              <div className="space-y-2">
                {msg.options.map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(opt)}
                    disabled={isTyping}
                    className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg flex items-center justify-between transition-colors border border-blue-50 disabled:opacity-50"
                  >
                    <span>{opt}</span>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {!isBot && (
          <div className="flex-shrink-0 ml-3">
            <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center">
              <User size={18} />
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── 渲染 ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-100 font-sans text-gray-800">
      {/* Tab Bar */}
      <nav className="bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="max-w-screen-xl mx-auto px-4 flex items-center h-12">
          {/* Lang switcher — left side */}
          <select
            value={lang}
            onChange={e => handleLangChange(e.target.value as Lang)}
            className="text-sm text-gray-500 bg-transparent outline-none cursor-pointer"
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
              className="ml-3 text-sm text-gray-500 bg-transparent outline-none cursor-pointer"
            >
              {inboundUsers.map(u => (
                <option key={u.phone} value={u.phone}>{u.name}</option>
              ))}
            </select>
          ) : (
            <select
              value={outboundTaskType === 'collection' ? collectionId : marketingId}
              onChange={e => {
                if (outboundTaskType === 'collection') setCollectionId(e.target.value);
                else setMarketingId(e.target.value);
              }}
              className="ml-3 text-sm text-gray-500 bg-transparent outline-none cursor-pointer"
            >
              {outboundTasks.filter(t => t.task_type === outboundTaskType).map(t => (
                <option key={t.id} value={t.id}>{(t.data[lang]?.customer_name ?? t.id) as string}</option>
              ))}
            </select>
          )}

          {/* Tab buttons — right side */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 ml-auto">
            <button
              onClick={() => setCurrentTab('chat')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                currentTab === 'chat' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >{t.tab_chat}</button>
            <button
              onClick={() => setCurrentTab('voice')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                currentTab === 'voice' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >{t.tab_voice}</button>
            <button
              onClick={() => setCurrentTab('outbound')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                currentTab === 'outbound' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >{t.tab_outbound}</button>
          </div>
        </div>

        {/* 二级菜单 — 语音外呼场景切换 */}
        {currentTab === 'outbound' && (
          <div className="border-t border-gray-100 px-4 flex items-center justify-end h-9">
            {([
              { key: 'collection',    label: t.outbound_task_collection },
              { key: 'marketing',     label: t.outbound_task_marketing  },
            ] as { key: TaskType; label: string }[]).map(item => (
              <button
                key={item.key}
                onClick={() => setOutboundTaskType(item.key)}
                className={`px-4 h-full text-xs font-medium border-b-2 transition-colors ${
                  outboundTaskType === item.key
                    ? 'border-violet-600 text-violet-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* Voice Page */}
      {currentTab === 'voice' && (
        <div className="flex justify-center flex-1 p-4 gap-4 overflow-hidden">
          <VoiceChatPage lang={lang} users={inboundUsers} selectedPhone={chatUserPhone} onPhoneChange={handleChatUserChange} />
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
            <div className="flex-1 bg-[#F4F5F7] rounded-3xl shadow-xl overflow-hidden flex flex-col border border-gray-200 min-h-0">

            {/* Header — 仅保留标题 */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 flex items-center rounded-b-xl shadow-sm z-10 relative flex-shrink-0">
              <Bot size={18} className="text-white mr-2 flex-shrink-0" />
              <h1 className="text-sm font-semibold text-white tracking-wide">{t.chat_bot_name}</h1>
            </div>

            {/* 消息区域 */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
              <div className="flex justify-center mb-6">
                <span className="text-xs text-gray-400 bg-gray-200/50 px-3 py-1 rounded-full">
                  {new Date().toLocaleDateString(t.chat_date_locale, { month: 'long', day: 'numeric' })}
                </span>
              </div>

              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}

              {/* 打字指示器 */}
              {isTyping && (
                <div className="flex w-full mb-4 justify-start items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <Bot size={18} />
                  </div>
                  <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center space-x-1.5 border border-gray-100">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 快捷问题栏 */}
            <div className="bg-white/60 backdrop-blur-md border-t border-gray-100 px-3 py-2.5">
              <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide pb-1">
                {t.chat_faq.map((faq, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(faq)}
                    disabled={isTyping}
                    className="whitespace-nowrap px-3.5 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs rounded-full shadow-sm hover:border-blue-300 hover:text-blue-600 transition disabled:opacity-50"
                  >
                    {faq}
                  </button>
                ))}
              </div>
            </div>

            {/* 输入区域 */}
            <div className="bg-white p-3 pt-2 pb-5 sm:pb-3 border-t border-gray-100">
              <div className="flex items-end space-x-2">
                <button className="p-2 text-gray-400 hover:text-blue-600 transition flex-shrink-0 mb-1">
                  <PlusCircle size={24} strokeWidth={1.5} />
                </button>

                <div className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl flex items-end relative overflow-hidden focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 transition-all">
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t.chat_placeholder}
                    disabled={isTyping}
                    className="w-full bg-transparent max-h-24 min-h-[40px] px-3 py-2.5 outline-none text-sm text-gray-800 resize-none scrollbar-hide disabled:opacity-60"
                    rows={1}
                  />
                  <button className="p-2 text-gray-400 hover:text-gray-600 transition flex-shrink-0 mb-0.5">
                    <Smile size={20} strokeWidth={1.5} />
                  </button>
                </div>

                <button
                  onClick={() => handleSend()}
                  disabled={!inputValue.trim() || isTyping}
                  className={`p-2.5 rounded-full flex-shrink-0 mb-0.5 transition-all shadow-sm ${
                    inputValue.trim() && !isTyping
                      ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <Send size={20} />
                </button>
              </div>
            </div>

            </div>{/* end chat dialog */}
          </div>{/* end flex-col wrapper */}
        </div>
      )}
    </div>
  );
}
