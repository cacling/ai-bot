import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, Send, Headset, User, Radio, MessageSquare, BookOpen, PlusCircle, Smile, Library, Wrench, Server } from 'lucide-react';
import { nowTime } from '../App';
import { CardMessage, type CardData } from '../chat/CardMessage';
import { DEFAULT_USER_PHONE } from '../chat/api';
import { T, type Lang } from '../i18n';
import { fetchMockUsers, type MockUser } from '../chat/mockUsers';
import { useAgentUserSync } from '../chat/userSync';
import { fetchOutboundTasks, findOutboundTaskByPhone, type OutboundTask } from '../chat/outboundData';
import './cards/index';  // register all card defs (side-effect)
import { buildInitialCardStates, findCardByEvent, type CardState } from './cards/registry';
import { CardPanel } from './cards/CardPanel';
import { EditorPage } from '../km/EditorPage';
import { SkillManagerPage } from '../km/SkillManagerPage';
import { KnowledgeManagementPage } from '../km/KnowledgeManagementPage';
import { McpManagementPage } from '../km/mcp/McpManagementPage';

interface AgentMessage {
  id: number;
  msgId?: string;            // session bus msg_id for dedup
  sender: 'bot' | 'agent' | 'customer';   // agent = workstation typed; customer = customer sent; bot = AI response
  text: string;
  translated_text?: string; // 译文（当客户与坐席语言不同时存在）
  time: string;
  card?: CardData;
  _ms?: number;
}

type AgentTab = 'chat' | 'editor';
type KnowledgeSubTab = 'knowledge' | 'skill' | 'mcp';

