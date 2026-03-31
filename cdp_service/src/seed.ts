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
