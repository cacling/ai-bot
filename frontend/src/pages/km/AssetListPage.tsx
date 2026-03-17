import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { kmApi, type KMAsset } from './api';
import type { KMPage } from './KnowledgeManagementPage';

const STATUS_LABELS: Record<string, string> = {
  online: '在线', canary: '灰度', downgraded: '降权', unpublished: '已下架',
};

export function AssetListPage({ navigate }: { navigate: (p: KMPage) => void }) {
  const [items, setItems] = useState<KMAsset[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    kmApi.listAssets().then(r => setItems(r.items)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-800">发布资产</h2>
        <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600"><RefreshCw size={14} /></button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">标题</th>
              <th className="text-left px-3 py-2 font-medium">类型</th>
              <th className="text-left px-3 py-2 font-medium">状态</th>
              <th className="text-left px-3 py-2 font-medium">版本</th>
              <th className="text-left px-3 py-2 font-medium">负责人</th>
              <th className="text-left px-3 py-2 font-medium">更新时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">暂无资产</td></tr>
            ) : items.map(a => (
              <tr key={a.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate({ view: 'asset-detail', id: a.id })}>
                <td className="px-3 py-2 text-blue-600 font-medium">{a.title}</td>
                <td className="px-3 py-2 text-gray-500">{a.asset_type}</td>
                <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  a.status === 'online' ? 'bg-green-50 text-green-600' :
                  a.status === 'unpublished' ? 'bg-gray-100 text-gray-500' : 'bg-yellow-50 text-yellow-600'
                }`}>{STATUS_LABELS[a.status] ?? a.status}</span></td>
                <td className="px-3 py-2 font-mono">v{a.current_version}</td>
                <td className="px-3 py-2 text-gray-500">{a.owner ?? '-'}</td>
                <td className="px-3 py-2 text-gray-400">{a.updated_at?.slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
