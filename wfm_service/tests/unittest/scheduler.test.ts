/**
 * scheduler.test.ts — 排班生成算法单元测试
 */
import { describe, it, expect } from 'bun:test';
import { db, wfmSchedulePlans, wfmScheduleEntries, wfmScheduleBlocks, wfmActivities, eq } from '../../src/db';
import { generateSchedule } from '../../src/services/scheduler';

describe('Scheduler', () => {
  function createTestPlan(startDate: string, endDate: string) {
    const [plan] = db.insert(wfmSchedulePlans).values({
      name: `test-${Date.now()}`,
      startDate,
      endDate,
      status: 'draft',
      versionNo: 1,
    }).returning().all();
    return plan;
  }

  it('should generate entries for a single day', () => {
    const plan = createTestPlan('2026-04-07', '2026-04-07');
    const result = generateSchedule({ planId: plan.id, startDate: '2026-04-07', endDate: '2026-04-07' });

    expect(result.totalEntries).toBeGreaterThan(0);
    expect(result.totalBlocks).toBeGreaterThan(0);

    // Verify entries exist in DB
    const entries = db.select().from(wfmScheduleEntries)
      .where(eq(wfmScheduleEntries.planId, plan.id)).all();
    expect(entries.length).toBe(result.totalEntries);
  });

  it('should generate entries for a full week', () => {
    const plan = createTestPlan('2026-04-07', '2026-04-13');
    const result = generateSchedule({ planId: plan.id, startDate: '2026-04-07', endDate: '2026-04-13' });

    // 7 days × up to 7 staff (minus those with leaves)
    expect(result.totalEntries).toBeGreaterThan(30);
  });

  it('should exclude staff with full-day approved leave', () => {
    const plan = createTestPlan('2026-04-08', '2026-04-08');
    generateSchedule({ planId: plan.id, startDate: '2026-04-08', endDate: '2026-04-08' });

    // 李娜 (agent_002) has approved sick leave on 04-08
    const liNaEntries = db.select().from(wfmScheduleEntries)
      .where(eq(wfmScheduleEntries.planId, plan.id)).all()
      .filter(e => e.staffId === 'agent_002');
    expect(liNaEntries.length).toBe(0);

    // 张琦 (agent_001) should still have entry on 04-08 (no leave that day)
    const zhangEntries = db.select().from(wfmScheduleEntries)
      .where(eq(wfmScheduleEntries.planId, plan.id)).all()
      .filter(e => e.staffId === 'agent_001');
    expect(zhangEntries.length).toBe(1);
  });

  it('should apply exception overlay', () => {
    // 马超 (agent_005) has training exception on 04-09 02:00-04:00 UTC
    const plan = createTestPlan('2026-04-09', '2026-04-09');
    generateSchedule({ planId: plan.id, startDate: '2026-04-09', endDate: '2026-04-09' });

    const maEntries = db.select().from(wfmScheduleEntries)
      .where(eq(wfmScheduleEntries.planId, plan.id)).all()
      .filter(e => e.staffId === 'agent_005');

    if (maEntries.length > 0) {
      const blocks = db.select().from(wfmScheduleBlocks)
        .where(eq(wfmScheduleBlocks.entryId, maEntries[0].id)).all();

      const trainingAct = db.select().from(wfmActivities)
        .where(eq(wfmActivities.code, 'TRAINING')).all()[0];

      const trainingBlocks = blocks.filter(b => b.activityId === trainingAct.id);
      expect(trainingBlocks.length).toBe(1);
      expect(trainingBlocks[0].source).toBe('exception');
    }
  });

  it('should clear previous entries on re-generate', () => {
    const plan = createTestPlan('2026-04-07', '2026-04-07');
    const result1 = generateSchedule({ planId: plan.id, startDate: '2026-04-07', endDate: '2026-04-07' });
    const result2 = generateSchedule({ planId: plan.id, startDate: '2026-04-07', endDate: '2026-04-07' });

    // Counts should be the same (old data cleared)
    expect(result2.totalEntries).toBe(result1.totalEntries);

    const entries = db.select().from(wfmScheduleEntries)
      .where(eq(wfmScheduleEntries.planId, plan.id)).all();
    expect(entries.length).toBe(result2.totalEntries);
  });

  it('each entry should have activity blocks from template', () => {
    const plan = createTestPlan('2026-04-07', '2026-04-07');
    generateSchedule({ planId: plan.id, startDate: '2026-04-07', endDate: '2026-04-07' });

    const entries = db.select().from(wfmScheduleEntries)
      .where(eq(wfmScheduleEntries.planId, plan.id)).all();
    expect(entries.length).toBeGreaterThan(0);

    const blocks = db.select().from(wfmScheduleBlocks)
      .where(eq(wfmScheduleBlocks.entryId, entries[0].id)).all();
    // Each shift should have at least 5 blocks (Work/Break/Work/Lunch/Work/Break/Work or Work/Break/Work/Break/Work)
    expect(blocks.length).toBeGreaterThanOrEqual(5);
  });
});
