/**
 * CDP Seed — 从 business.db 的 subscribers 表导入到 CDP 表
 *
 * 幂等：使用 onConflictDoNothing()，可重复运行
 */
import { Database } from 'bun:sqlite';
import { fileURLToPath } from 'url';
import {
  db,
  cdpParties,
  cdpPartyIdentities,
  cdpContactPoints,
  cdpCustomerAccounts,
  cdpServiceSubscriptions,
  cdpPartySubscriptionRelations,
  cdpSourceRecordLinks,
  cdpCommunicationPreferences,
  cdpConsentRecords,
  cdpServiceSummaries,
  cdpCustomerProfiles,
  eq,
  and,
} from './db';
import { normalizeIdentityValue } from './routes/identity';

const TENANT_ID = 'default';
const SOURCE_SYSTEM = 'business_db';

// 打开 business.db（只读）
const businessDbPath =
  process.env.BUSINESS_DB_PATH ??
  fileURLToPath(new URL('../../data/business.db', import.meta.url));

const businessDb = new Database(businessDbPath, { readonly: true });

interface SubscriberRow {
  phone: string;
  name: string;
  gender: string;
  email: string | null;
  customer_tier: string;
  preferred_language: string;
  plan_id: string;
  plan_name: string | null;
  plan_type: string | null;
  status: string;
  balance: number;
  household_id: string | null;
  region: string | null;
  activated_at: string;
  contract_end_date: string | null;
  overdue_days: number;
}

const rows = businessDb.prepare(`
  SELECT
    s.phone, s.name, s.gender, s.email, s.customer_tier, s.preferred_language,
    s.plan_id, p.name as plan_name, p.plan_type,
    s.status, s.balance, s.household_id, s.region,
    s.activated_at, s.contract_end_date, s.overdue_days
  FROM subscribers s
  LEFT JOIN plans p ON s.plan_id = p.plan_id
`).all() as SubscriberRow[];

console.log(`[cdp-seed] Found ${rows.length} subscribers in business.db`);

let created = 0;
let skipped = 0;

