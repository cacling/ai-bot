/**
 * WorkOrdersLayout.tsx — Layout for /agent/operations/workorders/* routes.
 *
 * Key design: does NOT use <Outlet /> for child rendering.
 * Instead, always renders all 3 WO pages with CSS hidden toggling,
 * so component internal state is preserved across tab switches.
 *
 * Pages are imported from @ai-bot/wo-frontend (independent module).
 */
import { useNavigate, useLocation } from 'react-router-dom';
import { ClipboardList, Inbox, GitMerge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAgentContext } from '../AgentContext';
import { type Lang } from '../../i18n';
import { WorkItemsPage, IntakesPage, ThreadsPage } from '@ai-bot/wo-frontend';

type WoSub = 'items' | 'intakes' | 'threads';

const TABS: { id: WoSub; path: string; Icon: typeof ClipboardList; label: Record<Lang, string> }[] = [
  { id: 'items',   path: '/agent/operations/workorders/items',   Icon: ClipboardList, label: { zh: '工单列表', en: 'Work Items' } },
  { id: 'intakes', path: '/agent/operations/workorders/intakes', Icon: Inbox,         label: { zh: '线索与草稿', en: 'Intakes' } },
  { id: 'threads', path: '/agent/operations/workorders/threads', Icon: GitMerge,      label: { zh: '事项主线', en: 'Threads' } },
];

function subFromPath(pathname: string): WoSub {
  if (pathname.includes('/intakes')) return 'intakes';
  if (pathname.includes('/threads')) return 'threads';
  return 'items';
}

export function WorkOrdersLayout() {
  const { lang } = useAgentContext();
  const navigate = useNavigate();
  const location = useLocation();
  const activeSub = subFromPath(location.pathname);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="bg-background border-b border-border px-4 flex items-center h-9 flex-shrink-0">
        {TABS.map(tab => (
          <Button
            key={tab.id}
            variant="ghost"
            size="sm"
            onClick={() => navigate(tab.path)}
            className={`flex items-center gap-1.5 px-4 h-full rounded-none text-xs font-medium border-b-2 transition-colors ${
              activeSub === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <tab.Icon size={13} />
            {tab.label[lang]}
          </Button>
        ))}
      </div>

      {/* WO pages — CSS hidden toggle to keep alive */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 ${activeSub !== 'items' ? 'hidden' : ''}`}>
          <WorkItemsPage lang={lang} />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'intakes' ? 'hidden' : ''}`}>
          <IntakesPage lang={lang} />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'threads' ? 'hidden' : ''}`}>
          <ThreadsPage lang={lang} />
        </div>
      </div>
    </div>
  );
}
