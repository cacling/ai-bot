import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Play } from 'lucide-react';
import { kmApi, type KMDocument, type KMDocVersion } from './api';
import type { KMPage } from './KnowledgeManagementPage';

export function DocumentDetailPage({ id, navigate }: { id: string; navigate: (p: KMPage) => void }) {
  const [doc, setDoc] = useState<(KMDocument & { versions: KMDocVersion[] }) | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    kmApi.getDocument(id).then(setDoc).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const handleParse = async (vid: string) => {
    await kmApi.triggerParse(vid);
    load();
  };

  if (loading) return <div className="p-4 text-xs text-gray-400">加载中...</div>;
  if (!doc) return <div className="p-4 text-xs text-red-500">文档不存在</div>;

  return (
    <div className="p-4">
      <button onClick={() => navigate({ view: 'documents' })} className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 mb-3">
        <ArrowLeft size={12} /> 返回列表
      </button>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
        <h2 className="text-sm font-semibold text-gray-800 mb-2">{doc.title}</h2>
        <div className="flex gap-4 text-xs text-gray-500">
          <span>来源: {doc.source}</span>
          <span>密级: {doc.classification}</span>
          <span>负责人: {doc.owner ?? '-'}</span>
          <span>状态: {doc.status}</span>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-700">版本列表</h3>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">版本号</th>
              <th className="text-left px-3 py-2 font-medium">生效时间</th>
              <th className="text-left px-3 py-2 font-medium">到期时间</th>
              <th className="text-left px-3 py-2 font-medium">状态</th>
              <th className="text-left px-3 py-2 font-medium">差异摘要</th>
              <th className="text-left px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {doc.versions.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-6 text-gray-400">暂无版本</td></tr>
            ) : doc.versions.map(v => (
              <tr key={v.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono">v{v.version_no}</td>
                <td className="px-3 py-2 text-gray-500">{v.effective_from ?? '-'}</td>
                <td className="px-3 py-2 text-gray-500">{v.effective_to ?? '-'}</td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    v.status === 'parsed' ? 'bg-green-50 text-green-600' :
                    v.status === 'failed' ? 'bg-red-50 text-red-600' :
                    v.status === 'parsing' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-600'
                  }`}>{v.status}</span>
                </td>
                <td className="px-3 py-2 text-gray-500 truncate max-w-[200px]">{v.diff_summary ?? '-'}</td>
                <td className="px-3 py-2">
                  <button onClick={() => handleParse(v.id)} className="flex items-center gap-1 text-blue-600 hover:text-blue-800">
                    <Play size={11} /> 触发解析
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
