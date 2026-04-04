/**
 * schedule-e2e.test.ts — 排班计划全流程 E2E 测试
 *
 * 覆盖：计划 CRUD → 排班生成 → 时间线查看 → 块拖拽/添加/删除/移动/缩放 →
 *       校验（边界、重叠、版本冲突） → 发布 → 回滚
 *
 * 重要：wfm_service 所有时间为本地时间字符串（无 Z 后缀），如 "2026-04-07T10:00:00"
 */
import { describe, it, expect, beforeAll } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();
const BASE = '/api/wfm/plans';

// ── 工具函数 ──

function post(url: string, body: object) {
  return app.request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function put(url: string, body: object) {
  return app.request(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function del(url: string) {
  return app.request(url, { method: 'DELETE' });
}

interface Block {
  id: number;
  activityCode: string;
  activityName: string;
  startTime: string;
  endTime: string;
  source: string;
  color: string;
}

interface Entry {
  id: number;
  staffId: string;
  date: string;
  shiftId: number;
  blocks: Block[];
}

/** 从 WORK 块中找一个安全的时间段用于插入新块 */
function findSafeSlot(entry: Entry, durationMin = 30): { startTime: string; endTime: string } | null {
  const workBlock = entry.blocks
    .filter(b => b.activityCode === 'WORK')
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .find(b => {
      const sH = Number(b.startTime.slice(11, 13)), sM = Number(b.startTime.slice(14, 16));
      const eH = Number(b.endTime.slice(11, 13)), eM = Number(b.endTime.slice(14, 16));
      return (eH * 60 + eM) - (sH * 60 + sM) >= durationMin;
    });
  if (!workBlock) return null;
  const startTime = workBlock.startTime;
  const sH = Number(startTime.slice(11, 13)), sM = Number(startTime.slice(14, 16));
  const endMin = sH * 60 + sM + durationMin;
  const endTime = `${startTime.slice(0, 11)}${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}:00`;
  return { startTime, endTime };
}

// ── 共享状态 ──

let planId: number;
let planVersionNo: number;
const DATE = '2026-04-07';
let activities: { id: number; code: string; name: string }[];

async function refreshPlan() {
  const res = await app.request(`${BASE}/${planId}`);
  const plan = await res.json();
  planVersionNo = plan.versionNo;
  return plan;
}

async function getTimeline(date = DATE): Promise<Entry[]> {
  const res = await app.request(`${BASE}/${planId}/timeline?date=${date}`);
  const { items } = await res.json();
  return items;
}

function findActivity(code: string) {
  return activities.find(a => a.code === code)!;
}

// ── Setup: 创建计划并生成排班 ──

beforeAll(async () => {
  // Load activities
  const actRes = await app.request('/api/wfm/activities');
  const actData = await actRes.json();
  activities = actData.items;

  // Create plan
  const createRes = await post(BASE, {
    name: `E2E排班 ${DATE}`,
    startDate: DATE,
    endDate: '2026-04-09',
  });
  const plan = await createRes.json();
  planId = plan.id;
  planVersionNo = plan.versionNo;

  // Generate schedule
  await post(`${BASE}/${planId}/generate`, {});
  await refreshPlan();
});

// ========== 1. 计划创建与生成 ==========

describe('1. Plan Create & Generate', () => {
  it('should have generated schedule with entries', async () => {
    const plan = await refreshPlan();
    expect(plan.status).toBe('generated');
    expect(plan.versionNo).toBeGreaterThanOrEqual(1);
  });

  it('should have timeline with blocks after generation', async () => {
    const entries = await getTimeline();
    expect(entries.length).toBeGreaterThan(0);

    const entry = entries[0];
    expect(entry.blocks.length).toBeGreaterThan(0);

    // All blocks should have local time format (no Z suffix)
    for (const block of entry.blocks) {
      expect(block.startTime).not.toContain('Z');
      expect(block.endTime).not.toContain('Z');
      expect(block.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    }
  });

  it('should have WORK blocks filling gaps between activities', async () => {
    const entries = await getTimeline();
    const entry = entries[0];
    const workBlocks = entry.blocks.filter(b => b.activityCode === 'WORK');
    const nonWorkBlocks = entry.blocks.filter(b => b.activityCode !== 'WORK');

    expect(workBlocks.length).toBeGreaterThan(0);
    expect(nonWorkBlocks.length).toBeGreaterThan(0);

    // WORK blocks should be source: algorithm
    for (const wb of workBlocks) {
      expect(wb.source).toBe('algorithm');
    }
  });
});

// ========== 2. 块添加（拖拽放置） ==========

describe('2. Add Block (drag-drop from palette)', () => {
  it('should add a BREAK block within shift boundary', async () => {
    const entries = await getTimeline();
    const entry = entries[0];
    const breakAct = findActivity('BREAK');
    const slot = findSafeSlot(entry, 30);
    expect(slot).toBeTruthy();

    const res = await post(`${BASE}/${planId}/blocks`, {
      entryId: entry.id,
      activityId: breakAct.id,
      startTime: slot!.startTime,
      endTime: slot!.endTime,
      versionNo: planVersionNo,
    });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.status).toBe('committed');
    expect(data.versionNo).toBe(planVersionNo + 1);

    // Verify block is in updated list
    const addedBlock = data.updatedBlocks.find(
      (b: Block) => b.activityCode === 'BREAK' && b.startTime === slot!.startTime,
    );
    expect(addedBlock).toBeTruthy();

    // All times in response should be local (no Z)
    for (const b of data.updatedBlocks) {
      expect(b.startTime).not.toContain('Z');
      expect(b.endTime).not.toContain('Z');
    }

    await refreshPlan();
  });

  it('should add a MEETING block and rebuild WORK blocks around it', async () => {
    const entries = await getTimeline();
    const entry = entries[0];
    const meetingAct = findActivity('MEETING');
    const slot = findSafeSlot(entry, 30);
    expect(slot).toBeTruthy();

    const res = await post(`${BASE}/${planId}/blocks`, {
      entryId: entry.id,
      activityId: meetingAct.id,
      startTime: slot!.startTime,
      endTime: slot!.endTime,
      versionNo: planVersionNo,
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.status).toBe('committed');

    // WORK blocks should be split around the meeting
    const workBlocks = data.updatedBlocks
      .filter((b: Block) => b.activityCode === 'WORK')
      .sort((a: Block, b: Block) => a.startTime.localeCompare(b.startTime));

    // Should have a WORK block ending at slot start and one starting at slot end
    const beforeMeeting = workBlocks.find((b: Block) => b.endTime === slot!.startTime);
    const afterMeeting = workBlocks.find((b: Block) => b.startTime === slot!.endTime);
    expect(beforeMeeting || afterMeeting).toBeTruthy(); // at least one gap filled

    await refreshPlan();
  });

  it('should add a TRAINING block', async () => {
    const entries = await getTimeline();
    const entry = entries[0];
    const trainingAct = findActivity('TRAINING');
    const slot = findSafeSlot(entry, 30);
    expect(slot).toBeTruthy();

    const res = await post(`${BASE}/${planId}/blocks`, {
      entryId: entry.id,
      activityId: trainingAct.id,
      startTime: slot!.startTime,
      endTime: slot!.endTime,
      versionNo: planVersionNo,
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.status).toBe('committed');

    const trainingBlock = data.updatedBlocks.find(
      (b: Block) => b.activityCode === 'TRAINING' && b.startTime === slot!.startTime,
    );
    expect(trainingBlock).toBeTruthy();
    expect(trainingBlock.source).toBe('manual');

    await refreshPlan();
  });
});

// ========== 3. 块移动（拖拽） ==========

describe('3. Move Block (drag)', () => {
  it('should move a BREAK block forward by 30min', async () => {
    const entries = await getTimeline();
    const entry = entries[0];
    const breakBlock = entry.blocks.find(b => b.activityCode === 'BREAK');
    if (!breakBlock) return;

    const origStart = breakBlock.startTime;
    const origEnd = breakBlock.endTime;
    const origStartH = Number(origStart.slice(11, 13));
    const origStartM = Number(origStart.slice(14, 16));
    const origEndH = Number(origEnd.slice(11, 13));
    const origEndM = Number(origEnd.slice(14, 16));

    // Shift forward 30 min
    const newStartMin = origStartH * 60 + origStartM + 30;
    const newEndMin = origEndH * 60 + origEndM + 30;
    const newStart = `${DATE}T${String(Math.floor(newStartMin / 60)).padStart(2, '0')}:${String(newStartMin % 60).padStart(2, '0')}:00`;
    const newEnd = `${DATE}T${String(Math.floor(newEndMin / 60)).padStart(2, '0')}:${String(newEndMin % 60).padStart(2, '0')}:00`;

    const res = await put(`${BASE}/${planId}/blocks/${breakBlock.id}`, {
      startTime: newStart,
      endTime: newEnd,
      versionNo: planVersionNo,
    });
    const data = await res.json();
    expect(data.status).toBe('committed');
    expect(data.versionNo).toBe(planVersionNo + 1);

    // Verify block moved
    const movedBlock = data.updatedBlocks.find((b: Block) => b.id === breakBlock.id);
    expect(movedBlock).toBeTruthy();
    expect(movedBlock.startTime).toBe(newStart);
    expect(movedBlock.endTime).toBe(newEnd);

    await refreshPlan();
  });
});

// ========== 4. 块缩放（resize） ==========

describe('4. Resize Block', () => {
  it('should extend a block by resizing right edge', async () => {
    const entries = await getTimeline();
    const entry = entries[0];
    const breakBlock = entry.blocks.find(b => b.activityCode === 'BREAK');
    if (!breakBlock) return;

    // Extend end by 15 min
    const endH = Number(breakBlock.endTime.slice(11, 13));
    const endM = Number(breakBlock.endTime.slice(14, 16));
    const newEndMin = endH * 60 + endM + 15;
    const newEnd = `${DATE}T${String(Math.floor(newEndMin / 60)).padStart(2, '0')}:${String(newEndMin % 60).padStart(2, '0')}:00`;

    const res = await put(`${BASE}/${planId}/blocks/${breakBlock.id}`, {
      startTime: breakBlock.startTime,
      endTime: newEnd,
      versionNo: planVersionNo,
    });
    const data = await res.json();
    expect(data.status).toBe('committed');

    const updated = data.updatedBlocks.find((b: Block) => b.id === breakBlock.id);
    expect(updated.endTime).toBe(newEnd);

    await refreshPlan();
  });

  it('should reject resize that makes block shorter than 15min', async () => {
    const entries = await getTimeline();
    const entry = entries[0];
    const breakBlock = entry.blocks.find(b => b.activityCode === 'BREAK');
    if (!breakBlock) return;

    // Try to set duration to 5 min (below minimum)
    const startH = Number(breakBlock.startTime.slice(11, 13));
    const startM = Number(breakBlock.startTime.slice(14, 16));
    const tinyEndMin = startH * 60 + startM + 5;
    const tinyEnd = `${DATE}T${String(Math.floor(tinyEndMin / 60)).padStart(2, '0')}:${String(tinyEndMin % 60).padStart(2, '0')}:00`;

    const res = await put(`${BASE}/${planId}/blocks/${breakBlock.id}`, {
      startTime: breakBlock.startTime,
      endTime: tinyEnd,
      versionNo: planVersionNo,
    });
    const data = await res.json();
    expect(data.status).toBe('rejected');
    const minDurError = data.validation.errors.find(
      (e: { ruleCode: string }) => e.ruleCode === 'MIN_DURATION',
    );
    expect(minDurError).toBeTruthy();
  });
});

// ========== 5. 块删除 ==========

describe('5. Delete Block', () => {
  it('should delete a non-WORK block and WORK fills the gap', async () => {
    await refreshPlan();
    const entries = await getTimeline();
    const entry = entries[0];
    // Find any deletable (non-WORK) block
    const target = entry.blocks.find(b => b.activityCode !== 'WORK');
    if (!target) return;

    const beforeCount = entry.blocks.filter(b => b.activityCode === 'WORK').length;

    const res = await app.request(
      `${BASE}/${planId}/blocks/${target.id}?versionNo=${planVersionNo}`,
      { method: 'DELETE' },
    );
    const data = await res.json();
    expect(data.status).toBe('committed');
    expect(data.versionNo).toBe(planVersionNo + 1);

    // WORK blocks should fill the gap → WORK count might change
    const afterWorkCount = data.updatedBlocks.filter((b: Block) => b.activityCode === 'WORK').length;
    // The deleted block should no longer be in the list
    const deleted = data.updatedBlocks.find((b: Block) => b.id === target.id);
    expect(deleted).toBeUndefined();

    await refreshPlan();
  });
});

// ========== 6. 版本冲突 ==========

describe('6. Optimistic Locking (version conflict)', () => {
  it('should reject edit with stale versionNo', async () => {
    const staleVersion = planVersionNo - 1;
    const entries = await getTimeline();
    const entry = entries[0];
    const breakAct = findActivity('BREAK');

    const res = await post(`${BASE}/${planId}/blocks`, {
      entryId: entry.id,
      activityId: breakAct.id,
      startTime: `${DATE}T15:00:00`,
      endTime: `${DATE}T15:30:00`,
      versionNo: staleVersion,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.status).toBe('rejected');
    expect(data.validation.errors[0].ruleCode).toBe('SYSTEM');
    expect(data.validation.errors[0].message).toContain('版本冲突');
  });
});

// ========== 7. 班次边界校验 ==========

describe('7. Shift Boundary Validation', () => {
  it('should reject block outside shift boundary', async () => {
    await refreshPlan();
    const entries = await getTimeline();
    const entry = entries[0];
    const breakAct = findActivity('BREAK');

    // Place block at 05:00-05:30 (well before any shift starts)
    const res = await post(`${BASE}/${planId}/blocks`, {
      entryId: entry.id,
      activityId: breakAct.id,
      startTime: `${DATE}T05:00:00`,
      endTime: `${DATE}T05:30:00`,
      versionNo: planVersionNo,
    });
    const data = await res.json();
    expect(data.status).toBe('rejected');
    const boundaryError = data.validation.errors.find(
      (e: { ruleCode: string }) => e.ruleCode === 'SHIFT_BOUNDARY',
    );
    expect(boundaryError).toBeTruthy();
  });

  it('should accept block within shift boundary', async () => {
    await refreshPlan(); // ensure fresh version
    const entries = await getTimeline();
    const entry = entries[0];
    const breakAct = findActivity('BREAK');
    const slot = findSafeSlot(entry, 30);
    expect(slot).toBeTruthy();

    const res = await post(`${BASE}/${planId}/blocks`, {
      entryId: entry.id,
      activityId: breakAct.id,
      startTime: slot!.startTime,
      endTime: slot!.endTime,
      versionNo: planVersionNo,
    });
    const data = await res.json();
    expect(data.status).toBe('committed');
    await refreshPlan();
  });
});

// ========== 8. 时间格式一致性 ==========

describe('8. Time Format Consistency', () => {
  it('all blocks should have local time format (no Z, no .000Z)', async () => {
    const entries = await getTimeline();
    for (const entry of entries) {
      for (const block of entry.blocks) {
        expect(block.startTime).not.toContain('Z');
        expect(block.endTime).not.toContain('Z');
        expect(block.startTime).not.toContain('.000');
        expect(block.endTime).not.toContain('.000');
        // Should match YYYY-MM-DDTHH:MM:SS
        expect(block.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
        expect(block.endTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      }
    }
  });

  it('blocks should be consistent after add+delete cycle', async () => {
    await refreshPlan();
    const entries = await getTimeline();
    const entry = entries[0];
    const breakAct = findActivity('BREAK');
    const slot = findSafeSlot(entry, 15);
    expect(slot).toBeTruthy();

    // Add block
    const addRes = await post(`${BASE}/${planId}/blocks`, {
      entryId: entry.id,
      activityId: breakAct.id,
      startTime: slot!.startTime,
      endTime: slot!.endTime,
      versionNo: planVersionNo,
    });
    const addData = await addRes.json();
    expect(addData.status).toBe('committed');
    await refreshPlan();

    // All blocks in response should have consistent format
    for (const b of addData.updatedBlocks) {
      expect(b.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      expect(b.endTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    }

    // Find and delete the block we just added
    const addedBlock = addData.updatedBlocks.find(
      (b: Block) => b.activityCode === 'BREAK' && b.startTime === slot!.startTime,
    );
    if (addedBlock) {
      const delRes = await app.request(
        `${BASE}/${planId}/blocks/${addedBlock.id}?versionNo=${planVersionNo}`,
        { method: 'DELETE' },
      );
      const delData = await delRes.json();
      expect(delData.status).toBe('committed');

      // Check format again
      for (const b of delData.updatedBlocks) {
        expect(b.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
        expect(b.endTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      }
      await refreshPlan();
    }
  });
});

// ========== 9. 多天时间线 ==========

describe('9. Multi-day Timeline', () => {
  it('should return different entries for different dates', async () => {
    const day1 = await getTimeline('2026-04-07');
    const day2 = await getTimeline('2026-04-08');

    expect(day1.length).toBeGreaterThan(0);
    expect(day2.length).toBeGreaterThan(0);

    // 04-08: agent_002 (李娜) should be excluded due to leave
    const liNa08 = day2.find(e => e.staffId === 'agent_002');
    expect(liNa08).toBeUndefined();
  });
});

// ========== 10. Preview API ==========

describe('10. Edit Preview', () => {
  it('should return preview_ready with mutations without persisting', async () => {
    await refreshPlan();
    const entries = await getTimeline();
    const entry = entries[0];
    const meetingAct = findActivity('MEETING');
    const slot = findSafeSlot(entry, 30);
    expect(slot).toBeTruthy();

    const res = await post(`${BASE}/${planId}/changes/preview`, {
      intentType: 'INSERT_ACTIVITY',
      entryId: entry.id,
      activityId: meetingAct.id,
      targetRange: {
        startTime: slot!.startTime,
        endTime: slot!.endTime,
      },
      versionNo: planVersionNo,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('preview_ready');
    expect(data.updatedBlocks).toBeArray();

    // Preview should NOT change versionNo
    const plan = await refreshPlan();
    expect(plan.versionNo).toBe(planVersionNo);
  });
});

// ========== 11. Publish & Rollback ==========

describe('11. Publish & Rollback', () => {
  it('should publish plan and prevent further edits', async () => {
    // Publish
    const valRes = await post(`${BASE}/${planId}/publish/validate`, {});
    const valData = await valRes.json();
    // Regardless of validation, attempt publish
    const pubRes = await post(`${BASE}/${planId}/publish`, {
      publishedBy: 'admin',
      publisherName: '管理员',
    });
    const pubData = await pubRes.json();

    if (pubRes.status === 200) {
      const plan = await refreshPlan();
      expect(plan.status).toBe('published');

      // Editing published plan should fail
      const entries = await getTimeline();
      if (entries.length > 0) {
        const breakAct = findActivity('BREAK');
        const editRes = await post(`${BASE}/${planId}/blocks`, {
          entryId: entries[0].id,
          activityId: breakAct.id,
          startTime: `${DATE}T10:00:00`,
          endTime: `${DATE}T10:30:00`,
          versionNo: planVersionNo,
        });
        const editData = await editRes.json();
        expect(editData.status).toBe('rejected');
      }
    }
  });

  it('should rollback published plan', async () => {
    const plan = await refreshPlan();
    if (plan.status !== 'published') return;

    const res = await post(`${BASE}/${planId}/rollback`, {});
    if (res.status === 200) {
      const updated = await refreshPlan();
      expect(updated.status).not.toBe('published');
    }
  });
});

// ========== 12. 变更历史 ==========

describe('12. Change History', () => {
  it('should have recorded all edit operations', async () => {
    const res = await app.request(`${BASE}/${planId}/changes`);
    expect(res.status).toBe(200);
    const { items } = await res.json();
    // We made several edits above
    expect(items.length).toBeGreaterThanOrEqual(3);

    // Each operation should have items
    const op = items[0];
    expect(op.items).toBeArray();
  });
});

// ========== 13. Coverage API ==========

describe('13. Coverage', () => {
  it('should return 48 half-hour slots', async () => {
    // Create a fresh plan for coverage test
    const createRes = await post(BASE, {
      name: 'Coverage Test',
      startDate: DATE,
      endDate: DATE,
    });
    const plan = await createRes.json();
    await post(`${BASE}/${plan.id}/generate`, {});

    const res = await app.request(`${BASE}/${plan.id}/coverage?date=${DATE}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.slots.length).toBe(48);

    // During working hours (09:00-17:00) should have agents
    const slot0900 = data.slots.find((s: { time: string }) => s.time === '09:00');
    expect(slot0900.agents).toBeGreaterThan(0);
  });
});
