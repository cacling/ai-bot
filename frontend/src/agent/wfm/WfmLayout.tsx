/**
 * WfmLayout.tsx — Layout for /staff/operations/wfm/* routes.
 *
 * Key design: does NOT use <Outlet /> for child rendering.
 * Instead, always renders all 4 WFM pages with CSS hidden toggling,
 * so component internal state is preserved across tab switches.
 *
 * Pages live in ./pages/ (migrated from wfm_service/frontend).
 */
import { useNavigate, useLocation } from 'react-router-dom';
import { CalendarDays, Database, CalendarOff, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAgentContext } from '../AgentContext';
import { type Lang } from '../../i18n';
import { SchedulePlanPage } from './pages/SchedulePlanPage';
import { MasterDataPage } from './pages/MasterDataPage';
import { LeaveManagementPage } from './pages/LeaveManagementPage';
import { RuleConfigPage } from './pages/RuleConfigPage';

type WfmSub = 'plans' | 'master' | 'leaves' | 'rule-config';

const TABS: { id: WfmSub; path: string; Icon: typeof CalendarDays; label: Record<Lang, string> }[] = [
  { id: 'plans',       path: '/staff/operations/wfm/plans',       Icon: CalendarDays, label: { zh: '排班计划', en: 'Schedule Plans' } },
  { id: 'master',      path: '/staff/operations/wfm/master',      Icon: Database,     label: { zh: '主数据', en: 'Master Data' } },
  { id: 'leaves',      path: '/staff/operations/wfm/leaves',      Icon: CalendarOff,  label: { zh: '假勤管理', en: 'Leave Mgmt' } },
  { id: 'rule-config', path: '/staff/operations/wfm/rule-config', Icon: Shield,       label: { zh: '规则配置', en: 'Rule Config' } },
];

function subFromPath(pathname: string): WfmSub {
  if (pathname.includes('/master')) return 'master';
  if (pathname.includes('/leaves')) return 'leaves';
  if (pathname.includes('/rule-config')) return 'rule-config';
  return 'plans';
}

export function WfmLayout() {
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

      {/* WFM pages — CSS hidden toggle to keep alive */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 ${activeSub !== 'plans' ? 'hidden' : ''}`}>
          <SchedulePlanPage lang={lang} />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'master' ? 'hidden' : ''}`}>
          <MasterDataPage lang={lang} />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'leaves' ? 'hidden' : ''}`}>
          <LeaveManagementPage lang={lang} />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'rule-config' ? 'hidden' : ''}`}>
          <RuleConfigPage lang={lang} />
        </div>
      </div>
    </div>
  );
}
