/**
 * plan-edits.test.ts — 排班编辑 API 测试
 */
import { describe, it, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();
const PLANS = '/api/wfm/plans';

const json = (body: object) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

async function createAndGeneratePlan() {
  const createRes = await app.request(PLANS, json({
    name: `edit-api-${Date.now()}`,
    startDate: '2026-04-07',
    endDate: '2026-04-07',
  }));
  const plan = await createRes.json();

  await app.request(`${PLANS}/${plan.id}/generate`, { method: 'POST' });

  const planRes = await app.request(`${PLANS}/${plan.id}`);
  const updatedPlan = await planRes.json();

  const timelineRes = await app.request(`${PLANS}/${plan.id}/timeline?date=2026-04-07`);
  const { items: entries } = await timelineRes.json();

  return { plan: updatedPlan, entries };
}

/** 从 entry 的第一个块获取安全的中间时段（本地时间，无 Z 后缀） */
function getSafeRange(entry: any) {
  const blocks = entry.blocks || [];
  if (blocks.length === 0) return { startTime: '2026-04-07T10:00:00', endTime: '2026-04-07T10:30:00' };
  // Parse HH:MM from first block start, add 2h offset
  const m = blocks[0].startTime.match(/T(\d{2}):(\d{2})/);
  const baseH = m ? Number(m[1]) : 8;
  const date = blocks[0].startTime.slice(0, 10);
  const safeH = baseH + 2;
  return {
    startTime: `${date}T${String(safeH).padStart(2, '0')}:00:00`,
    endTime: `${date}T${String(safeH).padStart(2, '0')}:30:00`,
  };
}

describe('Preview API', () => {
  it('POST /plans/:id/changes/preview should return preview_ready', async () => {
    const { plan, entries } = await createAndGeneratePlan();
    if (entries.length === 0) return;

    const actRes = await app.request('/api/wfm/activities');
    const { items: acts } = await actRes.json();
    const meeting = acts.find((a: { code: string }) => a.code === 'MEETING');
    const range = getSafeRange(entries[0]);

    const res = await app.request(`${PLANS}/${plan.id}/changes/preview`, json({
      intentType: 'INSERT_ACTIVITY',
      entryId: entries[0].id,
      activityId: meeting.id,
      targetRange: range,
      versionNo: plan.versionNo,
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('preview_ready');
    expect(body.updatedBlocks).toBeArray();
  });
});

describe('Commit API', () => {
  it('POST /plans/:id/changes/commit should commit edit', async () => {
    const { plan, entries } = await createAndGeneratePlan();
    if (entries.length === 0) return;

    const actRes = await app.request('/api/wfm/activities');
    const { items: acts } = await actRes.json();
    const meeting = acts.find((a: { code: string }) => a.code === 'MEETING');
    const range = getSafeRange(entries[0]);

    const res = await app.request(`${PLANS}/${plan.id}/changes/commit`, json({
      intentType: 'INSERT_ACTIVITY',
      entryId: entries[0].id,
      activityId: meeting.id,
      targetRange: range,
      versionNo: plan.versionNo,
    }));

    const body = await res.json();
    expect(body.status).toBe('committed');
    expect(body.operationId).toBeGreaterThan(0);
    expect(body.versionNo).toBe(plan.versionNo + 1);
  });
});

describe('Block CRUD API', () => {
  it('POST /plans/:id/blocks should add block', async () => {
    const { plan, entries } = await createAndGeneratePlan();
    if (entries.length === 0) return;

    const actRes = await app.request('/api/wfm/activities');
    const { items: acts } = await actRes.json();
    const training = acts.find((a: { code: string }) => a.code === 'TRAINING');
    const range = getSafeRange(entries[0]);

    const res = await app.request(`${PLANS}/${plan.id}/blocks`, json({
      entryId: entries[0].id,
      activityId: training.id,
      startTime: range.startTime,
      endTime: range.endTime,
      versionNo: plan.versionNo,
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('committed');
  });

  it('DELETE /plans/:id/blocks/:blockId should delete block', async () => {
    const { plan, entries } = await createAndGeneratePlan();
    if (entries.length === 0) return;

    const breakBlock = entries[0].blocks.find((b: { activityCode: string }) => b.activityCode === 'BREAK');
    if (!breakBlock) return;

    const res = await app.request(
      `${PLANS}/${plan.id}/blocks/${breakBlock.id}?versionNo=${plan.versionNo}`,
      { method: 'DELETE' },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('committed');
  });
});

describe('Validate API', () => {
  it('POST /plans/:id/validate should return validation result', async () => {
    const { plan } = await createAndGeneratePlan();

    const res = await app.request(`${PLANS}/${plan.id}/validate`, json({ date: '2026-04-07' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('valid');
    expect(body).toHaveProperty('errors');
    expect(body).toHaveProperty('warnings');
  });
});

describe('Changes History', () => {
  it('GET /plans/:id/changes should list operations after commit', async () => {
    const { plan, entries } = await createAndGeneratePlan();
    if (entries.length === 0) return;

    const actRes = await app.request('/api/wfm/activities');
    const { items: acts } = await actRes.json();
    const meeting = acts.find((a: { code: string }) => a.code === 'MEETING');
    const range = getSafeRange(entries[0]);

    // Commit an edit
    await app.request(`${PLANS}/${plan.id}/changes/commit`, json({
      intentType: 'INSERT_ACTIVITY',
      entryId: entries[0].id,
      activityId: meeting.id,
      targetRange: range,
      versionNo: plan.versionNo,
    }));

    const res = await app.request(`${PLANS}/${plan.id}/changes`);
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].items).toBeArray();
  });
});
