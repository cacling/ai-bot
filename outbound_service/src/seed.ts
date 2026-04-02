/**
 * Outbound Service Seed — 从 business.db + platform.db 导入数据 + 创建 test_personas
 *
 * 运行前提：
 *   1. outbound.db 已通过 drizzle-kit push 创建表结构
 *   2. business.db 和 platform.db 已 seed
 *   3. cdp_service 已启动（用于 phone → party_id 解析）
 */
import { Database } from 'bun:sqlite';
import { fileURLToPath } from 'url';
import {
  db, obCampaigns, obTasks, obCallResults, obSmsEvents,
  obHandoffCases, obMarketingResults, obCallbackTasks, obTestPersonas,
} from './db';

const CDP_BASE = `http://localhost:${process.env.CDP_SERVICE_PORT ?? 18020}/api/cdp`;

const businessDbPath = process.env.BUSINESS_DB_PATH ??
  fileURLToPath(new URL('../../mock_apis/data/business.db', import.meta.url));
const platformDbPath = process.env.PLATFORM_DB_PATH ??
  fileURLToPath(new URL('../../backend/data/platform.db', import.meta.url));

// ── 辅助 ──────────────────────────────────────────────────────────────────

/** 通过 CDP identity resolve API 将 phone 解析为 party_id */
async function resolvePartyId(phone: string): Promise<string | null> {
  try {
    const res = await fetch(`${CDP_BASE}/identity/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity_type: 'phone', identity_value: phone }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { resolved: boolean; party_id?: string };
    return data.resolved ? (data.party_id ?? null) : null;
  } catch {
    return null;
  }
}

// ── 主流程 ────────────────────────────────────────────────────────────────

async function seed() {
  console.log('[outbound-seed] Opening source databases...');

  const businessDb = new Database(businessDbPath, { readonly: true });
  const platformDb = new Database(platformDbPath, { readonly: true });

  // ── 1. 营销活动 ← offers_campaigns ────────────────────────────────────

  console.log('[outbound-seed] Importing campaigns...');
  db.delete(obCampaigns).run();
  const campaigns = businessDb.prepare('SELECT * FROM offers_campaigns').all() as Array<Record<string, unknown>>;
  if (campaigns.length > 0) {
    db.insert(obCampaigns).values(campaigns.map(c => ({
      campaign_id: c.campaign_id as string,
      campaign_name: c.campaign_name as string,
      offer_type: c.offer_type as string,
      status: c.status as string,
      headline: c.headline as string,
      benefit_summary: c.benefit_summary as string,
      target_segment: c.target_segment as string,
      recommended_plan_id: c.recommended_plan_id as string | null,
      price_delta: c.price_delta as number | null,
      valid_from: c.valid_from as string,
      valid_until: c.valid_until as string,
    }))).run();
    console.log(`[outbound-seed]   → ${campaigns.length} campaigns`);
  }

  // ── 2. 外呼任务 ← outbound_tasks ─────────────────────────────────────

  console.log('[outbound-seed] Importing tasks...');
  db.delete(obTasks).run();
  const tasks = platformDb.prepare('SELECT * FROM outbound_tasks').all() as Array<Record<string, unknown>>;
  if (tasks.length > 0) {
    db.insert(obTasks).values(tasks.map(t => ({
      id: t.id as string,
      phone: t.phone as string,
      task_type: t.task_type as string,
      label_zh: t.label_zh as string,
      label_en: t.label_en as string,
      data: t.data as string,
    }))).run();
    console.log(`[outbound-seed]   → ${tasks.length} tasks`);
  }

  // ── 3. 通话结果 ← outreach_call_results ───────────────────────────────

  console.log('[outbound-seed] Importing call results...');
  db.delete(obCallResults).run();
  const callResults = businessDb.prepare('SELECT * FROM outreach_call_results').all() as Array<Record<string, unknown>>;
  if (callResults.length > 0) {
    db.insert(obCallResults).values(callResults.map(r => ({
      result_id: r.result_id as string,
      task_id: r.task_id as string | null,
      phone: r.phone as string,
      result: r.result as string,
      remark: r.remark as string | null,
      callback_time: r.callback_time as string | null,
      ptp_date: r.ptp_date as string | null,
      created_at: r.created_at as string,
    }))).run();
    console.log(`[outbound-seed]   → ${callResults.length} call results`);
  }

  // ── 4. 短信事件 ← outreach_sms_events ─────────────────────────────────

  console.log('[outbound-seed] Importing SMS events...');
  db.delete(obSmsEvents).run();
  const smsEvents = businessDb.prepare('SELECT * FROM outreach_sms_events').all() as Array<Record<string, unknown>>;
  if (smsEvents.length > 0) {
    db.insert(obSmsEvents).values(smsEvents.map(e => ({
      event_id: e.event_id as string,
      phone: e.phone as string,
      sms_type: e.sms_type as string,
      context: e.context as string | null,
      status: e.status as string,
      reason: e.reason as string | null,
      sent_at: e.sent_at as string,
    }))).run();
    console.log(`[outbound-seed]   → ${smsEvents.length} SMS events`);
  }

  // ── 5. 转人工记录 ← outreach_handoff_cases ────────────────────────────

  console.log('[outbound-seed] Importing handoff cases...');
  db.delete(obHandoffCases).run();
  const handoffs = businessDb.prepare('SELECT * FROM outreach_handoff_cases').all() as Array<Record<string, unknown>>;
  if (handoffs.length > 0) {
    db.insert(obHandoffCases).values(handoffs.map(h => ({
      case_id: h.case_id as string,
      phone: h.phone as string,
      source_skill: h.source_skill as string,
      reason: h.reason as string,
      priority: h.priority as string,
      queue_name: h.queue_name as string,
      status: h.status as string,
      created_at: h.created_at as string,
    }))).run();
    console.log(`[outbound-seed]   → ${handoffs.length} handoff cases`);
  }

  // ── 6. 营销结果 ← outreach_marketing_results ──────────────────────────

  console.log('[outbound-seed] Importing marketing results...');
  db.delete(obMarketingResults).run();
  const mktResults = businessDb.prepare('SELECT * FROM outreach_marketing_results').all() as Array<Record<string, unknown>>;
  if (mktResults.length > 0) {
    db.insert(obMarketingResults).values(mktResults.map(r => ({
      record_id: r.record_id as string,
      campaign_id: r.campaign_id as string,
      phone: r.phone as string,
      result: r.result as string,
      callback_time: r.callback_time as string | null,
      is_dnd: (r.is_dnd as number) === 1,
      recorded_at: r.recorded_at as string,
    }))).run();
    console.log(`[outbound-seed]   → ${mktResults.length} marketing results`);
  }

  // ── 7. 回拨任务 ← callback_tasks ──────────────────────────────────────

  console.log('[outbound-seed] Importing callback tasks...');
  db.delete(obCallbackTasks).run();
  const callbacks = businessDb.prepare(
    "SELECT * FROM callback_tasks WHERE 1=1"
  ).all() as Array<Record<string, unknown>>;
  if (callbacks.length > 0) {
    db.insert(obCallbackTasks).values(callbacks.map(cb => ({
      task_id: cb.task_id as string,
      original_task_id: cb.original_task_id as string,
      customer_name: cb.customer_name as string,
      callback_phone: cb.callback_phone as string,
      preferred_time: cb.preferred_time as string,
      product_name: cb.product_name as string,
      status: cb.status as string,
    }))).run();
    console.log(`[outbound-seed]   → ${callbacks.length} callback tasks`);
  }

  // ── 8. 测试 Persona（phone → CDP party_id 解析）────────────────────────

  console.log('[outbound-seed] Creating test personas...');
  db.delete(obTestPersonas).run();

  const personaDefinitions = [
    // Inbound
    { id: 'U001', phone: '13800000001', category: 'inbound', task_id: null, sort_order: 0 },
    { id: 'U002', phone: '13800000002', category: 'inbound', task_id: null, sort_order: 1 },
    { id: 'U003', phone: '13800000003', category: 'inbound', task_id: null, sort_order: 2 },
    // Outbound Collection
    { id: 'C001', phone: '13900000001', category: 'outbound_collection', task_id: 'C001', sort_order: 0 },
    { id: 'C002', phone: '13900000002', category: 'outbound_collection', task_id: 'C002', sort_order: 1 },
    { id: 'C003', phone: '13900000003', category: 'outbound_collection', task_id: 'C003', sort_order: 2 },
    // Outbound Marketing
    { id: 'M001', phone: '13900000004', category: 'outbound_marketing', task_id: 'M001', sort_order: 0 },
    { id: 'M002', phone: '13900000005', category: 'outbound_marketing', task_id: 'M002', sort_order: 1 },
    { id: 'M003', phone: '13900000006', category: 'outbound_marketing', task_id: 'M003', sort_order: 2 },
  ];

  let resolved = 0;
  let unresolved = 0;
  for (const def of personaDefinitions) {
    const partyId = await resolvePartyId(def.phone);
    if (!partyId) {
      console.warn(`[outbound-seed]   ⚠ Cannot resolve party for ${def.id} (phone: ${def.phone}), using placeholder`);
      unresolved++;
    }
    db.insert(obTestPersonas).values({
      id: def.id,
      party_id: partyId ?? `unresolved:${def.phone}`,
      category: def.category,
      task_id: def.task_id,
      sort_order: def.sort_order,
    }).run();
    if (partyId) resolved++;
  }
  console.log(`[outbound-seed]   → ${resolved} resolved, ${unresolved} unresolved`);

  // ── 清理 ──────────────────────────────────────────────────────────────

  businessDb.close();
  platformDb.close();
  console.log('[outbound-seed] Done.');
}

seed().catch(err => {
  console.error('[outbound-seed] Fatal error:', err);
  process.exit(1);
});
