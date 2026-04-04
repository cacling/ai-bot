/**
 * LeaveManagementPage.tsx — 假勤管理（申请列表 + 审批 + 例外）
 */
import { memo, useState, useEffect, useCallback } from 'react';
import { type Lang } from '../../../i18n';

type SubTab = 'leaves' | 'exceptions';

interface LeaveRecord {
  id: number;
  staffId: string;
  leaveTypeId: number;
  startTime: string;
  endTime: string;
  isFullDay: boolean;
  status: string;
  isPrePlanned: boolean;
}

interface ExceptionRecord {
  id: number;
  staffId: string;
  activityId: number;
  startTime: string;
  endTime: string;
  note: string;
}

interface LeaveType {
  id: number;
  code: string;
  name: string;
}

interface Activity {
  id: number;
  code: string;
  name: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

const EMPTY_LEAVE_FORM = { staffId: '', leaveTypeId: 0, startTime: '', endTime: '', isFullDay: true, isPrePlanned: false };
const EMPTY_EXCEPTION_FORM = { staffId: '', activityId: 0, startTime: '', endTime: '', note: '' };

export const LeaveManagementPage = memo(function LeaveManagementPage({ lang }: { lang: Lang }) {
  const [tab, setTab] = useState<SubTab>('leaves');
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Dropdown data
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);

  // Dialog state
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showExceptionDialog, setShowExceptionDialog] = useState(false);
  const [leaveForm, setLeaveForm] = useState(EMPTY_LEAVE_FORM);
  const [exceptionForm, setExceptionForm] = useState(EMPTY_EXCEPTION_FORM);

  const loadLeaves = useCallback(async () => {
    try {
      const res = await fetch('/api/wfm/leaves');
      const data = await res.json();
      setLeaves(data.items ?? []);
    } catch (e) { setError(String(e)); }
  }, []);

  const loadExceptions = useCallback(async () => {
    try {
      const res = await fetch('/api/wfm/leaves/exceptions');
      const data = await res.json();
      setExceptions(data.items ?? []);
    } catch (e) { setError(String(e)); }
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    await Promise.all([loadLeaves(), loadExceptions()]);
    setLoading(false);
  }, [loadLeaves, loadExceptions]);

  useEffect(() => { reload(); }, [reload]);

  const loadLeaveTypes = useCallback(async () => {
    try {
      const res = await fetch('/api/wfm/leaves/types');
      const data = await res.json();
      const items = data.items ?? [];
      setLeaveTypes(items);
      if (items.length > 0) setLeaveForm(f => ({ ...f, leaveTypeId: items[0].id }));
    } catch { /* ignore */ }
  }, []);

  const loadActivities = useCallback(async () => {
    try {
      const res = await fetch('/api/wfm/activities');
      const data = await res.json();
      const items = data.items ?? [];
      setActivities(items);
      if (items.length > 0) setExceptionForm(f => ({ ...f, activityId: items[0].id }));
    } catch { /* ignore */ }
  }, []);

  // --- Actions ---

