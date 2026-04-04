/**
 * snap.ts — 15 分钟网格对齐
 *
 * 注意：wfm_service 中所有时间均为本地时间字符串（无 Z 后缀），
 * 如 "2026-04-03T14:00:00"，不可用 new Date() + getUTC 解析。
 */

const SNAP_MINUTES = 15;

/** 将 ISO 时间字符串对齐到最近的 15 分钟边界（直接解析 HH:MM，不经过 Date） */
export function snapTime(iso: string): string {
  const m = iso.match(/^(.+T)(\d{2}):(\d{2})(:\d{2})?(.*)$/);
  if (!m) return iso;
  const prefix = m[1];        // "2026-04-03T"
  const hours = Number(m[2]);
  const minutes = Number(m[3]);
  const snapped = Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
  // Handle overflow: 60 → next hour
  const finalH = hours + Math.floor(snapped / 60);
  const finalM = snapped % 60;
  return `${prefix}${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}:00`;
}

/** 将分钟数对齐到 15 分钟网格 */
export function snapMinutes(m: number): number {
  return Math.round(m / SNAP_MINUTES) * SNAP_MINUTES;
}
