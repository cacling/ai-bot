/**
 * edit-service.test.ts — 两阶段编辑引擎单元测试
 */
import { describe, it, expect } from 'bun:test';
import { db, wfmSchedulePlans, wfmScheduleEntries, wfmScheduleBlocks, wfmActivities, wfmShifts, eq } from '../../src/db';
import { generateSchedule } from '../../src/services/scheduler';
import { executeEdit } from '../../src/services/edit-service';

function setupPlan() {
  const [plan] = db.insert(wfmSchedulePlans).values({
    name: `edit-test-${Date.now()}`,
    startDate: '2026-04-07',
    endDate: '2026-04-07',
    status: 'draft',
    versionNo: 1,
  }).returning().all();
  generateSchedule({ planId: plan.id, startDate: '2026-04-07', endDate: '2026-04-07' });
  db.update(wfmSchedulePlans).set({ status: 'generated' })
    .where(eq(wfmSchedulePlans.id, plan.id)).run();
  return plan;
}

function getEntries(planId: number) {
  return db.select().from(wfmScheduleEntries)
    .where(eq(wfmScheduleEntries.planId, planId)).all();
}

function getBlocks(entryId: number) {
  return db.select().from(wfmScheduleBlocks)
    .where(eq(wfmScheduleBlocks.entryId, entryId)).all();
}

function getActivity(code: string) {
  return db.select().from(wfmActivities).where(eq(wfmActivities.code, code)).all()[0];
}

/** 获取 entry 的班次中间时段（安全的编辑时间范围） */
function getMidShiftRange(entry: any) {
  const shift = db.select().from(wfmShifts).where(eq(wfmShifts.id, entry.shiftId!)).all()[0];
  const [sh, sm] = shift.startTime.split(':').map(Number);
  // 使用班次开始后 2 小时的位置（安全地在班次中间）
  const midH = sh + 2;
  const startTime = `2026-04-07T${String(midH).padStart(2, '0')}:00:00Z`;
  const endTime = `2026-04-07T${String(midH).padStart(2, '0')}:30:00Z`;
  return { startTime, endTime };
}

describe('Edit Service — Preview', () => {
  it('preview should not modify DB', () => {
    const plan = setupPlan();
    const entries = getEntries(plan.id);
    const entry = entries[0];
    const blocksBefore = getBlocks(entry.id);
    const range = getMidShiftRange(entry);

    const meetingAct = getActivity('MEETING');
    const result = executeEdit({
      intentType: 'INSERT_ACTIVITY',
      planId: plan.id,
      entryId: entry.id,
      activityId: meetingAct.id,
      targetRange: range,
      saveMode: 'preview',
      versionNo: plan.versionNo,
    });

    expect(result.status).toBe('preview_ready');
    const blocksAfter = getBlocks(entry.id);
    expect(blocksAfter.length).toBe(blocksBefore.length);
  });

  it('preview should reject if duration < 15min', () => {
    const plan = setupPlan();
    const entries = getEntries(plan.id);
    const entry = entries[0];
    const range = getMidShiftRange(entry);
    const meetingAct = getActivity('MEETING');

    // Same start/end but only 5min apart → snaps to 0 duration
    const shortEnd = new Date(new Date(range.startTime).getTime() + 5 * 60000).toISOString();

    const result = executeEdit({
      intentType: 'INSERT_ACTIVITY',
      planId: plan.id,
      entryId: entry.id,
      activityId: meetingAct.id,
      targetRange: { startTime: range.startTime, endTime: shortEnd },
      saveMode: 'preview',
      versionNo: plan.versionNo,
    });

    expect(result.status).toBe('rejected');
    expect(result.validation.errors.some(e => e.ruleCode === 'MIN_DURATION')).toBe(true);
  });
});

