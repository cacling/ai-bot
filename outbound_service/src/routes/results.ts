/**
 * results.ts — 通话结果、营销结果、短信事件、转人工记录
 */
import { Hono } from 'hono';
import { db, obCallResults, obMarketingResults, obSmsEvents, obHandoffCases, eq, desc } from '../db';
import { signalTemporal } from '@ai-bot/shared-temporal';

const router = new Hono();

// ── 通话结果 ──────────────────────────────────────────────────────────────

router.post('/call-results', async (c) => {
  const body = await c.req.json();
  if (!body.phone || !body.result) {
    return c.json({ error: 'phone 和 result 必填' }, 400);
  }
  const resultId = body.result_id ?? `CALL-${Date.now()}`;
  db.insert(obCallResults).values({
    result_id: resultId,
    task_id: body.task_id ?? null,
    phone: body.phone,
    result: body.result,
    remark: body.remark ?? null,
    callback_time: body.callback_time ?? null,
    ptp_date: body.ptp_date ?? null,
    created_at: new Date().toISOString(),
  }).run();
  // Fire-and-forget: notify Temporal orchestrator of call result
  if (body.task_id) {
    signalTemporal(`/api/temporal/outbound/tasks/${body.task_id}/call-result`, {
      taskId: body.task_id, result: body.result, remark: body.remark,
      callbackTime: body.callback_time, ptpDate: body.ptp_date,
    });
  }
  return c.json({ ok: true, result_id: resultId }, 201);
});

router.get('/call-results', async (c) => {
  const taskId = c.req.query('task_id');
  const rows = taskId
    ? db.select().from(obCallResults).where(eq(obCallResults.task_id, taskId)).orderBy(desc(obCallResults.created_at)).all()
    : db.select().from(obCallResults).orderBy(desc(obCallResults.created_at)).all();
  return c.json({ results: rows });
});

// ── 营销结果 ──────────────────────────────────────────────────────────────

router.post('/marketing-results', async (c) => {
  const body = await c.req.json();
  if (!body.campaign_id || !body.phone || !body.result) {
    return c.json({ error: 'campaign_id, phone, result 必填' }, 400);
  }
  const recordId = body.record_id ?? `MKT-${Date.now()}`;
  db.insert(obMarketingResults).values({
    record_id: recordId,
    campaign_id: body.campaign_id,
    phone: body.phone,
    result: body.result,
    callback_time: body.callback_time ?? null,
    is_dnd: body.is_dnd ?? false,
    recorded_at: new Date().toISOString(),
  }).run();
  return c.json({ ok: true, record_id: recordId }, 201);
});

router.get('/marketing-results', async (c) => {
  const campaignId = c.req.query('campaign_id');
  const rows = campaignId
    ? db.select().from(obMarketingResults).where(eq(obMarketingResults.campaign_id, campaignId)).orderBy(desc(obMarketingResults.recorded_at)).all()
    : db.select().from(obMarketingResults).orderBy(desc(obMarketingResults.recorded_at)).all();
  return c.json({ results: rows });
});

// ── 短信事件 ──────────────────────────────────────────────────────────────

router.post('/sms-events', async (c) => {
  const body = await c.req.json();
  if (!body.phone || !body.sms_type || !body.status) {
    return c.json({ error: 'phone, sms_type, status 必填' }, 400);
  }
  const eventId = body.event_id ?? `SMS-${Date.now()}`;
  db.insert(obSmsEvents).values({
    event_id: eventId,
    phone: body.phone,
    sms_type: body.sms_type,
    context: body.context ?? null,
    status: body.status,
    reason: body.reason ?? null,
    sent_at: new Date().toISOString(),
  }).run();
  return c.json({ ok: true, event_id: eventId }, 201);
});

// ── 转人工记录 ────────────────────────────────────────────────────────────

router.post('/handoff-cases', async (c) => {
  const body = await c.req.json();
  if (!body.phone || !body.source_skill || !body.reason || !body.queue_name) {
    return c.json({ error: 'phone, source_skill, reason, queue_name 必填' }, 400);
  }
  const caseId = body.case_id ?? `HOF-${Date.now()}`;
  db.insert(obHandoffCases).values({
    case_id: caseId,
    phone: body.phone,
    source_skill: body.source_skill,
    reason: body.reason,
    priority: body.priority ?? 'medium',
    queue_name: body.queue_name,
    created_at: new Date().toISOString(),
  }).run();
  return c.json({ ok: true, case_id: caseId }, 201);
});

export default router;
