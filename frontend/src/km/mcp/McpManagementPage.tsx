/**
 * McpManagementPage.tsx — MCP 管理主容器（双 Tab：工具 + Server）
 */
import { useState } from 'react';
import { Wrench, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { McpServerList } from './McpServerList';
import { McpToolListPage } from './McpToolListPage';

type McpTab = 'tools' | 'servers';

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
      // Empty toolId = just switch to tools tab (e.g. "前往工具页")
      setTab('tools');
      return;
    }
    setNavigateToTool({ toolId, step, fromServer });
    setTab('tools');
  };

  // Reverse navigation: Tool Studio → back to Server Console
  const handleBackToServers = () => {
    setTab('servers');
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-auto">
      {/* Tab 切换 */}
      <div className="h-10 border-b border-border flex items-center shrink-0 px-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTab('tools')}
          className={`flex items-center gap-1.5 px-4 h-full rounded-none text-xs font-medium border-b-2 transition-colors ${
            tab === 'tools'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Wrench size={13} />
          Tool Studio
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTab('servers')}
          className={`flex items-center gap-1.5 px-4 h-full rounded-none text-xs font-medium border-b-2 transition-colors ${
            tab === 'servers'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Server size={13} />
          MCP Server
        </Button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto">
        {tab === 'tools'
          ? <McpToolListPage navigateToTool={navigateToTool} onNavigateHandled={() => setNavigateToTool(null)} onBackToServers={handleBackToServers} />
          : <McpServerList onOpenTool={handleOpenTool} />
        }
      </div>
    </div>
  );
}
