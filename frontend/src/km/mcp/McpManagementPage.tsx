/**
 * McpManagementPage.tsx — MCP 管理主容器（单页面）
 */
import { McpServerList } from './McpServerList';

export function McpManagementPage() {
  return (
    <div className="flex flex-col h-full bg-background overflow-auto">
      <McpServerList />
    </div>
  );
}