  const handleApprove = async (id: number) => {
    try {
      await fetch(`/api/wfm/leaves/${id}/approve`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      loadLeaves();
    } catch (e) { setError(String(e)); }
  };

  const handleReject = async (id: number) => {
    try {
      await fetch(`/api/wfm/leaves/${id}/reject`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      loadLeaves();
    } catch (e) { setError(String(e)); }
  };

  const handleDeleteLeave = async (id: number) => {
    if (!window.confirm(lang === 'zh' ? '确定删除此假勤记录？' : 'Delete this leave record?')) return;
    try {
      await fetch(`/api/wfm/leaves/${id}`, { method: 'DELETE' });
      loadLeaves();
    } catch (e) { setError(String(e)); }
  };

  const handleDeleteException = async (id: number) => {
    if (!window.confirm(lang === 'zh' ? '确定删除此例外？' : 'Delete this exception?')) return;
    try {
      await fetch(`/api/wfm/leaves/exceptions/${id}`, { method: 'DELETE' });
      loadExceptions();
    } catch (e) { setError(String(e)); }
  };

  // --- Create dialogs ---

  const openLeaveDialog = () => {
    setLeaveForm(EMPTY_LEAVE_FORM);
    setShowLeaveDialog(true);
    loadLeaveTypes();
  };

  const openExceptionDialog = () => {
    setExceptionForm(EMPTY_EXCEPTION_FORM);
    setShowExceptionDialog(true);
    loadActivities();
  };

  const handleCreateLeave = async () => {
    if (!leaveForm.staffId || !leaveForm.leaveTypeId || !leaveForm.startTime || !leaveForm.endTime) return;
    try {
      await fetch('/api/wfm/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: leaveForm.staffId,
          leaveTypeId: leaveForm.leaveTypeId,
          startTime: leaveForm.startTime + ':00',
          endTime: leaveForm.endTime + ':00',
          isFullDay: leaveForm.isFullDay,
          isPrePlanned: leaveForm.isPrePlanned,
        }),
      });
      setShowLeaveDialog(false);
      loadLeaves();
    } catch (e) { setError(String(e)); }
  };

  const handleCreateException = async () => {
    if (!exceptionForm.staffId || !exceptionForm.activityId || !exceptionForm.startTime || !exceptionForm.endTime) return;
    try {
      await fetch('/api/wfm/leaves/exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: exceptionForm.staffId,
          activityId: exceptionForm.activityId,
          startTime: exceptionForm.startTime + ':00',
          endTime: exceptionForm.endTime + ':00',
          note: exceptionForm.note || null,
        }),
      });
      setShowExceptionDialog(false);
      loadExceptions();
    } catch (e) { setError(String(e)); }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab bar + toolbar */}
      <div className="px-4 border-b border-border flex items-center h-9 flex-shrink-0">
        <button
          onClick={() => setTab('leaves')}
          className={`px-4 h-full text-xs font-medium border-b-2 transition-colors ${
            tab === 'leaves' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {lang === 'zh' ? '假勤申请' : 'Leave Requests'}
        </button>
        <button
          onClick={() => setTab('exceptions')}
          className={`px-4 h-full text-xs font-medium border-b-2 transition-colors ${
            tab === 'exceptions' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {lang === 'zh' ? '例外安排' : 'Exceptions'}
        </button>
        <div className="flex-1" />
        {loading && <span className="text-xs text-muted-foreground mr-2">{lang === 'zh' ? '加载中...' : 'Loading...'}</span>}
        {tab === 'leaves' ? (
          <button onClick={openLeaveDialog} className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90">
            {lang === 'zh' ? '+ 新建假勤' : '+ New Leave'}
          </button>
        ) : (
          <button onClick={openExceptionDialog} className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90">
            {lang === 'zh' ? '+ 新建例外' : '+ New Exception'}
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-1.5 bg-red-50 text-red-600 text-xs flex items-center gap-2 border-b border-red-200">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">x</button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {tab === 'leaves' ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">ID</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{lang === 'zh' ? '坐席' : 'Staff'}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{lang === 'zh' ? '类型' : 'Type'}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{lang === 'zh' ? '开始' : 'Start'}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{lang === 'zh' ? '结束' : 'End'}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{lang === 'zh' ? '全天' : 'Full Day'}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{lang === 'zh' ? '状态' : 'Status'}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{lang === 'zh' ? '操作' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {leaves.map(l => (
                <tr key={l.id} className="border-b border-border hover:bg-accent/30">
                  <td className="px-3 py-2 text-xs">{l.id}</td>
                  <td className="px-3 py-2 text-xs">{l.staffId}</td>
                  <td className="px-3 py-2 text-xs">{l.leaveTypeId}</td>
                  <td className="px-3 py-2 text-xs">{l.startTime?.slice(0, 16)}</td>
                  <td className="px-3 py-2 text-xs">{l.endTime?.slice(0, 16)}</td>
                  <td className="px-3 py-2 text-xs">{l.isFullDay ? '✓' : '✗'}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={`px-2 py-0.5 rounded ${STATUS_COLORS[l.status] ?? ''}`}>
                      {l.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="flex gap-1">
                      {l.status === 'pending' && (
                        <>
                          <button onClick={() => handleApprove(l.id)} className="px-2 py-0.5 bg-green-500 text-white rounded hover:bg-green-600">
                            {lang === 'zh' ? '批准' : 'Approve'}
                          </button>
                          <button onClick={() => handleReject(l.id)} className="px-2 py-0.5 bg-red-500 text-white rounded hover:bg-red-600">
                            {lang === 'zh' ? '拒绝' : 'Reject'}
                          </button>
                        </>
                      )}
                      <button onClick={() => handleDeleteLeave(l.id)} className="px-2 py-0.5 text-red-500 hover:text-red-700">
                        {lang === 'zh' ? '删除' : 'Delete'}
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">ID</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{lang === 'zh' ? '坐席' : 'Staff'}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{lang === 'zh' ? '活动' : 'Activity'}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{lang === 'zh' ? '开始' : 'Start'}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{lang === 'zh' ? '结束' : 'End'}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{lang === 'zh' ? '备注' : 'Note'}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{lang === 'zh' ? '操作' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map(e => (
                <tr key={e.id} className="border-b border-border hover:bg-accent/30">
                  <td className="px-3 py-2 text-xs">{e.id}</td>
                  <td className="px-3 py-2 text-xs">{e.staffId}</td>
                  <td className="px-3 py-2 text-xs">{e.activityId}</td>
                  <td className="px-3 py-2 text-xs">{e.startTime?.slice(0, 16)}</td>
                  <td className="px-3 py-2 text-xs">{e.endTime?.slice(0, 16)}</td>
                  <td className="px-3 py-2 text-xs">{e.note}</td>
                  <td className="px-3 py-2 text-xs">
                    <button onClick={() => handleDeleteException(e.id)} className="px-2 py-0.5 text-red-500 hover:text-red-700">
                      {lang === 'zh' ? '删除' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Leave Dialog */}
      {showLeaveDialog && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg p-4 w-96 shadow-lg">
            <h3 className="text-sm font-semibold mb-3">{lang === 'zh' ? '新建假勤申请' : 'New Leave Request'}</h3>
            <div className="space-y-2">
              <input
                type="text"
                placeholder={lang === 'zh' ? '坐席ID (如 agent_001)' : 'Staff ID'}
                value={leaveForm.staffId}
                onChange={e => setLeaveForm(f => ({ ...f, staffId: e.target.value }))}
                className="w-full text-sm border border-input rounded px-2 py-1.5"
              />
              <select
                value={leaveForm.leaveTypeId}
                onChange={e => setLeaveForm(f => ({ ...f, leaveTypeId: Number(e.target.value) }))}
                className="w-full text-sm border border-input rounded px-2 py-1.5"
              >
                {leaveTypes.map(lt => (
                  <option key={lt.id} value={lt.id}>{lt.name} ({lt.code})</option>
                ))}
              </select>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">{lang === 'zh' ? '开始' : 'Start'}</label>
                  <input
                    type="datetime-local"
                    value={leaveForm.startTime}
                    onChange={e => setLeaveForm(f => ({ ...f, startTime: e.target.value }))}
                    className="w-full text-sm border border-input rounded px-2 py-1.5"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">{lang === 'zh' ? '结束' : 'End'}</label>
                  <input
                    type="datetime-local"
                    value={leaveForm.endTime}
                    onChange={e => setLeaveForm(f => ({ ...f, endTime: e.target.value }))}
                    className="w-full text-sm border border-input rounded px-2 py-1.5"
                  />
                </div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={leaveForm.isFullDay}
                    onChange={e => setLeaveForm(f => ({ ...f, isFullDay: e.target.checked }))}
                  />
                  {lang === 'zh' ? '全天' : 'Full Day'}
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={leaveForm.isPrePlanned}
                    onChange={e => setLeaveForm(f => ({ ...f, isPrePlanned: e.target.checked }))}
                  />
                  {lang === 'zh' ? '预排' : 'Pre-planned'}
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowLeaveDialog(false)} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-accent">
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button onClick={handleCreateLeave} className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90">
                {lang === 'zh' ? '提交' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Exception Dialog */}
      {showExceptionDialog && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg p-4 w-96 shadow-lg">
            <h3 className="text-sm font-semibold mb-3">{lang === 'zh' ? '新建例外安排' : 'New Exception'}</h3>
            <div className="space-y-2">
              <input
                type="text"
                placeholder={lang === 'zh' ? '坐席ID (如 agent_001)' : 'Staff ID'}
                value={exceptionForm.staffId}
                onChange={e => setExceptionForm(f => ({ ...f, staffId: e.target.value }))}
                className="w-full text-sm border border-input rounded px-2 py-1.5"
              />
              <select
                value={exceptionForm.activityId}
                onChange={e => setExceptionForm(f => ({ ...f, activityId: Number(e.target.value) }))}
                className="w-full text-sm border border-input rounded px-2 py-1.5"
              >
                {activities.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
                ))}
              </select>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">{lang === 'zh' ? '开始' : 'Start'}</label>
                  <input
                    type="datetime-local"
                    value={exceptionForm.startTime}
                    onChange={e => setExceptionForm(f => ({ ...f, startTime: e.target.value }))}
                    className="w-full text-sm border border-input rounded px-2 py-1.5"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">{lang === 'zh' ? '结束' : 'End'}</label>
                  <input
                    type="datetime-local"
                    value={exceptionForm.endTime}
                    onChange={e => setExceptionForm(f => ({ ...f, endTime: e.target.value }))}
                    className="w-full text-sm border border-input rounded px-2 py-1.5"
                  />
                </div>
              </div>
              <input
                type="text"
                placeholder={lang === 'zh' ? '备注（可选）' : 'Note (optional)'}
                value={exceptionForm.note}
                onChange={e => setExceptionForm(f => ({ ...f, note: e.target.value }))}
                className="w-full text-sm border border-input rounded px-2 py-1.5"
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowExceptionDialog(false)} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-accent">
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button onClick={handleCreateException} className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90">
                {lang === 'zh' ? '提交' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
