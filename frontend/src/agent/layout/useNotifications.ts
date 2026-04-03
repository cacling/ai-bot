/**
 * useNotifications.ts — Accumulates notifications from inbox state changes.
 */
import { useCallback, useRef, useState } from 'react';

export interface Notification {
  id: number;
  text: string;
  timestamp: string;
  read: boolean;
}

let notifId = 0;

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const prevRef = useRef<{ offerCount: number; interactionCount: number }>({
    offerCount: 0,
    interactionCount: 0,
  });

  const push = useCallback((text: string) => {
    setNotifications((prev) => [
      { id: ++notifId, text, timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), read: false },
      ...prev,
    ].slice(0, 50));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, push, markAllRead, clearAll };
}
