/**
 * DB 连接 — 复用 shared-db 的 business schema
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as businessSchema from "@ai-bot/shared-db/schema/business";

const dbUrl = process.env.BUSINESS_DB_PATH
  ? (process.env.BUSINESS_DB_PATH.startsWith("file:") ? process.env.BUSINESS_DB_PATH : `file:${process.env.BUSINESS_DB_PATH}`)
  : new URL("../data/business.db", import.meta.url).href;

const client = createClient({ url: dbUrl });
await client.execute('PRAGMA busy_timeout = 5000');

export const db = drizzle(client, { schema: businessSchema });
export const {
  subscribers,
  bills,
  billingBillItems,
  billingDisputeCases,
  callbackTasks,
  plans,
  valueAddedServices,
  customerHouseholds,
  subscriberSubscriptions,
  deviceContexts,
  contracts,
  customerPreferences,
  identityOtpRequests,
  identityLoginEvents,
  paymentsTransactions,
  networkIncidents,
  offersCampaigns,
  invoiceRecords,
  ordersServiceOrders,
  ordersRefundRequests,
  outreachCallResults,
  outreachSmsEvents,
  outreachHandoffCases,
  outreachMarketingResults,
} = businessSchema;
export { eq, and } from "drizzle-orm";
