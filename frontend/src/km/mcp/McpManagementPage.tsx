/**
 * McpManagementPage.tsx — MCP 管理主容器
 *
 * Tool Contracts / MCP Servers / Connectors
 */
import { useState, useEffect } from 'react';
import { Wrench, Server, Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { McpServerList } from './McpServerList';
import { McpToolListPage } from './McpToolListPage';
import { ConnectorListPage } from './ConnectorListPage';

type McpTab = 'tools' | 'servers' | 'connectors';

const TABS: Array<{ id: McpTab; label: string; icon: React.ReactNode }> = [
  { id: 'tools', label: 'Tool Contracts', icon: <Wrench size={13} /> },
  { id: 'servers', label: 'MCP Servers', icon: <Server size={13} /> },
  { id: 'connectors', label: 'Connectors', icon: <Plug size={13} /> },
];

interface McpManagementProps {
  externalNavigateToTool?: { toolName: string; step?: string; from?: string } | null;
  onExternalNavigateHandled?: () => void;
}

export function McpManagementPage({ externalNavigateToTool, onExternalNavigateHandled }: McpManagementProps = {}) {
  const [tab, setTab] = useState<McpTab>('tools');

  // Cross-tab navigation: Server Console → Tool Studio
  const [navigateToTool, setNavigateToTool] = useState<{
    toolId: string;
    step?: string;
    fromServer?: string;
    toolName?: string;
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

  // 接收外部导航（从技能管理跳转过来）
  useEffect(() => {
    if (externalNavigateToTool) {
      setNavigateToTool({
        toolId: '', // McpToolListPage 会通过 toolName 查找
        step: externalNavigateToTool.step,
        fromServer: externalNavigateToTool.from,
        toolName: externalNavigateToTool.toolName,
      });
      setTab('tools');
      onExternalNavigateHandled?.();
    }
  }, [externalNavigateToTool]);

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
      </div>
    </div>
  );
}
