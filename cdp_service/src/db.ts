/**
 * DB 连接 — bun:sqlite，复用 shared-db 的 cdp schema
 */
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { fileURLToPath } from 'url';
import * as cdpSchema from '@ai-bot/shared-db/schema/cdp';

const dbPath =
  process.env.CDP_DB_PATH ??
  fileURLToPath(new URL('../data/cdp.db', import.meta.url));

const sqlite = new Database(dbPath, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA busy_timeout = 5000');

export const db = drizzle(sqlite, { schema: cdpSchema });
export { sqlite };

// ── 表 re-export ──
export const {
  cdpParties,
  cdpPartyIdentities,
  cdpContactPoints,
  cdpCustomerAccounts,
  cdpServiceSubscriptions,
  cdpPartySubscriptionRelations,
  // Phase 2
  cdpIdentityLinks,
  cdpSourceRecordLinks,
  cdpIdentityResolutionCases,
  // Phase 3
  cdpCommunicationPreferences,
  cdpConsentRecords,
  // Phase 4
  cdpCustomerProfiles,
  cdpServiceSummaries,
  cdpInteractionSummaries,
  // Phase 5
  cdpHouseholds,
  cdpCustomerEvents,
  // Phase 6: Customer Management
  cdpAuditLogs,
  cdpTags,
  cdpPartyTags,
  cdpBlacklist,
  cdpSegments,
  cdpSegmentMembers,
  cdpLifecycleStages,
  cdpPartyLifecycle,
  cdpImportExportTasks,
} = cdpSchema;

export { eq, and, desc, asc, sql, count, like, or, inArray } from 'drizzle-orm';
