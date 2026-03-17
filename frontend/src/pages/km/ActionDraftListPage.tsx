import React, { useState, useEffect } from 'react';
import { RefreshCw, Play } from 'lucide-react';
import { kmApi, type KMActionDraft } from './api';
import type { KMPage } from './KnowledgeManagementPage';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', submitted: '已提交', reviewed: '已复核',
  executing: '执行中', done: '已完成', failed: '失败',
};
const TYPE_LABELS: Record<string, string> = {
  publish: '发布', rollback: '回滚', rescope: '改范围',
  unpublish: '下架', downgrade: '降权', renew: '续期',
};

export function ActionDraftListPage({ navigate }: { navigate: (p: KMPage) => void }) {
  const [items, setItems] = useState<KMActionDraft[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    kmApi.listActionDrafts().then(r => setItems(r.items)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleExecute = async (id: string) => {
    if (!confirm('确认执行该草案？')) return;
    try {
      await kmApi.executeActionDraft(id, { executed_by: 'admin' });
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-800">动作草案</h2>
        <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600"><RefreshCw size={14} /></button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">类型</th>
              <th className="text-left px-3 py-2 font-medium">变更摘要</th>
              <th className="text-left px-3 py-2 font-medium">状态</th>
              <th className="text-left px-3 py-2 font-medium">回归</th>
              <th className="text-left px-3 py-2 font-medium">更新时间</th>
              <th className="text-left px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">暂无草案</td></tr>
            ) : items.map(d => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">{TYPE_LABELS[d.action_type] ?? d.action_type}</td>
                <td className="px-3 py-2 text-gray-600 truncate max-w-[200px]">{d.change_summary ?? '-'}</td>
                <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  d.status === 'done' ? 'bg-green-50 text-green-600' :
                  d.status === 'failed' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'
                }`}>{STATUS_LABELS[d.status] ?? d.status}</span></td>
                <td className="px-3 py-2 text-gray-400 font-mono text-[10px]">{d.regression_window_id ? '已绑定' : '-'}</td>
                <td className="px-3 py-2 text-gray-400">{d.updated_at?.slice(0, 16).replace('T', ' ')}</td>
                <td className="px-3 py-2">
                  {(d.status === 'draft' || d.status === 'reviewed') && (
                    <button onClick={() => handleExecute(d.id)} className="flex items-center gap-1 text-blue-600 hover:text-blue-800">
                      <Play size={11} /> 执行
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
