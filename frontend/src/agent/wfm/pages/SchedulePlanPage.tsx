/**
 * SchedulePlanPage.tsx — 排班计划列表 + 创建 + 生成 + 时间线
 */
import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { type Lang } from '../../../i18n';
import { TimelineEditor, type TimelineEntry } from '../components/TimelineEditor';

interface Plan {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  versionNo: number;
  publishedAt?: string;
}

// TimelineEntry type imported from TimelineEditor

const STATUS_LABELS: Record<string, Record<Lang, string>> = {
  draft: { zh: '草稿', en: 'Draft' },
  generated: { zh: '已生成', en: 'Generated' },
  editing: { zh: '编辑中', en: 'Editing' },
  published: { zh: '已发布', en: 'Published' },
  archived: { zh: '已归档', en: 'Archived' },
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  generated: 'bg-blue-100 text-blue-700',
  editing: 'bg-yellow-100 text-yellow-700',
  published: 'bg-green-100 text-green-700',
  archived: 'bg-gray-200 text-gray-500',
};

export const SchedulePlanPage = memo(function SchedulePlanPage({ lang }: { lang: Lang }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [timelineDate, setTimelineDate] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '' });
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const resizingRef = useRef(false);

  // Load staff id→display_name mapping
  useEffect(() => {
    fetch('/api/staff-auth/staff-list')
      .then(r => r.json())
      .then(data => {
        const map: Record<string, string> = {};
        for (const s of data.items ?? []) map[s.id] = s.display_name;
        setStaffNames(map);
      })
      .catch(() => {});
  }, []);

  // ── Sidebar resize drag ──
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const newW = Math.max(200, Math.min(600, startW + ev.clientX - startX));
      setSidebarWidth(newW);
    };
    const onUp = () => {
      resizingRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [sidebarWidth]);

  const loadPlans = useCallback(async () => {
    const res = await fetch('/api/wfm/plans');
    const data = await res.json();
    const items: Plan[] = data.items ?? [];
    setPlans(items);
    return items;
  }, []);

  // Track whether user has manually selected a plan
  const hasUserSelected = useRef(false);

  // Auto-select first plan on initial load (only if user hasn't selected one)
  useEffect(() => {
    loadPlans().then(items => {
      if (items.length > 0 && !hasUserSelected.current) {
        selectPlan(items[0]);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTimeline = useCallback(async (planId: number, date: string) => {
    const [tlRes, planRes] = await Promise.all([
      fetch(`/api/wfm/plans/${planId}/timeline?date=${date}`),
      fetch(`/api/wfm/plans/${planId}`),
    ]);
    const tlData = await tlRes.json();
    setTimeline(tlData.items ?? []);
    // Refresh plan to get updated versionNo after edits
    if (planRes.ok) {
      const planData = await planRes.json();
      setSelectedPlan(prev => prev?.id === planId ? { ...prev, ...planData } : prev);
    }
  }, []);

  const handleCreate = async () => {
    if (!form.name || !form.startDate || !form.endDate) return;
    await fetch('/api/wfm/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setShowCreate(false);
    setForm({ name: '', startDate: '', endDate: '' });
    loadPlans();
  };

  const refreshSelectedPlan = useCallback(async (planId: number) => {
    const res = await fetch(`/api/wfm/plans/${planId}`);
    if (res.ok) {
      const data = await res.json();
      setSelectedPlan(prev => prev?.id === planId ? { ...prev, ...data } : prev);
    }
    if (selectedPlan?.id === planId && timelineDate) {
      loadTimeline(planId, timelineDate);
    }
  }, [selectedPlan, timelineDate, loadTimeline]);

  const handleGenerate = async (planId: number) => {
    await fetch(`/api/wfm/plans/${planId}/generate`, { method: 'POST' });
    loadPlans();
    refreshSelectedPlan(planId);
  };

  const handlePublish = async (planId: number) => {
    const valRes = await fetch(`/api/wfm/plans/${planId}/publish/validate`, { method: 'POST' });
    const valData = await valRes.json();
    if (!valData.valid) {
      alert(lang === 'zh'
        ? `发布校验失败:\n${valData.errors.map((e: any) => e.message).join('\n')}`
        : `Publish validation failed:\n${valData.errors.map((e: any) => e.message).join('\n')}`);
      return;
    }
    await fetch(`/api/wfm/plans/${planId}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publishedBy: 'admin', publisherName: '管理员' }),
    });
    loadPlans();
    refreshSelectedPlan(planId);
  };

  const handleRollback = async (planId: number) => {
    await fetch(`/api/wfm/plans/${planId}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    loadPlans();
    refreshSelectedPlan(planId);
  };

  const selectPlan = (plan: Plan) => {
    hasUserSelected.current = true;
    setSelectedPlan(plan);
    setTimelineDate(plan.startDate);
    loadTimeline(plan.id, plan.startDate);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-shrink-0">
        <h2 className="text-sm font-semibold flex-1">
          {lang === 'zh' ? '排班计划' : 'Schedule Plans'}
        </h2>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90"
        >
          {lang === 'zh' ? '新建计划' : 'New Plan'}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Plan list — resizable */}
        <div className="border-r border-border overflow-y-auto flex-shrink-0" style={{ width: sidebarWidth }}>
          {plans.map(p => (
            <div
              key={p.id}
              onClick={() => selectPlan(p)}
              className={`px-4 py-3 border-b border-border cursor-pointer hover:bg-accent/50 transition-colors ${
                selectedPlan?.id === p.id ? 'bg-accent' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{p.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[p.status] ?? ''}`}>
                  {STATUS_LABELS[p.status]?.[lang] ?? p.status}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {p.startDate} ~ {p.endDate} · v{p.versionNo}
              </div>
              <div className="flex gap-1 mt-2">
                {p.status === 'draft' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleGenerate(p.id); }}
                    className="text-xs px-2 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    {lang === 'zh' ? '生成' : 'Generate'}
                  </button>
                )}
                {(p.status === 'generated' || p.status === 'editing') && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handlePublish(p.id); }}
                    className="text-xs px-2 py-0.5 bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    {lang === 'zh' ? '发布' : 'Publish'}
                  </button>
                )}
                {p.status === 'published' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRollback(p.id); }}
                    className="text-xs px-2 py-0.5 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                  >
                    {lang === 'zh' ? '回滚' : 'Rollback'}
                  </button>
                )}
              </div>
            </div>
          ))}
          {plans.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {lang === 'zh' ? '暂无排班计划' : 'No plans yet'}
            </div>
          )}
        </div>

        {/* Resize handle */}
        <div
          className="w-1 flex-shrink-0 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
          onMouseDown={onResizeStart}
        />

        {/* Timeline area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedPlan ? (
            <>
              <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-medium">{selectedPlan.name}</span>
                <input
                  type="date"
                  value={timelineDate}
                  min={selectedPlan.startDate}
                  max={selectedPlan.endDate}
                  onChange={(e) => {
                    setTimelineDate(e.target.value);
                    loadTimeline(selectedPlan.id, e.target.value);
                  }}
                  className="text-xs border border-input rounded px-2 py-1"
                />
              </div>
              <TimelineEditor
                lang={lang}
                planId={selectedPlan.id}
                planStatus={selectedPlan.status}
                versionNo={selectedPlan.versionNo}
                entries={timeline}
                staffNames={staffNames}
                onRefresh={() => loadTimeline(selectedPlan.id, timelineDate)}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              {lang === 'zh' ? '选择一个计划查看时间线' : 'Select a plan to view timeline'}
            </div>
          )}
        </div>
      </div>

      {/* Create dialog */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg p-4 w-96 shadow-lg">
            <h3 className="text-sm font-semibold mb-3">{lang === 'zh' ? '新建排班计划' : 'Create Plan'}</h3>
            <div className="space-y-2">
              <input
                type="text"
                placeholder={lang === 'zh' ? '计划名称' : 'Plan name'}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full text-sm border border-input rounded px-2 py-1.5"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className="flex-1 text-sm border border-input rounded px-2 py-1.5"
                />
                <input
                  type="date"
                  value={form.endDate}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  className="flex-1 text-sm border border-input rounded px-2 py-1.5"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 text-xs border border-border rounded hover:bg-accent"
              >
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={handleCreate}
                className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90"
              >
                {lang === 'zh' ? '创建' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
