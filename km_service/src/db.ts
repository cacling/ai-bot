/**
 * DB 连接 — 使用 bun:sqlite（同步），复用 shared-db 的 km + platform schemas
 *
 * KM 路由使用 km_* 表，MCP/Skills 路由使用 platform 表。
 */
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { fileURLToPath } from 'url';
import * as kmSchema from '@ai-bot/shared-db/schema/km';
import * as platformSchema from '@ai-bot/shared-db/schema/platform';

const schema = { ...kmSchema, ...platformSchema };

const dbPath =
  process.env.SQLITE_PATH ??
  fileURLToPath(new URL('../data/km.db', import.meta.url));

const sqlite = new Database(dbPath, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
export { sqlite };

// ── KM 表 re-export ──
export const {
  kmDocuments,
  kmDocVersions,
  kmDocChunks,
  kmPipelineJobs,
  kmCandidates,
  kmEvidenceRefs,
  kmConflictRecords,
  kmReviewPackages,
  kmActionDrafts,
  kmAssets,
  kmAssetVersions,
  kmGovernanceTasks,
  kmRegressionWindows,
  kmAuditLogs,
  kmReplyFeedback,
  kmRetrievalEvalCases,
} = kmSchema;

// ── Platform 表 re-export（MCP/Skills 路由使用）──
export const {
  mcpServers,
  mcpTools,
  connectors,
  toolImplementations,
  executionRecords,
  skillRegistry,
  skillVersions,
  changeRequests,
  testCases,
  skillToolBindings,
  skillWorkflowSpecs,
  skillInstances,
  skillInstanceEvents,
  mcpPrompts,
  mcpServerSyncRuns,
} = platformSchema;

export { eq, and, desc, asc, sql, count, like, or, between, inArray } from 'drizzle-orm';
