/**
 * TimelineEditor.tsx — 可编辑的排班时间线
 *
 * 功能对齐 wfm-demo：
 * - 拖拽移动 / 左右缩放（15 分钟吸附）
 * - WORK 块只读（灰色边框、不可拖拽）
 * - 从 ActivityToolbar 拖放新活动到时间线
 * - 点击选中 + 键盘 Delete 删除
 * - Hover 显示缩放把手和删除按钮
 * - 右键菜单（插入活动 / 删除）
 * - 当前时间红色指示线
 * - 编辑失败弹出 ValidationDialog
 */
import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { type Lang } from '../../../i18n';
import { ContextMenu } from './ContextMenu';
import { ActivityToolbar, ACTIVITY_MIME } from './ActivityToolbar';
import { ValidationDialog, type ValidationItem } from './ValidationDialog';

// ── 类型 ──

export interface TimelineBlock {
  id: number;
  activityCode: string;
  activityName: string;
  color: string;
  startTime: string;
  endTime: string;
}

export interface TimelineEntry {
  id: number;
  staffId: string;
  date: string;
  blocks: TimelineBlock[];
}

interface TimelineEditorProps {
  lang: Lang;
  planId: number;
  planStatus: string;
  versionNo: number;
  entries: TimelineEntry[];
  staffNames?: Record<string, string>;
  onRefresh: () => void;
}

// ── 常量 ──

const LABEL_WIDTH = 100;        // px — staff label column width (w-[100px])
const HOUR_WIDTH = 80;          // px per hour（同 wfm-demo）
const PX_PER_MINUTE = HOUR_WIDTH / 60;
const SNAP_MINUTES = 15;
const ROW_HEIGHT = 36;          // px
const RESIZE_HANDLE_W = 6;

// ── 时间工具 ──

