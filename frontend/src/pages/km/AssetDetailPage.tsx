import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { kmApi, type KMAsset, type KMAssetVersion } from './api';
import type { KMPage } from './KnowledgeManagementPage';

export function AssetDetailPage({ id, navigate }: { id: string; navigate: (p: KMPage) => void }) {
  const [asset, setAsset] = useState<KMAsset | null>(null);
  const [versions, setVersions] = useState<KMAssetVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([kmApi.getAsset(id), kmApi.getAssetVersions(id)])
      .then(([a, v]) => { setAsset(a); setVersions(v.items); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-4 text-xs text-gray-400">加载中...</div>;
  if (!asset) return <div className="p-4 text-xs text-red-500">资产不存在</div>;

  return (
    <div className="p-4">
      <button onClick={() => navigate({ view: 'assets' })} className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 mb-3">
        <ArrowLeft size={12} /> 返回列表
      </button>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
        <h2 className="text-sm font-semibold text-gray-800 mb-2">{asset.title}</h2>
        <div className="flex gap-4 text-xs text-gray-500">
          <span>类型: {asset.asset_type}</span>
          <span>状态: {asset.status}</span>
          <span>当前版本: v{asset.current_version}</span>
          <span>负责人: {asset.owner ?? '-'}</span>
        </div>
        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
          任何对资产的操作（发布/回滚/下架/降权/改范围）必须通过动作草案执行，不允许直接操作。
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-3 py-2 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-700">版本链</h3>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">版本</th>
              <th className="text-left px-3 py-2 font-medium">生效时间</th>
              <th className="text-left px-3 py-2 font-medium">回滚点</th>
              <th className="text-left px-3 py-2 font-medium">内容摘要</th>
              <th className="text-left px-3 py-2 font-medium">创建时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {versions.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-6 text-gray-400">暂无版本</td></tr>
            ) : versions.map(v => (
              <tr key={v.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono">v{v.version_no}</td>
                <td className="px-3 py-2 text-gray-500">{v.effective_from ?? '-'}</td>
                <td className="px-3 py-2 text-gray-400 font-mono text-[10px]">{v.rollback_point_id ?? '-'}</td>
                <td className="px-3 py-2 text-gray-500 truncate max-w-[200px]">{v.content_snapshot ? JSON.parse(v.content_snapshot).q ?? '-' : '-'}</td>
                <td className="px-3 py-2 text-gray-400">{v.created_at?.slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