describe('Edit Service — Commit INSERT_ACTIVITY', () => {
  it('should insert activity and rebuild WORK blocks', () => {
    const plan = setupPlan();
    const entries = getEntries(plan.id);
    const entry = entries[0];
    const range = getMidShiftRange(entry);
    const meetingAct = getActivity('MEETING');

    const result = executeEdit({
      intentType: 'INSERT_ACTIVITY',
      planId: plan.id,
      entryId: entry.id,
      activityId: meetingAct.id,
      targetRange: range,
      saveMode: 'commit',
      versionNo: plan.versionNo,
    });

    expect(result.status).toBe('committed');
    expect(result.operationId).toBeGreaterThan(0);
    expect(result.versionNo).toBe(plan.versionNo + 1);

    const blocks = getBlocks(entry.id);
    const meetingBlocks = blocks.filter(b => b.activityId === meetingAct.id);
    expect(meetingBlocks.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Edit Service — Commit MOVE_BLOCK', () => {
  it('should move a block and rebuild WORK', () => {
    const plan = setupPlan();
    const entries = getEntries(plan.id);
    const entry = entries[0];
    const breakAct = getActivity('BREAK');
    const shift = db.select().from(wfmShifts).where(eq(wfmShifts.id, entry.shiftId!)).all()[0];
    const [sh] = shift.startTime.split(':').map(Number);

    // Find a BREAK block
    const blocks = getBlocks(entry.id);
    const breakBlock = blocks.find(b => b.activityId === breakAct.id);
    if (!breakBlock) return;

    // Move to shift start + 3h
    const moveH = sh + 3;
    const result = executeEdit({
      intentType: 'MOVE_BLOCK',
      planId: plan.id,
      entryId: entry.id,
      blockId: breakBlock.id,
      targetRange: {
        startTime: `2026-04-07T${String(moveH).padStart(2, '0')}:00:00Z`,
        endTime: `2026-04-07T${String(moveH).padStart(2, '0')}:15:00Z`,
      },
      saveMode: 'commit',
      versionNo: plan.versionNo,
    });

    expect(result.status).toBe('committed');
  });
});

describe('Edit Service — Commit DELETE_BLOCK', () => {
  it('should delete block and fill with WORK', () => {
    const plan = setupPlan();
    const entries = getEntries(plan.id);
    const entry = entries[0];
    const breakAct = getActivity('BREAK');

    const blocks = getBlocks(entry.id);
    const breakBlock = blocks.find(b => b.activityId === breakAct.id);
    if (!breakBlock) return;

    const result = executeEdit({
      intentType: 'DELETE_BLOCK',
      planId: plan.id,
      entryId: entry.id,
      blockId: breakBlock.id,
      saveMode: 'commit',
      versionNo: plan.versionNo,
    });

    expect(result.status).toBe('committed');
    const blocksAfter = getBlocks(entry.id);
    expect(blocksAfter.find(b => b.id === breakBlock.id)).toBeUndefined();
  });
});

describe('Edit Service — Version Conflict', () => {
  it('should reject on version mismatch', () => {
    const plan = setupPlan();
    const entries = getEntries(plan.id);
    const range = getMidShiftRange(entries[0]);
    const meetingAct = getActivity('MEETING');

    const result = executeEdit({
      intentType: 'INSERT_ACTIVITY',
      planId: plan.id,
      entryId: entries[0].id,
      activityId: meetingAct.id,
      targetRange: range,
      saveMode: 'commit',
      versionNo: 999,
    });

    expect(result.status).toBe('rejected');
    expect(result.validation.errors[0].message).toContain('版本冲突');
  });
});

describe('Edit Service — COVER_WITH_ACTIVITY', () => {
  it('should reject covering LUNCH with TRAINING', () => {
    const plan = setupPlan();
    const entries = getEntries(plan.id);
    const entry = entries[0];
    const trainingAct = getActivity('TRAINING');
    const lunchAct = getActivity('LUNCH');

    const blocks = getBlocks(entry.id);
    const lunchBlock = blocks.find(b => b.activityId === lunchAct.id);
    if (!lunchBlock) return; // flex shift has no lunch

    const result = executeEdit({
      intentType: 'COVER_WITH_ACTIVITY',
      planId: plan.id,
      entryId: entry.id,
      activityId: trainingAct.id,
      targetRange: { startTime: lunchBlock.startTime, endTime: lunchBlock.endTime },
      saveMode: 'preview',
      versionNo: plan.versionNo,
    });

    expect(result.status).toBe('rejected');
    expect(result.validation.errors.some(e => e.ruleCode === 'ACTIVITY_COVER')).toBe(true);
  });
});
