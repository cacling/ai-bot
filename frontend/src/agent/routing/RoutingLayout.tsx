/**
 * RoutingLayout.tsx — Layout for /staff/operations/routing/* routes.
 *
 * 6 sub-pages grouped into 3 sections:
 * - 运营: 路由总览、路由规则配置
 * - 策略: 打分策略管理、溢出与降级
 * - 监控: 实时路由监控、执行日志与回放
 *
 * Uses CSS hidden toggle to preserve state across tabs.
 */
import { useNavigate, useLocation } from 'react-router-dom';
import {
  BarChart3,
  GitBranch,
  Award,
  ShieldAlert,
  Radio,
  ScrollText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAgentContext } from '../AgentContext';
import { RoutingOverviewPage } from './pages/RoutingOverviewPage';
import { RouteRuleConfigPage } from './pages/RouteRuleConfigPage';
import { ScoringStrategyPage } from './pages/ScoringStrategyPage';
import { OverflowStrategyPage } from './pages/OverflowStrategyPage';
import { RoutingMonitorPage } from './pages/RoutingMonitorPage';
import { ExecutionLogsPage } from './pages/ExecutionLogsPage';

type RoutingSub = 'overview' | 'rules' | 'scoring' | 'overflow' | 'monitor' | 'logs';

interface TabDef {
  id: RoutingSub;
  path: string;
  Icon: typeof BarChart3;
  label: Record<string, string>;
  group: 'ops' | 'strategy' | 'monitor';
}

const TABS: TabDef[] = [
  // 运营
  { id: 'overview', path: '/staff/operations/routing/overview', Icon: BarChart3, label: { zh: '路由总览', en: 'Overview' }, group: 'ops' },
  { id: 'rules', path: '/staff/operations/routing/rules', Icon: GitBranch, label: { zh: '路由规则', en: 'Rules' }, group: 'ops' },
  // 策略
  { id: 'scoring', path: '/staff/operations/routing/scoring', Icon: Award, label: { zh: '打分策略', en: 'Scoring' }, group: 'strategy' },
  { id: 'overflow', path: '/staff/operations/routing/overflow', Icon: ShieldAlert, label: { zh: '溢出与降级', en: 'Overflow' }, group: 'strategy' },
  // 监控
  { id: 'monitor', path: '/staff/operations/routing/monitor', Icon: Radio, label: { zh: '实时监控', en: 'Monitor' }, group: 'monitor' },
  { id: 'logs', path: '/staff/operations/routing/logs', Icon: ScrollText, label: { zh: '日志与回放', en: 'Logs & Replay' }, group: 'monitor' },
];

const GROUP_LABELS: Record<string, Record<string, string>> = {
  ops: { zh: '运营', en: 'Ops' },
  strategy: { zh: '策略', en: 'Strategy' },
  monitor: { zh: '监控', en: 'Monitor' },
};

function subFromPath(pathname: string): RoutingSub {
  for (const tab of TABS) {
    if (pathname.includes(`/${tab.id}`)) return tab.id;
  }
  return 'overview';
}

export function RoutingLayout() {
  const { lang } = useAgentContext();
  const navigate = useNavigate();
  const location = useLocation();
  const activeSub = subFromPath(location.pathname);

  const groups = ['ops', 'strategy', 'monitor'] as const;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="bg-background border-b border-border px-4 flex items-center h-9 flex-shrink-0 gap-0">
        {groups.map((group, gi) => {
          const groupTabs = TABS.filter((t) => t.group === group);
          return (
            <div key={group} className="flex items-center">
              {gi > 0 && <Separator orientation="vertical" className="h-4 mx-1" />}
              <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mr-1 select-none">
                {GROUP_LABELS[group][lang]}
              </span>
              {groupTabs.map((tab) => (
                <Button
                  key={tab.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(tab.path)}
                  className={`flex items-center gap-1.5 px-3 h-full rounded-none text-xs font-medium border-b-2 transition-colors ${
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
          );
        })}
      </div>

      {/* Pages — CSS hidden toggle to preserve state */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 ${activeSub !== 'overview' ? 'hidden' : ''}`}>
          <RoutingOverviewPage />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'rules' ? 'hidden' : ''}`}>
          <RouteRuleConfigPage />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'scoring' ? 'hidden' : ''}`}>
          <ScoringStrategyPage />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'overflow' ? 'hidden' : ''}`}>
          <OverflowStrategyPage />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'monitor' ? 'hidden' : ''}`}>
          <RoutingMonitorPage />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'logs' ? 'hidden' : ''}`}>
          <ExecutionLogsPage />
        </div>
      </div>
    </div>
  );
}
