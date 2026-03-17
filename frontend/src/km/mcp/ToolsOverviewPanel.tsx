/**
 * ToolsOverviewPanel.tsx — 全局工具概览（只读聚合视图）
 */
import React, { useState, useEffect } from 'react';
import { mcpApi, type ToolOverviewItem } from './api';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  available: { label: '可用', cls: 'bg-green-100 text-green-700' },
  disabled:  { label: '已禁用', cls: 'bg-gray-100 text-gray-500' },
  planned:   { label: '规划中', cls: 'bg-amber-100 text-amber-700' },
};

const SOURCE_BADGE: Record<string, string> = {
  mcp:     'bg-blue-50 text-blue-600',
  builtin: 'bg-purple-50 text-purple-600',
  local:   'bg-orange-50 text-orange-600',
};

export function ToolsOverviewPanel() {
  const [items, setItems] = useState<ToolOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    mcpApi.getToolsOverview()
      .then(r => setItems(r.items))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) return <div className="p-6 text-sm text-gray-400">加载中...</div>;

  // Group by source
  const groups = new Map<string, ToolOverviewItem[]>();
  for (const item of items) {
    const arr = groups.get(item.source) ?? [];
    arr.push(item);
    groups.set(item.source, arr);
  }

  return (
    <div className="p-4 space-y-1">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">全部工具 ({items.length})</h2>
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-400 border-b border-gray-200">
            <th className="py-2 px-3 font-medium">工具名</th>
            <th className="py-2 px-3 font-medium">描述</th>
            <th className="py-2 px-3 font-medium">来源</th>
            <th className="py-2 px-3 font-medium">状态</th>
            <th className="py-2 px-3 font-medium">引用的 Skill</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.available;
            const srcCls = SOURCE_BADGE[item.source_type] ?? SOURCE_BADGE.mcp;
            return (
              <tr key={`${item.source}-${item.name}`} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3 font-mono text-gray-800">{item.name}</td>
                <td className="py-2 px-3 text-gray-500 max-w-[240px] truncate">{item.description}</td>
                <td className="py-2 px-3">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${srcCls}`}>
                    {item.source}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.cls}`}>
                    {badge.label}
                  </span>
                </td>
                <td className="py-2 px-3 text-gray-500">
                  {item.skills.length > 0 ? item.skills.join(', ') : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