for (const row of rows) {
  const partyId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const subscriptionId = crypto.randomUUID();
  const phoneNorm = normalizeIdentityValue('phone', row.phone);

  try {
    // 1. party
    await db.insert(cdpParties).values({
      party_id: partyId,
      tenant_id: TENANT_ID,
      party_type: 'customer',
      display_name: row.name,
      canonical_name: row.name,
      status: row.status === 'cancelled' ? 'inactive' : 'active',
    }).onConflictDoNothing();

    // 2. party_identity (phone)
    await db.insert(cdpPartyIdentities).values({
      party_identity_id: crypto.randomUUID(),
      tenant_id: TENANT_ID,
      party_id: partyId,
      identity_type: 'phone',
      identity_value: row.phone,
      identity_value_norm: phoneNorm,
      source_system: SOURCE_SYSTEM,
      verified_flag: true,
      primary_flag: true,
      status: 'active',
    }).onConflictDoNothing();

    // 3. contact_point (phone)
    await db.insert(cdpContactPoints).values({
      contact_point_id: crypto.randomUUID(),
      tenant_id: TENANT_ID,
      party_id: partyId,
      contact_type: 'phone',
      contact_value: row.phone,
      contact_value_norm: phoneNorm,
      label: 'personal',
      preferred_flag: true,
      reachable_flag: true,
      verified_flag: true,
      status: 'active',
    }).onConflictDoNothing();

    // 4. contact_point (email, if exists)
    if (row.email) {
      const emailNorm = normalizeIdentityValue('email', row.email);
      await db.insert(cdpContactPoints).values({
        contact_point_id: crypto.randomUUID(),
        tenant_id: TENANT_ID,
        party_id: partyId,
        contact_type: 'email',
        contact_value: row.email,
        contact_value_norm: emailNorm,
        label: 'personal',
        preferred_flag: false,
        status: 'active',
      }).onConflictDoNothing();
    }

    // 5. customer_account
    const billingStatus = row.overdue_days > 0 ? 'overdue' : 'normal';
    const accountStatus = row.status === 'cancelled' ? 'closed'
      : row.status === 'suspended' ? 'suspended' : 'active';

    await db.insert(cdpCustomerAccounts).values({
      customer_account_id: accountId,
      tenant_id: TENANT_ID,
      account_no: row.phone,
      account_type: 'personal',
      account_status: accountStatus,
      billing_status: billingStatus,
      currency_code: 'CNY',
      risk_level: row.customer_tier === 'delinquent' ? 'high' : null,
      source_system: SOURCE_SYSTEM,
      snapshot_json: JSON.stringify({
        balance: row.balance,
        overdue_days: row.overdue_days,
        customer_tier: row.customer_tier,
        region: row.region,
      }),
    }).onConflictDoNothing();

    // 6. service_subscription
    await db.insert(cdpServiceSubscriptions).values({
      service_subscription_id: subscriptionId,
      tenant_id: TENANT_ID,
      customer_account_id: accountId,
      subscription_no: row.phone,
      subscription_type: row.plan_type ?? 'mobile',
      service_identifier: row.phone,
      plan_code: row.plan_id,
      service_status: row.status === 'cancelled' ? 'terminated'
        : row.status === 'suspended' ? 'suspended' : 'active',
      start_at: row.activated_at ? new Date(row.activated_at) : null,
      end_at: row.contract_end_date ? new Date(row.contract_end_date) : null,
      source_system: SOURCE_SYSTEM,
      snapshot_json: JSON.stringify({
        plan_name: row.plan_name,
        plan_type: row.plan_type,
        household_id: row.household_id,
      }),
    }).onConflictDoNothing();

    // 7. party_subscription_relation
    await db.insert(cdpPartySubscriptionRelations).values({
      relation_id: crypto.randomUUID(),
      tenant_id: TENANT_ID,
      party_id: partyId,
      service_subscription_id: subscriptionId,
      relation_type: 'owner',
      primary_flag: true,
      status: 'active',
    }).onConflictDoNothing();

    // 8. source_record_link — lineage: subscriber → party
    await db.insert(cdpSourceRecordLinks).values({
      source_record_link_id: crypto.randomUUID(),
      tenant_id: TENANT_ID,
      source_system: SOURCE_SYSTEM,
      source_entity_type: 'subscriber',
      source_entity_id: row.phone,
      target_entity_type: 'party',
      target_entity_id: partyId,
      link_type: 'imported',
    }).onConflictDoNothing();

    // 9. customer_profile — 基础画像（含 gender、tier、language 等）
    await db.insert(cdpCustomerProfiles).values({
      customer_profile_id: crypto.randomUUID(),
      tenant_id: TENANT_ID,
      party_id: partyId,
      basic_profile_json: JSON.stringify({
        gender: row.gender,
        customer_tier: row.customer_tier,
        preferred_language: row.preferred_language,
        region: row.region,
      }),
      contact_profile_json: JSON.stringify({
        phone: row.phone,
        email: row.email,
      }),
      service_profile_json: JSON.stringify({
        plan_id: row.plan_id,
        plan_name: row.plan_name,
        plan_type: row.plan_type,
      }),
    }).onConflictDoNothing();

    created++;
  } catch (err) {
    // 唯一约束冲突说明已导入过
    if (err instanceof Error && err.message.includes('UNIQUE constraint')) {
      skipped++;
    } else {
      console.error(`[cdp-seed] Error for ${row.phone}:`, err);
    }
  }
}

// ── Phase 1b: 渠道 identity 映射（飞书 open_id / WhatsApp JID → party）──
// 这些映射让 CDP 能从任意渠道的外部 ID 解析到同一个客户

const channelIdentities: Array<{
  phone: string;
  identity_type: string;
  identity_value: string;
}> = [
  // 陈军: 飞书 + WhatsApp
  { phone: '13609796392', identity_type: 'feishu_open_id', identity_value: 'ou_210e97fbdab389fc711e4784262bc6b2' },
  { phone: '13609796392', identity_type: 'wa_id', identity_value: '8613609796392@s.whatsapp.net' },
  // 张三: WhatsApp（厄瓜多尔号码作为 bot，此处仅示例）
  { phone: '13800000001', identity_type: 'wa_id', identity_value: '8613800000001@s.whatsapp.net' },
];

