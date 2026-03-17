/**
 * McpManagementPage.tsx — MCP 管理主容器
 *
 * 两个子视图：工具概览 + MCP 服务管理
 */
import React, { useState } from 'react';
import { LayoutList, Server } from 'lucide-react';
import { ToolsOverviewPanel } from './ToolsOverviewPanel';
import { McpServerList } from './McpServerList';

type McpView = 'overview' | 'servers';

export function McpManagementPage() {
  const [view, setView] = useState<McpView>('servers');

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Sub-nav */}
      <div className="bg-white border-b border-gray-200 px-4 flex items-center h-9 flex-shrink-0">
        <button
          onClick={() => setView('overview')}
          className={`flex items-center gap-1.5 px-4 h-full text-xs font-medium border-b-2 transition-colors ${
            view === 'overview'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <LayoutList size={13} />
          工具概览
        </button>
        <button
          onClick={() => setView('servers')}
          className={`flex items-center gap-1.5 px-4 h-full text-xs font-medium border-b-2 transition-colors ${
            view === 'servers'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Server size={13} />
          MCP 服务
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {view === 'overview' ? <ToolsOverviewPanel /> : <McpServerList />}
      </div>
    </div>
  );
}
