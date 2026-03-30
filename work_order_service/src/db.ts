/**
 * DB 连接 — 复用 shared-db 的 workorder schema
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as workorderSchema from "@ai-bot/shared-db/schema/workorder";

const dbUrl = process.env.WORKORDER_DB_PATH
  ? (process.env.WORKORDER_DB_PATH.startsWith("file:") ? process.env.WORKORDER_DB_PATH : `file:${process.env.WORKORDER_DB_PATH}`)
  : new URL("../../data/workorder.db", import.meta.url).href;

const client = createClient({ url: dbUrl });
await client.execute('PRAGMA busy_timeout = 5000');

export const db = drizzle(client, { schema: workorderSchema });
export const {
  workItems,
  workOrders,
  appointments,
  tickets,
  tasks,
  workItemEvents,
  workItemRelations,
  workItemTemplates,
  workQueues,
  workItemCategories,
  workflowDefinitions,
  workflowRuns,
  workflowRunEvents,
  workItemIntakes,
  workItemDrafts,
  issueThreads,
  issueMergeReviews,
} = workorderSchema;
export { eq, and, desc, asc, sql } from "drizzle-orm";
