import React, { useState, useEffect } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { kmApi, type KMTask } from './api';
import type { KMPage } from './KnowledgeManagementPage';

const TYPE_LABELS: Record<string, string> = {
  review_expiry: '到期复核', content_gap: '内容补齐', conflict_arb: '冲突仲裁',
  failure_fix: '失败修复', regression_fail: '回归失败', evidence_gap: '证据补齐',
};
const STATUS_LABELS: Record<string, string> = {
  open: '待处理', in_progress: '处理中', done: '已完成', closed: '已关闭',
};

export function TaskListPage({ navigate }: { navigate: (p: KMPage) => void }) {
  const [items, setItems] = useState<KMTask[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    kmApi.listTasks().then(r => setItems(r.items)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleClose = async (id: string) => {
    const conclusion = prompt('请输入处置结论:');
    if (!conclusion) return;
    await kmApi.updateTask(id, { status: 'done', conclusion });
    load();
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-800">治理任务</h2>
        <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600"><RefreshCw size={14} /></button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">类型</th>
              <th className="text-left px-3 py-2 font-medium">来源</th>
              <th className="text-left px-3 py-2 font-medium">优先级</th>
              <th className="text-left px-3 py-2 font-medium">负责人</th>
              <th className="text-left px-3 py-2 font-medium">状态</th>
              <th className="text-left px-3 py-2 font-medium">时限</th>
              <th className="text-left px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">暂无任务</td></tr>
            ) : items.map(t => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">{TYPE_LABELS[t.task_type] ?? t.task_type}</td>
                <td className="px-3 py-2 text-gray-400 font-mono text-[10px]">{t.source_ref_id?.slice(0, 8) ?? '-'}</td>
                <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  t.priority === 'urgent' ? 'bg-red-50 text-red-600' :
                  t.priority === 'high' ? 'bg-orange-50 text-orange-600' : 'bg-gray-100 text-gray-600'
                }`}>{t.priority}</span></td>
                <td className="px-3 py-2 text-gray-500">{t.assignee ?? '-'}</td>
                <td className="px-3 py-2 text-gray-500">{STATUS_LABELS[t.status] ?? t.status}</td>
                <td className="px-3 py-2 text-gray-400">{t.due_date ?? '-'}</td>
                <td className="px-3 py-2">
                  {(t.status === 'open' || t.status === 'in_progress') && (
                    <button onClick={() => handleClose(t.id)} className="text-blue-600 hover:text-blue-800">完成</button>
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
