import { memo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Headset, Radio, ChevronRight, LogOut } from 'lucide-react';
import { type Lang, T } from '../../i18n';
import { BREADCRUMB_LABELS } from '../nav';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '../auth/AuthProvider';

interface AgentTopBarProps {
  lang: Lang;
  setLang: (lang: Lang) => void;
  isConnected: boolean;
}

const ROLE_LABEL: Record<string, Record<Lang, string>> = {
  agent: { zh: '坐席', en: 'Agent' },
  operations: { zh: '运营', en: 'Ops' },
};

export const AgentTopBar = memo(function AgentTopBar({ lang, setLang, isConnected }: AgentTopBarProps) {
  const t = T[lang];
  const location = useLocation();
  const navigate = useNavigate();
  const { staff, logout } = useAuth();

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

      {isConnected && (
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-primary/10 border border-primary/20 rounded-full">
          <Radio size={11} className="text-primary animate-pulse" />
          <span className="text-[11px] text-primary font-medium">{t.agent_status_active}</span>
        </div>
      )}

      {/* Global search placeholder */}
      <Input
        placeholder={t.topbar_search}
        className="w-48 h-8 text-xs"
        disabled
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
    </nav>
  );
});
