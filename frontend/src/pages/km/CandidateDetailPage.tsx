import React, { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle, XCircle, Clock, Plus, ShieldCheck } from 'lucide-react';
import { kmApi, type KMCandidateDetail, type KMEvidence } from './api';
import type { KMPage } from './KnowledgeManagementPage';

const GATE_ICON: Record<string, React.ReactNode> = {
  pass: <CheckCircle size={14} className="text-green-500" />,
  fail: <XCircle size={14} className="text-red-500" />,
  pending: <Clock size={14} className="text-gray-400" />,
};
const GATE_LABELS: Record<string, string> = {
  evidence: '证据门槛', conflict: '冲突门槛', ownership: '归属门槛',
};

export function CandidateDetailPage({ id, navigate }: { id: string; navigate: (p: KMPage) => void }) {
  const [data, setData] = useState<KMCandidateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddEvidence, setShowAddEvidence] = useState(false);
  const [evidenceForm, setEvidenceForm] = useState({ doc_version_id: '', locator: '' });

  const load = () => {
    setLoading(true);
    kmApi.getCandidate(id).then(setData).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const handleGateCheck = async () => {
    await kmApi.gateCheck(id);
    load();
  };

  const handleAddEvidence = async () => {
    if (!evidenceForm.doc_version_id.trim()) return;
    await kmApi.createEvidence({ candidate_id: id, ...evidenceForm, status: 'pass' });
    setShowAddEvidence(false);
    setEvidenceForm({ doc_version_id: '', locator: '' });
    // 重新校验门槛
    await kmApi.gateCheck(id);
    load();
  };

  if (loading) return <div className="p-4 text-xs text-gray-400">加载中...</div>;
  if (!data) return <div className="p-4 text-xs text-red-500">候选不存在</div>;

  const allPass = data.gate_evidence === 'pass' && data.gate_conflict === 'pass' && data.gate_ownership === 'pass';

  return (
    <div className="p-4">
      <button onClick={() => navigate({ view: 'candidates' })} className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 mb-3">
        <ArrowLeft size={12} /> 返回列表
      </button>

      {/* 基础信息 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 mb-1">{data.normalized_q}</h2>
            <div className="flex gap-3 text-xs text-gray-500">
              <span>来源: {data.source_type}</span>
              <span>风险: {data.risk_level}</span>
              <span>状态: {data.status}</span>
            </div>
          </div>
          <button onClick={handleGateCheck} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-md hover:bg-blue-50">
            <ShieldCheck size={12} /> 校验门槛
          </button>
        </div>
        {data.draft_answer && (
          <div className="mt-3 p-2 bg-gray-50 rounded text-xs text-gray-700">
            <div className="text-[10px] text-gray-400 mb-1">草案答案</div>
            {data.draft_answer}
          </div>
        )}
      </div>

      {/* 门槛体检卡 */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        {(['evidence', 'conflict', 'ownership'] as const).map(key => {
          const gateStatus = key === 'evidence' ? data.gate_evidence :
            key === 'conflict' ? data.gate_conflict : data.gate_ownership;
          return (
            <div key={key} className={`bg-white rounded-lg border p-3 ${
              gateStatus === 'fail' ? 'border-red-200' : gateStatus === 'pass' ? 'border-green-200' : 'border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {GATE_ICON[gateStatus]}
                <span className="text-xs font-medium text-gray-700">{GATE_LABELS[key]}</span>
              </div>
              <div className="text-[10px] text-gray-500">
                {key === 'evidence' && (
                  gateStatus === 'pass' ? `${data.evidences.filter(e => e.status === 'pass').length} 条证据已通过` :
                  gateStatus === 'fail' ? '缺少有效证据引用' : '待校验'
                )}
                {key === 'conflict' && (
                  gateStatus === 'pass' ? '无阻断级冲突' :
                  gateStatus === 'fail' ? `${data.gate_card.conflict.details.length} 个待仲裁冲突` : '待校验'
                )}
                {key === 'ownership' && (
                  gateStatus === 'pass' ? (data.target_asset_id ? '已绑定目标资产' : '新增类候选') :
                  '更新类候选需绑定目标资产'
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 证据列表 */}
      <div className="bg-white rounded-lg border border-gray-200 mb-3">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-700">证据引用</h3>
          <button onClick={() => setShowAddEvidence(true)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
            <Plus size={11} /> 添加证据
          </button>
        </div>
        {showAddEvidence && (
          <div className="p-3 border-b border-gray-100 space-y-2">
            <input value={evidenceForm.doc_version_id} onChange={e => setEvidenceForm(f => ({ ...f, doc_version_id: e.target.value }))}
              placeholder="文档版本 ID" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded" />
            <input value={evidenceForm.locator} onChange={e => setEvidenceForm(f => ({ ...f, locator: e.target.value }))}
              placeholder="定位（页码/条款/片段）" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded" />
            <div className="flex gap-2">
              <button onClick={handleAddEvidence} className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700">确认添加</button>
              <button onClick={() => setShowAddEvidence(false)} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-50">取消</button>
            </div>
          </div>
        )}
        <div className="divide-y divide-gray-100">
          {data.evidences.length === 0 ? (
            <div className="py-4 text-center text-xs text-gray-400">暂无证据引用</div>
          ) : data.evidences.map(ev => (
            <div key={ev.id} className="flex items-center gap-3 px-3 py-2 text-xs">
              {GATE_ICON[ev.status]}
              <span className="text-gray-600 font-mono">{ev.doc_version_id}</span>
              <span className="text-gray-400">{ev.locator ?? '-'}</span>
              <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium ${
                ev.status === 'pass' ? 'bg-green-50 text-green-600' :
                ev.status === 'fail' ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'
              }`}>{ev.status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 阻断提示 */}
      {!allPass && data.status !== 'published' && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          无法加入评审包：门槛未全部通过。请先补齐证据、完成冲突仲裁或绑定目标资产。
        </div>
      )}
    </div>
  );
}
