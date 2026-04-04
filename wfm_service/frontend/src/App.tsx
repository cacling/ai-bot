import { useState } from 'react';
import { SchedulePlanPage } from './pages/SchedulePlanPage';
import { MasterDataPage } from './pages/MasterDataPage';
import { LeaveManagementPage } from './pages/LeaveManagementPage';
import { RuleConfigPage } from './pages/RuleConfigPage';
import { CalendarDays, Database, CalendarOff, Shield } from 'lucide-react';
import type { Lang } from './shared/i18n';

type WfmTab = 'plans' | 'master' | 'leaves' | 'rules';

export function App() {
  const [tab, setTab] = useState<WfmTab>('plans');
  const lang: Lang = 'zh';

  const tabs: { key: WfmTab; label: Record<Lang, string>; icon: React.ElementType }[] = [
    { key: 'plans',  label: { zh: '排班计划', en: 'Schedule Plans' }, icon: CalendarDays },
    { key: 'master', label: { zh: '主数据',   en: 'Master Data' },    icon: Database },
    { key: 'leaves', label: { zh: '假勤管理', en: 'Leave Mgmt' },     icon: CalendarOff },
    { key: 'rules',  label: { zh: '规则配置', en: 'Rule Config' },    icon: Shield },
  ];

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <nav className="flex items-center gap-1 px-4 h-12 border-b border-border bg-background">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors ${
              tab === t.key
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            <t.icon size={14} />
            {t.label[lang]}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 ${tab !== 'plans' ? 'hidden' : ''}`}><SchedulePlanPage lang={lang} /></div>
        <div className={`absolute inset-0 ${tab !== 'master' ? 'hidden' : ''}`}><MasterDataPage lang={lang} /></div>
        <div className={`absolute inset-0 ${tab !== 'leaves' ? 'hidden' : ''}`}><LeaveManagementPage lang={lang} /></div>
        <div className={`absolute inset-0 ${tab !== 'rules' ? 'hidden' : ''}`}><RuleConfigPage lang={lang} /></div>
      </div>
    </div>
  );
}
