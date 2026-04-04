/**
 * McpManagementPage.tsx — Tool Runtime 管理主容器
 *
 * Overview / Tool Contracts / Runtime Bindings / 后端连接 / Execution Records
 */
import { useState, useEffect, lazy, Suspense } from 'react';
import { Wrench, Plug, Activity, ScrollText, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { McpToolListPage } from './McpToolListPage';
import { ConnectorListPage } from './ConnectorListPage';
import { t, type Lang } from './i18n';

const RuntimeOverviewPage = lazy(() => import('./RuntimeOverviewPage').then(m => ({ default: m.RuntimeOverviewPage })));
const ExecutionRecordsPage = lazy(() => import('./ExecutionRecordsPage').then(m => ({ default: m.ExecutionRecordsPage })));
const RuntimeBindingsPage = lazy(() => import('./RuntimeBindingsPage').then(m => ({ default: m.RuntimeBindingsPage })));

type McpTab = 'overview' | 'tools' | 'bindings' | 'connectors' | 'records';

const TAB_ICONS: Record<McpTab, React.ReactNode> = {
  overview: <Activity size={13} />,
  tools: <Wrench size={13} />,
  bindings: <Link2 size={13} />,
  connectors: <Plug size={13} />,
  records: <ScrollText size={13} />,
};

const TAB_IDS: McpTab[] = ['overview', 'tools', 'bindings', 'connectors', 'records'];

const TAB_LABEL_KEYS: Record<McpTab, 'tab_overview' | 'tab_tool_contracts' | 'tab_runtime_bindings' | 'tab_connectors' | 'tab_exec_records'> = {
  overview: 'tab_overview',
  tools: 'tab_tool_contracts',
  bindings: 'tab_runtime_bindings',
  connectors: 'tab_connectors',
  records: 'tab_exec_records',
};

interface McpManagementProps {
  externalNavigateToTool?: { toolName: string; step?: string; from?: string } | null;
  onExternalNavigateHandled?: () => void;
  lang?: Lang;
}

export function McpManagementPage({ externalNavigateToTool, onExternalNavigateHandled, lang = 'zh' as Lang }: McpManagementProps = {}) {
  const T = t(lang);
  const [tab, setTab] = useState<McpTab>('tools');

  // Cross-tab navigation: Overview/Bindings → Tool Studio
  const [navigateToTool, setNavigateToTool] = useState<{
    toolId: string;
    step?: string;
    fromServer?: string;
    toolName?: string;
  } | null>(null);

  // Cross-tab navigation: Tool Contracts → Runtime Bindings drawer
  const [navigateToBinding, setNavigateToBinding] = useState<string | null>(null);

  const handleOpenTool = (toolId: string, step?: string, fromServer?: string) => {
    if (!toolId) {
      setTab('tools');
      return;
    }
    setNavigateToTool({ toolId, step, fromServer });
    setTab('tools');
  };

  const handleOpenBinding = (toolId: string) => {
    setNavigateToBinding(toolId);
    setTab('bindings');
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
        {TAB_IDS.map(id => (
          <Button
            key={id}
            variant="ghost"
            size="sm"
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 h-full rounded-none text-xs font-medium border-b-2 transition-colors ${
              tab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {TAB_ICONS[id]}
            {T[TAB_LABEL_KEYS[id]]}
          </Button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto relative">
        <div className={`absolute inset-0 ${tab !== 'overview' ? 'hidden' : ''}`}>
          <Suspense fallback={<div className="p-6 text-xs text-muted-foreground">{T.loading}</div>}>
            <RuntimeOverviewPage lang={lang} />
          </Suspense>
        </div>
        <div className={`absolute inset-0 ${tab !== 'tools' ? 'hidden' : ''}`}>
          <McpToolListPage navigateToTool={navigateToTool} onNavigateHandled={() => setNavigateToTool(null)} onOpenBinding={handleOpenBinding} lang={lang} />
        </div>
        <div className={`absolute inset-0 ${tab !== 'bindings' ? 'hidden' : ''}`}>
          <Suspense fallback={<div className="p-6 text-xs text-muted-foreground">{T.loading}</div>}>
            <RuntimeBindingsPage onOpenTool={handleOpenTool} navigateToBinding={navigateToBinding} onNavigateHandled={() => setNavigateToBinding(null)} lang={lang} />
          </Suspense>
        </div>
        <div className={`absolute inset-0 ${tab !== 'connectors' ? 'hidden' : ''}`}><ConnectorListPage lang={lang} /></div>
        <div className={`absolute inset-0 ${tab !== 'records' ? 'hidden' : ''}`}>
          <Suspense fallback={<div className="p-6 text-xs text-muted-foreground">{T.loading}</div>}>
            <ExecutionRecordsPage lang={lang} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
