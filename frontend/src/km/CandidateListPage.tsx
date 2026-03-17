import React, { useState, useEffect } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { kmApi, type KMCandidate } from './api';
import type { KMPage } from './KnowledgeManagementPage';

const GATE_DOT: Record<string, string> = { pass: 'bg-green-500', fail: 'bg-red-500', pending: 'bg-gray-300' };
const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', validating: '校验中', gate_pass: '门槛通过',
  in_review: '评审中', published: '已发布', rejected: '已驳回',
};

export function CandidateListPage({ navigate }: { navigate: (p: KMPage) => void }) {
  const [items, setItems] = useState<KMCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ normalized_q: '', draft_answer: '', source_type: 'manual' });

  const load = () => {
    setLoading(true);
    kmApi.listCandidates().then(r => setItems(r.items)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleCreate = async () => {
    if (!form.normalized_q.trim()) return;
    await kmApi.createCandidate(form);
    setShowCreate(false);
    setForm({ normalized_q: '', draft_answer: '', source_type: 'manual' });
    load();
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-800">知识候选</h2>
        <div className="flex gap-2">
          <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600"><RefreshCw size={14} /></button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
            <Plus size={12} /> 新建候选
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="mb-3 p-3 bg-white rounded-lg border border-gray-200 space-y-2">
          <input value={form.normalized_q} onChange={e => setForm(f => ({ ...f, normalized_q: e.target.value }))}
            placeholder="标准问句" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded" />
          <textarea value={form.draft_answer} onChange={e => setForm(f => ({ ...f, draft_answer: e.target.value }))}
            placeholder="草案答案" rows={3} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded" />
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
              <th className="text-left px-3 py-2 font-medium">标准问句</th>
              <th className="text-left px-3 py-2 font-medium">来源</th>
              <th className="text-center px-3 py-2 font-medium">门槛</th>
              <th className="text-left px-3 py-2 font-medium">风险</th>
              <th className="text-left px-3 py-2 font-medium">状态</th>
              <th className="text-left px-3 py-2 font-medium">更新时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">暂无候选</td></tr>
            ) : items.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate({ view: 'candidate-detail', id: c.id })}>
                <td className="px-3 py-2 text-blue-600 font-medium truncate max-w-[250px]">{c.normalized_q}</td>
                <td className="px-3 py-2 text-gray-500">{c.source_type}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-center gap-1" title={`证据:${c.gate_evidence} 冲突:${c.gate_conflict} 归属:${c.gate_ownership}`}>
                    <span className={`w-2 h-2 rounded-full ${GATE_DOT[c.gate_evidence]}`} />
                    <span className={`w-2 h-2 rounded-full ${GATE_DOT[c.gate_conflict]}`} />
                    <span className={`w-2 h-2 rounded-full ${GATE_DOT[c.gate_ownership]}`} />
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    c.risk_level === 'high' ? 'bg-red-50 text-red-600' :
                    c.risk_level === 'medium' ? 'bg-yellow-50 text-yellow-600' : 'bg-gray-50 text-gray-500'
                  }`}>{c.risk_level}</span>
                </td>
                <td className="px-3 py-2 text-gray-500">{STATUS_LABELS[c.status] ?? c.status}</td>
                <td className="px-3 py-2 text-gray-400">{c.updated_at?.slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
