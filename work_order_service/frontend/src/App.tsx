import { useState } from 'react';
import { WorkItemsPage } from './pages/WorkItemsPage';
import { IntakesPage } from './pages/IntakesPage';
import { ThreadsPage } from './pages/ThreadsPage';
import { Button } from '@/components/ui/button';
import { ClipboardList, Inbox, GitMerge } from 'lucide-react';
import type { Lang } from './shared/i18n';

type WoTab = 'items' | 'intakes' | 'threads';

export function App() {
  const [tab, setTab] = useState<WoTab>('items');
  const lang: Lang = 'zh';

  const tabs: { key: WoTab; label: Record<Lang, string>; icon: React.ElementType }[] = [
    { key: 'items',   label: { zh: '工单列表', en: 'Work Items' },       icon: ClipboardList },
    { key: 'intakes', label: { zh: '线索与草稿', en: 'Intakes & Drafts' }, icon: Inbox },
    { key: 'threads', label: { zh: '事项主线', en: 'Issue Threads' },     icon: GitMerge },
  ];

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <nav className="flex items-center gap-1 px-4 h-12 border-b border-border bg-background">
        {tabs.map(t => (
          <Button
            key={t.key}
            variant={tab === t.key ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setTab(t.key)}
            className="gap-1.5"
          >
            <t.icon size={14} />
            {t.label[lang]}
          </Button>
        ))}
      </nav>
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 ${tab !== 'items' ? 'hidden' : ''}`}><WorkItemsPage lang={lang} /></div>
        <div className={`absolute inset-0 ${tab !== 'intakes' ? 'hidden' : ''}`}><IntakesPage lang={lang} /></div>
        <div className={`absolute inset-0 ${tab !== 'threads' ? 'hidden' : ''}`}><ThreadsPage lang={lang} /></div>
      </div>
    </div>
  );
}
