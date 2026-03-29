import { useState } from 'react';
import { KnowledgeManagementPage } from './pages/KnowledgeManagementPage';
import { EditorPage } from './pages/EditorPage';
import { SkillManagerPage } from './pages/SkillManagerPage';
import { McpManagementPage } from './pages/mcp/McpManagementPage';
import { Button } from '@/components/ui/button';
import { Library, Wrench, Server, BookOpen } from 'lucide-react';

type KMTab = 'knowledge' | 'skills' | 'mcp' | 'editor';

export function App() {
  const [tab, setTab] = useState<KMTab>('knowledge');

  const tabs: { key: KMTab; label: string; icon: React.ElementType }[] = [
    { key: 'knowledge', label: '知识管理', icon: Library },
    { key: 'skills', label: '技能管理', icon: BookOpen },
    { key: 'mcp', label: 'MCP 管理', icon: Server },
    { key: 'editor', label: '技能编辑器', icon: Wrench },
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
            {t.label}
          </Button>
        ))}
      </nav>
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 ${tab !== 'knowledge' ? 'hidden' : ''}`}><KnowledgeManagementPage /></div>
        <div className={`absolute inset-0 ${tab !== 'skills' ? 'hidden' : ''}`}><SkillManagerPage /></div>
        <div className={`absolute inset-0 ${tab !== 'mcp' ? 'hidden' : ''}`}><McpManagementPage /></div>
        <div className={`absolute inset-0 ${tab !== 'editor' ? 'hidden' : ''}`}><EditorPage /></div>
      </div>
    </div>
  );
}
