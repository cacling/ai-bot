/**
 * ContextMenu.tsx — 时间线块右键菜单
 */
import { memo, useState, useEffect, useCallback } from 'react';
import { type Lang } from '../shared/i18n';

interface ContextMenuProps {
  lang: Lang;
  x: number;
  y: number;
  blockId: number;
  planId: number;
  versionNo: number;
  entryId: number;
  startTime: string;
  endTime: string;
  onClose: () => void;
  onRefresh: () => void;
}

interface Activity {
  id: number;
  code: string;
  name: string;
  color: string;
}

export const ContextMenu = memo(function ContextMenu({
  lang, x, y, blockId, planId, versionNo, entryId, startTime, endTime, onClose, onRefresh,
}: ContextMenuProps) {
  const [showInsert, setShowInsert] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<number>(0);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-context-menu]')) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const loadActivities = useCallback(async () => {
    try {
      const res = await fetch('/api/wfm/activities');
      const data = await res.json();
      const items = data.items ?? [];
      setActivities(items);
      if (items.length > 0) setSelectedActivityId(items[0].id);
    } catch { /* ignore */ }
  }, []);

  const handleDelete = async () => {
    if (!window.confirm(lang === 'zh' ? '确定删除此块？' : 'Delete this block?')) return;
    await fetch(`/api/wfm/plans/${planId}/blocks/${blockId}?versionNo=${versionNo}`, { method: 'DELETE' });
    onClose();
    onRefresh();
  };

  const handleInsertClick = () => {
    setShowInsert(true);
    loadActivities();
  };

  const handleInsertConfirm = async () => {
    if (!selectedActivityId) return;
    await fetch(`/api/wfm/plans/${planId}/blocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryId,
        activityId: selectedActivityId,
        startTime,
        endTime,
        source: 'manual',
        versionNo,
      }),
    });
    onClose();
    onRefresh();
  };

  return (
    <div
      data-context-menu
      className="fixed bg-background border border-border rounded shadow-lg py-1 z-50 min-w-[160px]"
      style={{ left: x, top: y }}
    >
      {!showInsert ? (
        <>
          <div
            className="px-3 py-1.5 text-xs hover:bg-accent cursor-pointer"
            onClick={handleInsertClick}
          >
            {lang === 'zh' ? '插入活动' : 'Insert Activity'}
          </div>
          <div
            className="px-3 py-1.5 text-xs hover:bg-accent cursor-pointer text-red-600"
            onClick={handleDelete}
          >
            {lang === 'zh' ? '删除块' : 'Delete Block'}
          </div>
        </>
      ) : (
        <div className="px-3 py-2 space-y-2 min-w-[200px]">
          <div className="text-xs font-medium">{lang === 'zh' ? '选择活动' : 'Select Activity'}</div>
          <select
            value={selectedActivityId}
            onChange={(e) => setSelectedActivityId(Number(e.target.value))}
            className="w-full text-xs border border-input rounded px-2 py-1"
          >
            {activities.map(a => (
              <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
            ))}
          </select>
          <div className="flex gap-1 justify-end">
            <button
              onClick={onClose}
              className="px-2 py-1 text-xs border border-border rounded hover:bg-accent"
            >
              {lang === 'zh' ? '取消' : 'Cancel'}
            </button>
            <button
              onClick={handleInsertConfirm}
              className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90"
            >
              {lang === 'zh' ? '插入' : 'Insert'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
