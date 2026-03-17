import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { kmApi, type KMAuditLog } from './api';

export function AuditLogPage() {
  const [items, setItems] = useState<KMAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    kmApi.listAuditLogs().then(r => setItems(r.items)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-800">审计日志</h2>
        <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600"><RefreshCw size={14} /></button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">动作</th>
              <th className="text-left px-3 py-2 font-medium">对象类型</th>
              <th className="text-left px-3 py-2 font-medium">对象 ID</th>
              <th className="text-left px-3 py-2 font-medium">操作人</th>
              <th className="text-left px-3 py-2 font-medium">风险</th>
              <th className="text-left px-3 py-2 font-medium">时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">暂无日志</td></tr>
            ) : items.map(l => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">{l.action}</td>
                <td className="px-3 py-2 text-gray-500">{l.object_type}</td>
                <td className="px-3 py-2 text-gray-400 font-mono text-[10px]">{l.object_id.slice(0, 12)}</td>
                <td className="px-3 py-2 text-gray-500">{l.operator}</td>
                <td className="px-3 py-2">
                  {l.risk_level && <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    l.risk_level === 'high' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'
                  }`}>{l.risk_level}</span>}
                </td>
                <td className="px-3 py-2 text-gray-400">{l.created_at?.slice(0, 19).replace('T', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
