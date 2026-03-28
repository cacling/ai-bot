/**
 * McpManagementPage.tsx — Tool Runtime 管理主容器
 *
 * Overview / Tool Contracts / Remote Endpoints / Connectors / Execution Records
 */
import { useState, useEffect, lazy, Suspense } from 'react';
import { Wrench, Server, Plug, Activity, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { McpServerList } from './McpServerList';
import { McpToolListPage } from './McpToolListPage';
import { ConnectorListPage } from './ConnectorListPage';

const RuntimeOverviewPage = lazy(() => import('./RuntimeOverviewPage').then(m => ({ default: m.RuntimeOverviewPage })));
const ExecutionRecordsPage = lazy(() => import('./ExecutionRecordsPage').then(m => ({ default: m.ExecutionRecordsPage })));

type McpTab = 'overview' | 'tools' | 'servers' | 'connectors' | 'records';

const TABS: Array<{ id: McpTab; label: string; icon: React.ReactNode }> = [
  { id: 'overview', label: 'Overview', icon: <Activity size={13} /> },
  { id: 'tools', label: 'Tool Contracts', icon: <Wrench size={13} /> },
  { id: 'servers', label: 'Remote Endpoints', icon: <Server size={13} /> },
  { id: 'connectors', label: 'Connectors', icon: <Plug size={13} /> },
  { id: 'records', label: 'Execution Records', icon: <ScrollText size={13} /> },
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
      <div className="flex-1 overflow-auto relative">
        <div className={`absolute inset-0 ${tab !== 'overview' ? 'hidden' : ''}`}>
          <Suspense fallback={<div className="p-6 text-xs text-muted-foreground">Loading...</div>}>
            <RuntimeOverviewPage />
          </Suspense>
        </div>
        <div className={`absolute inset-0 ${tab !== 'tools' ? 'hidden' : ''}`}><McpToolListPage navigateToTool={navigateToTool} onNavigateHandled={() => setNavigateToTool(null)} onBackToServers={handleBackToServers} /></div>
        <div className={`absolute inset-0 ${tab !== 'servers' ? 'hidden' : ''}`}><McpServerList onOpenTool={handleOpenTool} onOpenConnectors={() => setTab('connectors')} /></div>
        <div className={`absolute inset-0 ${tab !== 'connectors' ? 'hidden' : ''}`}><ConnectorListPage /></div>
        <div className={`absolute inset-0 ${tab !== 'records' ? 'hidden' : ''}`}>
          <Suspense fallback={<div className="p-6 text-xs text-muted-foreground">Loading...</div>}>
            <ExecutionRecordsPage />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