let channelCreated = 0;
for (const ci of channelIdentities) {
  const phoneNorm = normalizeIdentityValue('phone', ci.phone);
  const identityRows = await db
    .select({ party_id: cdpPartyIdentities.party_id })
    .from(cdpPartyIdentities)
    .where(
      and(
        eq(cdpPartyIdentities.tenant_id, TENANT_ID),
        eq(cdpPartyIdentities.identity_type, 'phone'),
        eq(cdpPartyIdentities.identity_value_norm, phoneNorm),
      ),
    )
    .limit(1);

  if (identityRows.length === 0) {
    console.warn(`[cdp-seed] No party found for phone ${ci.phone}, skipping ${ci.identity_type}`);
    continue;
  }

  const norm = normalizeIdentityValue(ci.identity_type, ci.identity_value);
  await db.insert(cdpPartyIdentities).values({
    party_identity_id: crypto.randomUUID(),
    tenant_id: TENANT_ID,
    party_id: identityRows[0].party_id,
    identity_type: ci.identity_type,
    identity_value: ci.identity_value,
    identity_value_norm: norm,
    source_system: 'channel_host',
    verified_flag: true,
    primary_flag: false,
    status: 'active',
  }).onConflictDoNothing();

  channelCreated++;
}

console.log(`[cdp-seed] Channel identities: ${channelCreated} created`);

// ── Phase 2: 导入 customer_preferences → communication_preference + consent_record + service_summary ──

interface PreferenceRow {
  phone: string;
  marketing_opt_in: number;
  sms_opt_in: number;
  dnd: number;
  preferred_channel: string;
  contact_window_start: string;
  contact_window_end: string;
}

const prefRows = businessDb.prepare(`
  SELECT phone, marketing_opt_in, sms_opt_in, dnd, preferred_channel,
         contact_window_start, contact_window_end
  FROM customer_preferences
`).all() as PreferenceRow[];

console.log(`[cdp-seed] Found ${prefRows.length} customer_preferences in business.db`);

let prefCreated = 0;

for (const pref of prefRows) {
  // 找到对应的 party_id（通过 phone identity resolve）
  const phoneNorm = normalizeIdentityValue('phone', pref.phone);
  const identityRows = await db
    .select({ party_id: cdpPartyIdentities.party_id })
    .from(cdpPartyIdentities)
    .where(
      and(
        eq(cdpPartyIdentities.tenant_id, TENANT_ID),
        eq(cdpPartyIdentities.identity_type, 'phone'),
        eq(cdpPartyIdentities.identity_value_norm, phoneNorm),
      ),
    )
    .limit(1);

  if (identityRows.length === 0) continue;
  const partyId = identityRows[0].party_id;

  try {
    // channel preference
    await db.insert(cdpCommunicationPreferences).values({
      communication_preference_id: crypto.randomUUID(),
      tenant_id: TENANT_ID,
      party_id: partyId,
      preference_type: 'channel_preference',
      channel_type: pref.preferred_channel,
      preference_value: pref.preferred_channel,
      priority_order: 1,
      source_system: SOURCE_SYSTEM,
    }).onConflictDoNothing();

    // contact_time preference
    await db.insert(cdpCommunicationPreferences).values({
      communication_preference_id: crypto.randomUUID(),
      tenant_id: TENANT_ID,
      party_id: partyId,
      preference_type: 'contact_time',
      preference_value: `${pref.contact_window_start}-${pref.contact_window_end}`,
      source_system: SOURCE_SYSTEM,
    }).onConflictDoNothing();

    // DND preference
    if (pref.dnd) {
      await db.insert(cdpCommunicationPreferences).values({
        communication_preference_id: crypto.randomUUID(),
        tenant_id: TENANT_ID,
        party_id: partyId,
        preference_type: 'contact_frequency',
        preference_value: 'dnd',
        source_system: SOURCE_SYSTEM,
      }).onConflictDoNothing();
    }

    // consent: marketing (sms)
    await db.insert(cdpConsentRecords).values({
      consent_record_id: crypto.randomUUID(),
      tenant_id: TENANT_ID,
      party_id: partyId,
      channel_type: 'sms',
      purpose_type: 'marketing',
      consent_status: pref.marketing_opt_in && pref.sms_opt_in ? 'granted' : 'revoked',
      source_system: SOURCE_SYSTEM,
    }).onConflictDoNothing();

    // consent: service (phone)
    await db.insert(cdpConsentRecords).values({
      consent_record_id: crypto.randomUUID(),
      tenant_id: TENANT_ID,
      party_id: partyId,
      channel_type: 'phone',
      purpose_type: 'service',
      consent_status: pref.dnd ? 'revoked' : 'granted',
      source_system: SOURCE_SYSTEM,
    }).onConflictDoNothing();

    // service_summary — 从已导入的 subscription 数据汇总
    const subRows = await db
      .select()
      .from(cdpServiceSubscriptions)
      .innerJoin(
        cdpPartySubscriptionRelations,
        eq(cdpServiceSubscriptions.service_subscription_id, cdpPartySubscriptionRelations.service_subscription_id),
      )
      .where(
        and(
          eq(cdpPartySubscriptionRelations.party_id, partyId),
          eq(cdpPartySubscriptionRelations.status, 'active'),
        ),
      );

    const activeSubs = subRows.filter(r => r.cdp_service_subscriptions.service_status === 'active');
    const primarySub = subRows[0]?.cdp_service_subscriptions;
    const accountRows = primarySub
      ? await db.select().from(cdpCustomerAccounts).where(eq(cdpCustomerAccounts.customer_account_id, primarySub.customer_account_id)).limit(1)
      : [];
    const account = accountRows[0];

    await db.insert(cdpServiceSummaries).values({
      service_summary_id: crypto.randomUUID(),
      tenant_id: TENANT_ID,
      party_id: partyId,
      primary_account_id: account?.customer_account_id ?? null,
      active_subscription_count: activeSubs.length,
      primary_subscription_id: primarySub?.service_subscription_id ?? null,
      service_status: activeSubs.length === subRows.length ? 'normal'
        : activeSubs.length > 0 ? 'partially_suspended' : 'suspended',
      billing_status: account?.billing_status ?? 'normal',
      delinquent_flag: account?.billing_status === 'overdue',
    }).onConflictDoNothing();

    prefCreated++;
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint')) {
      // already exists
    } else {
      console.error(`[cdp-seed] Error for preference ${pref.phone}:`, err);
    }
  }
}

