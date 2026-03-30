/**
 * AgentWorkstationPage.tsx — Agent Layout (shell)
 *
 * Top-level layout for /agent/* routes.
 * Owns: WS connection, chat state, card state.
 * Provides: AgentContext to child routes via <Outlet />.
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import { nowTime } from '../App';
import { type CardData } from '../chat/CardMessage';
import { DEFAULT_USER_PHONE } from '../chat/api';
import { T, type Lang } from '../i18n';
import { fetchTestPersonas, type TestPersona } from '../chat/testPersonas';
import { useAgentUserSync } from '../chat/userSync';
import { fetchOutboundTasks, findOutboundTaskByPhone, type OutboundTask } from '../chat/outboundData';
import './cards/index';  // register all card defs (side-effect)
import { buildInitialCardStates, findCardByEvent, type CardState } from './cards/registry';
import { AgentSidebarMenu, readSidebarCollapsed, writeSidebarCollapsed } from './layout/AgentSidebarMenu';
import { AgentTopBar } from './layout/AgentTopBar';
import { AgentContext, type AgentMessage } from './AgentContext';

export function AgentWorkstationPage() {
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarCollapsed());

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      writeSidebarCollapsed(next);
      return next;
    });
  };

  const agentWsRef      = useRef<WebSocket | null>(null);
  const langRef         = useRef<Lang>(lang);
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
      if (agentWsRef.current !== ws) return;
      const msg = JSON.parse(evt.data as string) as { source?: string; type: string; msg_id?: string; [k: string]: unknown };
      console.log('[AgentWS] received', msg.type, msg.source, msg);
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
          setMessages(prev => [...prev,
            { id: nextMsgId(), sender: 'customer', text: msg.text as string, translated_text: (msg.translated_text as string | undefined), time: nowTime() },
          ]);
        } else {
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
          const text = msg.text as string;
          if (text?.trim()) {
            setMessages(prev => [...prev,
              { id: nextMsgId(), sender: 'bot', text, translated_text: (msg.translated_text as string | undefined), time: nowTime() },
            ]);
          }
        } else {
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
        // Echo — skip
      } else if (msg.type === 'compliance_block') {
        setMessages(prev => [...prev, { id: nextMsgId(), sender: 'bot', text: `\u26d4 ${msg.message as string}`, time: nowTime() }]);
      } else if (msg.type === 'compliance_warning') {
        setMessages(prev => [...prev, { id: nextMsgId(), sender: 'bot', text: `\u26a0\ufe0f ${msg.message as string}`, time: nowTime() }]);
      } else if (msg.type === 'error') {
        const id = pendingBotRef.current;
        if (id != null) {
          const t = T[langRef.current];
          setMessages(prev => [
            ...prev.filter(m => m.id !== id),
            { id, sender: 'bot', text: `${t.agent_error_prefix}${msg.message as string}`, time: nowTime() },
          ]);
          pendingBotRef.current = null;
        }
        setIsTyping(false);
      } else {
        if (msg.type === 'handoff_card') {
          setBotMode('human');
          botModeRef.current = 'human';
          const id = pendingBotRef.current;
          if (id != null) {
            setMessages(prev => prev.filter(m => m.id !== id));
            pendingBotRef.current = null;
          }
          setIsTyping(false);
        }
        const def = findCardByEvent(msg.type);
        if (def) {
          const extracted = def.dataExtractor(msg);
          setCardStates(prev => prev.map(c => {
            if (c.id !== def.id) return c;
            if (c.id === 'compliance') {
              const arr = Array.isArray(c.data) ? c.data : [];
              return { ...c, data: [...arr, extracted], isOpen: true };
            }
            if (c.isOpen && JSON.stringify(c.data) === JSON.stringify(extracted)) return c;
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

  useEffect(() => {
    if (agentWsRef.current?.readyState === WebSocket.OPEN) {
      agentWsRef.current.send(JSON.stringify({ type: 'set_lang', lang }));
    }
  }, [lang]);

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
        const source = detail.source ?? 'reply_hint';
        const endpoint = source === 'agent_copilot'
          ? '/api/km/agent-copilot/feedback'
          : '/api/km/reply-copilot/feedback';
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: userPhone,
            asset_version_id: detail.assetVersionId,
            event_type: detail.event,
            source,
          }),
        }).catch(() => {});
      }
    };
    window.addEventListener('reply-copilot-action', handler);
    return () => window.removeEventListener('reply-copilot-action', handler);
  }, [userPhone]);

  useEffect(() => {
    const user = allPersonas.find(p => (p.context.phone as string) === userPhone) ?? null;
    const task = findOutboundTaskByPhone(outboundTasksList, userPhone);
    setCardStates(prev => prev.map(c => {
      if (c.id === 'user_detail')   return { ...c, data: user, isOpen: true };
      if (c.id === 'outbound_task') return { ...c, data: task ?? null, isOpen: !!task };
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
      fetch('/api/km/agent-copilot/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: userPhone,
          asset_version_id: pendingHint.assetVersionId,
          event_type: eventType,
          source: 'agent_copilot',
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
    const t = T[lang];
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

  const ctxValue = useMemo(() => ({
    lang,
    setLang,
    isConnected,
    messages,
    cardStates,
    inputValue,
    isTyping,
    botMode,
    textareaRef,
    messagesEndRef,
    onInputChange: setInputValue,
    onKeyDown: handleKeyDown,
    onSend: () => handleSend(),
    onTransferToBot: handleTransferToBot,
    onUpdateCards: setCardStates,
  }), [lang, isConnected, messages, cardStates, inputValue, isTyping, botMode]);

  return (
    <AgentContext.Provider value={ctxValue}>
      <div className="flex flex-col h-screen bg-muted font-sans text-foreground overflow-hidden">
        <AgentTopBar lang={lang} setLang={setLang} isConnected={isConnected} />
        <div className="flex-1 flex overflow-hidden">
          <AgentSidebarMenu lang={lang} collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} />
          <div className="flex-1 overflow-hidden">
            <Outlet />
          </div>
        </div>
      </div>
    </AgentContext.Provider>
  );
}
