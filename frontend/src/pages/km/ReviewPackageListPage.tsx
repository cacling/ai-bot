import React, { useState, useEffect } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { kmApi, type KMReviewPackage } from './api';
import type { KMPage } from './KnowledgeManagementPage';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', submitted: '已提交', reviewing: '评审中',
  approved: '已通过', rejected: '已驳回', published: '已发布',
};

export function ReviewPackageListPage({ navigate }: { navigate: (p: KMPage) => void }) {
  const [items, setItems] = useState<KMReviewPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', candidate_ids: '' });

  const load = () => {
    setLoading(true);
    kmApi.listReviewPackages().then(r => setItems(r.items)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    const ids = form.candidate_ids.split(',').map(s => s.trim()).filter(Boolean);
    await kmApi.createReviewPackage({ title: form.title, candidate_ids: ids });
    setShowCreate(false);
    setForm({ title: '', candidate_ids: '' });
    load();
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-800">评审包</h2>
        <div className="flex gap-2">
          <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600"><RefreshCw size={14} /></button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
            <Plus size={12} /> 新建评审包
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="mb-3 p-3 bg-white rounded-lg border border-gray-200 space-y-2">
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="评审包标题" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded" />
          <input value={form.candidate_ids} onChange={e => setForm(f => ({ ...f, candidate_ids: e.target.value }))}
            placeholder="候选 ID（逗号分隔）" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded" />
          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700">创建</button>
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-50">取消</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">标题</th>
              <th className="text-left px-3 py-2 font-medium">状态</th>
              <th className="text-left px-3 py-2 font-medium">风险</th>
              <th className="text-left px-3 py-2 font-medium">提交人</th>
              <th className="text-left px-3 py-2 font-medium">更新时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">暂无评审包</td></tr>
            ) : items.map(pkg => (
              <tr key={pkg.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate({ view: 'review-detail', id: pkg.id })}>
                <td className="px-3 py-2 text-blue-600 font-medium">{pkg.title}</td>
                <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  pkg.status === 'published' ? 'bg-green-50 text-green-600' :
                  pkg.status === 'approved' ? 'bg-blue-50 text-blue-600' :
                  pkg.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'
                }`}>{STATUS_LABELS[pkg.status] ?? pkg.status}</span></td>
                <td className="px-3 py-2 text-gray-500">{pkg.risk_level}</td>
                <td className="px-3 py-2 text-gray-500">{pkg.submitted_by ?? '-'}</td>
                <td className="px-3 py-2 text-gray-400">{pkg.updated_at?.slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
