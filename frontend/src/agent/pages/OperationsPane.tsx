import { memo, useState } from 'react';
import { Library, Wrench, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KnowledgeManagementPage } from '../knowledge/pages/KnowledgeManagementPage';
import { SkillManagerPage } from '../knowledge/pages/SkillManagerPage';
import { McpManagementPage } from '../knowledge/pages/mcp/McpManagementPage';
import { type Lang, T } from '../../i18n';
import { type OperationsView } from '../nav';
import { WorkOrderManagementPage } from '../workorders/pages/WorkOrderManagementPage';

type KnowledgeSubTab = 'knowledge' | 'skill' | 'mcp';

interface OperationsPaneProps {
  lang: Lang;
  operationsView: OperationsView;
  pendingToolNav: { toolName: string; step?: string; from?: string } | null;
  setPendingToolNav: (v: { toolName: string; step?: string; from?: string } | null) => void;
}

export const OperationsPane = memo(function OperationsPane({
  lang,
  operationsView,
  pendingToolNav,
  setPendingToolNav,
}: OperationsPaneProps) {
  const t = T[lang];
  const [knowledgeSubTab, setKnowledgeSubTab] = useState<KnowledgeSubTab>('knowledge');

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Knowledge management view */}
      <div className={`flex-1 flex flex-col overflow-hidden ${operationsView !== 'knowledge' ? 'hidden' : ''}`}>
        {/* Secondary menu */}
        <div className="bg-background border-b border-border px-4 flex items-center h-9 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setKnowledgeSubTab('knowledge')}
            className={`flex items-center gap-1.5 px-4 h-full rounded-none text-xs font-medium border-b-2 transition-colors ${
              knowledgeSubTab === 'knowledge'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Library size={13} />
            {t.ops_tab_knowledge}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setKnowledgeSubTab('skill')}
            className={`flex items-center gap-1.5 px-4 h-full rounded-none text-xs font-medium border-b-2 transition-colors ${
              knowledgeSubTab === 'skill'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Wrench size={13} />
            {t.ops_tab_skills}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setKnowledgeSubTab('mcp')}
            className={`flex items-center gap-1.5 px-4 h-full rounded-none text-xs font-medium border-b-2 transition-colors ${
              knowledgeSubTab === 'mcp'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Server size={13} />
            Tool Runtime
          </Button>
        </div>
        <div className="flex-1 overflow-hidden relative">
          <div className={`absolute inset-0 ${knowledgeSubTab !== 'knowledge' ? 'hidden' : ''}`}><KnowledgeManagementPage /></div>
          <div className={`absolute inset-0 ${knowledgeSubTab !== 'skill' ? 'hidden' : ''}`}>
            <SkillManagerPage onOpenToolContract={(toolName) => { setPendingToolNav({ toolName }); setKnowledgeSubTab('mcp'); }} />
          </div>
          <div className={`absolute inset-0 ${knowledgeSubTab !== 'mcp' ? 'hidden' : ''}`}>
            <McpManagementPage externalNavigateToTool={pendingToolNav} onExternalNavigateHandled={() => setPendingToolNav(null)} />
          </div>
        </div>
      </div>

      {/* Work order management view */}
      <div className={`flex-1 overflow-hidden ${operationsView !== 'workorders' ? 'hidden' : ''}`}>
        <WorkOrderManagementPage lang={lang} />
      </div>
    </div>
  );
});
