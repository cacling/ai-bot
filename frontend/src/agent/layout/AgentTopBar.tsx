import { memo, useState, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Headset, ChevronRight, LogOut, Search } from 'lucide-react';
import { type Lang, T } from '../../i18n';
import { BREADCRUMB_LABELS } from '../nav';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '../auth/AuthProvider';
import { PresenceToggle } from './PresenceToggle';
import { CapacityBadge, type AgentCapacity } from './CapacityBadge';
import { NotificationCenter } from './NotificationCenter';
import { type Notification } from './useNotifications';
import { SearchDialog } from './SearchDialog';

type PresenceStatus = 'online' | 'away' | 'dnd' | 'offline';

interface AgentTopBarProps {
  lang: Lang;
  setLang: (lang: Lang) => void;
  isConnected: boolean;
  presenceStatus: PresenceStatus;
  onPresenceChange: (status: PresenceStatus) => void;
  capacity: AgentCapacity | null;
  notifications: Notification[];
  unreadNotifCount: number;
  onMarkAllRead: () => void;
  onClearNotifications: () => void;
  onSelectInteraction?: (interactionId: string) => void;
}

const ROLE_LABEL: Record<string, Record<Lang, string>> = {
  agent: { zh: '坐席', en: 'Agent' },
  operations: { zh: '运营', en: 'Ops' },
};

export const AgentTopBar = memo(function AgentTopBar({
  lang,
  setLang,
  isConnected,
  presenceStatus,
  onPresenceChange,
  capacity,
  notifications,
  unreadNotifCount,
  onMarkAllRead,
  onClearNotifications,
  onSelectInteraction,
}: AgentTopBarProps) {
  const t = T[lang];
  const location = useLocation();
  const navigate = useNavigate();
  const { staff, logout } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);

  // Global Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSelectInteraction = useCallback((id: string) => {
    onSelectInteraction?.(id);
    setSearchOpen(false);
  }, [onSelectInteraction]);

  // Build breadcrumb from path segments after /staff/ (or /agent/ for compat)
  const segments = location.pathname.replace(/^\/(staff|agent)\/?/, '').split('/').filter(Boolean);
  const breadcrumbs = segments.map(seg => BREADCRUMB_LABELS[seg]?.[lang] ?? seg);

  const handleLogout = async () => {
    await logout();
    navigate('/staff/login', { replace: true });
  };

  return (
    <nav className="bg-background border-b border-border shadow-sm flex-shrink-0 h-12 flex items-center px-4 gap-3">
      <div className="flex items-center space-x-2 text-foreground font-semibold">
        <Headset size={17} className="text-primary" />
        <span className="text-sm">{t.agent_title}</span>
      </div>

      {/* Breadcrumb */}
      {breadcrumbs.length > 0 && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          {breadcrumbs.map((label, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} />}
              <span className={i === breadcrumbs.length - 1 ? 'text-foreground font-medium' : ''}>
                {label}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="flex-1" />

      {/* Presence status toggle */}
      <PresenceToggle lang={lang} status={presenceStatus} onStatusChange={onPresenceChange} />

      {/* Capacity display */}
      <CapacityBadge lang={lang} capacity={capacity} />

      {/* Global search trigger (Cmd+K) */}
      <button
        onClick={() => setSearchOpen(true)}
        className="flex items-center gap-2 w-48 h-8 px-2 text-xs text-muted-foreground bg-muted/50 border border-border rounded-md hover:bg-muted transition-colors"
      >
        <Search size={12} />
        <span className="flex-1 text-left">{t.topbar_search}</span>
        <kbd className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">⌘K</kbd>
      </button>

      {/* Notification center */}
      <NotificationCenter
        lang={lang}
        notifications={notifications}
        unreadCount={unreadNotifCount}
        onMarkAllRead={onMarkAllRead}
        onClearAll={onClearNotifications}
      />

      {/* Lang switcher */}
      <select
        value={lang}
        onChange={e => setLang(e.target.value as Lang)}
        className="text-sm text-muted-foreground bg-transparent outline-none cursor-pointer"
      >
        <option value="zh">中文</option>
        <option value="en">EN</option>
      </select>

      {/* Staff info + logout */}
      {staff && (
        <div className="flex items-center gap-2 pl-2 border-l border-border">
          <span className="text-sm text-foreground">{staff.display_name}</span>
          {staff.staff_roles.map(role => (
            <Badge key={role} variant="secondary" className="text-[10px] px-1.5 py-0">
              {ROLE_LABEL[role]?.[lang] ?? role}
            </Badge>
          ))}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleLogout}
            title={t.topbar_logout}
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut size={14} />
          </Button>
        </div>
      )}
      <SearchDialog
        open={searchOpen}
        lang={lang}
        onClose={() => setSearchOpen(false)}
        onSelectInteraction={handleSelectInteraction}
      />
    </nav>
  );
});
