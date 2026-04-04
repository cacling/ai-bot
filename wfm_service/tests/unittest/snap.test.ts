/**
 * snap.test.ts — 15 分钟网格对齐单元测试
 *
 * snapTime 现在输出本地时间格式（无 Z 后缀），与 wfm_service 统一。
 */
import { describe, it, expect } from 'bun:test';
import { snapTime, snapMinutes } from '../../src/services/snap';

describe('snapTime', () => {
  it('should snap to nearest 15-min boundary (round down)', () => {
    expect(snapTime('2026-04-07T09:07:00')).toBe('2026-04-07T09:00:00');
  });

  it('should snap to nearest 15-min boundary (round up)', () => {
    expect(snapTime('2026-04-07T09:08:00')).toBe('2026-04-07T09:15:00');
  });

  it('should keep exact 15-min boundaries unchanged', () => {
    expect(snapTime('2026-04-07T09:15:00')).toBe('2026-04-07T09:15:00');
    expect(snapTime('2026-04-07T09:30:00')).toBe('2026-04-07T09:30:00');
    expect(snapTime('2026-04-07T09:45:00')).toBe('2026-04-07T09:45:00');
    expect(snapTime('2026-04-07T10:00:00')).toBe('2026-04-07T10:00:00');
  });

  it('should zero out seconds', () => {
    expect(snapTime('2026-04-07T09:14:59')).toBe('2026-04-07T09:15:00');
  });

  it('should strip Z suffix and return local format', () => {
    // Input with Z suffix → still works, output has no Z
    expect(snapTime('2026-04-07T09:07:00Z')).toBe('2026-04-07T09:00:00');
  });
});

describe('snapMinutes', () => {
  it('should snap minutes to 15-min grid', () => {
    expect(snapMinutes(0)).toBe(0);
    expect(snapMinutes(7)).toBe(0);
    expect(snapMinutes(8)).toBe(15);
    expect(snapMinutes(15)).toBe(15);
    expect(snapMinutes(22)).toBe(15);
    expect(snapMinutes(23)).toBe(30);
    expect(snapMinutes(37)).toBe(30);
    expect(snapMinutes(38)).toBe(45);
  });
});
