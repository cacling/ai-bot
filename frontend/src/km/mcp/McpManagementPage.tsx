/**
 * McpManagementPage.tsx — MCP 管理主容器（严格 MCP 对齐：5 Tab）
 *
 * Tool Contracts / MCP Servers / Connectors / MCP Resources / MCP Prompts
 */
import { useState } from 'react';
import { Wrench, Server, Plug, FileText, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { McpServerList } from './McpServerList';
import { McpToolListPage } from './McpToolListPage';
import { ConnectorListPage } from './ConnectorListPage';
import { McpResourceCatalog } from './McpResourceCatalog';
import { McpPromptCatalog } from './McpPromptCatalog';

type McpTab = 'tools' | 'servers' | 'connectors' | 'mcp_resources' | 'mcp_prompts';

const TABS: Array<{ id: McpTab; label: string; icon: React.ReactNode }> = [
  { id: 'tools', label: 'Tool Contracts', icon: <Wrench size={13} /> },
  { id: 'servers', label: 'MCP Servers', icon: <Server size={13} /> },
  { id: 'connectors', label: 'Connectors', icon: <Plug size={13} /> },
  { id: 'mcp_resources', label: 'MCP Resources', icon: <FileText size={13} /> },
  { id: 'mcp_prompts', label: 'MCP Prompts', icon: <MessageSquare size={13} /> },
];

export function McpManagementPage() {
  const [tab, setTab] = useState<McpTab>('tools');

  // Cross-tab navigation: Server Console → Tool Studio
  const [navigateToTool, setNavigateToTool] = useState<{
    toolId: string;
    step?: string;
    fromServer?: string;
  } | null>(null);

  const handleOpenTool = (toolId: string, step?: string, fromServer?: string) => {
    if (!toolId) {
      setTab('tools');
      return;
    }
    setNavigateToTool({ toolId, step, fromServer });
    setTab('tools');
  };

  const handleBackToServers = () => {
    setTab('servers');
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-auto">
      {/* Tab 切换 */}
      <div className="h-10 border-b border-border flex items-center shrink-0 px-2">
        {TABS.map(t => (
          <Button
            key={t.id}
            variant="ghost"
            size="sm"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 h-full rounded-none text-xs font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon}
            {t.label}
          </Button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto">
        {tab === 'tools' && <McpToolListPage navigateToTool={navigateToTool} onNavigateHandled={() => setNavigateToTool(null)} onBackToServers={handleBackToServers} />}
        {tab === 'servers' && <McpServerList onOpenTool={handleOpenTool} onOpenConnectors={() => setTab('connectors')} />}
        {tab === 'connectors' && <ConnectorListPage />}
        {tab === 'mcp_resources' && <McpResourceCatalog />}
        {tab === 'mcp_prompts' && <McpPromptCatalog />}
      </div>
    </div>
  );
}