export function AgentWorkstationPage() {
  const [agentTab, setAgentTab] = useState<AgentTab>('chat');
  const [knowledgeSubTab, setKnowledgeSubTab] = useState<KnowledgeSubTab>('knowledge');
  const [lang, setLang] = useState<Lang>('zh');
  const [userPhone, setUserPhone] = useState(DEFAULT_USER_PHONE);
  const [allUsers, setAllUsers] = useState<MockUser[]>([]);
  const [outboundTasksList, setOutboundTasksList] = useState<OutboundTask[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [botMode, setBotMode] = useState<'bot' | 'human'>('bot');
  const botModeRef = useRef<'bot' | 'human'>('bot');
  const [cardStates, setCardStates] = useState<CardState[]>(() => buildInitialCardStates());

  const agentWsRef      = useRef<WebSocket | null>(null);
  const langRef         = useRef<Lang>(lang); // 用 ref 让 WS 建立时读取最新 lang，而不把 lang 加入 deps
  langRef.current = lang;
  const pendingBotRef   = useRef<number | null>(null);
  const tSendRef        = useRef<number>(0);
  const processedMsgIds = useRef(new Set<string>());
  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);
  const msgIdCounter    = useRef(0);
  const nextMsgId = () => ++msgIdCounter.current;

  // ── 跟随客户侧用户切换 ────────────────────────────────────────────────────────
  useAgentUserSync(setUserPhone);

  // ── 初始加载用户及外呼任务数据 ────────────────────────────────────────────────
  useEffect(() => {
    fetchMockUsers().then(setAllUsers).catch(console.error);
    fetchOutboundTasks().then(setOutboundTasksList).catch(console.error);
  }, []);

  useEffect(() => { botModeRef.current = botMode; }, [botMode]);

  // ── 持久 WebSocket 生命周期（随 phone 重建，lang 切换不重连）────────────────
  useEffect(() => {
    setMessages([]);
    setBotMode('bot');
    botModeRef.current = 'bot';
    setCardStates(buildInitialCardStates());
    setIsConnected(false);

    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${wsProto}//${location.host}/ws/agent?phone=${userPhone}&lang=${langRef.current}`;
    const ws = new WebSocket(url);
    agentWsRef.current = ws;

    ws.onopen = () => { setIsConnected(true); processedMsgIds.current.clear(); };

    ws.onmessage = (evt) => {
      // Guard: ignore events from a stale WS (React StrictMode double-invoke)
      if (agentWsRef.current !== ws) return;
      const msg = JSON.parse(evt.data as string) as { source?: string; type: string; msg_id?: string; [k: string]: unknown };
      // Debug: log all incoming WS events
      console.log('[AgentWS] received', msg.type, msg.source, msg);
      // Dedup: skip if this msg_id was already processed
      if (msg.msg_id) {
        if (processedMsgIds.current.has(msg.msg_id)) return;
        processedMsgIds.current.add(msg.msg_id);
        if (processedMsgIds.current.size > 2000) processedMsgIds.current.clear();
      }

      if (msg.type === 'new_session') {
        setMessages([]);
        setBotMode('bot');
        botModeRef.current = 'bot';
        pendingBotRef.current = null;
        setIsTyping(false);
        // Reset card states but preserve user_detail & outbound_task data
        // (they are driven by userPhone, not by session lifecycle)
        setCardStates(prev => {
          const fresh = buildInitialCardStates();
          const keep = new Set(['user_detail', 'outbound_task']);
          return fresh.map(c => {
            if (!keep.has(c.id)) return c;
            const old = prev.find(p => p.id === c.id);
            return old ? { ...c, data: old.data, isOpen: old.isOpen } : c;
          });
        });
        processedMsgIds.current.clear();
        return;
      }

      if (msg.type === 'user_message') {
        if (msg.source === 'voice') {
          // 语音：直接追加客户消息，不创建 pending bot 气泡（bot 回复将以独立 response 事件到来）
          setMessages(prev => [...prev,
            { id: nextMsgId(), sender: 'customer', text: msg.text as string, translated_text: (msg.translated_text as string | undefined), time: nowTime() },
          ]);
        } else {
          // 文字客服：追加客户消息；仅在 bot 模式下创建 pending bot 气泡
          const customerMsgId = nextMsgId();
          if (botModeRef.current === 'bot') {
            const botMsgId = nextMsgId();
            pendingBotRef.current = botMsgId;
            tSendRef.current = performance.now();
            setIsTyping(true);
            setMessages(prev => [...prev,
              { id: customerMsgId, msgId: msg.msg_id as string | undefined, sender: 'customer', text: msg.text as string, translated_text: (msg.translated_text as string | undefined), time: nowTime() },
              { id: botMsgId,      sender: 'bot',  text: '', time: nowTime() },
            ]);
          } else {
            setMessages(prev => [...prev,
              { id: customerMsgId, msgId: msg.msg_id as string | undefined, sender: 'customer', text: msg.text as string, translated_text: (msg.translated_text as string | undefined), time: nowTime() },
            ]);
          }
        }

      } else if (msg.type === 'text_delta') {
        const id = pendingBotRef.current;
        if (id == null) return;
        setMessages(prev => prev.map(m =>
          m.id === id && m.sender === 'bot' ? { ...m, text: m.text + (msg.delta as string) } : m
        ));

      } else if (msg.type === 'response') {
        if (msg.source === 'voice') {
          // 语音：每条 response 都是独立消息，直接追加
          const text = msg.text as string;
          if (text?.trim()) {
            setMessages(prev => [...prev,
              { id: nextMsgId(), sender: 'bot', text, translated_text: (msg.translated_text as string | undefined), time: nowTime() },
            ]);
          }
        } else {
          // 文字客服：填充 pending bot 气泡
          const id = pendingBotRef.current;
          if (id != null) {
            const elapsed = Math.round(performance.now() - tSendRef.current);
            setMessages(prev => prev.map(m =>
              m.id === id && m.sender === 'bot'
                ? { ...m, text: msg.text as string, translated_text: (msg.translated_text as string | undefined), card: (msg.card as AgentMessage['card']) ?? undefined, _ms: elapsed }
                : m
            ));
            pendingBotRef.current = null;
          }
          setIsTyping(false);
        }

      } else if (msg.type === 'agent_message') {
        // Echo of agent's own message (for confirmation) → skip, already added locally

      } else if (msg.type === 'compliance_block') {
        // 坐席发言被合规拦截 — 显示为系统提示
        setMessages(prev => [...prev, {
          id: nextMsgId(), sender: 'bot',
          text: `\u26d4 ${msg.message as string}`,
          time: nowTime(),
        }]);

      } else if (msg.type === 'compliance_warning') {
        // 坐席发言合规软告警 — 显示为系统提示
        setMessages(prev => [...prev, {
          id: nextMsgId(), sender: 'bot',
          text: `\u26a0\ufe0f ${msg.message as string}`,
          time: nowTime(),
        }]);

      } else if (msg.type === 'error') {
        const id = pendingBotRef.current;
        if (id != null) {
          setMessages(prev => [
            ...prev.filter(m => m.id !== id),
            { id, sender: 'bot', text: `${t.agent_error_prefix}${msg.message as string}`, time: nowTime() },
          ]);
          pendingBotRef.current = null;
        }
        setIsTyping(false);

      } else {
        // handoff_card signals transfer to human
        if (msg.type === 'handoff_card') {
          setBotMode('human');
          botModeRef.current = 'human';
          // Clear any stuck pending bot bubble
          const id = pendingBotRef.current;
          if (id != null) {
            setMessages(prev => prev.filter(m => m.id !== id));
            pendingBotRef.current = null;
          }
          setIsTyping(false);
        }

        // Route all other events to the card system
        const def = findCardByEvent(msg.type);
        if (def) {
          const extracted = def.dataExtractor(msg);
          setCardStates(prev => prev.map(c => {
            if (c.id !== def.id) return c;
            // Compliance card uses cumulative mode (append to array)
            if (c.id === 'compliance') {
              const arr = Array.isArray(c.data) ? c.data : [];
              return { ...c, data: [...arr, extracted], isOpen: true };
            }
            // Skip update if data is identical (avoids unnecessary re-renders)
            if (c.isOpen && JSON.stringify(c.data) === JSON.stringify(extracted)) return c;
            return { ...c, data: extracted, isOpen: true };
          }));
        }
      }
    };

    ws.onerror = () => setIsTyping(false);
    ws.onclose = () => {
      if (agentWsRef.current === ws) {
        agentWsRef.current = null;
        setIsConnected(false);
      }
    };

    return () => ws.close();
  }, [userPhone]);

  // ── lang 切换：通知后端，不重连 WS ────────────────────────────────────────────
  useEffect(() => {
    if (agentWsRef.current?.readyState === WebSocket.OPEN) {
      agentWsRef.current.send(JSON.stringify({ type: 'set_lang', lang }));
    }
  }, [lang]);

  // ── 用户详情 & 外呼任务详情卡片：随客户手机号或数据变更自动注入 ────────────────
  useEffect(() => {
    const user = allUsers.find(u => u.phone === userPhone) ?? null;
    const task = findOutboundTaskByPhone(outboundTasksList, userPhone);
    setCardStates(prev => prev.map(c => {
      if (c.id === 'user_detail')   return { ...c, data: user, isOpen: true };
      if (c.id === 'outbound_task') return { ...c, data: task ?? null, isOpen: true };
      return c;
    }));
  }, [userPhone, allUsers, outboundTasksList]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 96)}px`;
  }, [inputValue]);

  const handleSend = (text = inputValue) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping || !agentWsRef.current) return;

    setMessages(prev => [
      ...prev,
      { id: nextMsgId(), sender: 'agent', text: trimmed, time: nowTime() },
    ]);
    setInputValue('');

    agentWsRef.current.send(JSON.stringify({ type: 'agent_message', message: trimmed }));
  };

  const handleTransferToBot = () => {
    if (!agentWsRef.current || agentWsRef.current.readyState !== WebSocket.OPEN) return;
    agentWsRef.current.send(JSON.stringify({ type: 'agent_message', message: t.transfer_to_bot }));
    setMessages(prev => [...prev, { id: nextMsgId(), sender: 'agent', text: t.transfer_to_bot, time: nowTime() }]);
    setBotMode('bot');
    botModeRef.current = 'bot';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const t = T[lang];
  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans text-gray-800 overflow-hidden">

      {/* Top Nav */}
      <nav className="bg-white border-b border-gray-200 shadow-sm flex-shrink-0 h-12 flex items-center px-4 gap-3">
        <div className="flex items-center space-x-2 text-gray-800 font-semibold">
          <Headset size={17} className="text-blue-600" />
          <span className="text-sm">{t.agent_title}</span>
        </div>

        {isConnected && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-50 border border-green-200 rounded-full">
            <Radio size={11} className="text-green-500 animate-pulse" />
            <span className="text-[11px] text-green-600 font-medium">{t.agent_status_active}</span>
          </div>
        )}

        {/* Lang switcher — left side */}
        <select
          value={lang}
          onChange={e => setLang(e.target.value as Lang)}
          className="text-sm text-gray-500 bg-transparent outline-none cursor-pointer"
        >
          <option value="zh">中文</option>
          <option value="en">EN</option>
        </select>

        {/* Tab selector — right side */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 ml-auto">
          <button
            onClick={() => setAgentTab('chat')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              agentTab === 'chat' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <MessageSquare size={12} />
            {t.agent_tab_chat}
          </button>
          <button
            onClick={() => setAgentTab('editor')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              agentTab === 'editor' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <BookOpen size={12} />
            {t.agent_tab_editor}
          </button>
        </div>
      </nav>

      {/* Knowledge Base tab */}
      {agentTab === 'editor' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Secondary menu */}
          <div className="bg-white border-b border-gray-200 px-4 flex items-center h-9 flex-shrink-0">
            <button
              onClick={() => setKnowledgeSubTab('knowledge')}
              className={`flex items-center gap-1.5 px-4 h-full text-xs font-medium border-b-2 transition-colors ${
                knowledgeSubTab === 'knowledge'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Library size={13} />
              知识管理
            </button>
            <button
              onClick={() => setKnowledgeSubTab('skill')}
              className={`flex items-center gap-1.5 px-4 h-full text-xs font-medium border-b-2 transition-colors ${
                knowledgeSubTab === 'skill'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Wrench size={13} />
              技能管理
            </button>
            <button
              onClick={() => setKnowledgeSubTab('mcp')}
              className={`flex items-center gap-1.5 px-4 h-full text-xs font-medium border-b-2 transition-colors ${
                knowledgeSubTab === 'mcp'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Server size={13} />
              MCP管理
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {knowledgeSubTab === 'knowledge' ? <KnowledgeManagementPage /> : knowledgeSubTab === 'skill' ? <SkillManagerPage /> : <McpManagementPage />}
          </div>
        </div>
      )}

      {/* Main content: Chat left + CardPanel right */}
      <div className={`flex flex-1 overflow-hidden p-4 gap-4 ${agentTab !== 'chat' ? 'hidden' : ''}`}>

        {/* Left: Chat dialog */}
        <div className="w-[400px] flex-shrink-0 bg-white rounded-2xl shadow-md border border-gray-200 flex flex-col overflow-hidden">

          {/* Dialog header */}
          <div className="flex items-center px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
            <MessageSquare size={15} className="text-gray-500 mr-2" />
            <span className="text-sm font-medium text-gray-700">{t.agent_dialog_title}</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center select-none space-y-3">
                <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
                  <Bot size={28} className="text-blue-200" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-400">{t.agent_empty_title}</p>
                  <p className="text-xs text-gray-300">{t.agent_empty_subtitle}</p>
                </div>
              </div>
            )}

            {messages.map(msg => {
              const isLeft  = msg.sender === 'bot' || msg.sender === 'customer';
              const isAgent = msg.sender === 'agent';
              return (
                <div key={msg.id} className={`flex items-start gap-2 ${isLeft ? 'justify-start' : 'justify-end'}`}>
                  {/* Left-side avatar */}
                  {msg.sender === 'bot' && (
                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot size={14} />
                    </div>
                  )}
                  {msg.sender === 'customer' && (
                    <div className="w-7 h-7 rounded-full bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User size={14} />
                    </div>
                  )}

                  <div className={`flex flex-col ${isLeft ? 'flex-1 min-w-0' : 'max-w-[70%] items-end'}`}>
                    {/* Role label */}
                    {msg.sender === 'customer' && (
                      <span className="text-[10px] text-green-600 font-medium mb-0.5 px-0.5">{t.agent_label_customer}</span>
                    )}
                    {isAgent && (
                      <span className="text-[10px] text-blue-500 font-medium mb-0.5 px-0.5">{t.agent_label_agent}</span>
                    )}

                    {msg.text?.trim() && (
                      <div className={`px-3.5 py-2.5 rounded-xl text-sm leading-relaxed ${
                        msg.sender === 'bot'
                          ? 'bg-gray-50 text-gray-800 border border-gray-100 rounded-tl-none'
                          : msg.sender === 'customer'
                          ? 'bg-green-50 text-gray-800 border border-green-100 rounded-tl-none'
                          : 'bg-blue-600 text-white rounded-tr-none'
                      }`}>
                        {msg.sender !== 'agent'
                          ? <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown></div>
                          : msg.text}
                        {/* 译文（语言不同时显示，原文灰色在上，译文蓝色在下） */}
                        {msg.translated_text?.trim() && (
                          <div className={`mt-1.5 pt-1.5 text-sm leading-relaxed ${
                            msg.sender === 'customer'
                              ? 'border-t border-green-100 text-blue-600'
                              : 'border-t border-gray-100 text-blue-600'
                          }`}>
                            <div className="markdown-body">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.translated_text}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {msg.card && (
                      <div className="mt-2 w-full"><CardMessage card={msg.card} lang={lang} /></div>
                    )}
                    <div className="text-[11px] text-gray-400 mt-1 px-0.5">
                      {msg.time}
                      {msg.sender === 'bot' && msg._ms != null && (
                        <span className="ml-1.5 text-gray-300">· {(msg._ms / 1000).toFixed(1)}s</span>
                      )}
                    </div>
                  </div>

                  {/* Right-side avatar for agent */}
                  {isAgent && (
                    <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Headset size={14} />
                    </div>
                  )}
                </div>
              );
            })}

            {isTyping && (
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                  <Bot size={14} />
                </div>
                <div className="bg-gray-50 border border-gray-100 px-3 py-2 rounded-xl rounded-tl-none flex items-center space-x-1">
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Toolbar */}
          <div className="bg-white/60 backdrop-blur-md border-t border-gray-100 px-3 py-2.5 flex-shrink-0">
            <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide">
              <button
                onClick={handleTransferToBot}
                disabled={!isConnected}
                className="whitespace-nowrap px-3.5 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs rounded-full shadow-sm hover:border-green-400 hover:text-green-600 transition disabled:opacity-50"
              >
                {t.transfer_to_bot}
              </button>
            </div>
          </div>

          {/* Input area */}
          <div className="bg-white p-3 pt-2 pb-3 border-t border-gray-100 flex-shrink-0">
            <div className="flex items-end space-x-2">
              <button className="p-2 text-gray-400 hover:text-blue-600 transition flex-shrink-0 mb-1">
                <PlusCircle size={24} strokeWidth={1.5} />
              </button>
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl flex items-end relative overflow-hidden focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 transition-all">
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t.agent_reply_placeholder}
                  disabled={isTyping || !isConnected}
                  className="w-full bg-transparent max-h-24 min-h-[40px] px-3 py-2.5 outline-none text-sm text-gray-800 resize-none scrollbar-hide disabled:opacity-60"
                  rows={1}
                />
                <button className="p-2 text-gray-400 hover:text-gray-600 transition flex-shrink-0 mb-0.5">
                  <Smile size={20} strokeWidth={1.5} />
                </button>
              </div>
              <button
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || isTyping || !isConnected}
                className={`p-2.5 rounded-full flex-shrink-0 mb-0.5 transition-all shadow-sm ${
                  inputValue.trim() && !isTyping && isConnected
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Card panel */}
        <div className="flex-1 overflow-y-auto h-full pb-4 min-w-0">
          <CardPanel cards={cardStates} lang={lang} onUpdate={setCardStates} />
        </div>
      </div>
    </div>
  );
}
