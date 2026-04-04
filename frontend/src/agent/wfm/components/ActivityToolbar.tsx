/**
 * ActivityToolbar.tsx — 活动类型拖拽面板
 *
 * 从面板拖拽活动到时间线上创建新的排班块。
 * 使用 HTML5 Drag & Drop API，MIME 类型为 application/wfm-activity。
 */
import { memo, useState, useEffect } from 'react';
import { type Lang } from '../../../i18n';

interface Activity {
  id: number;
  code: string;
  name: string;
  color: string;
}

export const ACTIVITY_MIME = 'application/wfm-activity';

export const ActivityToolbar = memo(function ActivityToolbar({ lang }: { lang: Lang }) {
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    fetch('/api/wfm/activities')
      .then(r => r.json())
      .then(d => {
        // 过滤掉 WORK 和 DAY_OFF（不可手动放置）
        const items = (d.items ?? []).filter(
          (a: Activity) => a.code !== 'WORK' && a.code !== 'DAY_OFF',
        );
        setActivities(items);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border bg-muted/30 flex-shrink-0 overflow-x-auto">
      <span className="text-[10px] text-muted-foreground mr-1 flex-shrink-0">
        {lang === 'zh' ? '拖拽放置：' : 'Drag to place:'}
      </span>
      {activities.map(a => (
        <div
          key={a.id}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(ACTIVITY_MIME, JSON.stringify({
              activityId: a.id,
              code: a.code,
              name: a.name,
              color: a.color,
            }));
            e.dataTransfer.effectAllowed = 'copy';
          }}
          className="flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-background text-[10px] cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-primary flex-shrink-0 select-none"
          title={a.name}
        >
          <span
            className="w-2 h-2 rounded-sm flex-shrink-0"
            style={{ backgroundColor: a.color }}
          />
          {a.name}
        </div>
      ))}
    </div>
  );
});
