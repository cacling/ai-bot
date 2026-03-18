/**
 * McpManagementPage.tsx — MCP 管理主容器（单页面）
 */
import React from 'react';
import { McpServerList } from './McpServerList';

export function McpManagementPage() {
  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-auto">
      <McpServerList />
    </div>
  );
}
