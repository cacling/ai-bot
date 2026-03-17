import React, { useState, useEffect } from 'react';
import { ArrowLeft, Send, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { kmApi, type KMReviewPackageDetail } from './api';
import type { KMPage } from './KnowledgeManagementPage';

const GATE_DOT: Record<string, string> = { pass: 'bg-green-500', fail: 'bg-red-500', pending: 'bg-gray-300' };

export function ReviewPackageDetailPage({ id, navigate }: { id: string; navigate: (p: KMPage) => void }) {
  const [data, setData] = useState<KMReviewPackageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<{ candidate_id: string; q: string; reasons: string[] }[] | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    setBlockers(null);
    kmApi.getReviewPackage(id).then(setData).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const handleSubmit = async () => {
    try {
      setError(null);
      setBlockers(null);
      await kmApi.submitReview(id, { submitted_by: 'operator' });
      load();
    } catch (err: unknown) {
      const msg = (err as Error).message;
      setError(msg);
      // 尝试获取阻断详情
      try {
        const res = await fetch(`/api/km/review-packages/${id}/submit`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submitted_by: 'operator' }),
        });
        if (!res.ok) {
          const body = await res.json();
          if (body.blockers) setBlockers(body.blockers);
        }
      } catch {}
    }
  };

  const handleApprove = async () => {
    await kmApi.approveReview(id, { approved_by: 'reviewer' });
    load();
  };

  const handleReject = async () => {
    await kmApi.rejectReview(id, { rejected_by: 'reviewer', reason: '需要修改' });
    load();
  };

  const handleCreateDraft = async () => {
    if (!data) return;
    await kmApi.createActionDraft({
      action_type: 'publish', review_pkg_id: id,
      change_summary: `发布评审包: ${data.title}`, created_by: 'operator',
    });
    alert('已创建发布草案，请到「动作草案」页面执行');
  };

  if (loading) return <div className="p-4 text-xs text-gray-400">加载中...</div>;
  if (!data) return <div className="p-4 text-xs text-red-500">评审包不存在</div>;

  return (
    <div className="p-4">
      <button onClick={() => navigate({ view: 'review-packages' })} className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 mb-3">
        <ArrowLeft size={12} /> 返回列表
      </button>

      {/* 基本信息 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 mb-1">{data.title}</h2>
            <div className="flex gap-3 text-xs text-gray-500">
              <span>状态: {data.status}</span>
              <span>风险: {data.risk_level}</span>
              <span>候选数: {data.candidates.length}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {data.status === 'draft' && (
              <button onClick={handleSubmit} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
                <Send size={12} /> 提交评审
              </button>
            )}
            {data.status === 'submitted' && (
              <>
                <button onClick={handleApprove} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700">
                  <CheckCircle size={12} /> 通过
                </button>
                <button onClick={handleReject} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50">
                  <XCircle size={12} /> 驳回
                </button>
              </>
            )}
            {data.status === 'approved' && (
              <button onClick={handleCreateDraft} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700">
                派生发布草案
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 阻断提示 */}
      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 text-xs font-medium text-red-700 mb-2">
            <AlertTriangle size={13} /> 门槛检查未通过
          </div>
          {blockers && blockers.map((b, i) => (
            <div key={i} className="text-xs text-red-600 ml-5 mb-1">
              <span className="text-red-800 font-medium">{b.q}</span>：{b.reasons.join('、')}
            </div>
          ))}
          {!blockers && <div className="text-xs text-red-600 ml-5">{error}</div>}
        </div>
      )}

      {/* 候选列表 */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-3 py-2 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-700">包内候选</h3>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">标准问句</th>
              <th className="text-center px-3 py-2 font-medium">证据</th>
              <th className="text-center px-3 py-2 font-medium">冲突</th>
              <th className="text-center px-3 py-2 font-medium">归属</th>
              <th className="text-left px-3 py-2 font-medium">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.candidates.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-6 text-gray-400">评审包内无候选</td></tr>
            ) : data.candidates.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate({ view: 'candidate-detail', id: c.id })}>
                <td className="px-3 py-2 text-blue-600">{c.normalized_q}</td>
                <td className="px-3 py-2 text-center"><span className={`inline-block w-2 h-2 rounded-full ${GATE_DOT[c.gate_evidence]}`} /></td>
                <td className="px-3 py-2 text-center"><span className={`inline-block w-2 h-2 rounded-full ${GATE_DOT[c.gate_conflict]}`} /></td>
                <td className="px-3 py-2 text-center"><span className={`inline-block w-2 h-2 rounded-full ${GATE_DOT[c.gate_ownership]}`} /></td>
                <td className="px-3 py-2 text-gray-500">{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
