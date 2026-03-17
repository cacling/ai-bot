import React, { useState, useEffect } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { kmApi, type KMDocument } from './api';
import type { KMPage } from './KnowledgeManagementPage';

const CLASSIFICATION_LABELS: Record<string, string> = { public: '公开', internal: '内部', sensitive: '敏感' };

export function DocumentListPage({ navigate }: { navigate: (p: KMPage) => void }) {
  const [items, setItems] = useState<KMDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', classification: 'internal', owner: '' });

  const load = () => {
    setLoading(true);
    kmApi.listDocuments().then(r => setItems(r.items)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    await kmApi.createDocument(form);
    setShowCreate(false);
    setForm({ title: '', classification: 'internal', owner: '' });
    load();
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-800">文档列表</h2>
        <div className="flex gap-2">
          <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600"><RefreshCw size={14} /></button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
            <Plus size={12} /> 新建文档
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="mb-3 p-3 bg-white rounded-lg border border-gray-200 space-y-2">
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="文档标题" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded" />
          <div className="flex gap-2">
            <select value={form.classification} onChange={e => setForm(f => ({ ...f, classification: e.target.value }))}
              className="px-2 py-1.5 text-xs border border-gray-200 rounded">
              <option value="public">公开</option><option value="internal">内部</option><option value="sensitive">敏感</option>
            </select>
            <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
              placeholder="负责人" className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded" />
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
              <th className="text-left px-3 py-2 font-medium">来源</th>
              <th className="text-left px-3 py-2 font-medium">密级</th>
              <th className="text-left px-3 py-2 font-medium">负责人</th>
              <th className="text-left px-3 py-2 font-medium">更新时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">暂无文档</td></tr>
            ) : items.map(doc => (
              <tr key={doc.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate({ view: 'document-detail', id: doc.id })}>
                <td className="px-3 py-2 text-blue-600 font-medium">{doc.title}</td>
                <td className="px-3 py-2 text-gray-500">{doc.source}</td>
                <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  doc.classification === 'sensitive' ? 'bg-red-50 text-red-600' :
                  doc.classification === 'internal' ? 'bg-yellow-50 text-yellow-600' : 'bg-green-50 text-green-600'
                }`}>{CLASSIFICATION_LABELS[doc.classification] ?? doc.classification}</span></td>
                <td className="px-3 py-2 text-gray-500">{doc.owner ?? '-'}</td>
                <td className="px-3 py-2 text-gray-400">{doc.updated_at?.slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