businessDb.close();
console.log(`[cdp-seed] Done: ${created} subscribers, ${prefCreated} preferences/summaries imported`);

// ── Phase 6: 审计日志样本数据 ──────────────────────────────────────────────

import { cdpAuditLogs } from './db';

// 获取前 5 个 party 用于生成样本审计日志
const sampleParties = await db
  .select({ party_id: cdpParties.party_id, display_name: cdpParties.display_name })
  .from(cdpParties)
  .where(eq(cdpParties.tenant_id, TENANT_ID))
  .limit(5);

const auditActions: Array<{ object_type: string; action: string; operator_name: string }> = [
  { object_type: 'party', action: 'create', operator_name: '系统导入' },
  { object_type: 'party', action: 'update', operator_name: '张运营' },
  { object_type: 'consent', action: 'update', operator_name: '李合规' },
  { object_type: 'party', action: 'blacklist', operator_name: '王风控' },
  { object_type: 'party', action: 'merge', operator_name: '赵数据' },
];

let auditCreated = 0;
for (let i = 0; i < sampleParties.length; i++) {
  const party = sampleParties[i];
  const audit = auditActions[i % auditActions.length];
  try {
    await db.insert(cdpAuditLogs).values({
      audit_log_id: crypto.randomUUID(),
      tenant_id: TENANT_ID,
      object_type: audit.object_type,
      object_id: party.party_id,
      action: audit.action,
      operator_id: `staff_${i + 1}`,
      operator_name: audit.operator_name,
      before_value: audit.action === 'create' ? null : JSON.stringify({ display_name: party.display_name }),
      after_value: JSON.stringify({ display_name: party.display_name, status: 'active' }),
    }).onConflictDoNothing();
    auditCreated++;
  } catch {
    // skip duplicates
  }
}

console.log(`[cdp-seed] Audit logs: ${auditCreated} created`);

// ── Phase 6b: 标签 + 标签关系 + 黑名单 ────────────────────────────────────

import { cdpTags, cdpPartyTags, cdpBlacklist, count } from './db';

