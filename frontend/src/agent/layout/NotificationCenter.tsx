/**
 * NotificationCenter.tsx — Bell icon with dropdown notification panel.
 */
import { memo, useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { type Lang } from '../../i18n';
import { type Notification } from './useNotifications';

interface NotificationCenterProps {
  lang: Lang;
  notifications: Notification[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onClearAll: () => void;
}

export const NotificationCenter = memo(function NotificationCenter({
  lang,
  notifications,
  unreadCount,
  onMarkAllRead,
  onClearAll,
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleToggle = () => {
    if (!open) onMarkAllRead();
    setOpen(!open);
  };

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleToggle}
        className="relative text-muted-foreground hover:text-foreground"
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[9px] flex items-center justify-center"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-background border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-medium text-foreground">
              {lang === 'zh' ? '通知' : 'Notifications'}
            </span>
            {notifications.length > 0 && (
              <Button variant="ghost" size="sm" className="text-[10px] h-5 px-1.5" onClick={onClearAll}>
                {lang === 'zh' ? '清空' : 'Clear'}
              </Button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                {lang === 'zh' ? '暂无通知' : 'No notifications'}
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className="px-3 py-2 border-b border-border last:border-0 hover:bg-muted/50"
                >
                  <p className="text-xs text-foreground">{n.text}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{n.timestamp}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
});
