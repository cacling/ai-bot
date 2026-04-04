/**
 * OutboundLayout.tsx — Layout for /staff/operations/outbound/* routes.
 *
 * CSS hidden toggle pattern (same as WorkOrdersLayout) to preserve
 * component state across tab switches.
 */
import { useNavigate, useLocation } from 'react-router-dom';
import { Megaphone, PhoneOutgoing, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAgentContext } from '../AgentContext';
import { type Lang } from '../../i18n';
import { CampaignsPage } from './pages/CampaignsPage';
import { CallRecordsPage } from './pages/CallRecordsPage';
import { DashboardPage } from './pages/DashboardPage';

type OutboundSub = 'campaigns' | 'call-records' | 'dashboard';

const TABS: { id: OutboundSub; path: string; Icon: typeof Megaphone; label: Record<Lang, string> }[] = [
  { id: 'campaigns',    path: '/staff/operations/outbound/campaigns',    Icon: Megaphone,     label: { zh: '活动与任务', en: 'Campaigns & Tasks' } },
  { id: 'call-records', path: '/staff/operations/outbound/call-records', Icon: PhoneOutgoing,  label: { zh: '通话记录', en: 'Call Records' } },
  { id: 'dashboard',    path: '/staff/operations/outbound/dashboard',    Icon: BarChart3,      label: { zh: '效果看板', en: 'Performance' } },
];

function subFromPath(pathname: string): OutboundSub {
  if (pathname.includes('/call-records')) return 'call-records';
  if (pathname.includes('/dashboard')) return 'dashboard';
  return 'campaigns';
}

export function OutboundLayout() {
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

      {/* Pages — CSS hidden toggle to keep alive */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 ${activeSub !== 'campaigns' ? 'hidden' : ''}`}>
          <CampaignsPage lang={lang} />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'call-records' ? 'hidden' : ''}`}>
          <CallRecordsPage lang={lang} />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'dashboard' ? 'hidden' : ''}`}>
          <DashboardPage lang={lang} />
        </div>
      </div>
    </div>
  );
}