const TAG_DEFS: Array<{ tag_name: string; tag_category: string; tag_type: string; description: string }> = [
  { tag_name: '高价值客户', tag_category: '业务标签', tag_type: 'manual', description: '累计消费 Top 10%' },
  { tag_name: 'VIP', tag_category: '业务标签', tag_type: 'manual', description: 'VIP 等级客户' },
  { tag_name: '近30天活跃', tag_category: '行为标签', tag_type: 'rule', description: '近30天有登录或交易行为' },
  { tag_name: '流失预警', tag_category: '模型标签', tag_type: 'model', description: '流失概率 > 60%' },
  { tag_name: '欠费用户', tag_category: '业务标签', tag_type: 'rule', description: '当前有欠费记录' },
  { tag_name: '新注册', tag_category: '行为标签', tag_type: 'rule', description: '注册时间在30天内' },
  { tag_name: '家庭套餐', tag_category: '业务标签', tag_type: 'manual', description: '使用家庭共享套餐' },
  { tag_name: '投诉客户', tag_category: '业务标签', tag_type: 'manual', description: '近90天有投诉记录' },
  { tag_name: '高频来电', tag_category: '行为标签', tag_type: 'rule', description: '近7天来电 ≥ 3 次' },
  { tag_name: '营销敏感', tag_category: '模型标签', tag_type: 'model', description: '营销响应概率 > 40%' },
];

const tagIdMap = new Map<string, string>();
let tagCreated = 0;

for (const def of TAG_DEFS) {
  const tag_id = crypto.randomUUID();
  try {
    await db.insert(cdpTags).values({
      tag_id,
      tenant_id: TENANT_ID,
      tag_name: def.tag_name,
      tag_category: def.tag_category,
      tag_type: def.tag_type,
      description: def.description,
      created_by: 'seed',
    }).onConflictDoNothing();
    tagIdMap.set(def.tag_name, tag_id);
    tagCreated++;
  } catch {
    // skip
  }
}

// 为前 10 个 party 随机分配标签
const partyIdsForTags = await db
  .select({ party_id: cdpParties.party_id })
  .from(cdpParties)
  .where(eq(cdpParties.tenant_id, TENANT_ID))
  .limit(10);

let ptCreated = 0;
const tagIds = [...tagIdMap.values()];
for (const { party_id } of partyIdsForTags) {
  // 每个 party 分配 2-3 个随机标签
  const count = 2 + Math.floor(Math.random() * 2);
  const shuffled = tagIds.slice().sort(() => Math.random() - 0.5).slice(0, count);
  for (const tid of shuffled) {
    try {
      await db.insert(cdpPartyTags).values({
        party_tag_id: crypto.randomUUID(),
        tenant_id: TENANT_ID,
        party_id,
        tag_id: tid,
        source: 'seed',
      }).onConflictDoNothing();
      ptCreated++;
    } catch {
      // skip
    }
  }
}

// 更新标签覆盖人数
for (const [, tid] of tagIdMap) {
  const result = await db
    .select({ value: count() })
    .from(cdpPartyTags)
    .where(and(eq(cdpPartyTags.tenant_id, TENANT_ID), eq(cdpPartyTags.tag_id, tid)));
  await db.update(cdpTags)
    .set({ cover_count: result[0]?.value ?? 0 })
    .where(eq(cdpTags.tag_id, tid));
}

// 黑名单：3 条记录
const partyIdsForBl = partyIdsForTags.slice(0, 3);
const blReasons = ['恶意投诉', '欺诈行为', '高频骚扰'];
let blCreated = 0;

for (let i = 0; i < partyIdsForBl.length; i++) {
  try {
    await db.insert(cdpBlacklist).values({
      blacklist_id: crypto.randomUUID(),
      tenant_id: TENANT_ID,
      party_id: partyIdsForBl[i].party_id,
      reason: blReasons[i],
      source: 'seed',
      operator_id: 'staff_risk',
      operator_name: '王风控',
    }).onConflictDoNothing();
    blCreated++;
  } catch {
    // skip
  }
}

console.log(`[cdp-seed] Tags: ${tagCreated} tags, ${ptCreated} party-tags, ${blCreated} blacklist records`);

// ── Phase 6c: 生命周期阶段 + 分群 + 导入导出任务 ────────────────────────

import { cdpLifecycleStages, cdpPartyLifecycle, cdpSegments, cdpSegmentMembers, cdpImportExportTasks } from './db';