function snapMin(m: number) { return Math.round(m / SNAP_MINUTES) * SNAP_MINUTES; }
function timeToX(iso: string) {
  // 时间格式可能是 "2026-04-04T08:00:00"（无 Z）或 ISO UTC
  // 直接解析 HH:MM 部分，避免时区问题
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return 0;
  return (Number(m[1]) + Number(m[2]) / 60) * HOUR_WIDTH;
}
function xToMinutes(px: number) { return px / PX_PER_MINUTE; }
function shiftIso(iso: string, deltaMin: number) {
  // 解析 HH:MM 并偏移，日期跟随进位/借位
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return iso;
  const totalMin = Number(m[1]) * 60 + Number(m[2]) + deltaMin;
  const dayOffset = Math.floor(totalMin / (24 * 60));
  const dayMin = ((totalMin % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = String(Math.floor(dayMin / 60)).padStart(2, '0');
  const mm = String(dayMin % 60).padStart(2, '0');
  // Advance or rewind the date if crossing midnight
  const d = new Date(iso.slice(0, 10) + 'T12:00:00'); // noon to avoid DST issues
  d.setDate(d.getDate() + dayOffset);
  const dateStr = d.toISOString().slice(0, 10);
  return `${dateStr}T${h}:${mm}:00`;
}
/** 从 pixel X 偏移量推算时间 ISO 字符串（用于 drop） */
function xToIso(baseDate: string, px: number) {
  const totalMin = snapMin(xToMinutes(px));
  const h = String(Math.max(0, Math.min(23, Math.floor(totalMin / 60)))).padStart(2, '0');
  const m = String(Math.max(0, totalMin % 60)).padStart(2, '0');
  return `${baseDate}T${h}:${m}:00`;
}

// ── 拖拽状态 ──

type DragMode = 'move' | 'resize-left' | 'resize-right';

interface DragState {
  mode: DragMode;
  blockId: number;
  entryId: number;
  startX: number;
  origStart: string;
  origEnd: string;
  deltaPx: number;
}

interface CtxState {
  x: number; y: number;
  blockId: number; entryId: number;
  startTime: string; endTime: string;
}

interface ValState {
  errors: ValidationItem[];
  warnings: ValidationItem[];
  retryCmd?: any;
}

// ── 组件 ──

export const TimelineEditor = memo(function TimelineEditor({
  lang, planId, planStatus, versionNo, entries, staffNames, onRefresh,
}: TimelineEditorProps) {
  const editable = planStatus === 'generated' || planStatus === 'editing';
  const [drag, setDrag] = useState<DragState | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxState | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);
  const [validation, setValidation] = useState<ValState | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const hasAutoScrolled = useRef(false);

  // ── Auto-scroll to first block's start time when entries load ──
  useEffect(() => {
    if (!bodyRef.current || entries.length === 0) return;
    // Only auto-scroll once per plan selection (not on every edit refresh)
    if (hasAutoScrolled.current) return;
    // Find earliest block start across all entries
    let earliestX = Infinity;
    for (const entry of entries) {
      for (const block of entry.blocks) {
        const x = timeToX(block.startTime);
        if (x < earliestX) earliestX = x;
      }
    }
    if (earliestX < Infinity) {
      // Scroll so the earliest block is ~100px from the left edge
      bodyRef.current.scrollLeft = Math.max(0, earliestX - 100);
      hasAutoScrolled.current = true;
    }
  }, [entries]);

  // Reset auto-scroll flag when plan changes
  useEffect(() => {
    hasAutoScrolled.current = false;
  }, [planId]);

  // ── 通用 commit 请求（含 validation 弹窗） ──

  const commitEdit = useCallback(async (
    url: string, method: string, body?: any, confirmWarnings = false,
  ) => {
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify({ ...body, versionNo, confirmWarnings }) } : {}),
      });
      const data = await res.json();
      if (data.status === 'rejected' && data.validation) {
        const { errors = [], warnings = [] } = data.validation;
        if (errors.length || warnings.length) {
          setValidation({ errors, warnings, retryCmd: { url, method, body } });
          return;
        }
      }
      onRefresh();
    } catch { /* ignore */ }
  }, [versionNo, onRefresh]);

  // ── Block pointer drag ──

  const onBlockDown = useCallback((
    e: React.MouseEvent, mode: DragMode, block: TimelineBlock, entryId: number,
  ) => {
    if (!editable || e.button !== 0 || block.activityCode === 'WORK') return;
    e.preventDefault(); e.stopPropagation();
    setCtxMenu(null);
    setSelectedBlockId(block.id);
    setDrag({ mode, blockId: block.id, entryId, startX: e.clientX, origStart: block.startTime, origEnd: block.endTime, deltaPx: 0 });
  }, [editable]);

  const onPointerMove = useCallback((e: MouseEvent) => {
    if (!drag) return;
    setDrag(prev => prev ? { ...prev, deltaPx: e.clientX - prev.startX } : null);
  }, [drag]);

  const onPointerUp = useCallback(async () => {
    if (!drag) return;
    const dMin = snapMin(xToMinutes(drag.deltaPx));
    setDrag(null);
    if (dMin === 0) return;

    let newStart = drag.origStart;
    let newEnd = drag.origEnd;
    if (drag.mode === 'move') { newStart = shiftIso(drag.origStart, dMin); newEnd = shiftIso(drag.origEnd, dMin); }
    else if (drag.mode === 'resize-left') { newStart = shiftIso(drag.origStart, dMin); }
    else { newEnd = shiftIso(drag.origEnd, dMin); }

    // 最小 15 分钟
    if (new Date(newEnd).getTime() - new Date(newStart).getTime() < 15 * 60000) return;

    await commitEdit(
      `/api/wfm/plans/${planId}/blocks/${drag.blockId}`, 'PUT',
      { startTime: newStart, endTime: newEnd },
    );
  }, [drag, planId, commitEdit]);

  useEffect(() => {
    if (!drag) return;
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerUp);
    return () => { document.removeEventListener('mousemove', onPointerMove); document.removeEventListener('mouseup', onPointerUp); };
  }, [drag, onPointerMove, onPointerUp]);

  // ── 键盘删除 ──

  useEffect(() => {
    if (!editable || !selectedBlockId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        commitEdit(`/api/wfm/plans/${planId}/blocks/${selectedBlockId}?versionNo=${versionNo}`, 'DELETE');
        setSelectedBlockId(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [editable, selectedBlockId, planId, versionNo, commitEdit]);

  // ── HTML5 Drop（从 ActivityToolbar 拖入） ──

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!editable || !e.dataTransfer.types.includes(ACTIVITY_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, [editable]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData(ACTIVITY_MIME);
    if (!raw || !bodyRef.current) return;

    const { activityId } = JSON.parse(raw);
    const rect = bodyRef.current.getBoundingClientRect();
    const rulerH = rulerRef.current?.offsetHeight ?? 0;
    const relX = e.clientX - rect.left + bodyRef.current.scrollLeft - LABEL_WIDTH;
    const relY = e.clientY - rect.top + bodyRef.current.scrollTop - rulerH;

    const rowIdx = Math.floor(relY / ROW_HEIGHT);
    if (rowIdx < 0 || rowIdx >= entries.length) return;
    const entry = entries[rowIdx];

    // 30 分钟默认时长
    const baseDate = entry.date;
    const startIso = xToIso(baseDate, relX);
    const endIso = shiftIso(startIso, 30);

    commitEdit(`/api/wfm/plans/${planId}/blocks`, 'POST', {
      entryId: entry.id,
      activityId,
      startTime: startIso,
      endTime: endIso,
    });
  }, [entries, planId, commitEdit]);

  // ── 右键菜单 ──

  const onCtx = useCallback((e: React.MouseEvent, block: TimelineBlock, entryId: number) => {
    if (!editable) return;
    e.preventDefault(); e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, blockId: block.id, entryId, startTime: block.startTime, endTime: block.endTime });
  }, [editable]);

  // ── 点击选中（点空白取消） ──

  const onBodyClick = useCallback(() => { setSelectedBlockId(null); setCtxMenu(null); }, []);
  const onBlockClick = useCallback((e: React.MouseEvent, blockId: number) => {
    e.stopPropagation();
    setSelectedBlockId(blockId);
    setCtxMenu(null);
  }, []);

  // ── Block style（含拖拽预览偏移） ──

  function blockStyle(block: TimelineBlock, entryId: number) {
    let l = timeToX(block.startTime);
    let r = timeToX(block.endTime);
    // Handle midnight wrap: if endTime <= startTime, treat as next day (24:00+)
    if (r <= l && block.endTime.slice(0, 10) > block.startTime.slice(0, 10)) {
      r += 24 * HOUR_WIDTH;
    } else if (r === 0 && l > 0) {
      // endTime is exactly 00:00 same date → means midnight = 24:00
      r = 24 * HOUR_WIDTH;
    }

    if (drag && drag.blockId === block.id && drag.entryId === entryId) {
      const dPx = (snapMin(xToMinutes(drag.deltaPx)) / 60) * HOUR_WIDTH;
      if (drag.mode === 'move') { l += dPx; r += dPx; }
      else if (drag.mode === 'resize-left') { l += dPx; }
      else { r += dPx; }
    }
    return { left: l, width: Math.max(r - l, 2) };
  }

  // ── 当前时间线 X 位置（本地时间） ──
  const now = new Date();
  const nowX = (now.getHours() + now.getMinutes() / 60) * HOUR_WIDTH;

  // ── Validation 确认 warning 后重试 ──
  const handleConfirmWarnings = useCallback(async () => {
    if (!validation?.retryCmd) return;
    const { url, method, body } = validation.retryCmd;
    setValidation(null);
    await commitEdit(url, method, body, true);
  }, [validation, commitEdit]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Activity palette */}
      {editable && <ActivityToolbar lang={lang} />}

      <div
        ref={bodyRef}
        className="flex-1 overflow-auto select-none outline-none"
        tabIndex={0}
        onClick={onBodyClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {/* Hour ruler */}
        <div ref={rulerRef} className="sticky top-0 bg-background z-10 flex border-b border-border">
          <div className="w-[100px] flex-shrink-0 sticky left-0 z-[3] bg-background" />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="text-[10px] text-muted-foreground border-l border-border/50 flex-shrink-0" style={{ width: HOUR_WIDTH, paddingLeft: 2 }}>
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Staff rows */}
        {entries.map((entry, rowIdx) => (
          <div key={entry.id} className="flex border-b border-border hover:bg-accent/20" style={{ height: ROW_HEIGHT }}>
            {/* Staff label — sticky on horizontal scroll */}
            <div className="w-[100px] flex-shrink-0 sticky left-0 z-[2] px-2 text-[11px] flex items-center text-muted-foreground truncate border-r border-border bg-background" title={entry.staffId}>
              {staffNames?.[entry.staffId] ?? entry.staffId}
            </div>

            {/* Timeline row */}
            <div className="relative flex-1" style={{ minWidth: 24 * HOUR_WIDTH }}>
              {/* Hour grid lines */}
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="absolute top-0 h-full border-l border-border/20" style={{ left: h * HOUR_WIDTH }} />
              ))}

              {/* Current time line (only on first row to avoid duplication, but render per row for alignment) */}
              <div
                className="absolute top-0 h-full w-px bg-red-500 z-[5] pointer-events-none"
                style={{ left: nowX }}
              />

              {/* Blocks */}
              {entry.blocks.map(block => {
                const isWork = block.activityCode === 'WORK';
                const { left, width } = blockStyle(block, entry.id);
                const isDragging = drag?.blockId === block.id;
                const isSelected = selectedBlockId === block.id;
                const blockEditable = editable && !isWork;

                return (
                  <div
                    key={block.id}
                    className={`group absolute flex items-center justify-center overflow-hidden rounded-sm transition-shadow ${
                      blockEditable ? 'cursor-grab active:cursor-grabbing' : ''
                    } ${isDragging ? 'opacity-70 z-10' : ''
                    } ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1 z-10' : ''
                    } ${isWork ? 'border border-dashed border-gray-300' : 'hover:brightness-110'}`}
                    style={{
                      left, width,
                      top: 2, height: ROW_HEIGHT - 4,
                      backgroundColor: isWork ? '#f0fdf4' : block.color,
                    }}
                    title={`${block.activityName} ${block.startTime.slice(11, 16)}-${block.endTime.slice(11, 16)}`}
                    onClick={(e) => onBlockClick(e, block.id)}
                    onMouseDown={(e) => blockEditable && onBlockDown(e, 'move', block, entry.id)}
                    onContextMenu={(e) => !isWork && onCtx(e, block, entry.id)}
                  >
                    {/* Left resize handle (hover only) */}
                    {blockEditable && (
                      <div
                        className="absolute left-0 top-0 h-full opacity-0 group-hover:opacity-100 bg-black/20 cursor-col-resize transition-opacity"
                        style={{ width: RESIZE_HANDLE_W }}
                        onMouseDown={(e) => { e.stopPropagation(); onBlockDown(e, 'resize-left', block, entry.id); }}
                      />
                    )}

                    {/* Label */}
                    <span className={`text-[10px] truncate px-1 ${isWork ? 'text-gray-400' : 'text-white font-medium'}`}>
                      {width > 35 ? block.activityName : (width > 20 ? block.activityCode : '')}
                    </span>

                    {/* Right resize handle (hover only) */}
                    {blockEditable && (
                      <div
                        className="absolute right-0 top-0 h-full opacity-0 group-hover:opacity-100 bg-black/20 cursor-col-resize transition-opacity"
                        style={{ width: RESIZE_HANDLE_W }}
                        onMouseDown={(e) => { e.stopPropagation(); onBlockDown(e, 'resize-right', block, entry.id); }}
                      />
                    )}

                    {/* Hover delete button */}
                    {blockEditable && (
                      <button
                        className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[8px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-opacity z-20"
                        onClick={(e) => {
                          e.stopPropagation();
                          commitEdit(`/api/wfm/plans/${planId}/blocks/${block.id}?versionNo=${versionNo}`, 'DELETE');
                        }}
                        title={lang === 'zh' ? '删除' : 'Delete'}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {entries.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {lang === 'zh' ? '暂无排班数据，请先生成排班' : 'No schedule data. Generate first.'}
          </div>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          lang={lang}
          x={ctxMenu.x} y={ctxMenu.y}
          blockId={ctxMenu.blockId}
          planId={planId}
          versionNo={versionNo}
          entryId={ctxMenu.entryId}
          startTime={ctxMenu.startTime}
          endTime={ctxMenu.endTime}
          onClose={() => setCtxMenu(null)}
          onRefresh={onRefresh}
        />
      )}

      {/* Validation dialog */}
      {validation && (
        <ValidationDialog
          lang={lang}
          errors={validation.errors}
          warnings={validation.warnings}
          onClose={() => setValidation(null)}
          onConfirmWarnings={validation.warnings.length > 0 ? handleConfirmWarnings : undefined}
        />
      )}
    </div>
  );
});
