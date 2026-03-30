/**
 * KnowledgeLayout.tsx — Layout for /agent/operations/knowledge/* routes.
 *
 * Key design: does NOT use <Outlet /> for child rendering.
 * Instead, always renders all 3 KM pages with CSS hidden toggling,
 * so KM component internal state is preserved across tab switches.
 */
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Library, Wrench, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KnowledgeManagementPage, SkillManagerPage, McpManagementPage } from '@ai-bot/km-frontend';
import { useAgentContext } from '../AgentContext';

type KnowledgeSub = 'documents' | 'skills' | 'tools';

const TABS: { id: KnowledgeSub; path: string; Icon: typeof Library; label: Record<string, string> }[] = [
  { id: 'documents', path: '/agent/operations/knowledge/documents', Icon: Library, label: { zh: '知识管理', en: 'Knowledge' } },
  { id: 'skills',    path: '/agent/operations/knowledge/skills',    Icon: Wrench,  label: { zh: '技能管理', en: 'Skills' } },
  { id: 'tools',     path: '/agent/operations/knowledge/tools',     Icon: Server,  label: { zh: '工具管理', en: 'Tool Runtime' } },
];

function subFromPath(pathname: string): KnowledgeSub {
  if (pathname.includes('/skills')) return 'skills';
  if (pathname.includes('/tools')) return 'tools';
  return 'documents';
}

export function KnowledgeLayout() {
  const { lang } = useAgentContext();
  const navigate = useNavigate();
  const location = useLocation();
  const activeSub = subFromPath(location.pathname);

  const [pendingToolNav, setPendingToolNav] = useState<{ toolName: string; step?: string; from?: string } | null>(null);

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

      {/* KM pages — CSS hidden toggle to keep alive */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 ${activeSub !== 'documents' ? 'hidden' : ''}`}>
          <KnowledgeManagementPage />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'skills' ? 'hidden' : ''}`}>
          <SkillManagerPage onOpenToolContract={(toolName) => { setPendingToolNav({ toolName }); navigate('/agent/operations/knowledge/tools'); }} />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'tools' ? 'hidden' : ''}`}>
          <McpManagementPage lang={lang} externalNavigateToTool={pendingToolNav} onExternalNavigateHandled={() => setPendingToolNav(null)} />
        </div>
      </div>
    </div>
  );
}