const LIFECYCLE_STAGES = [
  { stage_name: '潜客', stage_order: 1, color: '#94a3b8', description: '未注册或未产生交易的客户' },
  { stage_name: '新客', stage_order: 2, color: '#60a5fa', description: '注册30天内的客户' },
  { stage_name: '活跃', stage_order: 3, color: '#34d399', description: '近30天有活跃行为的客户' },
  { stage_name: '沉默', stage_order: 4, color: '#fbbf24', description: '30-90天无活跃行为的客户' },
  { stage_name: '流失', stage_order: 5, color: '#f87171', description: '90天以上无活跃行为的客户' },
];

const stageIdMap = new Map<string, string>();
let stageCreated = 0;

for (const def of LIFECYCLE_STAGES) {
  const stage_id = crypto.randomUUID();
  try {
    await db.insert(cdpLifecycleStages).values({
      stage_id,
      tenant_id: TENANT_ID,
      stage_name: def.stage_name,
      stage_order: def.stage_order,
      color: def.color,
      description: def.description,
    }).onConflictDoNothing();
    stageIdMap.set(def.stage_name, stage_id);
    stageCreated++;
  } catch { /* skip */ }
}

// 将前 10 个 party 分配到生命周期阶段
const stageIds = [...stageIdMap.values()];
let plCreated = 0;
for (let i = 0; i < partyIdsForTags.length && stageIds.length > 0; i++) {
  const stageId = stageIds[i % stageIds.length];
  try {
    await db.insert(cdpPartyLifecycle).values({
      party_lifecycle_id: crypto.randomUUID(),
      tenant_id: TENANT_ID,
      party_id: partyIdsForTags[i].party_id,
      stage_id: stageId,
    }).onConflictDoNothing();
    plCreated++;
  } catch { /* skip */ }
}

// 创建 2 个分群
const SEGMENT_DEFS = [
  { segment_name: '高价值活跃客户', segment_type: 'dynamic', description: '等级 Gold 以上且近30天活跃', conditions: { tier: ['gold', 'platinum'], active_30d: true } },
  { segment_name: '流失预警名单', segment_type: 'static', description: '手动导入的流失预警客户', conditions: null },
];

let segCreated = 0;
for (const def of SEGMENT_DEFS) {
  const segment_id = crypto.randomUUID();
  try {
    await db.insert(cdpSegments).values({
      segment_id,
      tenant_id: TENANT_ID,
      segment_name: def.segment_name,
      segment_type: def.segment_type,
      description: def.description,
      conditions: def.conditions ? JSON.stringify(def.conditions) : null,
      status: 'active',
      created_by: 'seed',
    }).onConflictDoNothing();

    // 为静态分群添加成员
    if (def.segment_type === 'static') {
      for (const { party_id } of partyIdsForTags.slice(0, 5)) {
        await db.insert(cdpSegmentMembers).values({
          member_id: crypto.randomUUID(),
          tenant_id: TENANT_ID,
          segment_id,
          party_id,
        }).onConflictDoNothing();
      }
      await db.update(cdpSegments).set({ estimated_count: 5 }).where(eq(cdpSegments.segment_id, segment_id));
    }
    segCreated++;
  } catch { /* skip */ }
}

// 导入导出任务样本
try {
  await db.insert(cdpImportExportTasks).values({
    task_id: crypto.randomUUID(),
    tenant_id: TENANT_ID,
    task_type: 'import',
    task_name: '客户数据首次导入',
    status: 'success',
    file_name: 'customers_2026Q1.xlsx',
    total_count: 500,
    success_count: 498,
    fail_count: 2,
    fail_detail: JSON.stringify([{ row: 123, reason: '手机号格式错误' }, { row: 456, reason: '重复记录' }]),
    operator_id: 'staff_1',
    operator_name: '张运营',
    finished_at: new Date(),
  }).onConflictDoNothing();

  await db.insert(cdpImportExportTasks).values({
    task_id: crypto.randomUUID(),
    tenant_id: TENANT_ID,
    task_type: 'export',
    task_name: '活跃客户导出',
    status: 'success',
    file_name: 'active_customers_export.csv',
    total_count: 200,
    success_count: 200,
    fail_count: 0,
    operator_id: 'staff_2',
    operator_name: '李合规',
    finished_at: new Date(),
  }).onConflictDoNothing();
} catch { /* skip */ }

console.log(`[cdp-seed] Lifecycle: ${stageCreated} stages, ${plCreated} assignments`);
console.log(`[cdp-seed] Segments: ${segCreated} segments, Import/Export: 2 tasks`);
