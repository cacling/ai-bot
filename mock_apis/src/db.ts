/**
 * DB 连接 — 复用 shared-db 的 business schema
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as businessSchema from "@ai-bot/shared-db/schema/business";

const dbUrl = process.env.SQLITE_PATH
  ? (process.env.SQLITE_PATH.startsWith("file:") ? process.env.SQLITE_PATH : `file:${process.env.SQLITE_PATH}`)
  : new URL("../../data/telecom.db", import.meta.url).href;

const client = createClient({ url: dbUrl });

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
