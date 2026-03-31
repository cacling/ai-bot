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
  email: string | null;
  customer_tier: string;
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
    s.phone, s.name, s.email, s.customer_tier,
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

businessDb.close();
console.log(`[cdp-seed] Done: ${created} created, ${skipped} skipped (already exist)`);
