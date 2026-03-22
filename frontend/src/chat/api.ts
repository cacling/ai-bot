/**
 * chat.ts — 文字客服 WebSocket API
 */

import type { CardData } from './CardMessage';

export const DEFAULT_USER_PHONE = '13800000001';

interface ChatResponse {
  response: string;
  session_id: string;
  card: CardData | null;
  skill_diagram: { skill_name: string; mermaid: string } | null;
}

export function sendChatMessageWS(
  message: string,
  sessionId: string,
  lang: 'zh' | 'en' = 'zh',
  userPhone: string = DEFAULT_USER_PHONE,
  onDiagramUpdate?: (skillName: string, mermaid: string) => void,
  onTextDelta?: (delta: string) => void,
): Promise<ChatResponse & { _fetchMs: number }> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProto}//${location.host}/ws/chat`);

    ws.onopen = () => {
      console.log('[ws] connected, sending message');
      ws.send(JSON.stringify({ type: 'chat_message', message, session_id: sessionId, user_phone: userPhone, lang }));
    };

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data as string) as { type: string; [k: string]: unknown };
      console.log('[ws] received:', msg.type, msg.type === 'text_delta' ? (msg.delta as string).slice(0, 10) : '');
      if (msg.type === 'skill_diagram_update') {
        onDiagramUpdate?.(msg.skill_name as string, msg.mermaid as string);
      } else if (msg.type === 'text_delta') {
        onTextDelta?.(msg.delta as string);
      } else if (msg.type === 'step_text') {
        // 中间步骤文本（如"身份验证通过，正在查询..."），追加换行后展示
        onTextDelta?.((msg.text as string) + '\n');
      } else if (msg.type === 'response') {
        console.log('[ws] response received, text length:', (msg.text as string)?.length);
        ws.close();
        resolve({
          response: (msg.text as string) ?? '',
          session_id: sessionId,
          card: (msg.card as ChatResponse['card']) ?? null,
          skill_diagram: (msg.skill_diagram as ChatResponse['skill_diagram']) ?? null,
          _fetchMs: Math.round(performance.now() - t0),
        });
      } else if (msg.type === 'error') {
        console.error('[ws] error from server:', msg.message);
        ws.close();
        reject(new Error(msg.message as string));
      }
    };

    ws.onerror = (e) => { console.error('[ws] onerror', e); reject(new Error('WebSocket connection error')); };
    ws.onclose = (evt) => {
      console.log('[ws] closed, wasClean:', evt.wasClean, 'code:', evt.code);
      if (!evt.wasClean) reject(new Error('WebSocket closed unexpectedly'));
    };
  });
}

export async function clearSession(sessionId: string): Promise<void> {
  await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
}
