import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, Send, Headset, User, Radio, MessageSquare, BookOpen, PlusCircle, Smile, Library, Wrench, Server } from 'lucide-react';
import { nowTime } from '../App';
import { CardMessage, type CardData } from '../chat/CardMessage';
import { DEFAULT_USER_PHONE } from '../chat/api';
import { T, type Lang } from '../i18n';
import { fetchTestPersonas, type TestPersona } from '../chat/testPersonas';
import { useAgentUserSync } from '../chat/userSync';
import { fetchOutboundTasks, findOutboundTaskByPhone, type OutboundTask } from '../chat/outboundData';
import './cards/index';  // register all card defs (side-effect)
import { buildInitialCardStates, findCardByEvent, type CardState } from './cards/registry';
import { CardPanel } from './cards/CardPanel';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { EditorPage } from '../km/EditorPage';
import { SkillManagerPage } from '../km/SkillManagerPage';
import { KnowledgeManagementPage } from '../km/KnowledgeManagementPage';
import { McpManagementPage } from '../km/mcp/McpManagementPage';
import { Button } from '@/components/ui/button';

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
  const [pendingToolNav, setPendingToolNav] = useState<{ toolName: string; step?: string; from?: string } | null>(null);
  const [lang, setLang] = useState<Lang>('zh');
  const [userPhone, setUserPhone] = useState(DEFAULT_USER_PHONE);
  const [allPersonas, setAllPersonas] = useState<TestPersona[]>([]);
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
  const pendingReplyHintRef = useRef<{ assetVersionId: string; insertedText: string } | null>(null);
  const tSendRef        = useRef<number>(0);
  const processedMsgIds = useRef(new Set<string>());
  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const hiddenCardsRef  = useRef<Set<string>>(new Set());
  const textareaRef     = useRef<HTMLTextAreaElement>(null);
  const msgIdCounter    = useRef(0);
  const nextMsgId = () => ++msgIdCounter.current;

  // ── 跟随客户侧用户切换 ────────────────────────────────────────────────────────
  useAgentUserSync(setUserPhone);

  // ── 初始加载用户及外呼任务数据 + 卡片可见性配置 ──────────────────────────────
  useEffect(() => {
    fetchTestPersonas().then(setAllPersonas).catch(console.error);
    fetchOutboundTasks().then(setOutboundTasksList).catch(console.error);
    fetch('/api/agent-config').then(r => r.json()).then((cfg: { hiddenCards?: string[] }) => {
      const hidden = new Set(cfg.hiddenCards ?? []);
      hiddenCardsRef.current = hidden;
      if (hidden.size > 0) {
        setCardStates(prev => prev.map(c => hidden.has(c.id) ? { ...c, isOpen: false } : c));
      }
    }).catch(console.error);
  }, []);

  useEffect(() => { botModeRef.current = botMode; }, [botMode]);

  // ── 持久 WebSocket 生命周期（随 phone 重建，lang 切换不重连）────────────────
  useEffect(() => {
    setMessages([]);
    setBotMode('bot');
    botModeRef.current = 'bot';
    const hidden = hiddenCardsRef.current;
    setCardStates(buildInitialCardStates().map(c => hidden.has(c.id) ? { ...c, isOpen: false } : c));
    setIsConnected(false);
    pendingReplyHintRef.current = null;

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
          const hidden = hiddenCardsRef.current;
          const fresh = buildInitialCardStates().map(c => hidden.has(c.id) ? { ...c, isOpen: false } : c);
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
            // For diagram card: merge progressState and nodeTypeMap from previous data if new event doesn't have them
            if (c.id === 'diagram' && c.data && extracted && typeof c.data === 'object' && typeof extracted === 'object') {
              const prev = c.data as Record<string, unknown>;
              const next = extracted as Record<string, unknown>;
              const merged = { ...next };
              if (!next.progressState && prev.progressState) merged.progressState = prev.progressState;
              if (!next.nodeTypeMap && prev.nodeTypeMap) merged.nodeTypeMap = prev.nodeTypeMap;
              if (merged !== next) return { ...c, data: merged, isOpen: true };
            }
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

  // ── Reply Copilot: listen for CustomEvents from ReplyHintContent card ────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type === 'insert_text') {
        setInputValue(prev => {
          const nextText = String(detail.text ?? '');
          const assetVersionId = String(detail.assetVersionId ?? '');
          pendingReplyHintRef.current = assetVersionId
            ? { assetVersionId, insertedText: nextText }
            : null;
          if (!prev.trim()) return nextText;
          return `${prev.replace(/\s+$/, '')}\n${nextText}`;
        });
      }
      if (detail?.type === 'reply_feedback') {
        fetch('/api/km/reply-copilot/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: userPhone,
            asset_version_id: detail.assetVersionId,
            event_type: detail.event,
          }),
        }).catch(() => {});
      }
    };
    window.addEventListener('reply-copilot-action', handler);
    return () => window.removeEventListener('reply-copilot-action', handler);
  }, [userPhone]);

  // ── 用户详情 & 外呼任务详情卡片：随客户手机号或数据变更自动注入 ────────────────
  useEffect(() => {
    const user = allPersonas.find(p => (p.context.phone as string) === userPhone) ?? null;
    const task = findOutboundTaskByPhone(outboundTasksList, userPhone);
    setCardStates(prev => prev.map(c => {
      if (c.id === 'user_detail')   return { ...c, data: user, isOpen: true };
      if (c.id === 'outbound_task') return { ...c, data: task ?? null, isOpen: true };
      return c;
    }));
  }, [userPhone, allPersonas, outboundTasksList]);

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

    const pendingHint = pendingReplyHintRef.current;
    if (pendingHint?.assetVersionId && trimmed.includes(pendingHint.insertedText.trim())) {
      const eventType = trimmed === pendingHint.insertedText.trim() ? 'use' : 'edit';
      fetch('/api/km/reply-copilot/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: userPhone,
          asset_version_id: pendingHint.assetVersionId,
          event_type: eventType,
        }),
      }).catch(() => {});
    }
    pendingReplyHintRef.current = null;

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
    <div className="flex flex-col h-screen bg-muted font-sans text-foreground overflow-hidden">

      {/* Top Nav */}
      <nav className="bg-background border-b border-border shadow-sm flex-shrink-0 h-12 flex items-center px-4 gap-3">
        <div className="flex items-center space-x-2 text-foreground font-semibold">
          <Headset size={17} className="text-primary" />
          <span className="text-sm">{t.agent_title}</span>
        </div>

        {isConnected && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-primary/10 border border-primary/20 rounded-full">
            <Radio size={11} className="text-primary animate-pulse" />
            <span className="text-[11px] text-primary font-medium">{t.agent_status_active}</span>
          </div>
        )}

        {/* Lang switcher — left side */}
        <select
          value={lang}
          onChange={e => setLang(e.target.value as Lang)}
          className="text-sm text-muted-foreground bg-transparent outline-none cursor-pointer"
        >
          <option value="zh">中文</option>
          <option value="en">EN</option>
        </select>

        {/* Tab selector — right side */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 ml-auto">
          <Button
            variant={agentTab === 'chat' ? 'outline' : 'ghost'}
            size="sm"
            onClick={() => setAgentTab('chat')}
            className={`flex items-center gap-1.5 text-xs font-medium ${
              agentTab === 'chat' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <MessageSquare size={12} />
            {t.agent_tab_chat}
          </Button>
          <Button
            variant={agentTab === 'editor' ? 'outline' : 'ghost'}
            size="sm"
            onClick={() => setAgentTab('editor')}
            className={`flex items-center gap-1.5 text-xs font-medium ${
              agentTab === 'editor' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BookOpen size={12} />
            {t.agent_tab_editor}
          </Button>
        </div>
      </nav>

      {/* Knowledge Base tab */}
      <div className={`flex-1 flex flex-col overflow-hidden ${agentTab !== 'editor' ? 'hidden' : ''}`}>
          {/* Secondary menu */}
          <div className="bg-background border-b border-border px-4 flex items-center h-9 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setKnowledgeSubTab('knowledge')}
              className={`flex items-center gap-1.5 px-4 h-full rounded-none text-xs font-medium border-b-2 transition-colors ${
                knowledgeSubTab === 'knowledge'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Library size={13} />
              知识管理
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setKnowledgeSubTab('skill')}
              className={`flex items-center gap-1.5 px-4 h-full rounded-none text-xs font-medium border-b-2 transition-colors ${
                knowledgeSubTab === 'skill'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Wrench size={13} />
              技能管理
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setKnowledgeSubTab('mcp')}
              className={`flex items-center gap-1.5 px-4 h-full rounded-none text-xs font-medium border-b-2 transition-colors ${
                knowledgeSubTab === 'mcp'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Server size={13} />
              MCP管理
            </Button>
          </div>
          <div className="flex-1 overflow-hidden relative">
            <div className={`absolute inset-0 ${knowledgeSubTab !== 'knowledge' ? 'hidden' : ''}`}><KnowledgeManagementPage /></div>
            <div className={`absolute inset-0 ${knowledgeSubTab !== 'skill' ? 'hidden' : ''}`}><SkillManagerPage onOpenToolContract={(toolName) => { setPendingToolNav({ toolName }); setKnowledgeSubTab('mcp'); }} /></div>
            <div className={`absolute inset-0 ${knowledgeSubTab !== 'mcp' ? 'hidden' : ''}`}><McpManagementPage externalNavigateToTool={pendingToolNav} onExternalNavigateHandled={() => setPendingToolNav(null)} /></div>
          </div>
      </div>

      {/* Main content: Chat left + CardPanel right */}
      <div className={`flex-1 overflow-hidden p-4 ${agentTab !== 'chat' ? 'hidden' : ''}`}>
      <ResizablePanelGroup orientation="horizontal" className="h-full gap-4" id="agent-workstation">

        {/* Left: Chat dialog */}
        <ResizablePanel id="agent-chat" defaultSize="30%" minSize="20%" maxSize="50%">
        <div className="h-full bg-background rounded-2xl shadow-md border border-border flex flex-col overflow-hidden">

          {/* Dialog header */}
          <div className="flex items-center px-4 py-2.5 border-b border-border bg-muted flex-shrink-0">
            <MessageSquare size={15} className="text-muted-foreground mr-2" />
            <span className="text-sm font-medium text-foreground">{t.agent_dialog_title}</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center select-none space-y-3">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot size={28} className="text-primary/30" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">{t.agent_empty_title}</p>
                  <p className="text-xs text-muted-foreground/60">{t.agent_empty_subtitle}</p>
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
                    <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot size={14} />
                    </div>
                  )}
                  {msg.sender === 'customer' && (
                    <div className="w-7 h-7 rounded-full bg-secondary text-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User size={14} />
                    </div>
                  )}

                  <div className={`flex flex-col ${isLeft ? 'flex-1 min-w-0' : 'max-w-[70%] items-end'}`}>
                    {/* Role label */}
                    {msg.sender === 'customer' && (
                      <span className="text-[10px] text-primary font-medium mb-0.5 px-0.5">{t.agent_label_customer}</span>
                    )}
                    {isAgent && (
                      <span className="text-[10px] text-primary font-medium mb-0.5 px-0.5">{t.agent_label_agent}</span>
                    )}

                    {msg.text?.trim() && (
                      <div className={`px-3.5 py-2.5 rounded-xl text-sm leading-relaxed ${
                        msg.sender === 'bot'
                          ? 'bg-muted text-foreground border border-border rounded-tl-none'
                          : msg.sender === 'customer'
                          ? 'bg-secondary text-foreground border border-border rounded-tl-none'
                          : 'bg-primary text-primary-foreground rounded-tr-none'
                      }`}>
                        {msg.sender !== 'agent'
                          ? <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown></div>
                          : msg.text}
                        {/* 译文（语言不同时显示，原文灰色在上，译文蓝色在下） */}
                        {msg.translated_text?.trim() && (
                          <div className={`mt-1.5 pt-1.5 text-sm leading-relaxed ${
                            msg.sender === 'customer'
                              ? 'border-t border-border text-primary'
                              : 'border-t border-border text-primary'
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
                    <div className="text-[11px] text-muted-foreground mt-1 px-0.5">
                      {msg.time}
                      {msg.sender === 'bot' && msg._ms != null && (
                        <span className="ml-1.5 text-muted-foreground/60">· {(msg._ms / 1000).toFixed(1)}s</span>
                      )}
                    </div>
                  </div>

                  {/* Right-side avatar for agent */}
                  {isAgent && (
                    <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Headset size={14} />
                    </div>
                  )}
                </div>
              );
            })}

            {isTyping && (
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                  <Bot size={14} />
                </div>
                <div className="bg-muted border border-border px-3 py-2 rounded-xl rounded-tl-none flex items-center space-x-1">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Toolbar */}
          <div className="bg-background/60 backdrop-blur-md border-t border-border px-3 py-2.5 flex-shrink-0">
            <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTransferToBot}
                disabled={!isConnected}
                className="whitespace-nowrap rounded-full text-xs shadow-sm hover:border-primary hover:text-primary transition"
              >
                {t.transfer_to_bot}
              </Button>
            </div>
          </div>

          {/* Input area */}
          <div className="bg-background p-3 pt-2 pb-3 border-t border-border flex-shrink-0">
            <div className="flex items-end space-x-2">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary flex-shrink-0 mb-1">
                <PlusCircle size={24} strokeWidth={1.5} />
              </Button>
              <div className="flex-1 bg-muted border border-border rounded-2xl flex items-end relative overflow-hidden focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-all">
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t.agent_reply_placeholder}
                  disabled={isTyping || !isConnected}
                  className="w-full bg-transparent max-h-24 min-h-[40px] px-3 py-2.5 outline-none text-sm text-foreground resize-none scrollbar-hide disabled:opacity-60"
                  rows={1}
                />
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground flex-shrink-0 mb-0.5">
                  <Smile size={20} strokeWidth={1.5} />
                </Button>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || isTyping || !isConnected}
                className={`p-2.5 rounded-full flex-shrink-0 mb-0.5 transition-all shadow-sm ${
                  inputValue.trim() && !isTyping && isConnected
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                }`}
              >
                <Send size={18} />
              </Button>
            </div>
          </div>
        </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Right: Card panel */}
        <ResizablePanel id="agent-cards" defaultSize="70%" minSize="40%">
        <div className="h-full overflow-y-auto pb-4">
          <CardPanel cards={cardStates} lang={lang} onUpdate={setCardStates} />
        </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      </div>
    </div>
  );
}
