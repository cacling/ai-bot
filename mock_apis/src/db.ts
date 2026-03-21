/**
 * DB 连接 — 复用 shared-db 的 business schema
 */
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as businessSchema from "@ai-bot/shared-db/schema/business";

const dbPath = process.env.SQLITE_PATH ?? path.resolve(import.meta.dirname, "../../data/telecom.db");
const client = createClient({ url: `file:${dbPath}` });

export const db = drizzle(client, { schema: businessSchema });
export const { subscribers, bills, callbackTasks } = businessSchema;
export { eq, and } from "drizzle-orm";
