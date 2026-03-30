/**
 * DB 连接 — 复用 shared-db 的 workorder schema
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as workorderSchema from "@ai-bot/shared-db/schema/workorder";

const dbUrl = process.env.SQLITE_PATH
  ? (process.env.SQLITE_PATH.startsWith("file:") ? process.env.SQLITE_PATH : `file:${process.env.SQLITE_PATH}`)
  : new URL("../../data/telecom.db", import.meta.url).href;

const client = createClient({ url: dbUrl });

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
