/**
 * DB 连接 — bun:sqlite，复用 shared-db 的 interaction schema
 */
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { fileURLToPath } from 'url';
import * as ixSchema from '@ai-bot/shared-db/schema/interaction';

const dbPath =
  process.env.INTERACTION_DB_PATH ??
  fileURLToPath(new URL('../data/interaction.db', import.meta.url));

const sqlite = new Database(dbPath, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA busy_timeout = 5000');

export const db = drizzle(sqlite, { schema: ixSchema });
export { sqlite };

// ── 表 re-export ──
export const {
  ixConversations,
  ixInteractions,
  ixInteractionEvents,
  ixOffers,
  ixAssignments,
  ixRoutingQueues,
  ixAgentPresence,
  // Phase 4: Public Engagement
  ixContentAssets,
  ixEngagementItems,
  ixTriageResults,
  ixModerationActions,
  // Phase 5: Plugin System
  ixPluginCatalog,
  ixPluginBindings,
  ixPluginExecutionLogs,
  // Phase 6: Routing Management
  ixRouteRules,
  ixRouteReplayTasks,
  ixRouteOperationAudit,
} = ixSchema;

export { eq, and, desc, asc, sql, count, or, inArray } from 'drizzle-orm';
