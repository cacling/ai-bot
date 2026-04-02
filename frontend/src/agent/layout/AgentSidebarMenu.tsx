import { memo, useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Headset, Settings, BookOpen, ClipboardList, Route, Users, ChevronRight, ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type Lang } from '../../i18n';
import { MENU_TREE } from '../nav';
import { useAuth } from '../auth/AuthProvider';

interface AgentSidebarMenuProps {
  lang: Lang;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const ICONS: Record<string, React.ReactNode> = {
  workbench: <Headset size={18} />,
  operations: <Settings size={18} />,
  knowledge: <BookOpen size={16} />,
  workorders: <ClipboardList size={16} />,
  routing: <Route size={16} />,
  customers: <Users size={16} />,
};

const STORAGE_KEY = 'agent.sidebar.collapsed';

export function readSidebarCollapsed(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; }
  catch { return false; }
}

export function writeSidebarCollapsed(v: boolean) {
  try { localStorage.setItem(STORAGE_KEY, String(v)); }
  catch { /* ignore */ }
}

export const AgentSidebarMenu = memo(function AgentSidebarMenu({
  lang,
  collapsed,
  onToggleCollapse,
}: AgentSidebarMenuProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { staff } = useAuth();
  const visibleMenu = useMemo(() => {
    const roles = staff?.staff_roles ?? [];
    return MENU_TREE.filter(item => !item.roles || item.roles.some(r => roles.includes(r)));
  }, [staff]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(['operations']));
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isPathActive = (path: string) => location.pathname.startsWith(path);

  // Close hover popover when clicking outside
  useEffect(() => {
    if (!hoveredGroup) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      setHoveredGroup(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [hoveredGroup]);

  const handleMouseEnterGroup = (id: string) => {
    if (!collapsed) return;
    clearTimeout(hoverTimeoutRef.current);
    setHoveredGroup(id);
  };

  const handleMouseLeaveGroup = () => {
    if (!collapsed) return;
    hoverTimeoutRef.current = setTimeout(() => setHoveredGroup(null), 200);
  };

  const handleMouseEnterPopover = () => {
    clearTimeout(hoverTimeoutRef.current);
  };

  const handleMouseLeavePopover = () => {
    hoverTimeoutRef.current = setTimeout(() => setHoveredGroup(null), 200);
  };

  // ─── Expanded mode ───────────────────────────────────────────────
  if (!collapsed) {
    return (
      <div className="w-[220px] min-w-[220px] bg-background border-r border-border flex flex-col transition-all duration-200">
        {/* Toggle button */}
        <div className="flex items-center justify-end px-2 py-1.5 border-b border-border">
          <Button variant="ghost" size="icon-sm" onClick={onToggleCollapse} className="text-muted-foreground hover:text-foreground">
            <PanelLeftClose size={16} />
          </Button>
        </div>

        {/* Menu items */}
        <div className="flex-1 py-1">
          {visibleMenu.map(item => {
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = expandedGroups.has(item.id);
            const isActive = !hasChildren && isPathActive(item.path);

            return (
              <div key={item.id}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (hasChildren) {
                      toggleGroup(item.id);
                      if (!isExpanded) navigate(item.children![0].path);
                    } else {
                      navigate(item.path);
                    }
                  }}
                  className={`w-full justify-start gap-2.5 px-3 h-9 rounded-none text-sm font-medium ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  {ICONS[item.id]}
                  <span className="flex-1 text-left">{item.label[lang]}</span>
                  {hasChildren && (
                    isExpanded
                      ? <ChevronDown size={14} className="text-muted-foreground" />
                      : <ChevronRight size={14} className="text-muted-foreground" />
                  )}
                </Button>

                {hasChildren && isExpanded && item.children!.map(child => {
                  const isChildActive = isPathActive(child.path);
                  return (
                    <Button
                      key={child.id}
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(child.path)}
                      className={`w-full justify-start gap-2.5 pl-9 pr-3 h-8 rounded-none text-sm ${
                        isChildActive
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      {ICONS[child.id]}
                      <span>{child.label[lang]}</span>
                    </Button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Collapsed mode (icon rail) ──────────────────────────────────
  return (
    <div className="w-[44px] min-w-[44px] bg-background border-r border-border flex flex-col transition-all duration-200">
      {/* Toggle button */}
      <div className="flex items-center justify-center px-1 py-1.5 border-b border-border">
        <Button variant="ghost" size="icon-sm" onClick={onToggleCollapse} className="text-muted-foreground hover:text-foreground">
          <PanelLeftOpen size={16} />
        </Button>
      </div>

      {/* Icon rail */}
      <div className="flex-1 py-1 flex flex-col items-center">
        {visibleMenu.map(item => {
          const hasChildren = item.children && item.children.length > 0;
          const isActive = isPathActive(item.path);
          const isHovered = hoveredGroup === item.id;

          return (
            <div key={item.id} className="relative">
              <Button
                ref={isHovered ? triggerRef : undefined}
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (hasChildren) {
                    // Toggle popover on click
                    setHoveredGroup(prev => prev === item.id ? null : item.id);
                  } else {
                    navigate(item.path);
                  }
                }}
                onMouseEnter={() => handleMouseEnterGroup(item.id)}
                onMouseLeave={handleMouseLeaveGroup}
                title={item.label[lang]}
                className={`w-8 h-8 my-0.5 ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {ICONS[item.id]}
              </Button>

              {/* Hover popover for groups with children */}
              {hasChildren && isHovered && (
                <div
                  ref={popoverRef}
                  onMouseEnter={handleMouseEnterPopover}
                  onMouseLeave={handleMouseLeavePopover}
                  className="absolute left-full top-0 ml-1 z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[160px] animate-in fade-in-0 zoom-in-95 slide-in-from-left-2 duration-150"
                >
                  <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border mb-1">
                    {item.label[lang]}
                  </div>
                  {item.children!.map(child => {
                    const isChildActive = isPathActive(child.path);
                    return (
                      <Button
                        key={child.id}
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigate(child.path);
                          setHoveredGroup(null);
                        }}
                        className={`w-full justify-start gap-2 px-3 h-8 rounded-none text-sm ${
                          isChildActive
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                      >
                        {ICONS[child.id]}
                        <span>{child.label[lang]}</span>
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
