/**
 * AgentWorkstationPage.tsx — Agent Layout (shell)
 *
 * Top-level layout for /agent/* routes.
 * Owns: legacy WS connection (for bot/card events), workspace WS (for inbox).
 * Bridges legacy WS events into InboxContext per-interaction maps.
 * Provides: AgentContext (layout-only) and InboxContext to child routes.
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
import { useNotifications } from './layout/useNotifications';
import { type AgentCapacity } from './layout/CapacityBadge';
import { AgentContext, type AgentMessage } from './AgentContext';
import { InboxContext, useWorkspaceWs, getFocusedInteraction } from './inbox';
import { useAuth } from './auth/AuthProvider';

export function AgentWorkstationPage() {
  const [lang, setLang] = useState<Lang>('zh');
  const [userPhone, setUserPhone] = useState(DEFAULT_USER_PHONE);
  const [allPersonas, setAllPersonas] = useState<TestPersona[]>([]);
  const [outboundTasksList, setOutboundTasksList] = useState<OutboundTask[]>([]);
  const [isLegacyConnected, setIsLegacyConnected] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarCollapsed());
  const [presenceStatus, setPresenceStatus] = useState<'online' | 'away' | 'dnd' | 'offline'>('online');
  const [agentCapacity, setAgentCapacity] = useState<AgentCapacity | null>(null);
  const { notifications, unreadCount: unreadNotifCount, push: pushNotification, markAllRead, clearAll: clearNotifications } = useNotifications();

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
  const pendingBotIxRef = useRef<string | null>(null); // which interaction the pending bot is for
  const pendingReplyHintRef = useRef<{ assetVersionId: string; insertedText: string } | null>(null);
  const tSendRef        = useRef<number>(0);
  const processedMsgIds = useRef(new Set<string>());
  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const hiddenCardsRef  = useRef<Set<string>>(new Set());
  const textareaRef     = useRef<HTMLTextAreaElement>(null);
  const msgIdCounter    = useRef(0);
  const nextMsgId = () => ++msgIdCounter.current;

  // Ref to track focused interaction ID inside WS callbacks
  const focusedIdRef = useRef<string | null>(null);

  // ── 跟随客户侧用户切换 ────────────────────────────────────────────────────────
  useAgentUserSync(setUserPhone);

  // ── Workspace WS (Inbox model) ────────────────────────────────────────────
  const { staff } = useAuth();
  const agentId = staff?.id ?? 'agent-demo-001';
  const workspaceWs = useWorkspaceWs({ agentId, enabled: true, lang });

  // Track focused ID in ref for use inside callbacks
  useEffect(() => {
    focusedIdRef.current = workspaceWs.inbox.focusedInteractionId;
  }, [workspaceWs.inbox.focusedInteractionId]);

  // Derive phone from focused interaction (fallback to userPhone for legacy compat)
  const focusedInteraction = getFocusedInteraction(workspaceWs.inbox);
  const effectivePhone = focusedInteraction?.customer_party_id ?? userPhone;

  // ── Presence change handler ────────────────────────────────────────────────
  const handlePresenceChange = useCallback((status: 'online' | 'away' | 'dnd' | 'offline') => {
    setPresenceStatus(status);
    workspaceWs.setPresence(status);
  }, [workspaceWs]);

  // ── Derive capacity from backend presence data ──────────────────────────────
  useEffect(() => {
    const p = workspaceWs.inbox.presence;
    if (p) {
      setAgentCapacity({
        active_chat_count: p.active_chat_count,
        max_chat_slots: p.max_chat_slots,
        active_voice_count: p.active_voice_count,
        max_voice_slots: p.max_voice_slots,
      });
      setPresenceStatus(p.status as 'online' | 'away' | 'dnd' | 'offline');
    } else {
      const chatCount = workspaceWs.inbox.interactions.filter(
        (i) => i.channel === 'chat' && i.state !== 'closed',
      ).length;
      const voiceCount = workspaceWs.inbox.interactions.filter(
        (i) => i.channel === 'voice' && i.state !== 'closed',
      ).length;
      setAgentCapacity({
        active_chat_count: chatCount,
        max_chat_slots: 3,
        active_voice_count: voiceCount,
        max_voice_slots: 1,
      });
    }
  }, [workspaceWs.inbox.presence, workspaceWs.inbox.interactions]);

  // ── Push notifications on new offers ────────────────────────────────────────
  const prevOfferCountRef = useRef(0);
  useEffect(() => {
    const newCount = workspaceWs.inbox.offers.length;
    if (newCount > prevOfferCountRef.current) {
      const diff = newCount - prevOfferCountRef.current;
      const label = langRef.current === 'zh' ? `${diff} 个新任务等待接受` : `${diff} new offer(s) pending`;
      pushNotification(label);
    }
    prevOfferCountRef.current = newCount;
  }, [workspaceWs.inbox.offers.length, pushNotification]);

  // ── Push notifications on interaction state changes ──────────────────────────
  const prevStatesRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const zh = langRef.current === 'zh';
    for (const i of workspaceWs.inbox.interactions) {
      const prevState = prevStatesRef.current.get(i.interaction_id);
      if (prevState && prevState !== i.state) {
        const id = i.customer_party_id?.slice(0, 8) ?? i.interaction_id.slice(0, 8);
        if (i.state === 'wrapping_up') {
          pushNotification(zh ? `会话 ${id} 进入收尾` : `Interaction ${id} wrapping up`);
        } else if (i.state === 'transferred') {
          pushNotification(zh ? `会话 ${id} 已转接` : `Interaction ${id} transferred`);
        }
      }
      prevStatesRef.current.set(i.interaction_id, i.state);
    }
  }, [workspaceWs.inbox.interactions, pushNotification]);

  // ── 初始加载用户及外呼任务数据 + 卡片可见性配置 ──────────────────────────────
  useEffect(() => {
    fetchTestPersonas().then(setAllPersonas).catch(console.error);
    fetchOutboundTasks().then(setOutboundTasksList).catch(console.error);
    fetch('/api/agent-config').then(r => r.json()).then((cfg: { hiddenCards?: string[] }) => {
      const hidden = new Set(cfg.hiddenCards ?? []);
      hiddenCardsRef.current = hidden;
    }).catch(console.error);
  }, []);

  // ── Inject user_detail / outbound_task cards into focused interaction ──────
  useEffect(() => {
    const fid = workspaceWs.inbox.focusedInteractionId;
    if (!fid) return;
    const user = allPersonas.find(p => (p.context.phone as string) === effectivePhone) ?? null;
    const task = findOutboundTaskByPhone(outboundTasksList, effectivePhone);
    // Update cards for the focused interaction
    workspaceWs.dispatchExternalCardEvent(fid, 'user_detail', user);
    if (task) workspaceWs.dispatchExternalCardEvent(fid, 'outbound_task', task);
  }, [effectivePhone, allPersonas, outboundTasksList, workspaceWs.inbox.focusedInteractionId]);

  // ── 持久 WebSocket 生命周期（随 effectivePhone 重建）────────────────────────
  useEffect(() => {
    // Reset streaming state
    pendingBotRef.current = null;
    pendingBotIxRef.current = null;
    pendingReplyHintRef.current = null;
    setIsLegacyConnected(false);

    // When focused interaction changes, set bot mode to 'bot' for new interaction
    const fid = focusedIdRef.current;
    if (fid) {
      const currentMode = workspaceWs.inbox.botModeMap.get(fid);
      if (currentMode === undefined) {
        workspaceWs.setBotMode(fid, 'bot');
      }
    }

    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${wsProto}//${location.host}/ws/agent?phone=${effectivePhone}&lang=${langRef.current}`;
    const ws = new WebSocket(url);
    agentWsRef.current = ws;

    ws.onopen = () => { setIsLegacyConnected(true); processedMsgIds.current.clear(); };

    ws.onmessage = (evt) => {
      if (agentWsRef.current !== ws) return;
      const msg = JSON.parse(evt.data as string) as { source?: string; type: string; msg_id?: string; [k: string]: unknown };
      console.log('[AgentWS] received', msg.type, msg.source, msg);

      // Dedup by msg_id
      if (msg.msg_id) {
        if (processedMsgIds.current.has(msg.msg_id)) return;
        processedMsgIds.current.add(msg.msg_id);
        if (processedMsgIds.current.size > 2000) processedMsgIds.current.clear();
      }

      // Resolve interaction ID — create synthetic if none exists yet
      let iid = focusedIdRef.current;
      if (!iid) {
        iid = workspaceWs.ensureSyntheticInteraction(effectivePhone);
        focusedIdRef.current = iid;
      }

      if (msg.type === 'new_session') {
        workspaceWs.clearMessages(iid);
        workspaceWs.setBotMode(iid, 'bot');
        workspaceWs.setTyping(iid, false);
        pendingBotRef.current = null;
        pendingBotIxRef.current = null;
        // Re-initialize cards for this interaction
        const hidden = hiddenCardsRef.current;
        const fresh = buildInitialCardStates().map(c => hidden.has(c.id) ? { ...c, isOpen: false } : c);
        workspaceWs.updateCardStates(iid, fresh);
        processedMsgIds.current.clear();
        return;
      }

      if (msg.type === 'user_message') {
        const currentMode = workspaceWs.inbox.botModeMap.get(iid) ?? 'bot';
        if (msg.source === 'voice') {
          workspaceWs.dispatchExternalMessage(iid, {
            id: nextMsgId(), sender: 'customer', text: msg.text as string,
            translated_text: msg.translated_text as string | undefined, time: nowTime(),
          });
        } else {
          // Customer message
          workspaceWs.dispatchExternalMessage(iid, {
            id: nextMsgId(), msgId: msg.msg_id, sender: 'customer', text: msg.text as string,
            translated_text: msg.translated_text as string | undefined, time: nowTime(),
          });
          if (currentMode === 'bot') {
            // Create placeholder bot message for streaming
            const botMsgId = nextMsgId();
            pendingBotRef.current = botMsgId;
            pendingBotIxRef.current = iid;
            tSendRef.current = performance.now();
            workspaceWs.setTyping(iid, true);
            workspaceWs.dispatchExternalMessage(iid, {
              id: botMsgId, sender: 'bot', text: '', time: nowTime(),
            });
          }
        }
      } else if (msg.type === 'text_delta') {
        const id = pendingBotRef.current;
        const ix = pendingBotIxRef.current;
        if (id == null || !ix) return;
        workspaceWs.updateMessageInPlace(ix, id, (m) => ({
          ...m, text: m.text + (msg.delta as string),
        }));
      } else if (msg.type === 'response') {
        if (msg.source === 'voice') {
          const text = msg.text as string;
          if (text?.trim()) {
            workspaceWs.dispatchExternalMessage(iid, {
              id: nextMsgId(), sender: 'bot', text,
              translated_text: msg.translated_text as string | undefined, time: nowTime(),
            });
          }
        } else {
          const id = pendingBotRef.current;
          const ix = pendingBotIxRef.current;
          if (id != null && ix) {
            const elapsed = Math.round(performance.now() - tSendRef.current);
            workspaceWs.updateMessageInPlace(ix, id, (m) => ({
              ...m, text: msg.text as string,
              translated_text: msg.translated_text as string | undefined,
              card: (msg.card as AgentMessage['card']) ?? undefined,
              _ms: elapsed,
            }));
            pendingBotRef.current = null;
            pendingBotIxRef.current = null;
          }
          workspaceWs.setTyping(iid, false);
        }
      } else if (msg.type === 'agent_message') {
        // Echo — skip
      } else if (msg.type === 'compliance_block') {
        workspaceWs.dispatchExternalMessage(iid, {
          id: nextMsgId(), sender: 'bot', text: `\u26d4 ${msg.message as string}`, time: nowTime(),
        });
      } else if (msg.type === 'compliance_warning') {
        workspaceWs.dispatchExternalMessage(iid, {
          id: nextMsgId(), sender: 'bot', text: `\u26a0\ufe0f ${msg.message as string}`, time: nowTime(),
        });
      } else if (msg.type === 'error') {
        const id = pendingBotRef.current;
        const ix = pendingBotIxRef.current;
        if (id != null && ix) {
          const t = T[langRef.current];
          workspaceWs.removeMessage(ix, id);
          workspaceWs.dispatchExternalMessage(ix, {
            id: nextMsgId(), sender: 'bot', text: `${t.agent_error_prefix}${msg.message as string}`, time: nowTime(),
          });
          pendingBotRef.current = null;
          pendingBotIxRef.current = null;
        }
        workspaceWs.setTyping(iid, false);
      } else {
        // Card events
        if (msg.type === 'handoff_card') {
          workspaceWs.setBotMode(iid, 'human');
          const id = pendingBotRef.current;
          const ix = pendingBotIxRef.current;
          if (id != null && ix) {
            workspaceWs.removeMessage(ix, id);
            pendingBotRef.current = null;
            pendingBotIxRef.current = null;
          }
          workspaceWs.setTyping(iid, false);
        }
        const def = findCardByEvent(msg.type);
        if (def) {
          const extracted = def.dataExtractor(msg);
          if (def.id === 'compliance') {
            // Compliance: append to array
            workspaceWs.dispatchExternalCardEvent(iid, def.id, extracted, (c) => {
              const arr = Array.isArray(c.data) ? c.data : [];
              return { ...c, data: [...arr, extracted], isOpen: true };
            });
          } else if (def.id === 'diagram' && extracted && typeof extracted === 'object') {
            // Diagram: merge with previous state
            workspaceWs.dispatchExternalCardEvent(iid, def.id, extracted, (c) => {
              if (!c.data || typeof c.data !== 'object') return { ...c, data: extracted, isOpen: true };
              const prev = c.data as Record<string, unknown>;
              const next = extracted as Record<string, unknown>;
              const merged = { ...next } as Record<string, unknown>;
              if (!next.progressState && prev.progressState) merged.progressState = prev.progressState;
              if (!next.nodeTypeMap && prev.nodeTypeMap) merged.nodeTypeMap = prev.nodeTypeMap;
              return { ...c, data: merged, isOpen: true };
            });
          } else {
            workspaceWs.dispatchExternalCardEvent(iid, def.id, extracted);
          }
        }
      }
    };

    ws.onerror = () => {
      const fid2 = focusedIdRef.current;
      if (fid2) workspaceWs.setTyping(fid2, false);
    };
    ws.onclose = () => {
      if (agentWsRef.current === ws) {
        agentWsRef.current = null;
        setIsLegacyConnected(false);
      }
    };

    return () => ws.close();
  }, [effectivePhone]);

  // ── Lang sync to legacy WS ────────────────────────────────────────────────
  useEffect(() => {
    if (agentWsRef.current?.readyState === WebSocket.OPEN) {
      agentWsRef.current.send(JSON.stringify({ type: 'set_lang', lang }));
    }
  }, [lang]);

  // ── Reply copilot action handler ──────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const fid = focusedIdRef.current;
      if (detail?.type === 'insert_text' && fid) {
        const nextText = String(detail.text ?? '');
        const assetVersionId = String(detail.assetVersionId ?? '');
        pendingReplyHintRef.current = assetVersionId
          ? { assetVersionId, insertedText: nextText }
          : null;
        const prev = workspaceWs.inbox.inputValueMap.get(fid) ?? '';
        const newVal = !prev.trim() ? nextText : `${prev.replace(/\s+$/, '')}\n${nextText}`;
        workspaceWs.setInputValue(fid, newVal);
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
            phone: effectivePhone,
            asset_version_id: detail.assetVersionId,
            event_type: detail.event,
            source,
          }),
        }).catch(() => {});
      }
    };
    window.addEventListener('reply-copilot-action', handler);
    return () => window.removeEventListener('reply-copilot-action', handler);
  }, [effectivePhone, workspaceWs]);

  // ── Auto-scroll on message changes ────────────────────────────────────────
  const focusedMsgs = workspaceWs.inbox.messagesMap.get(workspaceWs.inbox.focusedInteractionId ?? '');
  const focusedTyping = workspaceWs.inbox.typingMap.get(workspaceWs.inbox.focusedInteractionId ?? '');
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [focusedMsgs, focusedTyping]);

  // ── Textarea auto-resize ──────────────────────────────────────────────────
  const focusedInput = workspaceWs.inbox.inputValueMap.get(workspaceWs.inbox.focusedInteractionId ?? '') ?? '';
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 96)}px`;
  }, [focusedInput]);

  // ── Send handler (via legacy WS for bot processing) ───────────────────────
  const handleSend = useCallback((text?: string) => {
    const fid = focusedIdRef.current;
    if (!fid) return;
    const inputVal = text ?? (workspaceWs.inbox.inputValueMap.get(fid) ?? '');
    const trimmed = inputVal.trim();
    const isCurrentlyTyping = workspaceWs.inbox.typingMap.get(fid) ?? false;
    if (!trimmed || isCurrentlyTyping || !agentWsRef.current) return;

    // Reply hint feedback
    const pendingHint = pendingReplyHintRef.current;
    if (pendingHint?.assetVersionId && trimmed.includes(pendingHint.insertedText.trim())) {
      const eventType = trimmed === pendingHint.insertedText.trim() ? 'use' : 'edit';
      fetch('/api/km/agent-copilot/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: effectivePhone,
          asset_version_id: pendingHint.assetVersionId,
          event_type: eventType,
          source: 'agent_copilot',
        }),
      }).catch(() => {});
    }
    pendingReplyHintRef.current = null;

    // Write agent message to InboxContext
    workspaceWs.dispatchExternalMessage(fid, {
      id: nextMsgId(), sender: 'agent', text: trimmed, time: nowTime(),
    });
    workspaceWs.setInputValue(fid, '');

    // Send via legacy WS for bot/engine processing
    agentWsRef.current.send(JSON.stringify({ type: 'agent_message', message: trimmed }));
  }, [effectivePhone, workspaceWs]);

  const handleTransferToBot = useCallback(() => {
    const fid = focusedIdRef.current;
    if (!agentWsRef.current || agentWsRef.current.readyState !== WebSocket.OPEN || !fid) return;
    const t = T[langRef.current];
    agentWsRef.current.send(JSON.stringify({ type: 'agent_message', message: t.transfer_to_bot }));
    workspaceWs.dispatchExternalMessage(fid, {
      id: nextMsgId(), sender: 'agent', text: t.transfer_to_bot, time: nowTime(),
    });
    workspaceWs.setBotMode(fid, 'bot');
  }, [workspaceWs]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleInputChange = useCallback((value: string) => {
    const fid = focusedIdRef.current;
    if (fid) workspaceWs.setInputValue(fid, value);
  }, [workspaceWs]);

  // ── Context values ────────────────────────────────────────────────────────

  const ctxValue = useMemo(() => ({
    lang,
    setLang,
    isConnected: isLegacyConnected,
    textareaRef,
    messagesEndRef,
    onInputChange: handleInputChange,
    onKeyDown: handleKeyDown,
    onSend: () => handleSend(),
    onTransferToBot: handleTransferToBot,
  }), [lang, isLegacyConnected, handleInputChange, handleKeyDown, handleSend, handleTransferToBot]);

  const inboxCtxValue = useMemo(() => ({
    inbox: workspaceWs.inbox,
    isConnected: workspaceWs.isConnected,
    focusInteraction: workspaceWs.focusInteraction,
    acceptOffer: workspaceWs.acceptOffer,
    declineOffer: workspaceWs.declineOffer,
    sendMessage: workspaceWs.sendMessage,
    wrapUp: workspaceWs.wrapUp,
    transferInteraction: workspaceWs.transferInteraction,
    setPresence: workspaceWs.setPresence,
    dispatchExternalMessage: workspaceWs.dispatchExternalMessage,
    dispatchExternalCardEvent: workspaceWs.dispatchExternalCardEvent,
    setTyping: workspaceWs.setTyping,
    setBotMode: workspaceWs.setBotMode,
    updateCardStates: workspaceWs.updateCardStates,
    setInputValue: workspaceWs.setInputValue,
    updateMessageInPlace: workspaceWs.updateMessageInPlace,
    removeMessage: workspaceWs.removeMessage,
    clearMessages: workspaceWs.clearMessages,
  }), [workspaceWs]);

  return (
    <AgentContext.Provider value={ctxValue}>
      <InboxContext.Provider value={inboxCtxValue}>
        <div className="flex flex-col h-screen bg-muted font-sans text-foreground overflow-hidden">
          <AgentTopBar
            lang={lang}
            setLang={setLang}
            isConnected={isLegacyConnected}
            presenceStatus={presenceStatus}
            onPresenceChange={handlePresenceChange}
            capacity={agentCapacity}
            notifications={notifications}
            unreadNotifCount={unreadNotifCount}
            onMarkAllRead={markAllRead}
            onClearNotifications={clearNotifications}
          />
          <div className="flex-1 flex overflow-hidden">
            <AgentSidebarMenu lang={lang} collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} />
            <div className="flex-1 overflow-hidden">
              <Outlet />
            </div>
          </div>
        </div>
      </InboxContext.Provider>
    </AgentContext.Provider>
  );
}
