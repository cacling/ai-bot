/**
 * seed.ts — 初始化电信业务数据
 *
 * 将模拟数据写入 SQLite 数据库。
 * 运行方式：bun run db:seed
 *
 * 幂等设计：先清空再插入，可重复执行。
 */

import { db, sqlite, platformDb, platformSqlite } from './index';
import { eq } from 'drizzle-orm';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { fileURLToPath } from 'url';

// ── Business DB（独立 SQLite 文件，供 mock_apis 使用）───────────────────────
const businessDbPath =
  process.env.BUSINESS_DB_PATH ??
  fileURLToPath(new URL('../../../mock_apis/data/business.db', import.meta.url));
const businessSqlite = new Database(businessDbPath, { create: true });
businessSqlite.exec('PRAGMA journal_mode = WAL');
businessSqlite.exec('PRAGMA busy_timeout = 5000');
const businessDb = drizzle(businessSqlite);

// ── KM DB（km_service 独占：MCP tools/servers, skill registry/versions 等）──
const kmDbPath =
  process.env.SQLITE_PATH ??
  fileURLToPath(new URL('../../../km_service/data/km.db', import.meta.url));
const kmSqlite = new Database(kmDbPath, { create: true });
kmSqlite.exec('PRAGMA journal_mode = WAL');
kmSqlite.exec('PRAGMA busy_timeout = 5000');
const kmDb = drizzle(kmSqlite);
// E2E test cases (originally from tests/apitest/usecase/, inlined after directory removal)
const seededE2ECases = [
  // bill-inquiry
  { skill_name: 'bill-inquiry', input_message: '帮我查一下这个月账单总额和费用明细。', expected_keywords: JSON.stringify(['账单', '费用']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'bill-inquiry' }, { type: 'tool_called', value: 'query_bill' }]), persona_id: 'U001' },
  { skill_name: 'bill-inquiry', input_message: '这个月话费怎么突然高了这么多？帮我分析一下原因。', expected_keywords: JSON.stringify(['异常', '费用']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'bill-inquiry' }, { type: 'tool_called_any_of', value: 'analyze_bill_anomaly,query_bill' }]), persona_id: 'U001' },
  { skill_name: 'bill-inquiry', input_message: '我欠费停机了，帮我看看还欠多少，为什么会停机？', expected_keywords: JSON.stringify(['欠费', '停机']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'bill-inquiry' }, { type: 'tool_called_any_of', value: 'query_subscriber,query_bill,check_account_balance' }, { type: 'response_has_next_step', value: '' }]), persona_id: 'U003' },
  { skill_name: 'bill-inquiry', input_message: '帮我看一下上个月账单，顺便告诉我哪些费用可以开发票。', expected_keywords: JSON.stringify(['上个月', '发票']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'bill-inquiry' }, { type: 'tool_called', value: 'query_bill' }, { type: 'response_mentions_all', value: '账单,发票' }]), persona_id: 'U001' },
  { skill_name: 'bill-inquiry', input_message: '上个月国际漫游怎么会多扣这么多，帮我看看是不是异常。', expected_keywords: JSON.stringify(['漫游', '异常']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'bill-inquiry' }, { type: 'tool_called_any_of', value: 'query_bill,analyze_bill_anomaly' }, { type: 'response_mentions_any', value: '漫游包,漫游费,国际漫游,漫游' }]), persona_id: 'M003' },
  // plan-inquiry
  { skill_name: 'plan-inquiry', input_message: '帮我看看我现在适合什么套餐，顺便对比一下热门套餐。', expected_keywords: JSON.stringify(['套餐', '对比']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'plan-inquiry' }, { type: 'tool_called_any_of', value: 'query_plans,query_subscriber' }]), persona_id: 'U002' },
  { skill_name: 'plan-inquiry', input_message: '我每个月流量都不够用，按我现在的用量有没有更大的套餐推荐？', expected_keywords: JSON.stringify(['流量', '推荐']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'plan-inquiry' }, { type: 'tool_called_any_of', value: 'query_subscriber,query_plans' }, { type: 'response_has_next_step', value: '' }]), persona_id: 'M001' },
  { skill_name: 'plan-inquiry', input_message: '家庭融合套餐和我现在的个人套餐有什么区别？', expected_keywords: JSON.stringify(['家庭融合', '区别']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'plan-inquiry' }, { type: 'tool_called', value: 'query_plans' }]), persona_id: 'M002' },
  { skill_name: 'plan-inquiry', input_message: '先帮我看一下我现在套餐和流量用了多少，再推荐要不要升级。', expected_keywords: JSON.stringify(['流量', '升级']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'plan-inquiry' }, { type: 'tool_called', value: 'query_subscriber' }, { type: 'response_has_next_step', value: '' }]), persona_id: 'U001' },
  { skill_name: 'plan-inquiry', input_message: '我最近准备出国，有没有适合商务客户的漫游包或更合适的套餐？', expected_keywords: JSON.stringify(['出国', '漫游']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'plan-inquiry' }, { type: 'tool_called_any_of', value: 'query_plans,query_subscriber' }, { type: 'response_mentions_any', value: '漫游,出国,国际' }]), persona_id: 'M003' },
  // service-cancel
  { skill_name: 'service-cancel', input_message: '帮我把短信百条包退掉，我不需要了。', expected_keywords: JSON.stringify(['退订', '短信包']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'service-cancel' }, { type: 'tool_called_any_of', value: 'cancel_service,query_subscriber' }]), persona_id: 'U001' },
  { skill_name: 'service-cancel', input_message: '这个月多扣了一个视频会员费，你先帮我查清楚是什么，再决定要不要退。', expected_keywords: JSON.stringify(['视频会员', '多扣']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'service-cancel' }, { type: 'tool_called_any_of', value: 'query_bill,query_subscriber' }, { type: 'tool_not_called', value: 'cancel_service' }]), persona_id: 'U001' },
  { skill_name: 'service-cancel', input_message: '这个游戏加速包像是我误订的，帮我先看一下订购时间和能不能退款。', expected_keywords: JSON.stringify(['误订', '退款']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'service-cancel' }, { type: 'tool_called', value: 'query_subscriber' }, { type: 'response_mentions_any', value: '订购,退款,游戏加速' }]), persona_id: 'U003' },
  { skill_name: 'service-cancel', input_message: '国际漫游包我下个月不需要了，帮我按规则退掉。', expected_keywords: JSON.stringify(['漫游包', '下个月']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'service-cancel' }, { type: 'tool_called_any_of', value: 'cancel_service,query_subscriber' }]), persona_id: 'U002' },
  { skill_name: 'service-cancel', input_message: '先告诉我我现在订了哪些增值业务，再决定取消哪个。', expected_keywords: JSON.stringify(['增值业务', '取消']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'service-cancel' }, { type: 'tool_called', value: 'query_subscriber' }]), persona_id: 'U001' },
  { skill_name: 'service-cancel', input_message: '帮我把彩铃退掉', expected_keywords: JSON.stringify(['退订', '彩铃']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'service-cancel' }, { type: 'tool_called', before: 'query_subscriber' }, { type: 'tool_called_before', value: 'query_subscriber,cancel_service' }]), persona_id: 'U001' },
  { skill_name: 'service-cancel', input_message: '我这个月不知道为什么多扣了20块钱，查一下什么情况', expected_keywords: JSON.stringify(['扣费', '查询']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'service-cancel' }, { type: 'tool_called', value: 'query_bill' }, { type: 'tool_not_called', value: 'cancel_service' }]), persona_id: 'U001' },
  // fault-diagnosis
  { skill_name: 'fault-diagnosis', input_message: '我这边最近上网特别慢，帮我排查一下是不是网络有问题。', expected_keywords: JSON.stringify(['网络', '排查']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'fault-diagnosis' }, { type: 'tool_called', value: 'diagnose_network' }, { type: 'response_has_next_step', value: '' }]), persona_id: 'U001' },
  { skill_name: 'fault-diagnosis', input_message: '今天突然没信号，也打不了电话，能帮我看看吗？', expected_keywords: JSON.stringify(['没信号', '电话']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'fault-diagnosis' }, { type: 'tool_called', value: 'diagnose_network' }, { type: 'response_has_next_step', value: '' }]), persona_id: 'U003' },
  { skill_name: 'fault-diagnosis', input_message: '我突然上不了网了，像是区域故障，帮我查一下。', expected_keywords: JSON.stringify(['上不了网', '故障']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'fault-diagnosis' }, { type: 'tool_called', value: 'diagnose_network' }, { type: 'response_has_next_step', value: '' }]), persona_id: 'U002' },
  { skill_name: 'fault-diagnosis', input_message: '这两天打电话老是突然断线，你帮我查一下是手机问题还是网络问题。', expected_keywords: JSON.stringify(['断线', '网络']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'fault-diagnosis' }, { type: 'tool_called', value: 'diagnose_network' }, { type: 'response_has_next_step', value: '' }]), persona_id: 'M002' },
  { skill_name: 'fault-diagnosis', input_message: '我在境外漫游时一直上不了网，帮我看看是不是网络侧的问题。', expected_keywords: JSON.stringify(['漫游', '上不了网']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'fault-diagnosis' }, { type: 'tool_called', value: 'diagnose_network' }, { type: 'response_mentions_any', value: '漫游包,漫游,覆盖,网络' }]), persona_id: 'M003' },
  // telecom-app
  { skill_name: 'telecom-app', input_message: '我今天一直登录不上 APP，而且验证码来得特别慢。', expected_keywords: JSON.stringify(['登录', '验证码']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'telecom-app' }, { type: 'tool_called', value: 'diagnose_app' }]), persona_id: 'U003' },
  { skill_name: 'telecom-app', input_message: 'APP 提示我的账号被锁了，怎么处理？', expected_keywords: JSON.stringify(['账号', '锁定']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'telecom-app' }, { type: 'tool_called', value: 'diagnose_app' }]), persona_id: 'U003' },
  { skill_name: 'telecom-app', input_message: '系统提示我的登录环境异常，麻烦帮我看看是什么问题。', expected_keywords: JSON.stringify(['环境异常', '登录']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'telecom-app' }, { type: 'tool_called', value: 'diagnose_app' }]), persona_id: 'M003' },
  { skill_name: 'telecom-app', input_message: '我是不是因为欠费停机了，所以 APP 一直登不上？', expected_keywords: JSON.stringify(['欠费', '停机']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'telecom-app' }, { type: 'tool_called', value: 'query_subscriber' }]), persona_id: 'U003' },
  { skill_name: 'telecom-app', input_message: 'APP 版本是不是太旧了？我打开后老是报错闪退。', expected_keywords: JSON.stringify(['版本', '报错']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'telecom-app' }, { type: 'tool_called', value: 'diagnose_app' }]), persona_id: 'U001' },
  // outbound-collection
  { skill_name: 'outbound-collection', input_message: '我这周五之前会还，你把链接发我一下。', expected_keywords: JSON.stringify(['还款', '链接']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'outbound-collection' }, { type: 'tool_called', value: 'record_call_result' }, { type: 'tool_called', value: 'send_followup_sms' }, { type: 'not_contains', value: '法律后果' }, { type: 'not_contains', value: '起诉' }]), persona_id: 'C001' },
  { skill_name: 'outbound-collection', input_message: '金额太高了，我要人工和你们协商处理。', expected_keywords: JSON.stringify(['人工', '协商']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'outbound-collection' }, { type: 'tool_called', value: 'record_call_result' }, { type: 'tool_called', value: 'transfer_to_human' }, { type: 'not_contains', value: '信用记录' }]), persona_id: 'C002' },
  { skill_name: 'outbound-collection', input_message: '我现在不方便，明天下午三点你们再打给我。', expected_keywords: JSON.stringify(['回拨', '明天下午']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'outbound-collection' }, { type: 'tool_called', value: 'create_callback_task' }, { type: 'tool_called', value: 'record_call_result' }]), persona_id: 'C003' },
  { skill_name: 'outbound-collection', input_message: '我其实昨天已经交过费了，你们先去核实一下，不要一直催。', expected_keywords: JSON.stringify(['已经交过费', '核实']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'outbound-collection' }, { type: 'tool_called', value: 'record_call_result' }, { type: 'not_contains', value: '起诉' }, { type: 'not_contains', value: '法律后果' }]), persona_id: 'C001' },
  { skill_name: 'outbound-collection', input_message: '你打错了，这个号码不是本人。', expected_keywords: JSON.stringify(['不是本人']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'outbound-collection' }, { type: 'tool_called', value: 'record_call_result' }, { type: 'tool_not_called', value: 'send_followup_sms' }]), persona_id: 'C003' },
  { skill_name: 'outbound-collection', input_message: '好吧，我下周一还，发个还款链接给我。', expected_keywords: JSON.stringify(['还款', '链接']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'outbound-collection' }, { type: 'tool_called', value: 'record_call_result' }, { type: 'tool_called', value: 'send_followup_sms' }, { type: 'tool_called_before', value: 'record_call_result,send_followup_sms' }]), persona_id: 'C001' },
  // outbound-marketing
  { skill_name: 'outbound-marketing', input_message: '听起来可以，你把套餐详情发我，我自己去办。', expected_keywords: JSON.stringify(['套餐详情', '办理']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'outbound-marketing' }, { type: 'tool_called', value: 'send_followup_sms' }, { type: 'tool_called', value: 'record_marketing_result' }]), persona_id: 'M001' },
  { skill_name: 'outbound-marketing', input_message: '我先跟家里人商量一下，明天再联系我吧。', expected_keywords: JSON.stringify(['商量', '联系']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'outbound-marketing' }, { type: 'tool_called', value: 'send_followup_sms' }, { type: 'tool_called', value: 'record_marketing_result' }]), persona_id: 'M002' },
  { skill_name: 'outbound-marketing', input_message: '这个漫游套餐我有兴趣，但你帮我转人工确认一下细节。', expected_keywords: JSON.stringify(['漫游', '人工']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'outbound-marketing' }, { type: 'tool_called', value: 'transfer_to_human' }]), persona_id: 'M003' },
  { skill_name: 'outbound-marketing', input_message: '我对这个活动没兴趣，你帮我记录一下，别再推了。', expected_keywords: JSON.stringify(['没兴趣', '记录']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'outbound-marketing' }, { type: 'tool_called', value: 'record_marketing_result' }, { type: 'tool_not_called', value: 'send_followup_sms' }]), persona_id: 'M001' },
  { skill_name: 'outbound-marketing', input_message: '不要再给我打营销电话了，把我标成免打扰。', expected_keywords: JSON.stringify(['免打扰', '营销电话']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'outbound-marketing' }, { type: 'tool_called', value: 'record_marketing_result' }, { type: 'tool_not_called', value: 'send_followup_sms' }, { type: 'response_mentions_any', value: '免打扰,不再打扰,不再拨打' }]), persona_id: 'U002' },
];
import { seedReplyCopilotKnowledge } from './seed-reply-copilot';
import {
  bills,
  billingBillItems,
  billingDisputeCases,
  offersCampaigns,
  callbackTasks,
  contracts,
  customerHouseholds,
  customerPreferences,
  deviceContexts,
  outreachHandoffCases,
  identityLoginEvents,
  invoiceRecords,
  outreachMarketingResults,
  networkIncidents,
  identityOtpRequests,
  paymentsTransactions,
  ordersServiceOrders,
  ordersRefundRequests,
  outreachSmsEvents,
  outreachCallResults,
  testCases,
  testPersonas,
  outboundTasks,
  plans,
  subscriberSubscriptions,
  subscribers,
  valueAddedServices,
  users,
  kmDocuments,
  kmDocVersions,
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
  mcpServers,
  mcpTools,
  connectors,
  toolImplementations,
  skillRegistry,
  skillVersions,
  skillToolBindings,
  skillInstances,
  skillInstanceEvents,
  executionRecords,
  staffAccounts,
  staffSessions,
} from './schema';

/** 计算从 dueDate 到今天的逾期天数（负数表示还没到期） */
function calcOverdueDays(dueDate: string): number {
  const due = new Date(dueDate + 'T00:00:00+08:00');
  const today = new Date();
  const diffMs = today.getTime() - due.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/** 返回最近 n 个月的 YYYY-MM 字符串，[0] 为最近月，[1] 为上月，依此类推 */
function recentMonths(n: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    result.push(month);
  }
  return result;
}

function kmDocPath(name: string): string {
  return `data/km-documents/${name}`;
}

function ensureMockBackendTables() {
  businessSqlite.exec(`
    CREATE TABLE IF NOT EXISTS customer_households (
      household_id TEXT PRIMARY KEY,
      household_name TEXT NOT NULL,
      household_type TEXT NOT NULL DEFAULT 'individual',
      primary_phone TEXT,
      billing_group TEXT NOT NULL DEFAULT 'independent',
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS customer_preferences (
      phone TEXT PRIMARY KEY REFERENCES subscribers(phone) ON DELETE CASCADE,
      marketing_opt_in INTEGER NOT NULL DEFAULT 1,
      sms_opt_in INTEGER NOT NULL DEFAULT 1,
      dnd INTEGER NOT NULL DEFAULT 0,
      preferred_channel TEXT NOT NULL DEFAULT 'voice',
      contact_window_start TEXT NOT NULL DEFAULT '09:00',
      contact_window_end TEXT NOT NULL DEFAULT '20:30',
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS identity_otp_requests (
      request_id TEXT PRIMARY KEY,
      phone TEXT NOT NULL REFERENCES subscribers(phone) ON DELETE CASCADE,
      otp TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'sms',
      delivery_status TEXT NOT NULL DEFAULT 'sent',
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      trace_id TEXT
    );

    CREATE TABLE IF NOT EXISTS payments_transactions (
      payment_id TEXT PRIMARY KEY,
      phone TEXT NOT NULL REFERENCES subscribers(phone) ON DELETE CASCADE,
      month TEXT NOT NULL,
      amount REAL NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      posted INTEGER NOT NULL DEFAULT 0,
      paid_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS network_incidents (
      incident_id TEXT PRIMARY KEY,
      region TEXT NOT NULL,
      incident_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      affected_services TEXT NOT NULL DEFAULT '[]',
      start_time TEXT NOT NULL,
      end_time TEXT,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS offers_campaigns (
      campaign_id TEXT PRIMARY KEY,
      campaign_name TEXT NOT NULL,
      offer_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      headline TEXT NOT NULL,
      benefit_summary TEXT NOT NULL,
      target_segment TEXT NOT NULL,
      recommended_plan_id TEXT REFERENCES plans(plan_id),
      price_delta REAL,
      valid_from TEXT NOT NULL,
      valid_until TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoice_records (
      invoice_no TEXT PRIMARY KEY,
      phone TEXT NOT NULL REFERENCES subscribers(phone) ON DELETE CASCADE,
      month TEXT NOT NULL,
      total REAL NOT NULL,
      email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'issued',
      requested_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS billing_bill_items (
      line_id TEXT PRIMARY KEY,
      phone TEXT NOT NULL REFERENCES subscribers(phone) ON DELETE CASCADE,
      month TEXT NOT NULL,
      bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
      item_type TEXT NOT NULL,
      item_name TEXT NOT NULL,
      amount REAL NOT NULL,
      service_id TEXT,
      occurred_at TEXT NOT NULL,
      source_system TEXT NOT NULL DEFAULT 'mock_billing',
      disputable INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS billing_dispute_cases (
      case_id TEXT PRIMARY KEY,
      phone TEXT NOT NULL REFERENCES subscribers(phone) ON DELETE CASCADE,
      month TEXT NOT NULL,
      bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
      issue_category TEXT NOT NULL,
      description TEXT NOT NULL,
      claimed_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      resolution_summary TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS orders_service_orders (
      order_id TEXT PRIMARY KEY,
      order_type TEXT NOT NULL,
      phone TEXT NOT NULL REFERENCES subscribers(phone) ON DELETE CASCADE,
      service_id TEXT,
      service_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL,
      effective_at TEXT,
      requires_manual_review INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders_refund_requests (
      refund_id TEXT PRIMARY KEY,
      phone TEXT NOT NULL REFERENCES subscribers(phone) ON DELETE CASCADE,
      service_id TEXT,
      month TEXT,
      reason TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending_review',
      requested_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS identity_login_events (
      event_id TEXT PRIMARY KEY,
      phone TEXT NOT NULL REFERENCES subscribers(phone) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      result TEXT NOT NULL,
      failure_reason TEXT,
      device_label TEXT,
      ip_region TEXT,
      occurred_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outreach_call_results (
      result_id TEXT PRIMARY KEY,
      task_id TEXT,
      phone TEXT NOT NULL,
      result TEXT NOT NULL,
      remark TEXT,
      callback_time TEXT,
      ptp_date TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outreach_sms_events (
      event_id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      sms_type TEXT NOT NULL,
      context TEXT,
      status TEXT NOT NULL,
      reason TEXT,
      sent_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outreach_handoff_cases (
      case_id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      source_skill TEXT NOT NULL,
      reason TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      queue_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outreach_marketing_results (
      record_id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      result TEXT NOT NULL,
      callback_time TEXT,
      is_dnd INTEGER NOT NULL DEFAULT 0,
      recorded_at TEXT NOT NULL
    );
  `);
}

async function seed() {
  console.log('[seed] 开始初始化数据...');
  ensureMockBackendTables();

  // ── 1. 套餐 ─────────────────────────────────────────────────────────────────
  console.log('[seed] 写入套餐数据...');
  businessDb.delete(plans).run();
  businessDb.insert(plans).values([
    {
      plan_id: 'plan_10g',
      name: '基础 10G 套餐',
      plan_type: 'mobile',
      speed_tier: '4G',
      is_shareable: false,
      is_marketable: true,
      monthly_fee: 30,
      data_gb: 10,
      voice_min: 200,
      sms: 50,
      features: JSON.stringify(['免费来电显示', '语音信箱']),
      description: '适合轻度用户，满足日常通话与基础上网需求',
    },
    {
      plan_id: 'plan_50g',
      name: '畅享 50G 套餐',
      plan_type: 'mobile',
      speed_tier: '5G',
      is_shareable: false,
      is_marketable: true,
      monthly_fee: 50,
      data_gb: 50,
      voice_min: 500,
      sms: 100,
      features: JSON.stringify(['免费来电显示', '语音信箱', 'WiFi 热点共享']),
      description: '主流 5G 套餐，适合中度用户，兼顾流量和通话。',
    },
    {
      plan_id: 'plan_100g',
      name: '超值 100G 套餐',
      plan_type: 'mobile',
      speed_tier: '5G',
      is_shareable: false,
      is_marketable: true,
      monthly_fee: 88,
      data_gb: 100,
      voice_min: 1000,
      sms: 200,
      features: JSON.stringify(['免费来电显示', '语音信箱', 'WiFi 热点共享', '国内漫游免费']),
      description: '大流量套餐，适合经常刷视频或出差用户。',
    },
    {
      plan_id: 'plan_unlimited',
      name: '无限流量套餐',
      plan_type: 'mobile',
      speed_tier: '5G',
      is_shareable: true,
      is_marketable: true,
      monthly_fee: 128,
      data_gb: -1,
      voice_min: -1,
      sms: -1,
      features: JSON.stringify(['免费来电显示', '语音信箱', 'WiFi 热点共享', '国内漫游免费', '视频会员权益']),
      description: '旗舰无限套餐，面向高价值个人用户。',
    },
    {
      plan_id: 'plan_4g_99',
      name: '4G 畅享套餐 99 元',
      plan_type: 'mobile',
      speed_tier: '4G',
      is_shareable: false,
      is_marketable: true,
      monthly_fee: 99,
      data_gb: 100,
      voice_min: 300,
      sms: 100,
      features: JSON.stringify(['4G 全国流量', '100GB 定向包']),
      description: '典型存量 4G 套餐，适合 5G 升级营销。',
    },
    {
      plan_id: 'plan_personal_79',
      name: '个人套餐 79 元',
      plan_type: 'mobile',
      speed_tier: '4G',
      is_shareable: false,
      is_marketable: true,
      monthly_fee: 79,
      data_gb: 60,
      voice_min: 300,
      sms: 100,
      features: JSON.stringify(['个人 4G 套餐', '可叠加家庭融合权益']),
      description: '适合作为家庭融合升级的个人套餐基线。',
    },
    {
      plan_id: 'plan_business_159',
      name: '5G 商务套餐 159 元',
      plan_type: 'business',
      speed_tier: '5G',
      is_shareable: true,
      is_marketable: true,
      monthly_fee: 159,
      data_gb: 150,
      voice_min: 1200,
      sms: 300,
      features: JSON.stringify(['商务优先网络', '国际漫游折扣', '企业发票支持']),
      description: '面向商旅和企业客户的 5G 商务套餐。',
    },
    {
      plan_id: 'plan_family_299',
      name: '家庭融合套餐 299 元',
      plan_type: 'family',
      speed_tier: '5G',
      is_shareable: true,
      is_marketable: true,
      monthly_fee: 299,
      data_gb: 200,
      voice_min: -1,
      sms: 300,
      features: JSON.stringify(['最多 3 张副卡共享', '500M 宽带', '家庭亲情号']),
      description: '手机+宽带融合套餐，适合多成员家庭。',
    },
    {
      plan_id: 'plan_broadband_annual',
      name: '宽带包年套餐',
      plan_type: 'broadband',
      speed_tier: '500M',
      is_shareable: false,
      is_marketable: false,
      monthly_fee: 299,
      data_gb: 0,
      voice_min: 0,
      sms: 0,
      features: JSON.stringify(['500M 宽带', '年度一次性计费', '含上门维护']),
      description: '包年宽带类产品，用于催收和故障类场景。',
    },
    {
      plan_id: 'plan_data_59',
      name: '流量月包 59 元',
      plan_type: 'mobile',
      speed_tier: '5G',
      is_shareable: false,
      is_marketable: true,
      monthly_fee: 59,
      data_gb: 30,
      voice_min: 100,
      sms: 50,
      features: JSON.stringify(['30GB 通用流量', '适合数据型客户']),
      description: '低月租高流量月包，适合对价格敏感的数据型客户。',
    },
  ]).run();

  console.log('[seed] 写入营销活动数据...');
  businessDb.delete(offersCampaigns).run();
  businessDb.insert(offersCampaigns).values([
    {
      campaign_id: 'CMP-UP-100G',
      campaign_name: '畅享 50G 升级 100G',
      offer_type: 'plan_upgrade',
      status: 'active',
      headline: '本月升级 100G 套餐，首月减免 20 元',
      benefit_summary: '适合流量接近 50G 上限的用户，减少超额流量费用。',
      target_segment: '50G 套餐高流量用户',
      recommended_plan_id: 'plan_100g',
      price_delta: 38,
      valid_from: '2026-03-01',
      valid_until: '2026-03-31',
    },
    {
      campaign_id: 'CMP-ROAM-001',
      campaign_name: '春季境外漫游加油包',
      offer_type: 'roaming_pack',
      status: 'active',
      headline: '出境用户专享 5GB 漫游流量包',
      benefit_summary: '适合近期有漫游需求的用户，按包计费更划算。',
      target_segment: '近期有差旅/漫游需求用户',
      recommended_plan_id: null,
      price_delta: 10,
      valid_from: '2026-03-15',
      valid_until: '2026-04-15',
    },
    {
      campaign_id: 'CMP-FAMILY-001',
      campaign_name: '家庭融合副卡权益包',
      offer_type: 'family_bundle',
      status: 'active',
      headline: '主卡加副卡，共享家庭融合权益',
      benefit_summary: '适合多号码家庭，统一账单、共享流量。',
      target_segment: '多成员家庭 / 多号码客户',
      recommended_plan_id: 'plan_family_299',
      price_delta: 120,
      valid_from: '2026-03-10',
      valid_until: '2026-04-30',
    },
    {
      campaign_id: 'CMP-RET-001',
      campaign_name: '欠费用户复机挽留包',
      offer_type: 'retention',
      status: 'paused',
      headline: '补缴后赠送 3 天不限量流量',
      benefit_summary: '用于欠费停机后客户挽留。',
      target_segment: '欠费/停机用户',
      recommended_plan_id: null,
      price_delta: null,
      valid_from: '2026-03-01',
      valid_until: '2026-03-31',
    },
  ]).run();

  // ── 2. 增值业务 ──────────────────────────────────────────────────────────────
  console.log('[seed] 写入增值业务数据...');
  businessDb.delete(valueAddedServices).run();
  businessDb.insert(valueAddedServices).values([
    { service_id: 'video_pkg', name: '视频会员流量包（20GB/月）', monthly_fee: 20, effective_end: '次月1日00:00' },
    { service_id: 'sms_100', name: '短信百条包（100条/月）', monthly_fee: 5, effective_end: '次月1日00:00' },
    { service_id: 'roaming_pkg', name: '国际漫游安心包', monthly_fee: 30, effective_end: '次月1日00:00' },
    { service_id: 'game_pkg', name: '游戏加速包（10GB/月）', monthly_fee: 15, effective_end: '次月1日00:00' },
    { service_id: 'family_share', name: '家庭共享副卡权益包', monthly_fee: 30, effective_end: '次月1日00:00' },
  ]).run();

  // ── 3. 家庭 / 客户主档 ───────────────────────────────────────────────────────
  console.log('[seed] 写入客户家庭主数据...');
  businessDb.delete(subscriberSubscriptions).run();
  businessDb.delete(subscribers).run();
  businessDb.delete(customerHouseholds).run();
  businessDb.insert(customerHouseholds).values([
    {
      household_id: 'HH-001',
      household_name: '李四家庭',
      household_type: 'premium_family',
      primary_phone: '13800000002',
      billing_group: 'shared',
      notes: '高价值家庭主卡，适合家庭融合与副卡营销。',
    },
    {
      household_id: 'HH-002',
      household_name: '李华家庭',
      household_type: 'family_bundle',
      primary_phone: '13900000002',
      billing_group: 'consolidated',
      notes: '家庭融合客户，当前存在较高欠费与人工复核需求。',
    },
    {
      household_id: 'HH-003',
      household_name: '赵强商务账户',
      household_type: 'business_group',
      primary_phone: '13900000006',
      billing_group: 'corporate',
      notes: '商务客户，关注国际漫游和发票服务。',
    },
  ]).run();

  console.log('[seed] 写入用户主数据...');
  businessDb.insert(subscribers).values([
    { phone: '13800000001', name: '张三', gender: 'male', customer_tier: 'standard', preferred_language: 'zh-CN', id_type: '居民身份证', id_last4: '1234', plan_id: 'plan_50g', household_id: null, status: 'active', balance: 45.8, data_used_gb: 32.5, voice_used_min: 280, sms_used: 45, activated_at: '2023-06-15', contract_end_date: '2026-06-15', overdue_days: 0, email: 'zhangsan@example.com', region: '广州' },
    { phone: '13800000002', name: '李四', gender: 'female', customer_tier: 'vip', preferred_language: 'zh-CN', id_type: '居民身份证', id_last4: '5678', plan_id: 'plan_unlimited', household_id: 'HH-001', status: 'active', balance: 128.0, data_used_gb: 89.2, voice_used_min: 130, sms_used: 12, activated_at: '2022-11-01', contract_end_date: '2026-11-01', overdue_days: 0, email: 'lisi@example.com', region: '深圳' },
    { phone: '13800000003', name: '王五', gender: 'male', customer_tier: 'delinquent', preferred_language: 'zh-CN', id_type: '居民身份证', id_last4: '9012', plan_id: 'plan_10g', household_id: null, status: 'suspended', balance: -23.5, data_used_gb: 10, voice_used_min: 200, sms_used: 120, activated_at: '2024-01-20', contract_end_date: '2025-12-31', overdue_days: 25, email: 'wangwu@example.com', region: '北京' },
    { phone: '13900000001', name: '张明', gender: 'male', customer_tier: 'delinquent', preferred_language: 'zh-CN', id_type: '居民身份证', id_last4: '2301', plan_id: 'plan_broadband_annual', household_id: null, status: 'suspended', balance: -386.0, data_used_gb: 0, voice_used_min: 0, sms_used: 0, activated_at: '2025-04-01', contract_end_date: '2026-03-31', overdue_days: 30, email: 'zhangming@example.com', region: '广州' },
    { phone: '13900000002', name: '李华', gender: 'male', customer_tier: 'delinquent', preferred_language: 'zh-CN', id_type: '居民身份证', id_last4: '4502', plan_id: 'plan_family_299', household_id: 'HH-002', status: 'suspended', balance: -1280.0, data_used_gb: 186.0, voice_used_min: 820, sms_used: 30, activated_at: '2024-09-01', contract_end_date: '2026-09-01', overdue_days: 45, email: 'lihua@example.com', region: '成都' },
    { phone: '13900000003', name: '王芳', gender: 'female', customer_tier: 'delinquent', preferred_language: 'zh-CN', id_type: '居民身份证', id_last4: '7813', plan_id: 'plan_data_59', household_id: null, status: 'suspended', balance: -520.0, data_used_gb: 55.0, voice_used_min: 30, sms_used: 5, activated_at: '2025-05-01', contract_end_date: null, overdue_days: 15, email: 'wangfang@example.com', region: '南京' },
    { phone: '13900000004', name: '陈伟', gender: 'male', customer_tier: 'premium', preferred_language: 'zh-CN', id_type: '居民身份证', id_last4: '9924', plan_id: 'plan_4g_99', household_id: null, status: 'active', balance: 68.0, data_used_gb: 96.0, voice_used_min: 210, sms_used: 10, activated_at: '2024-03-01', contract_end_date: '2026-05-31', overdue_days: 0, email: 'chenwei@example.com', region: '广州' },
    { phone: '13900000005', name: '刘丽', gender: 'female', customer_tier: 'premium', preferred_language: 'zh-CN', id_type: '居民身份证', id_last4: '1185', plan_id: 'plan_personal_79', household_id: null, status: 'active', balance: 102.0, data_used_gb: 38.0, voice_used_min: 260, sms_used: 30, activated_at: '2024-07-12', contract_end_date: null, overdue_days: 0, email: 'liuli@example.com', region: '杭州' },
    { phone: '13900000006', name: '赵强', gender: 'male', customer_tier: 'premium', preferred_language: 'zh-CN', id_type: '居民身份证', id_last4: '6636', plan_id: 'plan_business_159', household_id: 'HH-003', status: 'active', balance: 260.0, data_used_gb: 72.0, voice_used_min: 480, sms_used: 8, activated_at: '2023-09-01', contract_end_date: '2026-09-01', overdue_days: 0, email: 'zhaoqiang@corp.example.com', region: '深圳' },
    { phone: '13609796392', name: '陈军', gender: 'male', customer_tier: 'standard', preferred_language: 'zh-CN', id_type: '居民身份证', id_last4: '8877', plan_id: 'plan_100g', household_id: null, status: 'active', balance: 66.5, data_used_gb: 58.3, voice_used_min: 150, sms_used: 20, activated_at: '2024-05-01', contract_end_date: '2026-05-01', overdue_days: 0, email: 'chenjun@example.com', region: '贵阳' },
  ]).run();

  const [m0, m1, m2] = recentMonths(3); // m0=本月, m1=上月, m2=上上月

  // ── 4. 用户已订增值业务 / 当前权益 ───────────────────────────────────────────
  console.log('[seed] 写入用户订阅关系...');
  businessDb.insert(subscriberSubscriptions).values([
    { phone: '13800000001', service_id: 'video_pkg', status: 'active', channel: 'app', subscribed_at: `${m2}-05T10:00:00+08:00`, effective_start: `${m2}-05T10:00:00+08:00`, effective_end: null, auto_renew: true, order_id: 'ORD-SUB-001' },
    { phone: '13800000001', service_id: 'sms_100', status: 'active', channel: 'app', subscribed_at: `${m1}-03T09:00:00+08:00`, effective_start: `${m1}-03T09:00:00+08:00`, effective_end: null, auto_renew: true, order_id: 'ORD-SUB-002' },
    { phone: '13800000002', service_id: 'video_pkg', status: 'active', channel: 'store', subscribed_at: `${m2}-01T08:00:00+08:00`, effective_start: `${m2}-01T08:00:00+08:00`, effective_end: null, auto_renew: true, order_id: 'ORD-SUB-003' },
    { phone: '13800000002', service_id: 'roaming_pkg', status: 'active', channel: 'app', subscribed_at: `${m1}-12T12:00:00+08:00`, effective_start: `${m1}-12T12:00:00+08:00`, effective_end: null, auto_renew: true, order_id: 'ORD-SUB-004' },
    { phone: '13800000003', service_id: 'game_pkg', status: 'active', channel: 'app', subscribed_at: `${m2}-18T18:30:00+08:00`, effective_start: `${m2}-18T18:30:00+08:00`, effective_end: null, auto_renew: true, order_id: 'ORD-SUB-005' },
    { phone: '13900000002', service_id: 'family_share', status: 'active', channel: 'store', subscribed_at: `${m2}-20T11:20:00+08:00`, effective_start: `${m2}-20T11:20:00+08:00`, effective_end: null, auto_renew: true, order_id: 'ORD-SUB-006' },
    { phone: '13900000005', service_id: 'video_pkg', status: 'active', channel: 'app', subscribed_at: `${m1}-16T16:00:00+08:00`, effective_start: `${m1}-16T16:00:00+08:00`, effective_end: null, auto_renew: true, order_id: 'ORD-SUB-007' },
    { phone: '13900000006', service_id: 'roaming_pkg', status: 'active', channel: 'sales', subscribed_at: `${m0}-02T09:45:00+08:00`, effective_start: `${m0}-02T09:45:00+08:00`, effective_end: null, auto_renew: false, order_id: 'ORD-SUB-008' },
  ]).run();

  console.log('[seed] 写入客户偏好数据...');
  businessDb.delete(customerPreferences).run();
  businessDb.insert(customerPreferences).values([
    { phone: '13800000001', marketing_opt_in: true, sms_opt_in: true, dnd: false, preferred_channel: 'sms', contact_window_start: '09:00', contact_window_end: '20:30', notes: '愿意接收套餐升级和账单解释短信。' },
    { phone: '13800000002', marketing_opt_in: false, sms_opt_in: false, dnd: true, preferred_channel: 'app', contact_window_start: '10:00', contact_window_end: '18:00', notes: 'VIP 客户，除服务通知外不接受营销联系。' },
    { phone: '13800000003', marketing_opt_in: true, sms_opt_in: true, dnd: false, preferred_channel: 'voice', contact_window_start: '09:30', contact_window_end: '19:00', notes: '催缴和账单解释优先电话联系。' },
    { phone: '13900000001', marketing_opt_in: false, sms_opt_in: true, dnd: false, preferred_channel: 'voice', contact_window_start: '10:00', contact_window_end: '20:00', notes: '宽带包年客户，逾期催缴允许短信+电话。' },
    { phone: '13900000002', marketing_opt_in: false, sms_opt_in: true, dnd: false, preferred_channel: 'voice', contact_window_start: '09:00', contact_window_end: '18:30', notes: '家庭融合欠费客户，优先协商回款。' },
    { phone: '13900000003', marketing_opt_in: false, sms_opt_in: true, dnd: false, preferred_channel: 'voice', contact_window_start: '09:00', contact_window_end: '19:00', notes: '流量月包欠费客户，对价格敏感。' },
    { phone: '13900000004', marketing_opt_in: true, sms_opt_in: true, dnd: false, preferred_channel: 'voice', contact_window_start: '10:00', contact_window_end: '21:00', notes: '高流量 4G 客户，适合 5G 升级。' },
    { phone: '13900000005', marketing_opt_in: true, sms_opt_in: true, dnd: false, preferred_channel: 'voice', contact_window_start: '09:00', contact_window_end: '20:30', notes: '家庭融合潜客，接受语音沟通。' },
    { phone: '13900000006', marketing_opt_in: true, sms_opt_in: true, dnd: false, preferred_channel: 'sms', contact_window_start: '09:00', contact_window_end: '21:00', notes: '商务客户，可接受国际漫游和发票服务提醒。' },
    { phone: '13609796392', marketing_opt_in: true, sms_opt_in: true, dnd: false, preferred_channel: 'feishu', contact_window_start: '09:00', contact_window_end: '22:00', notes: '多渠道测试用户（WhatsApp + 飞书），偏好在线客服。飞书 open_id: ou_210e97fbdab389fc711e4784262bc6b2' },
  ]).run();

  // ── 4b. 合约（依赖用户）──────────────────────────────────────────────────────
  console.log('[seed] 写入合约数据...');
  businessDb.delete(contracts).run();
  businessDb.insert(contracts).values([
    { contract_id: 'CT001', phone: '13800000001', name: '24个月 50G 套餐合约', start_date: '2024-07-01', end_date: '2026-06-30', penalty: 200, risk_level: 'medium', status: 'active' },
    { contract_id: 'CT002', phone: '13800000002', name: 'VIP 无限流量承诺合约', start_date: '2024-11-01', end_date: '2026-11-01', penalty: 300, risk_level: 'high', status: 'active' },
    { contract_id: 'CT003', phone: '13800000003', name: '12个月宽带合约', start_date: '2025-01-20', end_date: '2026-01-19', penalty: 100, risk_level: 'medium', status: 'expired' },
    { contract_id: 'CT004', phone: '13900000001', name: '宽带包年承诺', start_date: '2025-04-01', end_date: '2026-03-31', penalty: 386, risk_level: 'high', status: 'active' },
    { contract_id: 'CT005', phone: '13900000002', name: '家庭融合 24 个月合约', start_date: '2024-09-01', end_date: '2026-09-01', penalty: 600, risk_level: 'high', status: 'active' },
    { contract_id: 'CT006', phone: '13900000004', name: '4G 套餐合约', start_date: '2024-06-01', end_date: '2026-05-31', penalty: 120, risk_level: 'medium', status: 'active' },
    { contract_id: 'CT007', phone: '13900000006', name: '5G 商务套餐企业协议', start_date: '2024-09-01', end_date: '2026-09-01', penalty: 300, risk_level: 'medium', status: 'active' },
  ]).run();

  // ── 5. 账单（依赖用户）──────────────────────────────────────────────────────
  console.log('[seed] 写入账单数据...');
  console.log(`[seed] 账单月份: ${m2}, ${m1}, ${m0}`);
  const mkBill = (phone: string, month: string, total: number, plan_fee: number, data_fee: number, voice_fee: number, sms_fee: number, value_added_fee: number, tax: number, status: 'paid' | 'unpaid' | 'overdue') => ({
    phone,
    month,
    total,
    plan_fee,
    data_fee,
    voice_fee,
    sms_fee,
    value_added_fee,
    tax,
    status,
  });
  businessDb.delete(bills).run();
  businessDb.insert(bills).values([
    mkBill('13800000001', m0, 88.0, 50.0, 10.0, 0.0, 0.0, 25.0, 3.0, 'paid'),
    mkBill('13800000001', m1, 79.5, 50.0, 12.5, 0.0, 0.0, 15.0, 2.0, 'paid'),
    mkBill('13800000001', m2, 58.0, 50.0, 0.0, 0.0, 0.0, 6.0, 2.0, 'paid'),
    mkBill('13800000002', m0, 158.0, 128.0, 0.0, 0.0, 0.0, 20.0, 10.0, 'paid'),
    mkBill('13800000002', m1, 168.0, 128.0, 0.0, 0.0, 0.0, 30.0, 10.0, 'paid'),
    mkBill('13800000002', m2, 158.0, 128.0, 0.0, 0.0, 0.0, 20.0, 10.0, 'paid'),
    mkBill('13800000003', m0, 36.0, 30.0, 0.0, 0.0, 0.0, 5.0, 1.0, 'overdue'),
    mkBill('13800000003', m1, 36.0, 30.0, 0.0, 0.0, 0.0, 5.0, 1.0, 'paid'),
    mkBill('13800000003', m2, 34.0, 30.0, 0.0, 1.0, 1.0, 1.0, 1.0, 'paid'),
    mkBill('13900000001', m0, 386.0, 299.0, 0.0, 0.0, 0.0, 80.0, 7.0, 'overdue'),
    mkBill('13900000001', m1, 299.0, 299.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'paid'),
    mkBill('13900000001', m2, 299.0, 299.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'paid'),
    mkBill('13900000002', m0, 640.0, 299.0, 120.0, 80.0, 0.0, 120.0, 21.0, 'overdue'),
    mkBill('13900000002', m1, 640.0, 299.0, 120.0, 80.0, 0.0, 120.0, 21.0, 'overdue'),
    mkBill('13900000002', m2, 299.0, 299.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'paid'),
    mkBill('13900000003', m0, 260.0, 59.0, 120.0, 0.0, 0.0, 70.0, 11.0, 'overdue'),
    mkBill('13900000003', m1, 260.0, 59.0, 120.0, 0.0, 0.0, 70.0, 11.0, 'unpaid'),
    mkBill('13900000003', m2, 59.0, 59.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'paid'),
    mkBill('13900000004', m0, 129.0, 99.0, 20.0, 0.0, 0.0, 0.0, 10.0, 'paid'),
    mkBill('13900000004', m1, 119.0, 99.0, 10.0, 0.0, 0.0, 0.0, 10.0, 'paid'),
    mkBill('13900000004', m2, 99.0, 99.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'paid'),
    mkBill('13900000005', m0, 179.0, 79.0, 0.0, 0.0, 0.0, 90.0, 10.0, 'paid'),
    mkBill('13900000005', m1, 169.0, 79.0, 0.0, 0.0, 0.0, 80.0, 10.0, 'paid'),
    mkBill('13900000005', m2, 159.0, 79.0, 0.0, 0.0, 0.0, 70.0, 10.0, 'paid'),
    mkBill('13900000006', m0, 257.0, 159.0, 50.0, 20.0, 0.0, 20.0, 8.0, 'paid'),
    mkBill('13900000006', m1, 239.0, 159.0, 40.0, 0.0, 0.0, 30.0, 10.0, 'paid'),
    mkBill('13900000006', m2, 159.0, 159.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'paid'),
    mkBill('13609796392', m0, 108.0, 88.0, 8.0, 0.0, 0.0, 8.0, 4.0, 'paid'),
    mkBill('13609796392', m1, 96.0, 88.0, 0.0, 0.0, 0.0, 5.0, 3.0, 'paid'),
    mkBill('13609796392', m2, 88.0, 88.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'paid'),
  ]).run();

  const billRows = businessDb.select().from(bills).all();
  const billIdByPhoneMonth = new Map(billRows.map((bill) => [`${bill.phone}:${bill.month}`, bill.id]));
  const findBillId = (phone: string, month: string) => billIdByPhoneMonth.get(`${phone}:${month}`) ?? null;

  console.log('[seed] 写入账单明细与争议数据...');
  businessDb.delete(billingBillItems).run();
  businessDb.delete(billingDisputeCases).run();
  businessDb.insert(billingBillItems).values([
    { line_id: `BLI-${m0}-001`, phone: '13800000001', month: m0, bill_id: findBillId('13800000001', m0), item_type: 'plan_fee', item_name: '畅享 50G 套餐月费', amount: 50, service_id: null, occurred_at: `${m0}-01T00:00:00+08:00`, source_system: 'billing_core', disputable: false },
    { line_id: `BLI-${m0}-002`, phone: '13800000001', month: m0, bill_id: findBillId('13800000001', m0), item_type: 'data_fee', item_name: '流量超额费', amount: 10, service_id: null, occurred_at: `${m0}-15T12:00:00+08:00`, source_system: 'billing_core', disputable: true },
    { line_id: `BLI-${m0}-003`, phone: '13800000001', month: m0, bill_id: findBillId('13800000001', m0), item_type: 'value_added_fee', item_name: '视频会员流量包（20GB/月）', amount: 20, service_id: 'video_pkg', occurred_at: `${m0}-03T09:00:00+08:00`, source_system: 'vas_center', disputable: true },
    { line_id: `BLI-${m0}-004`, phone: '13800000001', month: m0, bill_id: findBillId('13800000001', m0), item_type: 'value_added_fee', item_name: '短信百条包（100条/月）', amount: 5, service_id: 'sms_100', occurred_at: `${m0}-03T09:00:00+08:00`, source_system: 'vas_center', disputable: false },
    { line_id: `BLI-${m0}-005`, phone: '13800000001', month: m0, bill_id: findBillId('13800000001', m0), item_type: 'tax', item_name: '税费', amount: 3, service_id: null, occurred_at: `${m0}-28T23:00:00+08:00`, source_system: 'billing_core', disputable: false },
    { line_id: `BLI-${m0}-006`, phone: '13800000002', month: m0, bill_id: findBillId('13800000002', m0), item_type: 'plan_fee', item_name: '无限流量套餐月费', amount: 128, service_id: null, occurred_at: `${m0}-01T00:00:00+08:00`, source_system: 'billing_core', disputable: false },
    { line_id: `BLI-${m0}-007`, phone: '13800000002', month: m0, bill_id: findBillId('13800000002', m0), item_type: 'value_added_fee', item_name: '视频会员流量包（20GB/月）', amount: 20, service_id: 'video_pkg', occurred_at: `${m0}-02T10:00:00+08:00`, source_system: 'vas_center', disputable: false },
    { line_id: `BLI-${m0}-008`, phone: '13800000002', month: m0, bill_id: findBillId('13800000002', m0), item_type: 'tax', item_name: '税费', amount: 10, service_id: null, occurred_at: `${m0}-28T23:00:00+08:00`, source_system: 'billing_core', disputable: false },
    { line_id: `BLI-${m0}-009`, phone: '13800000003', month: m0, bill_id: findBillId('13800000003', m0), item_type: 'plan_fee', item_name: '基础 10G 套餐月费', amount: 30, service_id: null, occurred_at: `${m0}-01T00:00:00+08:00`, source_system: 'billing_core', disputable: false },
    { line_id: `BLI-${m0}-010`, phone: '13800000003', month: m0, bill_id: findBillId('13800000003', m0), item_type: 'value_added_fee', item_name: '游戏加速包（10GB/月）', amount: 5, service_id: 'game_pkg', occurred_at: `${m0}-10T09:30:00+08:00`, source_system: 'vas_center', disputable: true },
    { line_id: `BLI-${m0}-011`, phone: '13800000003', month: m0, bill_id: findBillId('13800000003', m0), item_type: 'tax', item_name: '税费', amount: 1, service_id: null, occurred_at: `${m0}-28T23:00:00+08:00`, source_system: 'billing_core', disputable: false },
    { line_id: `BLI-${m0}-012`, phone: '13900000001', month: m0, bill_id: findBillId('13900000001', m0), item_type: 'plan_fee', item_name: '宽带包年套餐', amount: 299, service_id: null, occurred_at: `${m0}-01T00:00:00+08:00`, source_system: 'broadband_core', disputable: false },
    { line_id: `BLI-${m0}-013`, phone: '13900000001', month: m0, bill_id: findBillId('13900000001', m0), item_type: 'value_added_fee', item_name: '逾期违约与恢复服务费', amount: 80, service_id: null, occurred_at: `${m0}-18T08:00:00+08:00`, source_system: 'collections', disputable: true },
    { line_id: `BLI-${m0}-014`, phone: '13900000001', month: m0, bill_id: findBillId('13900000001', m0), item_type: 'tax', item_name: '税费', amount: 7, service_id: null, occurred_at: `${m0}-28T23:00:00+08:00`, source_system: 'billing_core', disputable: false },
    { line_id: `BLI-${m0}-015`, phone: '13900000002', month: m0, bill_id: findBillId('13900000002', m0), item_type: 'plan_fee', item_name: '家庭融合套餐月费', amount: 299, service_id: null, occurred_at: `${m0}-01T00:00:00+08:00`, source_system: 'billing_core', disputable: false },
    { line_id: `BLI-${m0}-016`, phone: '13900000002', month: m0, bill_id: findBillId('13900000002', m0), item_type: 'data_fee', item_name: '家庭共享超额流量费', amount: 120, service_id: null, occurred_at: `${m0}-20T20:00:00+08:00`, source_system: 'billing_core', disputable: true },
    { line_id: `BLI-${m0}-017`, phone: '13900000002', month: m0, bill_id: findBillId('13900000002', m0), item_type: 'voice_fee', item_name: '国际长途语音费', amount: 80, service_id: null, occurred_at: `${m0}-21T18:00:00+08:00`, source_system: 'billing_core', disputable: true },
    { line_id: `BLI-${m0}-018`, phone: '13900000002', month: m0, bill_id: findBillId('13900000002', m0), item_type: 'value_added_fee', item_name: '家庭共享副卡权益包', amount: 120, service_id: 'family_share', occurred_at: `${m0}-01T00:00:00+08:00`, source_system: 'vas_center', disputable: false },
    { line_id: `BLI-${m0}-019`, phone: '13900000002', month: m0, bill_id: findBillId('13900000002', m0), item_type: 'tax', item_name: '税费', amount: 21, service_id: null, occurred_at: `${m0}-28T23:00:00+08:00`, source_system: 'billing_core', disputable: false },
    { line_id: `BLI-${m0}-020`, phone: '13900000003', month: m0, bill_id: findBillId('13900000003', m0), item_type: 'plan_fee', item_name: '流量月包月费', amount: 59, service_id: null, occurred_at: `${m0}-01T00:00:00+08:00`, source_system: 'billing_core', disputable: false },
    { line_id: `BLI-${m0}-021`, phone: '13900000003', month: m0, bill_id: findBillId('13900000003', m0), item_type: 'data_fee', item_name: '超额流量费', amount: 120, service_id: null, occurred_at: `${m0}-19T18:00:00+08:00`, source_system: 'billing_core', disputable: true },
    { line_id: `BLI-${m0}-022`, phone: '13900000003', month: m0, bill_id: findBillId('13900000003', m0), item_type: 'value_added_fee', item_name: '催缴处理费', amount: 70, service_id: null, occurred_at: `${m0}-20T09:00:00+08:00`, source_system: 'collections', disputable: true },
    { line_id: `BLI-${m0}-023`, phone: '13900000003', month: m0, bill_id: findBillId('13900000003', m0), item_type: 'tax', item_name: '税费', amount: 11, service_id: null, occurred_at: `${m0}-28T23:00:00+08:00`, source_system: 'billing_core', disputable: false },
    { line_id: `BLI-${m0}-024`, phone: '13900000004', month: m0, bill_id: findBillId('13900000004', m0), item_type: 'plan_fee', item_name: '4G 畅享套餐月费', amount: 99, service_id: null, occurred_at: `${m0}-01T00:00:00+08:00`, source_system: 'billing_core', disputable: false },
    { line_id: `BLI-${m0}-025`, phone: '13900000004', month: m0, bill_id: findBillId('13900000004', m0), item_type: 'data_fee', item_name: '超额流量费', amount: 20, service_id: null, occurred_at: `${m0}-23T21:00:00+08:00`, source_system: 'billing_core', disputable: false },
    { line_id: `BLI-${m0}-026`, phone: '13900000004', month: m0, bill_id: findBillId('13900000004', m0), item_type: 'tax', item_name: '税费', amount: 10, service_id: null, occurred_at: `${m0}-28T23:00:00+08:00`, source_system: 'billing_core', disputable: false },
    { line_id: `BLI-${m0}-027`, phone: '13900000005', month: m0, bill_id: findBillId('13900000005', m0), item_type: 'plan_fee', item_name: '个人套餐月费', amount: 79, service_id: null, occurred_at: `${m0}-01T00:00:00+08:00`, source_system: 'billing_core', disputable: false },
    { line_id: `BLI-${m0}-028`, phone: '13900000005', month: m0, bill_id: findBillId('13900000005', m0), item_type: 'value_added_fee', item_name: '家庭宽带服务费', amount: 90, service_id: null, occurred_at: `${m0}-01T00:00:00+08:00`, source_system: 'broadband_core', disputable: false },
    { line_id: `BLI-${m0}-029`, phone: '13900000005', month: m0, bill_id: findBillId('13900000005', m0), item_type: 'tax', item_name: '税费', amount: 10, service_id: null, occurred_at: `${m0}-28T23:00:00+08:00`, source_system: 'billing_core', disputable: false },
    { line_id: `BLI-${m0}-030`, phone: '13900000006', month: m0, bill_id: findBillId('13900000006', m0), item_type: 'plan_fee', item_name: '5G 商务套餐月费', amount: 159, service_id: null, occurred_at: `${m0}-01T00:00:00+08:00`, source_system: 'billing_core', disputable: false },
    { line_id: `BLI-${m0}-031`, phone: '13900000006', month: m0, bill_id: findBillId('13900000006', m0), item_type: 'data_fee', item_name: '国际漫游流量费', amount: 50, service_id: null, occurred_at: `${m0}-14T11:00:00+08:00`, source_system: 'roaming_core', disputable: true },
    { line_id: `BLI-${m0}-032`, phone: '13900000006', month: m0, bill_id: findBillId('13900000006', m0), item_type: 'voice_fee', item_name: '国际漫游语音费', amount: 20, service_id: null, occurred_at: `${m0}-14T11:30:00+08:00`, source_system: 'roaming_core', disputable: true },
    { line_id: `BLI-${m0}-033`, phone: '13900000006', month: m0, bill_id: findBillId('13900000006', m0), item_type: 'value_added_fee', item_name: '国际漫游安心包', amount: 20, service_id: 'roaming_pkg', occurred_at: `${m0}-02T09:45:00+08:00`, source_system: 'vas_center', disputable: false },
    { line_id: `BLI-${m0}-034`, phone: '13900000006', month: m0, bill_id: findBillId('13900000006', m0), item_type: 'tax', item_name: '税费', amount: 8, service_id: null, occurred_at: `${m0}-28T23:00:00+08:00`, source_system: 'billing_core', disputable: false },
    { line_id: `BLI-${m0}-035`, phone: '13609796392', month: m0, bill_id: findBillId('13609796392', m0), item_type: 'plan_fee', item_name: '超值 100G 套餐月费', amount: 88, service_id: null, occurred_at: `${m0}-01T00:00:00+08:00`, source_system: 'billing_core', disputable: false },
    { line_id: `BLI-${m0}-036`, phone: '13609796392', month: m0, bill_id: findBillId('13609796392', m0), item_type: 'data_fee', item_name: '流量超额费', amount: 8, service_id: null, occurred_at: `${m0}-22T16:00:00+08:00`, source_system: 'billing_core', disputable: true },
    { line_id: `BLI-${m0}-037`, phone: '13609796392', month: m0, bill_id: findBillId('13609796392', m0), item_type: 'value_added_fee', item_name: '来电显示增值服务', amount: 8, service_id: null, occurred_at: `${m0}-01T00:00:00+08:00`, source_system: 'vas_center', disputable: true },
    { line_id: `BLI-${m0}-038`, phone: '13609796392', month: m0, bill_id: findBillId('13609796392', m0), item_type: 'tax', item_name: '税费', amount: 4, service_id: null, occurred_at: `${m0}-28T23:00:00+08:00`, source_system: 'billing_core', disputable: false },
  ]).run();
  businessDb.insert(billingDisputeCases).values([
    { case_id: 'DSP-001', phone: '13800000001', month: m0, bill_id: findBillId('13800000001', m0), issue_category: 'value_added_charge', description: '客户质疑视频会员未主动续订仍继续扣费。', claimed_amount: 20, status: 'open', resolution_summary: null, created_at: `${m0}-22T09:30:00+08:00`, resolved_at: null },
    { case_id: 'DSP-002', phone: '13900000006', month: m1, bill_id: findBillId('13900000006', m1), issue_category: 'roaming_charge', description: '客户反馈上月漫游流量费可能重复计费。', claimed_amount: 30, status: 'resolved', resolution_summary: '核查后确认计费正常，已补偿 10 元关怀券。', created_at: `${m1}-14T10:00:00+08:00`, resolved_at: `${m1}-16T16:30:00+08:00` },
  ]).run();

  console.log('[seed] 写入支付交易数据...');
  businessDb.delete(paymentsTransactions).run();
  businessDb.insert(paymentsTransactions).values([
    { payment_id: 'PAY-1001', phone: '13800000001', month: m0, amount: 88, channel: 'app', status: 'success', posted: true, paid_at: `${m0}-09T09:12:00+08:00` },
    { payment_id: 'PAY-1002', phone: '13800000001', month: m1, amount: 79.5, channel: 'autopay', status: 'success', posted: true, paid_at: `${m1}-11T08:40:00+08:00` },
    { payment_id: 'PAY-2001', phone: '13800000002', month: m0, amount: 158, channel: 'bank', status: 'success', posted: true, paid_at: `${m0}-21T21:05:00+08:00` },
    { payment_id: 'PAY-2002', phone: '13800000002', month: m1, amount: 168, channel: 'bank', status: 'success', posted: true, paid_at: `${m1}-22T20:05:00+08:00` },
    { payment_id: 'PAY-3001', phone: '13800000003', month: m1, amount: 20, channel: 'store', status: 'failed', posted: false, paid_at: `${m1}-01T12:10:00+08:00` },
    { payment_id: 'PAY-4001', phone: '13900000001', month: m0, amount: 386, channel: 'payment_link', status: 'failed', posted: false, paid_at: `${m0}-18T18:00:00+08:00` },
    { payment_id: 'PAY-5001', phone: '13900000002', month: m1, amount: 640, channel: 'bank', status: 'failed', posted: false, paid_at: `${m1}-15T09:00:00+08:00` },
    { payment_id: 'PAY-5002', phone: '13900000002', month: m0, amount: 640, channel: 'payment_link', status: 'processing', posted: false, paid_at: `${m0}-20T11:00:00+08:00` },
    { payment_id: 'PAY-6001', phone: '13900000003', month: m0, amount: 100, channel: 'wallet', status: 'partial', posted: false, paid_at: `${m0}-12T13:30:00+08:00` },
    { payment_id: 'PAY-7001', phone: '13900000004', month: m0, amount: 129, channel: 'autopay', status: 'success', posted: true, paid_at: `${m0}-08T07:50:00+08:00` },
    { payment_id: 'PAY-8001', phone: '13900000005', month: m0, amount: 179, channel: 'app', status: 'success', posted: true, paid_at: `${m0}-06T19:20:00+08:00` },
    { payment_id: 'PAY-9001', phone: '13900000006', month: m0, amount: 257, channel: 'corp', status: 'success', posted: true, paid_at: `${m0}-10T10:10:00+08:00` },
  ]).run();

  console.log('[seed] 清空 OTP / 登录事件 / 发票 / 退款数据...');
  businessDb.delete(identityOtpRequests).run();
  businessDb.delete(identityLoginEvents).run();
  businessDb.delete(invoiceRecords).run();
  businessDb.delete(ordersRefundRequests).run();
  businessDb.insert(identityOtpRequests).values([
    { request_id: 'OTP-DEMO-001', phone: '13800000001', otp: '000001', channel: 'sms', delivery_status: 'sent', status: 'verified', requested_at: `${m0}-22T09:30:00+08:00`, expires_at: `${m0}-22T09:35:00+08:00`, trace_id: 'trace_demo_otp_001' },
    { request_id: 'OTP-DEMO-002', phone: '13800000003', otp: '000003', channel: 'sms', delivery_status: 'delayed', status: 'pending', requested_at: `${m0}-22T10:00:00+08:00`, expires_at: `${m0}-22T10:05:00+08:00`, trace_id: 'trace_demo_otp_002' },
    { request_id: 'OTP-DEMO-003', phone: '13900000006', otp: '000006', channel: 'sms', delivery_status: 'sent', status: 'pending', requested_at: `${m0}-22T11:00:00+08:00`, expires_at: `${m0}-22T11:05:00+08:00`, trace_id: 'trace_demo_otp_003' },
  ]).run();
  businessDb.insert(identityLoginEvents).values([
    { event_id: 'LOGIN-001', phone: '13800000001', event_type: 'login_success', result: 'success', failure_reason: null, device_label: 'Pixel 8', ip_region: '广州', occurred_at: `${m0}-21T08:10:00+08:00` },
    { event_id: 'LOGIN-002', phone: '13800000002', event_type: 'login_success', result: 'success', failure_reason: null, device_label: 'iPhone 15', ip_region: '深圳', occurred_at: `${m0}-21T09:00:00+08:00` },
    { event_id: 'LOGIN-003', phone: '13800000003', event_type: 'login_failed', result: 'failed', failure_reason: 'password_attempts_exceeded', device_label: 'Redmi Note 12', ip_region: '北京', occurred_at: `${m0}-22T09:50:00+08:00` },
    { event_id: 'LOGIN-004', phone: '13800000003', event_type: 'otp_challenge', result: 'failed', failure_reason: 'otp_delayed', device_label: 'Redmi Note 12', ip_region: '北京', occurred_at: `${m0}-22T10:01:00+08:00` },
    { event_id: 'LOGIN-005', phone: '13800000003', event_type: 'account_locked', result: 'blocked', failure_reason: 'risk_review_required', device_label: 'Redmi Note 12', ip_region: '北京', occurred_at: `${m0}-22T10:02:30+08:00` },
    { event_id: 'LOGIN-006', phone: '13900000004', event_type: 'login_success', result: 'success', failure_reason: null, device_label: 'Honor 100', ip_region: '广州', occurred_at: `${m0}-20T20:10:00+08:00` },
    { event_id: 'LOGIN-007', phone: '13900000006', event_type: 'login_failed', result: 'failed', failure_reason: 'unusual_ip_region', device_label: 'iPhone 14 Pro', ip_region: '香港', occurred_at: `${m0}-19T07:40:00+08:00` },
  ]).run();
  businessDb.insert(invoiceRecords).values([
    { invoice_no: `INV-${m1.replace('-', '')}-0001`, phone: '13800000001', month: m1, total: 79.5, email: 'zhangsan@example.com', status: 'issued', requested_at: `${m0}-18T14:20:00+08:00` },
    { invoice_no: `INV-${m0.replace('-', '')}-0002`, phone: '13800000002', month: m0, total: 158, email: 'lisi@example.com', status: 'issued', requested_at: `${m0}-20T09:20:00+08:00` },
    { invoice_no: `INV-${m1.replace('-', '')}-0003`, phone: '13900000006', month: m1, total: 239, email: 'finance@corp.example.com', status: 'issued', requested_at: `${m0}-15T16:20:00+08:00` },
  ]).run();
  businessDb.insert(ordersRefundRequests).values([
    { refund_id: 'REF-001', phone: '13800000001', service_id: 'video_pkg', month: m0, reason: 'customer_claims_unwanted_renewal', amount: 20, status: 'pending_review', requested_at: `${m0}-22T10:10:00+08:00`, resolved_at: null },
    { refund_id: 'REF-002', phone: '13900000006', service_id: 'roaming_pkg', month: m1, reason: 'duplicate_roaming_charge_claim', amount: 30, status: 'approved', requested_at: `${m1}-14T11:20:00+08:00`, resolved_at: `${m1}-16T17:00:00+08:00` },
    { refund_id: 'REF-003', phone: '13800000003', service_id: 'game_pkg', month: m0, reason: 'service_not_used', amount: 15, status: 'rejected', requested_at: `${m0}-21T18:10:00+08:00`, resolved_at: `${m0}-22T09:10:00+08:00` },
  ]).run();

  // ── 6. test_personas ─────────────────────────────────────────────────────────
  console.log('[seed] 写入 test_personas 数据...');
  db.delete(testPersonas).run();
  db.insert(testPersonas).values([
    { id: 'U001', label_zh: '张三 · 畅享50G套餐 · 套餐升级/账单争议', label_en: 'Zhang San · 50G Plan · Upgrade/Bill Dispute', category: 'inbound', tag_zh: '正常用户', tag_en: 'Active', tag_color: 'bg-green-100 text-green-600', sort_order: 0, context: JSON.stringify({ phone: '13800000001', name: '张三', gender: 'male', plan: '畅享50G套餐', status: 'active', region: '广州', contract_end_date: '2026-06-15', email: 'zhangsan@example.com', customer_tier: 'standard', highlight: '视频会员扣费争议' }) },
    { id: 'U002', label_zh: '李四 · 无限流量套餐 · VIP/DND', label_en: 'Li Si · Unlimited Plan · VIP/DND', category: 'inbound', tag_zh: 'VIP用户', tag_en: 'VIP', tag_color: 'bg-blue-100 text-blue-600', sort_order: 1, context: JSON.stringify({ phone: '13800000002', name: '李四', gender: 'female', plan: '无限流量套餐', status: 'active', region: '深圳', email: 'lisi@example.com', customer_tier: 'vip', household_id: 'HH-001', dnd: true }) },
    { id: 'U003', label_zh: '王五 · 基础10G套餐 · 欠费停机 / App风控', label_en: 'Wang Wu · 10G Basic Plan · Suspended/App Risk', category: 'inbound', tag_zh: '欠费停机', tag_en: 'Suspended', tag_color: 'bg-red-100 text-red-600', sort_order: 2, context: JSON.stringify({ phone: '13800000003', name: '王五', gender: 'male', plan: '基础10G套餐', status: 'suspended', region: '北京', contract_end_date: '2025-12-31', overdue_days: 25, highlight: '登录失败+OTP延迟' }) },
    { id: 'C001', label_zh: 'C001 · 张明 · 宽带包年 · 逾期30天 · ¥386', label_en: 'C001 · Zhang Ming · Annual Broadband · 30d overdue · ¥386', category: 'outbound_collection', tag_zh: '逾期30天', tag_en: '30d Overdue', tag_color: 'bg-red-100 text-red-600', sort_order: 0, context: JSON.stringify({ phone: '13900000001', name: '张明', gender: 'male', plan: '宽带包年套餐', status: 'suspended', task_type: 'collection', overdue_amount: 386, overdue_days: 30, outbound_task_id: 'C001' }) },
    { id: 'C002', label_zh: 'C002 · 李华 · 家庭融合 · 逾期45天 · ¥1,280', label_en: 'C002 · Li Hua · Family Bundle · 45d overdue · ¥1,280', category: 'outbound_collection', tag_zh: '逾期45天', tag_en: '45d Overdue', tag_color: 'bg-red-100 text-red-600', sort_order: 1, context: JSON.stringify({ phone: '13900000002', name: '李华', gender: 'male', plan: '家庭融合套餐', status: 'suspended', task_type: 'collection', overdue_amount: 1280, overdue_days: 45, household_id: 'HH-002', outbound_task_id: 'C002' }) },
    { id: 'C003', label_zh: 'C003 · 王芳 · 流量月包 · 逾期15天 · ¥520', label_en: 'C003 · Wang Fang · Monthly Data Pack · 15d overdue · ¥520', category: 'outbound_collection', tag_zh: '逾期15天', tag_en: '15d Overdue', tag_color: 'bg-orange-100 text-orange-600', sort_order: 2, context: JSON.stringify({ phone: '13900000003', name: '王芳', gender: 'female', plan: '流量月包', status: 'suspended', task_type: 'collection', overdue_amount: 520, overdue_days: 15, outbound_task_id: 'C003' }) },
    { id: 'M001', label_zh: 'M001 · 陈伟 · 5G升级专项活动 · ¥199/月', label_en: 'M001 · Chen Wei · 5G Upgrade Campaign · ¥199/mo', category: 'outbound_marketing', tag_zh: '高流量4G', tag_en: 'High Usage 4G', tag_color: 'bg-violet-100 text-violet-600', sort_order: 0, context: JSON.stringify({ phone: '13900000004', name: '陈伟', gender: 'male', plan: '4G套餐 99元', status: 'active', task_type: 'marketing', customer_tier: 'premium', outbound_task_id: 'M001' }) },
    { id: 'M002', label_zh: 'M002 · 刘丽 · 家庭融合推广活动 · ¥299/月', label_en: 'M002 · Liu Li · Family Bundle Campaign · ¥299/mo', category: 'outbound_marketing', tag_zh: '家庭融合潜客', tag_en: 'Family Bundle Lead', tag_color: 'bg-violet-100 text-violet-600', sort_order: 1, context: JSON.stringify({ phone: '13900000005', name: '刘丽', gender: 'female', plan: '个人套餐 79元', status: 'active', task_type: 'marketing', outbound_task_id: 'M002' }) },
    { id: 'M003', label_zh: 'M003 · 赵强 · 国际漫游出行季活动 · ¥98/月', label_en: 'M003 · Zhao Qiang · Roaming Season Campaign · ¥98/mo', category: 'outbound_marketing', tag_zh: '商务漫游', tag_en: 'Business Roaming', tag_color: 'bg-violet-100 text-violet-600', sort_order: 2, context: JSON.stringify({ phone: '13900000006', name: '赵强', gender: 'male', plan: '5G商务套餐 159元', status: 'active', task_type: 'marketing', household_id: 'HH-003', outbound_task_id: 'M003' }) },
  ]).run();

  console.log('[seed] 写入 E2E 测试用例数据...');
  db.delete(testCases).run();
  db.insert(testCases).values(seededE2ECases).run();

  // ── 7a. callback_tasks ─────────────────────────────────────────────────────
  console.log('[seed] 写入 callback_tasks 历史数据...');
  businessDb.delete(callbackTasks).run();
  businessDb.insert(callbackTasks).values([
    { task_id: 'CB-HIST-001', original_task_id: 'C001', customer_name: '张明', callback_phone: '13900000001', preferred_time: `${m0}-23T15:00:00+08:00`, product_name: '宽带包年套餐', created_at: `${m0}-22T14:10:00+08:00`, status: 'completed' },
    { task_id: 'CB-HIST-002', original_task_id: 'M001', customer_name: '陈伟', callback_phone: '13900000004', preferred_time: `${m0}-24T10:30:00+08:00`, product_name: '5G 畅享套餐', created_at: `${m0}-22T16:10:00+08:00`, status: 'pending' },
  ]).run();

  // ── 7b. device_contexts ────────────────────────────────────────────────────
  console.log('[seed] 写入 device_contexts 数据...');
  businessDb.delete(deviceContexts).run();
  businessDb.insert(deviceContexts).values([
    { phone: '13800000001', installed_app_version: '3.2.1', latest_app_version: '3.5.0', device_os: 'android', os_version: 'Android 13', device_rooted: false, developer_mode_on: false, running_on_emulator: false, has_vpn_active: false, has_fake_gps: false, has_remote_access_app: false, has_screen_share_active: false, flagged_apps: '[]', login_location_changed: false, new_device: false, otp_delivery_issue: false },
    { phone: '13800000002', installed_app_version: '3.5.0', latest_app_version: '3.5.0', device_os: 'ios', os_version: 'iOS 17.4', device_rooted: false, developer_mode_on: false, running_on_emulator: false, has_vpn_active: true, has_fake_gps: false, has_remote_access_app: false, has_screen_share_active: false, flagged_apps: '[]', login_location_changed: false, new_device: false, otp_delivery_issue: false },
    { phone: '13800000003', installed_app_version: '3.0.0', latest_app_version: '3.5.0', device_os: 'android', os_version: 'Android 12', device_rooted: false, developer_mode_on: true, running_on_emulator: false, has_vpn_active: false, has_fake_gps: false, has_remote_access_app: false, has_screen_share_active: false, flagged_apps: '[]', login_location_changed: true, new_device: true, otp_delivery_issue: true },
    { phone: '13900000001', installed_app_version: '3.4.0', latest_app_version: '3.5.0', device_os: 'android', os_version: 'Android 13', device_rooted: false, developer_mode_on: false, running_on_emulator: false, has_vpn_active: false, has_fake_gps: false, has_remote_access_app: false, has_screen_share_active: false, flagged_apps: '[]', login_location_changed: false, new_device: false, otp_delivery_issue: false },
    { phone: '13900000002', installed_app_version: '3.5.0', latest_app_version: '3.5.0', device_os: 'android', os_version: 'Android 14', device_rooted: false, developer_mode_on: false, running_on_emulator: false, has_vpn_active: false, has_fake_gps: false, has_remote_access_app: false, has_screen_share_active: false, flagged_apps: '[]', login_location_changed: false, new_device: false, otp_delivery_issue: false },
    { phone: '13900000003', installed_app_version: '3.1.2', latest_app_version: '3.5.0', device_os: 'android', os_version: 'Android 13', device_rooted: false, developer_mode_on: false, running_on_emulator: false, has_vpn_active: false, has_fake_gps: false, has_remote_access_app: false, has_screen_share_active: false, flagged_apps: '[]', login_location_changed: false, new_device: false, otp_delivery_issue: false },
    { phone: '13900000004', installed_app_version: '3.5.0', latest_app_version: '3.5.0', device_os: 'android', os_version: 'HarmonyOS 4', device_rooted: false, developer_mode_on: false, running_on_emulator: false, has_vpn_active: false, has_fake_gps: false, has_remote_access_app: false, has_screen_share_active: false, flagged_apps: '[]', login_location_changed: false, new_device: true, otp_delivery_issue: false },
    { phone: '13900000005', installed_app_version: '3.4.8', latest_app_version: '3.5.0', device_os: 'ios', os_version: 'iOS 17.2', device_rooted: false, developer_mode_on: false, running_on_emulator: false, has_vpn_active: false, has_fake_gps: false, has_remote_access_app: false, has_screen_share_active: false, flagged_apps: '[]', login_location_changed: false, new_device: false, otp_delivery_issue: false },
    { phone: '13900000006', installed_app_version: '3.5.0', latest_app_version: '3.5.0', device_os: 'ios', os_version: 'iOS 17.5', device_rooted: false, developer_mode_on: false, running_on_emulator: false, has_vpn_active: true, has_fake_gps: false, has_remote_access_app: false, has_screen_share_active: false, flagged_apps: '[]', login_location_changed: true, new_device: false, otp_delivery_issue: false },
  ]).run();

  console.log('[seed] 写入网络事件数据...');
  businessDb.delete(networkIncidents).run();
  businessDb.insert(networkIncidents).values([
    { incident_id: 'NET-001', region: '广州', incident_type: 'congestion', severity: 'medium', status: 'open', affected_services: JSON.stringify(['4G', '5G']), start_time: '2026-03-22T08:30:00+08:00', end_time: null, description: '广州天河晚高峰基站负载偏高，可能导致数据速率下降。' },
    { incident_id: 'NET-002', region: '深圳', incident_type: 'maintenance', severity: 'low', status: 'observing', affected_services: JSON.stringify(['5G']), start_time: '2026-03-22T01:00:00+08:00', end_time: '2026-03-22T05:00:00+08:00', description: '深圳南山区 5G 维护窗口，部分用户可能出现瞬时波动。' },
    { incident_id: 'NET-003', region: '北京', incident_type: 'outage', severity: 'high', status: 'open', affected_services: JSON.stringify(['4G', '语音']), start_time: '2026-03-22T10:00:00+08:00', end_time: null, description: '北京朝阳部分片区基站中断，影响语音与数据业务。' },
    { incident_id: 'NET-004', region: '全国', incident_type: 'sms_delay', severity: 'medium', status: 'observing', affected_services: JSON.stringify(['短信验证码']), start_time: '2026-03-22T09:15:00+08:00', end_time: null, description: '短信中心短时延迟，验证码送达可能晚于平时。' },
    { incident_id: 'NET-005', region: '深圳', incident_type: 'roaming_alert', severity: 'low', status: 'observing', affected_services: JSON.stringify(['国际漫游']), start_time: '2026-03-22T06:00:00+08:00', end_time: null, description: '部分国际漫游合作网关切换，可能导致短时计费或短信延迟。' },
  ]).run();

  // ── 7c. outbound_tasks ─────────────────────────────────────────────────────
  console.log('[seed] 写入 outbound_tasks 数据...');
  platformDb.delete(outboundTasks).run();
  platformDb.insert(outboundTasks).values([
    { id: 'C001', phone: '13900000001', task_type: 'collection', label_zh: 'C001 · 张明 · 宽带包年 · ¥386', label_en: 'C001 · Zhang Ming · Annual Broadband · ¥386', data: JSON.stringify({ zh: { case_id: 'C001', customer_name: '张明', gender: 'male', overdue_amount: 386, due_date: `${m0}-15`, product_name: '宽带包年套餐', strategy: '轻催' }, en: { case_id: 'C001', customer_name: 'Zhang Ming', gender: 'male', overdue_amount: 386, due_date: `${m0}-15`, product_name: 'Annual Broadband Plan', strategy: 'soft' } }) },
    { id: 'C002', phone: '13900000002', task_type: 'collection', label_zh: 'C002 · 李华 · 家庭融合 · ¥1,280', label_en: 'C002 · Li Hua · Family Bundle · ¥1,280', data: JSON.stringify({ zh: { case_id: 'C002', customer_name: '李华', gender: 'male', overdue_amount: 1280, due_date: `${m0}-05`, product_name: '家庭融合套餐', strategy: '中催' }, en: { case_id: 'C002', customer_name: 'Li Hua', gender: 'male', overdue_amount: 1280, due_date: `${m0}-05`, product_name: 'Family Bundle Plan', strategy: 'medium' } }) },
    { id: 'C003', phone: '13900000003', task_type: 'collection', label_zh: 'C003 · 王芳 · 流量月包 · ¥520', label_en: 'C003 · Wang Fang · Monthly Data Pack · ¥520', data: JSON.stringify({ zh: { case_id: 'C003', customer_name: '王芳', gender: 'female', overdue_amount: 520, due_date: `${m0}-20`, product_name: '流量月包', strategy: '轻催' }, en: { case_id: 'C003', customer_name: 'Wang Fang', gender: 'female', overdue_amount: 520, due_date: `${m0}-20`, product_name: 'Monthly Data Plan', strategy: 'soft' } }) },
    { id: 'M001', phone: '13900000004', task_type: 'marketing', label_zh: 'M001 · 陈伟 · 5G升级专项活动 · ¥199/月', label_en: 'M001 · Chen Wei · 5G Upgrade Campaign · ¥199/mo', data: JSON.stringify({ zh: { campaign_id: 'M001', campaign_name: '5G升级专项活动', customer_name: '陈伟', gender: 'male', current_plan: '4G畅享套餐 99元/月（100GB流量）', target_plan_name: '5G畅享套餐', target_plan_fee: 199, target_plan_data: '300GB（5G速率）', target_plan_voice: '600分钟', target_plan_features: ['解锁5G网速', '流量翻三倍', '首月免月租'], promo_note: '首月免月租，本月底前办理有效', talk_template: '5G_upgrade_v2' }, en: { campaign_id: 'M001', campaign_name: '5G Upgrade Campaign', customer_name: 'Chen Wei', gender: 'male', current_plan: '4G Unlimited Plan ¥99/mo (100GB data)', target_plan_name: '5G Unlimited Plan', target_plan_fee: 199, target_plan_data: '300GB (5G speed)', target_plan_voice: '600 minutes', target_plan_features: ['Unlock 5G speed', '3x more data', 'First month free'], promo_note: 'First month free — offer valid through end of this month', talk_template: '5G_upgrade_v2' } }) },
    { id: 'M002', phone: '13900000005', task_type: 'marketing', label_zh: 'M002 · 刘丽 · 家庭融合推广活动 · ¥299/月', label_en: 'M002 · Liu Li · Family Bundle Campaign · ¥299/mo', data: JSON.stringify({ zh: { campaign_id: 'M002', campaign_name: '家庭融合推广活动', customer_name: '刘丽', gender: 'female', current_plan: '个人4G套餐 79元/月（60GB流量）+ 宽带 90元/月', target_plan_name: '家庭融合套餐', target_plan_fee: 299, target_plan_data: '主卡200GB + 3张副卡各50GB', target_plan_voice: '主卡不限分钟', target_plan_features: ['手机+宽带500M合一', '3张副卡共享流量', '每月节省约100元'], promo_note: '宽带免费升速至500M，24个月合约', talk_template: 'family_bundle_v1' }, en: { campaign_id: 'M002', campaign_name: 'Family Bundle Promotion', customer_name: 'Liu Li', gender: 'female', current_plan: 'Personal 4G Plan ¥79/mo (60GB data) + Broadband ¥90/mo', target_plan_name: 'Family Bundle Plan', target_plan_fee: 299, target_plan_data: 'Primary line 200GB + 3 sub-lines 50GB each', target_plan_voice: 'Primary line unlimited minutes', target_plan_features: ['Mobile + 500M broadband combined', '3 shared sub-lines', 'Save ~¥100/month'], promo_note: 'Free broadband speed upgrade to 500M, 24-month contract', talk_template: 'family_bundle_v1' } }) },
    { id: 'M003', phone: '13900000006', task_type: 'marketing', label_zh: 'M003 · 赵强 · 国际漫游出行季活动 · ¥98/月', label_en: 'M003 · Zhao Qiang · Roaming Season Campaign · ¥98/mo', data: JSON.stringify({ zh: { campaign_id: 'M003', campaign_name: '国际漫游出行季活动', customer_name: '赵强', gender: 'male', current_plan: '5G商务套餐 159元/月', target_plan_name: '国际漫游月包', target_plan_fee: 98, target_plan_data: '日韩港澳台及东南亚10国每日1GB高速', target_plan_voice: '接听免费，拨出0.5元/分钟', target_plan_features: ['落地即用', '超量不断网', '比直接漫游省60%'], promo_note: '出境前1天激活即可，30天内有效', talk_template: 'roaming_v1' }, en: { campaign_id: 'M003', campaign_name: 'International Roaming Travel Season', customer_name: 'Zhao Qiang', gender: 'male', current_plan: '5G Business Plan ¥159/mo', target_plan_name: 'International Roaming Monthly Pack', target_plan_fee: 98, target_plan_data: '1GB/day high-speed in Japan, Korea, HK, Macau, Taiwan & 10 SE Asian countries', target_plan_voice: 'Free incoming calls, outgoing ¥0.5/min', target_plan_features: ['Ready on arrival', 'No cutoff after cap', 'Save 60% vs. standard roaming'], promo_note: 'Activate 1 day before departure — valid for 30 days', talk_template: 'roaming_v1' } }) },
  ]).run();

  console.log('[seed] 清空服务订单、退款、外呼结果、短信事件、转人工与营销结果...');
  businessDb.delete(ordersServiceOrders).run();
  businessDb.delete(outreachCallResults).run();
  businessDb.delete(outreachSmsEvents).run();
  businessDb.delete(outreachHandoffCases).run();
  businessDb.delete(outreachMarketingResults).run();
  businessDb.insert(ordersServiceOrders).values([
    { order_id: 'ORD-DEMO-001', order_type: 'service_cancel', phone: '13800000001', service_id: 'sms_100', service_name: '短信百条包（100条/月）', reason: 'customer_requested_cancel', status: 'pending_effective', effective_at: '次月1日00:00', requires_manual_review: false, message: '退订申请已受理，预计次月生效。', created_at: `${m0}-20T11:00:00+08:00` },
    { order_id: 'ORD-DEMO-002', order_type: 'service_cancel', phone: '13900000002', service_id: 'family_share', service_name: '家庭共享副卡权益包', reason: 'arrears_review_required', status: 'manual_review', effective_at: null, requires_manual_review: true, message: '客户存在高额欠费，已提交人工复核后再决定是否退订。', created_at: `${m0}-21T10:00:00+08:00` },
  ]).run();
  businessDb.insert(outreachCallResults).values([
    { result_id: 'CALL-DEMO-001', task_id: 'C001', phone: '13900000001', result: 'ptp', remark: '客户承诺本周五前缴费', callback_time: null, ptp_date: `${m0}-28`, created_at: `${m0}-22T14:00:00+08:00` },
    { result_id: 'CALL-DEMO-002', task_id: 'C002', phone: '13900000002', result: 'human_transfer', remark: '客户要求人工协商分期', callback_time: null, ptp_date: null, created_at: `${m0}-22T14:20:00+08:00` },
    { result_id: 'CALL-DEMO-003', task_id: 'M001', phone: '13900000004', result: 'callback', remark: '客户对 5G 升级有兴趣，需要下周回访', callback_time: `${m0}-24T10:30:00+08:00`, ptp_date: null, created_at: `${m0}-22T15:10:00+08:00` },
  ]).run();
  businessDb.insert(outreachSmsEvents).values([
    { event_id: 'SMS-DEMO-001', phone: '13900000001', sms_type: 'payment_link', context: 'collection', status: 'sent', reason: null, sent_at: `${m0}-22T14:02:00+08:00` },
    { event_id: 'SMS-DEMO-002', phone: '13900000004', sms_type: 'plan_detail', context: 'marketing', status: 'sent', reason: null, sent_at: `${m0}-22T15:20:00+08:00` },
    { event_id: 'SMS-DEMO-003', phone: '13800000002', sms_type: 'plan_detail', context: 'marketing', status: 'blocked', reason: 'dnd_preference', sent_at: `${m0}-22T16:05:00+08:00` },
  ]).run();
  businessDb.insert(outreachHandoffCases).values([
    { case_id: 'HOF-DEMO-001', phone: '13800000002', source_skill: 'outbound-marketing', reason: 'customer_requested_human', priority: 'medium', queue_name: 'general_support', status: 'open', created_at: `${m0}-22T15:10:00+08:00` },
    { case_id: 'HOF-DEMO-002', phone: '13900000002', source_skill: 'outbound-collection', reason: 'installment_negotiation', priority: 'high', queue_name: 'collections_specialist', status: 'open', created_at: `${m0}-22T14:25:00+08:00` },
  ]).run();
  businessDb.insert(outreachMarketingResults).values([
    { record_id: 'MKT-DEMO-001', campaign_id: 'CMP-UP-100G', phone: '13900000004', result: 'callback', callback_time: `${m0}-24T10:30:00+08:00`, is_dnd: false, recorded_at: `${m0}-22T15:30:00+08:00` },
    { record_id: 'MKT-DEMO-002', campaign_id: 'CMP-FAMILY-001', phone: '13900000005', result: 'interested', callback_time: null, is_dnd: false, recorded_at: `${m0}-22T16:00:00+08:00` },
    { record_id: 'MKT-DEMO-003', campaign_id: 'CMP-FAMILY-001', phone: '13800000002', result: 'dnd', callback_time: null, is_dnd: true, recorded_at: `${m0}-22T16:10:00+08:00` },
  ]).run();

  // ── 默认用户 ─────────────────────────────────────────────────────
  console.log('[seed] 写入默认用户...');
  platformDb.delete(users).run();
  platformDb.insert(users).values([
    { id: 'admin',         name: '管理员',    role: 'admin' },
    { id: 'flow_manager',  name: '流程管理员', role: 'flow_manager' },
    { id: 'config_editor', name: '配置编辑员', role: 'config_editor' },
    { id: 'reviewer',      name: '审核员',    role: 'reviewer' },
    { id: 'auditor',       name: '审计员',    role: 'auditor' },
  ]).run();

  // ── 员工账号（Staff RBAC）──────────────────────────────────────────────────
  console.log('[seed] 写入员工账号...');
  platformDb.delete(staffSessions).run();
  platformDb.delete(staffAccounts).run();

  const STAFF_SEED = [
    { id: 'demo_admin_001', username: 'demo',      display_name: '演示主管', password: '123456',  primary_staff_role: 'agent', staff_roles: ['agent', 'operations'], platform_role: 'admin',        team_code: 'demo_supervisor',  seat_code: 'D01',  default_queue_code: 'frontline', is_demo: true },
    { id: 'agent_001',      username: 'zhang.qi',   display_name: '张琦',     password: '123456', primary_staff_role: 'agent', staff_roles: ['agent'],              platform_role: 'auditor',      team_code: 'frontline_online', seat_code: 'A01',  default_queue_code: 'frontline', is_demo: false },
    { id: 'agent_002',      username: 'li.na',      display_name: '李娜',     password: '123456', primary_staff_role: 'agent', staff_roles: ['agent'],              platform_role: 'auditor',      team_code: 'frontline_online', seat_code: 'A02',  default_queue_code: 'frontline', is_demo: false },
    { id: 'agent_callback_01', username: 'wang.lei', display_name: '王蕾',    password: '123456', primary_staff_role: 'agent', staff_roles: ['agent'],              platform_role: 'auditor',      team_code: 'callback_team',    seat_code: 'C01',  default_queue_code: 'callback_team', is_demo: false },
    { id: 'ops_001',        username: 'chen.min',   display_name: '陈敏',     password: '123456',   primary_staff_role: 'operations', staff_roles: ['operations'],     platform_role: 'flow_manager', team_code: 'ops_knowledge',    seat_code: null,   default_queue_code: null,        is_demo: false },
    { id: 'ops_002',        username: 'zhao.ning',  display_name: '赵宁',     password: '123456',   primary_staff_role: 'operations', staff_roles: ['operations'],     platform_role: 'flow_manager', team_code: 'ops_workorder',    seat_code: null,   default_queue_code: null,        is_demo: false },
    // WFM 新增坐席
    { id: 'agent_003',      username: 'zhao.min',   display_name: '赵敏',     password: '123456', primary_staff_role: 'agent', staff_roles: ['agent'],              platform_role: 'auditor',      team_code: 'frontline_online', seat_code: 'A03',  default_queue_code: 'frontline', is_demo: false },
    { id: 'agent_004',      username: 'liu.yang',   display_name: '刘洋',     password: '123456', primary_staff_role: 'agent', staff_roles: ['agent'],              platform_role: 'auditor',      team_code: 'frontline_online', seat_code: 'A04',  default_queue_code: 'frontline', is_demo: false },
    { id: 'agent_005',      username: 'ma.chao',    display_name: '马超',     password: '123456', primary_staff_role: 'agent', staff_roles: ['agent'],              platform_role: 'auditor',      team_code: 'frontline_voice',  seat_code: 'V01',  default_queue_code: 'voice',     is_demo: false },
    { id: 'agent_006',      username: 'fang.lin',   display_name: '方琳',     password: '123456', primary_staff_role: 'agent', staff_roles: ['agent'],              platform_role: 'auditor',      team_code: 'frontline_voice',  seat_code: 'V02',  default_queue_code: 'voice',     is_demo: false },
  ];

  for (const s of STAFF_SEED) {
    const password_hash = await Bun.password.hash(s.password, 'bcrypt');
    platformDb.insert(staffAccounts).values({
      id: s.id,
      username: s.username,
      display_name: s.display_name,
      password_hash,
      primary_staff_role: s.primary_staff_role,
      staff_roles: JSON.stringify(s.staff_roles),
      platform_role: s.platform_role,
      team_code: s.team_code,
      seat_code: s.seat_code,
      default_queue_code: s.default_queue_code,
      is_demo: s.is_demo,
    }).onConflictDoUpdate({
      target: staffAccounts.id,
      set: {
        username: s.username,
        display_name: s.display_name,
        password_hash,
        primary_staff_role: s.primary_staff_role,
        staff_roles: JSON.stringify(s.staff_roles),
        platform_role: s.platform_role,
        team_code: s.team_code,
        seat_code: s.seat_code,
        default_queue_code: s.default_queue_code,
        is_demo: s.is_demo,
        status: 'active',
      },
    }).run();
  }
  console.log('[seed] 员工账号写入完成（10 条）');

  // ── 8. 知识管理演示数据 ────────────────────────────────────────────────────
  console.log('[seed] 写入知识管理演示数据...');

  // 清空（按外键依赖顺序）
  db.delete(kmReplyFeedback).run();
  db.delete(kmAuditLogs).run();
  db.delete(kmRegressionWindows).run();
  db.delete(kmGovernanceTasks).run();
  db.delete(kmAssetVersions).run();
  db.delete(kmAssets).run();
  db.delete(kmActionDrafts).run();
  db.delete(kmReviewPackages).run();
  db.delete(kmConflictRecords).run();
  db.delete(kmEvidenceRefs).run();
  db.delete(kmCandidates).run();
  db.delete(kmPipelineJobs).run();
  db.delete(kmDocVersions).run();
  db.delete(kmDocuments).run();

  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
  const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const nextQuarter = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  // ── 8.1 文档 ──────────────────────────────────────────────────────
  db.insert(kmDocuments).values([
    { id: 'doc-cancel-policy',   title: '增值业务退订政策（2026版）', source: 'upload',    classification: 'internal', owner: '张三', status: 'active', created_at: oneWeekAgo, updated_at: yesterday },
    { id: 'doc-billing-rules',   title: '计费规则与争议处理规范',       source: 'upload',    classification: 'sensitive', owner: '李四', status: 'active', created_at: oneWeekAgo, updated_at: twoDaysAgo },
    { id: 'doc-5g-plans',        title: '5G套餐资费说明（2026Q1）',   source: 'connector', classification: 'public',    owner: '王五', status: 'active', created_at: threeDaysAgo, updated_at: threeDaysAgo },
    { id: 'doc-network-faq',     title: '宽带故障排查FAQ手册',        source: 'upload',    classification: 'internal', owner: '张三', status: 'active', created_at: oneWeekAgo, updated_at: oneWeekAgo },
    { id: 'doc-complaint-guide', title: '客户投诉处理操作指引',        source: 'upload',    classification: 'sensitive', owner: '李四', status: 'active', created_at: twoDaysAgo, updated_at: yesterday },
  ]).run();

  // ── 8.2 文档版本 ──────────────────────────────────────────────────
  db.insert(kmDocVersions).values([
    { id: 'dv-cancel-v1', document_id: 'doc-cancel-policy', version_no: 1, file_path: kmDocPath('cancel-policy-v1.md'), scope_json: '{"region":"全国","channel":"全渠道"}', effective_from: '2026-01-01', effective_to: '2026-12-31', diff_summary: null, status: 'parsed', created_at: oneWeekAgo },
    { id: 'dv-cancel-v2', document_id: 'doc-cancel-policy', version_no: 2, file_path: kmDocPath('cancel-policy-v2.md'), scope_json: '{"region":"全国","channel":"全渠道"}', effective_from: '2026-03-01', effective_to: '2026-12-31', diff_summary: '退订时限从7个工作日缩短为5个工作日；新增即时退订通道', status: 'parsed', created_at: yesterday },
    { id: 'dv-billing-v1', document_id: 'doc-billing-rules', version_no: 1, file_path: kmDocPath('billing-rules-v1.md'), scope_json: '{"region":"全国","channel":"线上"}', effective_from: '2026-01-01', effective_to: '2026-06-30', diff_summary: null, status: 'parsed', created_at: oneWeekAgo },
    { id: 'dv-5g-v1',     document_id: 'doc-5g-plans',      version_no: 1, file_path: kmDocPath('5g-plans-v1.md'), scope_json: '{"region":"全国","channel":"全渠道"}', effective_from: '2026-01-01', effective_to: '2026-03-31', diff_summary: null, status: 'parsed', created_at: threeDaysAgo },
    { id: 'dv-network-v1', document_id: 'doc-network-faq',   version_no: 1, file_path: kmDocPath('network-faq-v1.md'), scope_json: '{"region":"全国","channel":"客服"}', effective_from: '2025-07-01', effective_to: '2026-06-30', diff_summary: null, status: 'parsed', created_at: oneWeekAgo },
    { id: 'dv-complaint-v1', document_id: 'doc-complaint-guide', version_no: 1, file_path: kmDocPath('complaint-guide-v1.md'), scope_json: '{"region":"全国","channel":"全渠道"}', effective_from: '2026-03-01', effective_to: '2026-12-31', diff_summary: null, status: 'parsed', created_at: twoDaysAgo },
    { id: 'dv-complaint-v2', document_id: 'doc-complaint-guide', version_no: 2, file_path: kmDocPath('complaint-guide-v2.md'), scope_json: '{"region":"全国","channel":"全渠道"}', effective_from: '2026-03-15', effective_to: '2026-12-31', diff_summary: '新增投诉升级和监管触点说明，待重新解析', status: 'draft', created_at: yesterday },
  ]).run();

  // ── 8.3 流水线作业 ────────────────────────────────────────────────
  db.insert(kmPipelineJobs).values([
    { id: 'job-cancel-parse',    doc_version_id: 'dv-cancel-v2', stage: 'parse',    status: 'success', candidate_count: 0, started_at: yesterday, finished_at: yesterday, created_at: yesterday },
    { id: 'job-cancel-chunk',    doc_version_id: 'dv-cancel-v2', stage: 'chunk',    status: 'success', candidate_count: 0, started_at: yesterday, finished_at: yesterday, created_at: yesterday },
    { id: 'job-cancel-generate', doc_version_id: 'dv-cancel-v2', stage: 'generate', status: 'success', candidate_count: 3, started_at: yesterday, finished_at: yesterday, created_at: yesterday },
    { id: 'job-cancel-validate', doc_version_id: 'dv-cancel-v2', stage: 'validate', status: 'success', candidate_count: 0, started_at: yesterday, finished_at: yesterday, created_at: yesterday },
    { id: 'job-complaint-parse', doc_version_id: 'dv-complaint-v2', stage: 'parse', status: 'failed', error_code: 'OCR_LANG', error_message: 'OCR语言包不匹配，请尝试切换为中文简体模式', started_at: yesterday, finished_at: yesterday, created_at: yesterday },
  ]).run();

  // ── 8.4 知识候选 ──────────────────────────────────────────────────
  db.insert(kmCandidates).values([
    // 已发布（退订政策产出）
    { id: 'cand-001', source_type: 'parsing', source_ref_id: 'dv-cancel-v2', normalized_q: '如何退订增值业务？', draft_answer: '您可以通过以下方式退订：1）营业厅App → 我的服务 → 增值业务 → 退订；2）拨打10000号转人工；3）营业厅柜台办理。退订后次月生效，当月费用不退。', category: '业务办理', risk_level: 'low', gate_evidence: 'pass', gate_conflict: 'pass', gate_ownership: 'pass', status: 'published', review_pkg_id: 'rpkg-001', created_by: '张三', created_at: twoDaysAgo, updated_at: yesterday },
    { id: 'cand-002', source_type: 'parsing', source_ref_id: 'dv-cancel-v2', normalized_q: '退订增值业务后费用如何计算？', draft_answer: '退订当月仍按月度全额计费，次月起停止扣费。已享受优惠期内退订需补缴优惠差额。', category: '费用查询', risk_level: 'low', gate_evidence: 'pass', gate_conflict: 'pass', gate_ownership: 'pass', status: 'published', review_pkg_id: 'rpkg-001', created_by: '张三', created_at: twoDaysAgo, updated_at: yesterday },
    { id: 'cand-003', source_type: 'parsing', source_ref_id: 'dv-cancel-v2', normalized_q: '退订增值业务需要多长时间生效？', draft_answer: '常规退订：次月1日零点生效。即时退订通道（2026年3月起新增）：提交后实时生效，当月按天折算退费。', category: '业务办理', risk_level: 'low', gate_evidence: 'pass', gate_conflict: 'pass', gate_ownership: 'pass', status: 'published', review_pkg_id: 'rpkg-001', created_by: '张三', created_at: twoDaysAgo, updated_at: yesterday },

    // 门槛通过，待入评审包
    { id: 'cand-004', source_type: 'parsing', source_ref_id: 'dv-billing-v1', normalized_q: '账单金额与实际使用不符怎么办？', draft_answer: '请先核实账单明细（App → 我的账单 → 明细），如确认异常可在线提交争议工单，客服将在3个工作日内回复处理结果。', category: '费用查询', risk_level: 'medium', gate_evidence: 'pass', gate_conflict: 'pass', gate_ownership: 'pass', status: 'gate_pass', created_by: '李四', created_at: twoDaysAgo, updated_at: twoDaysAgo },
    { id: 'cand-005', source_type: 'parsing', source_ref_id: 'dv-5g-v1', normalized_q: '5G套餐升级后原套餐剩余流量如何处理？', draft_answer: '升级当月，原套餐剩余流量与新套餐流量叠加使用；次月起按新套餐标准计量。', category: '套餐变更', risk_level: 'low', gate_evidence: 'pass', gate_conflict: 'pass', gate_ownership: 'pass', status: 'gate_pass', created_by: '王五', created_at: yesterday, updated_at: yesterday },

    // 文档来源但仍待进一步治理
    { id: 'cand-006', source_type: 'parsing', source_ref_id: 'dv-network-v1', normalized_q: '宽带网速慢有哪些可能原因？', draft_answer: '常见原因包括：光猫缓存满、WiFi信道拥堵、光纤接口松动、区域网络高峰。建议先重启光猫，仍无改善请报修。', category: '故障排查', risk_level: 'low', gate_evidence: 'pass', gate_conflict: 'pass', gate_ownership: 'pass', status: 'gate_pass', created_by: '张三', created_at: yesterday, updated_at: yesterday },
    { id: 'cand-007', source_type: 'parsing', source_ref_id: 'dv-complaint-v1', normalized_q: '投诉处理流程是怎样的？', draft_answer: '投诉受理 → 48小时内首次回复 → 问题定位 → 解决方案确认 → 执行 → 回访确认满意。', category: '投诉处理', risk_level: 'high', gate_evidence: 'pass', gate_conflict: 'pass', gate_ownership: 'pass', status: 'gate_pass', created_by: '李四', created_at: yesterday, updated_at: yesterday },

    // 存在冲突
    { id: 'cand-008', source_type: 'parsing', source_ref_id: 'dv-5g-v1', normalized_q: '5G畅享套餐月费多少？', draft_answer: '5G畅享套餐月费199元，含100GB全国通用流量、1000分钟国内通话、视频会员权益。', category: '套餐查询', risk_level: 'low', gate_evidence: 'pass', gate_conflict: 'fail', gate_ownership: 'pass', status: 'draft', created_by: '王五', created_at: yesterday, updated_at: yesterday },
  ]).run();

  // ── 8.5 证据引用 ──────────────────────────────────────────────────
  db.insert(kmEvidenceRefs).values([
    { id: 'ev-001', candidate_id: 'cand-001', doc_version_id: 'dv-cancel-v2', locator: '第2章第1节「退订渠道」', status: 'pass', rule_version: 'v1.0', reviewed_by: 'reviewer', reviewed_at: yesterday, created_at: twoDaysAgo },
    { id: 'ev-002', candidate_id: 'cand-002', doc_version_id: 'dv-cancel-v2', locator: '第3章「费用结算规则」第2条', status: 'pass', rule_version: 'v1.0', reviewed_by: 'reviewer', reviewed_at: yesterday, created_at: twoDaysAgo },
    { id: 'ev-003', candidate_id: 'cand-003', doc_version_id: 'dv-cancel-v2', locator: '第2章第3节「即时退订」', status: 'pass', rule_version: 'v1.0', reviewed_by: 'reviewer', reviewed_at: yesterday, created_at: twoDaysAgo },
    { id: 'ev-004', candidate_id: 'cand-004', doc_version_id: 'dv-billing-v1', locator: '第5章「争议处理」', status: 'pass', rule_version: 'v1.0', reviewed_by: 'reviewer', reviewed_at: twoDaysAgo, created_at: twoDaysAgo },
    { id: 'ev-005', candidate_id: 'cand-005', doc_version_id: 'dv-5g-v1', locator: '第4节「套餐变更」', status: 'pass', rule_version: 'v1.0', reviewed_by: 'reviewer', reviewed_at: yesterday, created_at: yesterday },
    { id: 'ev-006', candidate_id: 'cand-006', doc_version_id: 'dv-network-v1', locator: '第2章第2节「网速慢常见原因」', status: 'pass', rule_version: 'v1.0', reviewed_by: 'reviewer', reviewed_at: yesterday, created_at: yesterday },
    { id: 'ev-007', candidate_id: 'cand-007', doc_version_id: 'dv-complaint-v1', locator: '第2章第1节「投诉受理与48小时回复」', status: 'pass', rule_version: 'v1.0', reviewed_by: 'reviewer', reviewed_at: yesterday, created_at: yesterday },
    { id: 'ev-008', candidate_id: 'cand-008', doc_version_id: 'dv-5g-v1', locator: '第1节「套餐一览」', status: 'pass', rule_version: 'v1.0', reviewed_by: 'reviewer', reviewed_at: yesterday, created_at: yesterday },
  ]).run();

  // ── 8.6 冲突记录 ──────────────────────────────────────────────────
  db.insert(kmConflictRecords).values([
    { id: 'conf-001', conflict_type: 'wording', item_a_id: 'cand-008', item_b_id: 'asset-003', overlap_scope: '5G畅享套餐月费：候选说199元，现有资产说189元（促销价）', blocking_policy: 'block_submit', status: 'pending', created_at: yesterday },
  ]).run();

  // ── 8.7 评审包 ────────────────────────────────────────────────────
  db.insert(kmReviewPackages).values([
    // 已发布
    { id: 'rpkg-001', title: '退订政策首批知识入库', status: 'published', risk_level: 'low', impact_summary: '覆盖增值业务退订场景的3条核心QA', candidate_ids_json: '["cand-001","cand-002","cand-003"]', approval_policy: '运营双人复核', approval_snapshot: JSON.stringify({ submitted_by: '张三', submitted_at: twoDaysAgo, approved_by: 'reviewer', approved_at: yesterday }), submitted_by: '张三', submitted_at: twoDaysAgo, approved_by: 'reviewer', approved_at: yesterday, created_by: '张三', created_at: twoDaysAgo, updated_at: yesterday },
    // 草稿（待提交）
    { id: 'rpkg-002', title: '计费争议与套餐升级知识补充', status: 'draft', risk_level: 'medium', impact_summary: '补充计费争议处理、5G升级和宽带排查场景', candidate_ids_json: '["cand-004","cand-005","cand-006"]', created_by: '李四', created_at: yesterday, updated_at: yesterday },
  ]).run();

  // ── 8.8 动作草案 ──────────────────────────────────────────────────
  db.insert(kmActionDrafts).values([
    // 已执行（退订政策发布）
    { id: 'adraft-001', action_type: 'publish', review_pkg_id: 'rpkg-001', status: 'done', change_summary: '退订政策首批3条QA发布上线', rollback_point_id: 'rollback_adraft-001', regression_window_id: 'regwin-001', executed_by: 'admin', executed_at: yesterday, created_by: '张三', created_at: yesterday, updated_at: yesterday },
    // 草稿（降权示例）
    { id: 'adraft-002', action_type: 'downgrade', target_asset_id: 'asset-003', status: 'draft', change_summary: '5G畅享套餐价格存疑，暂时降权处理', created_by: '王五', created_at: now, updated_at: now },
  ]).run();

  // ── 8.9 知识资产 ──────────────────────────────────────────────────
  db.insert(kmAssets).values([
    { id: 'asset-001', title: '如何退订增值业务？',         asset_type: 'qa', status: 'online', current_version: 1, scope_json: '{"region":"全国","channel":"全渠道"}', owner: '张三', next_review_date: nextQuarter, created_at: yesterday, updated_at: yesterday },
    { id: 'asset-002', title: '退订增值业务后费用如何计算？', asset_type: 'qa', status: 'online', current_version: 1, scope_json: '{"region":"全国","channel":"全渠道"}', owner: '张三', next_review_date: nextQuarter, created_at: yesterday, updated_at: yesterday },
    { id: 'asset-003', title: '退订增值业务需要多长时间生效？', asset_type: 'qa', status: 'online', current_version: 1, scope_json: '{"region":"全国","channel":"全渠道"}', owner: '张三', next_review_date: nextQuarter, created_at: yesterday, updated_at: yesterday },
    // 一个已有的5G资产（用于冲突演示）
    { id: 'asset-004', title: '5G畅享套餐月费多少？', asset_type: 'qa', status: 'online', current_version: 1, scope_json: '{"region":"全国","channel":"全渠道"}', owner: '王五', next_review_date: nextMonth, created_at: oneWeekAgo, updated_at: oneWeekAgo },
  ]).run();

  // ── 8.10 资产版本 ─────────────────────────────────────────────────
  db.insert(kmAssetVersions).values([
    { id: 'av-001', asset_id: 'asset-001', version_no: 1, content_snapshot: JSON.stringify({ q: '如何退订增值业务？', a: '您可以通过以下方式退订：1）营业厅App → 我的服务 → 增值业务 → 退订；2）拨打10000号转人工；3）营业厅柜台办理。退订后次月生效，当月费用不退。' }), scope_snapshot: '{"region":"全国","channel":"全渠道"}', evidence_summary: '退订政策2026版 第2章第1节', action_draft_id: 'adraft-001', effective_from: yesterday, created_at: yesterday },
    { id: 'av-002', asset_id: 'asset-002', version_no: 1, content_snapshot: JSON.stringify({ q: '退订增值业务后费用如何计算？', a: '退订当月仍按月度全额计费，次月起停止扣费。已享受优惠期内退订需补缴优惠差额。' }), scope_snapshot: '{"region":"全国","channel":"全渠道"}', evidence_summary: '退订政策2026版 第3章第2条', action_draft_id: 'adraft-001', effective_from: yesterday, created_at: yesterday },
    { id: 'av-003', asset_id: 'asset-003', version_no: 1, content_snapshot: JSON.stringify({ q: '退订增值业务需要多长时间生效？', a: '常规退订次月生效。即时退订通道（2026年3月起）实时生效，按天折算退费。' }), scope_snapshot: '{"region":"全国","channel":"全渠道"}', evidence_summary: '退订政策2026版 第2章第3节', action_draft_id: 'adraft-001', effective_from: yesterday, created_at: yesterday },
    { id: 'av-004', asset_id: 'asset-004', version_no: 1, content_snapshot: JSON.stringify({ q: '5G畅享套餐月费多少？', a: '5G畅享套餐月费189元（促销期），含80GB流量、800分钟通话。' }), scope_snapshot: '{"region":"全国","channel":"全渠道"}', evidence_summary: '5G套餐资费说明 第1节', effective_from: oneWeekAgo, created_at: oneWeekAgo },
  ]).run();

  // ── 8.11 治理任务 ─────────────────────────────────────────────────
  db.insert(kmGovernanceTasks).values([
    { id: 'task-001', task_type: 'content_gap',    source_type: 'candidate',        source_ref_id: 'cand-006', priority: 'medium', assignee: '张三', status: 'open',        due_date: nextMonth, created_at: yesterday, updated_at: yesterday },
    { id: 'task-002', task_type: 'content_gap',    source_type: 'candidate',        source_ref_id: 'cand-007', priority: 'high',   assignee: '李四', status: 'open',        due_date: nextMonth, created_at: yesterday, updated_at: yesterday },
    { id: 'task-003', task_type: 'conflict_arb',   source_type: 'conflict_record',  source_ref_id: 'conf-001', priority: 'high',   assignee: '王五', status: 'in_progress', due_date: nextMonth, created_at: yesterday, updated_at: now },
    { id: 'task-004', task_type: 'failure_fix',    source_type: 'pipeline_job',     source_ref_id: 'job-complaint-parse', priority: 'medium', assignee: '张三', status: 'open', due_date: nextMonth, created_at: yesterday, updated_at: yesterday },
    { id: 'task-005', task_type: 'review_expiry',  source_type: 'asset',            source_ref_id: 'asset-004',           priority: 'low',    assignee: '王五', status: 'open', due_date: nextMonth, conclusion: null, created_at: now, updated_at: now },
  ]).run();

  // ── 8.12 回归窗口 ─────────────────────────────────────────────────
  db.insert(kmRegressionWindows).values([
    { id: 'regwin-001', linked_type: 'action_draft', linked_id: 'adraft-001', metrics_json: JSON.stringify({ recall_score: 0.85, self_resolve_rate: 0.72, transfer_rate: 0.08 }), threshold_json: JSON.stringify({ recall_score: 0.7, self_resolve_rate: 0.6 }), verdict: 'pass', observe_from: yesterday, observe_until: new Date(Date.now() + 7 * 86400000).toISOString(), concluded_at: now, created_at: yesterday },
  ]).run();

  // ── 8.13 审计日志 ─────────────────────────────────────────────────
  db.insert(kmAuditLogs).values([
    { action: 'create_document',   object_type: 'document',        object_id: 'doc-cancel-policy',  operator: '张三',    risk_level: null, detail_json: JSON.stringify({ title: '增值业务退订政策（2026版）' }), created_at: oneWeekAgo },
    { action: 'create_document',   object_type: 'document',        object_id: 'doc-billing-rules',  operator: '李四',    risk_level: null, detail_json: JSON.stringify({ title: '计费规则与争议处理规范' }), created_at: oneWeekAgo },
    { action: 'evidence_pass',     object_type: 'evidence_ref',    object_id: 'ev-001',             operator: 'reviewer', risk_level: null, detail_json: null, created_at: yesterday },
    { action: 'evidence_pass',     object_type: 'evidence_ref',    object_id: 'ev-002',             operator: 'reviewer', risk_level: null, detail_json: null, created_at: yesterday },
    { action: 'evidence_pass',     object_type: 'evidence_ref',    object_id: 'ev-003',             operator: 'reviewer', risk_level: null, detail_json: null, created_at: yesterday },
    { action: 'submit_review',     object_type: 'review_package',  object_id: 'rpkg-001',           operator: '张三',    risk_level: null, detail_json: null, created_at: twoDaysAgo },
    { action: 'approve_review',    object_type: 'review_package',  object_id: 'rpkg-001',           operator: 'reviewer', risk_level: null, detail_json: null, created_at: yesterday },
    { action: 'execute_publish',   object_type: 'action_draft',    object_id: 'adraft-001',         operator: 'admin',   risk_level: 'high', detail_json: JSON.stringify({ action_type: 'publish', review_pkg_id: 'rpkg-001' }), created_at: yesterday },
  ]).run();

  const replyCopilotSeed = await seedReplyCopilotKnowledge({
    createdBy: 'seed',
    owner: 'reply-copilot-seed',
    includeConsoleLogs: false,
  });
  console.log(`[seed] Reply Copilot 初始化数据写入完成：${replyCopilotSeed.count} 条运营商场景资产`);
  console.log('[seed] 知识管理数据写入完成：7篇文档 / 18条候选 / 14条资产 / 3个评审包 / 5个治理任务');

  // ── 9. MCP Server 注册数据（upsert：已存在则跳过，保留用户修改）──────────────
  console.log('[seed] 写入 MCP Server 注册数据...');
  // ── Mock 规则定义（覆盖所有 Skill 分支场景）───────────────────────────────
  const userInfoMockRules = JSON.stringify([
    // query_subscriber（含 arrears_level, usage_ratio, services, vas_total_fee）
    { tool_name: 'query_subscriber', match: 'phone == "13800000001"', response: '{"phone": "13800000001", "name": "张三", "plan_fee": 50, "status": "active", "balance": 45.8, "data_used_gb": 32.5, "data_total_gb": 50, "voice_used_min": 280, "voice_total_min": 500, "data_usage_ratio": 0.65, "voice_usage_ratio": 0.56, "is_arrears": false, "arrears_level": "none", "overdue_days": 0, "services": [{"service_id": "video_pkg", "name": "视频会员流量包（20GB/月）", "monthly_fee": 20}, {"service_id": "sms_100", "name": "短信百条包（100条/月）", "monthly_fee": 5}], "vas_total_fee": 25, "gender": null}' },
    { tool_name: 'query_subscriber', match: 'phone == "13800000002"', response: '{"phone": "13800000002", "name": "李四", "plan_fee": 128, "status": "active", "balance": 128, "data_used_gb": 89.2, "data_total_gb": -1, "voice_used_min": 0, "voice_total_min": -1, "data_usage_ratio": null, "voice_usage_ratio": null, "is_arrears": false, "arrears_level": "none", "overdue_days": 0, "services": [{"service_id": "video_pkg", "name": "视频会员流量包（20GB/月）", "monthly_fee": 20}], "vas_total_fee": 20, "gender": null}' },
    { tool_name: 'query_subscriber', match: 'phone == "13800000003"', response: '{"phone": "13800000003", "name": "王五", "plan_fee": 30, "status": "suspended", "balance": -23.5, "data_used_gb": 10, "data_total_gb": 10, "voice_used_min": 200, "voice_total_min": 200, "data_usage_ratio": 1, "voice_usage_ratio": 1, "is_arrears": true, "arrears_level": "normal", "overdue_days": 25, "services": [], "vas_total_fee": 0, "gender": null}' },
    { tool_name: 'query_subscriber', match: '', response: '{"voice_usage_ratio": 0, "is_arrears": false, "balance": 0, "data_usage_ratio": 0, "data_total_gb": 0, "data_used_gb": 0, "overdue_days": 0, "plan_fee": 0, "services": [], "voice_total_min": 0, "name": null, "status": null, "gender": null, "vas_total_fee": 0, "phone": null, "arrears_level": null, "voice_used_min": 0}' },
    // query_bill（含 breakdown, payable）
    { tool_name: 'query_bill', match: 'phone == "13800000001"', response: '{"bills": [{"phone": "13800000001", "month": "2026-03", "month_label": "2026年3月", "total": 68, "plan_fee": 50, "data_fee": 8, "voice_fee": 0, "value_added_fee": 8, "tax": 2, "status": "paid", "breakdown": [{"item": "套餐月费", "amount": 50, "ratio": 0.74}, {"item": "流量费", "amount": 8, "ratio": 0.12}, {"item": "增值业务费", "amount": 8, "ratio": 0.12}, {"item": "税费", "amount": 2, "ratio": 0.03}], "payable": false}, {"phone": "13800000001", "month": "2026-02", "month_label": "2026年2月", "total": 72.5, "plan_fee": 50, "data_fee": 12.5, "voice_fee": 0, "value_added_fee": 8, "tax": 2, "status": "paid", "breakdown": [{"item": "套餐月费", "amount": 50, "ratio": 0.69}, {"item": "流量费", "amount": 12.5, "ratio": 0.17}, {"item": "增值业务费", "amount": 8, "ratio": 0.11}, {"item": "税费", "amount": 2, "ratio": 0.03}], "payable": false}, {"phone": "13800000001", "month": "2026-01", "month_label": "2026年1月", "total": 58, "plan_fee": 50, "data_fee": 0, "voice_fee": 0, "value_added_fee": 6, "tax": 2, "status": "paid", "breakdown": [{"item": "套餐月费", "amount": 50, "ratio": 0.86}, {"item": "增值业务费", "amount": 6, "ratio": 0.1}, {"item": "税费", "amount": 2, "ratio": 0.03}], "payable": false}], "count": 3, "requested_month": null, "note": "以下为最近3个月账单"}' },
    { tool_name: 'query_bill', match: 'phone == "13800000003"', response: '{"bills": [{"phone": "13800000003", "month": "2026-03", "month_label": "2026年3月", "total": 36, "plan_fee": 30, "data_fee": 0, "voice_fee": 0, "value_added_fee": 5, "tax": 1, "status": "overdue", "breakdown": [{"item": "套餐月费", "amount": 30, "ratio": 0.83}, {"item": "增值业务费", "amount": 5, "ratio": 0.14}, {"item": "税费", "amount": 1, "ratio": 0.03}], "payable": true}], "count": 1, "requested_month": null, "note": "以下为最近1个月账单"}' },
    { tool_name: 'query_bill', match: '', response: '{"bills": [], "count": 0, "requested_month": null, "note": ""}' },
    // query_plans
    { tool_name: 'query_plans', match: 'plan_id == "plan_unlimited"', response: '{"plans": [{"plan_id": "plan_unlimited", "name": "无限流量套餐", "monthly_fee": 128, "data_gb": -1, "voice_min": -1, "sms": -1, "features": ["免费来电显示", "语音信箱", "WiFi热点共享", "国内漫游免费", "视频会员权益"], "description": "旗舰无限套餐"}], "count": 1, "requested_plan_id": "plan_unlimited"}' },
    { tool_name: 'query_plans', match: '', response: '{"plans": [{"plan_id": "plan_10g", "name": "基础10G套餐", "monthly_fee": 30, "data_gb": 10, "voice_min": 200, "features": ["免费来电显示"]}, {"plan_id": "plan_50g", "name": "畅享50G套餐", "monthly_fee": 50, "data_gb": 50, "voice_min": 500, "features": ["免费来电显示", "WiFi热点共享"]}, {"plan_id": "plan_100g", "name": "超值100G套餐", "monthly_fee": 88, "data_gb": 100, "voice_min": 1000, "features": ["免费来电显示", "WiFi热点共享", "国内漫游免费"]}, {"plan_id": "plan_unlimited", "name": "无限流量套餐", "monthly_fee": 128, "data_gb": -1, "voice_min": -1, "features": ["免费来电显示", "WiFi热点共享", "国内漫游免费", "视频会员权益"]}], "count": 4, "requested_plan_id": null}' },
    // analyze_bill_anomaly
    { tool_name: 'analyze_bill_anomaly', match: 'phone == "13800000001" && month == "2026-03"', response: '{"is_anomaly": false, "current_month": "2026-03", "previous_month": "2026-02", "current_total": 68, "previous_total": 72.5, "diff": -4.5, "change_ratio": -6, "primary_cause": "unknown", "causes": [], "recommendation": "本月费用较上月有所降低，属于正常波动。"}' },
    { tool_name: 'analyze_bill_anomaly', match: 'phone == "13800000003"', response: '{"is_anomaly": false, "current_month": "2026-03", "previous_month": "2026-02", "current_total": 36, "previous_total": 0, "diff": 36, "change_ratio": 0, "primary_cause": "unknown", "causes": [], "recommendation": "无上月账单可供对比。"}' },
    { tool_name: 'analyze_bill_anomaly', match: '', response: '{"is_anomaly": false, "current_month": "", "previous_month": "", "current_total": 0, "previous_total": 0, "diff": 0, "change_ratio": 0, "primary_cause": "unknown", "causes": [], "recommendation": "当月账单未找到。"}' },
  ]);

  const businessMockRules = JSON.stringify([
    // cancel_service
    { tool_name: 'cancel_service', match: 'phone == "13800000001" && service_id == "video_pkg"', response: '{"phone": "13800000001", "service_id": "video_pkg", "service_name": "视频会员流量包（20GB/月）", "monthly_fee": 20, "effective_end": "次月1日00:00", "refund_eligible": false, "refund_note": "当月费用不退，次月起不再扣费。"}' },
    { tool_name: 'cancel_service', match: 'phone == "13800000001" && service_id == "sms_100"', response: '{"phone": "13800000001", "service_id": "sms_100", "service_name": "短信百条包（100条/月）", "monthly_fee": 5, "effective_end": "次月1日00:00", "refund_eligible": false, "refund_note": "当月费用不退，次月起不再扣费。"}' },
    { tool_name: 'cancel_service', match: 'service_id == "nonexistent"', response: '{"monthly_fee": 0, "service_id": null, "refund_eligible": false, "refund_note": null, "effective_end": null, "phone": null, "service_name": null}' },
    { tool_name: 'cancel_service', match: '', response: '{"monthly_fee": 0, "service_id": null, "refund_eligible": false, "refund_note": null, "effective_end": null, "phone": null, "service_name": null}' },
    // issue_invoice
    { tool_name: 'issue_invoice', match: 'phone == "13800000001"', response: '{"invoice_no": "INV-202603-0001-MOCK", "phone": "13800000001", "total": 68, "email": "te****@example.com", "status": "已发送", "month": null}' },
    { tool_name: 'issue_invoice', match: '', response: '{"month": null, "phone": null, "email": null, "invoice_no": null, "status": null, "total": 0}' },
  ]);

  const diagnosisMockRules = JSON.stringify([
    // diagnose_network（含 severity, should_escalate, next_action）
    { tool_name: 'diagnose_network', match: 'issue_type == "slow_data" && phone == "13800000001"', response: '{"phone": "13800000001", "issue_type": "slow_data", "diagnostic_steps": [{"step": "账号状态", "status": "ok", "detail": "正常", "action": ""}, {"step": "流量余额", "status": "ok", "detail": "剩余17.5GB", "action": ""}, {"step": "APN配置", "status": "ok", "detail": "正常", "action": ""}, {"step": "基站信号", "status": "warning", "detail": "信号强度-85dBm，低于正常范围", "action": "建议移至开阔区域"}, {"step": "网络拥塞", "status": "warning", "detail": "当前基站负载82%", "action": "建议错峰使用或连接WiFi"}], "conclusion": "网络拥塞导致网速下降", "severity": "warning", "should_escalate": false, "next_action": "建议关闭后台高流量应用，或切换至 WiFi 网络。"}' },
    { tool_name: 'diagnose_network', match: 'issue_type == "no_signal"', response: '{"issue_type": "no_signal", "diagnostic_steps": [{"step": "账号状态", "status": "error", "detail": "账户已停机（欠费）", "action": "请先缴清欠费"}], "conclusion": "账户欠费停机，需先缴费恢复", "severity": "critical", "should_escalate": false, "next_action": "请检查 SIM 卡是否松动，或尝试切换飞行模式后重新搜网。", "phone": null}' },
    { tool_name: 'diagnose_network', match: 'issue_type == "no_network" && phone == "13800000001"', response: '{"issue_type": "no_network", "diagnostic_steps": [{"step": "账号状态", "status": "ok", "detail": "正常", "action": ""}, {"step": "APN配置", "status": "warning", "detail": "APN设置异常", "action": "请重置APN为默认值"}], "conclusion": "APN配置异常导致无法上网", "severity": "warning", "should_escalate": false, "next_action": "请检查 APN 设置是否正确，或重置网络设置。", "phone": null}' },
    { tool_name: 'diagnose_network', match: 'issue_type == "slow_data" && phone == "13800000003"', response: '{"issue_type": "slow_data", "diagnostic_steps": [{"step": "账号状态", "status": "ok", "detail": "", "action": ""}, {"step": "流量余额", "status": "error", "detail": "本月流量已用完（10GB/10GB）", "action": "建议购买流量加油包或升级套餐"}], "conclusion": "流量已耗尽", "severity": "critical", "should_escalate": false, "next_action": "建议关闭后台高流量应用，或切换至 WiFi 网络。", "phone": null}' },
    { tool_name: 'diagnose_network', match: 'issue_type == "call_drop"', response: '{"issue_type": "call_drop", "diagnostic_steps": [{"step": "账号状态", "status": "ok", "detail": "正常", "action": ""}, {"step": "基站信号", "status": "ok", "detail": "信号良好", "action": ""}, {"step": "网络拥塞", "status": "ok", "detail": "负载正常", "action": ""}], "conclusion": "各项指标正常，建议观察", "severity": "normal", "should_escalate": false, "next_action": "各项检测正常。如问题持续，建议重启设备后观察。", "phone": null}' },
    { tool_name: 'diagnose_network', match: '', response: '{"next_action": null, "should_escalate": false, "diagnostic_steps": [], "severity": null, "issue_type": null, "phone": null, "conclusion": null}' },
    // diagnose_app（含 risk_level, next_step, action_count）
    { tool_name: 'diagnose_app', match: 'issue_type == "app_locked"', response: '{"issue_type": "app_locked", "diagnostic_steps": [{"step": "账号状态", "status": "error", "detail": "账号已被锁定", "action": "需联系安全团队解锁", "escalate": true}], "conclusion": "账号被锁定", "escalation_path": "security_team", "customer_actions": ["联系客服热线10000", "携带身份证到营业厅"], "risk_level": "high", "next_step": "检测到高风险问题，请立即转接安全团队处理，请勿让客户继续尝试登录。", "action_count": 2, "phone": null, "lock_reason": null}' },
    { tool_name: 'diagnose_app', match: 'issue_type == "login_failed"', response: '{"issue_type": "login_failed", "diagnostic_steps": [{"step": "登录历史", "status": "warning", "detail": "连续3次密码错误", "action": "重置密码"}], "conclusion": "密码错误次数过多", "escalation_path": "self_service", "customer_actions": ["通过App找回密码", "使用短信验证码登录"], "risk_level": "none", "next_step": "所有检查项通过，请引导客户重新尝试登录。", "action_count": 2, "phone": null, "lock_reason": null}' },
    { tool_name: 'diagnose_app', match: 'issue_type == "device_incompatible"', response: '{"issue_type": "device_incompatible", "diagnostic_steps": [{"step": "App版本", "status": "error", "detail": "当前版本3.0.0，最新3.5.0", "action": "请更新至最新版本"}], "conclusion": "App版本过低", "escalation_path": "self_service", "customer_actions": ["前往应用商店更新"], "risk_level": "low", "next_step": "发现可修复问题，请引导客户按建议操作后重新尝试。", "action_count": 1, "phone": null, "lock_reason": null}' },
    { tool_name: 'diagnose_app', match: 'issue_type == "suspicious_activity"', response: '{"issue_type": "suspicious_activity", "diagnostic_steps": [{"step": "设备安全", "status": "error", "detail": "检测到异常登录地点", "action": "建议修改密码并开启双重验证", "escalate": true}], "conclusion": "存在异常活动", "escalation_path": "security_team", "customer_actions": ["立即修改密码", "检查账户是否有异常操作"], "risk_level": "high", "next_step": "检测到高风险问题，请立即转接安全团队处理，请勿让客户继续尝试登录。", "action_count": 2, "phone": null, "lock_reason": null}' },
    { tool_name: 'diagnose_app', match: '', response: '{"diagnostic_steps": [{"step": "全部检查", "status": "ok", "detail": "未发现异常", "action": ""}], "conclusion": "App运行正常", "escalation_path": "self_service", "customer_actions": [], "risk_level": "none", "next_step": "所有检查项通过，请引导客户重新尝试登录。", "action_count": 0, "phone": null, "lock_reason": null, "issue_type": null}' },
  ]);

  const outboundMockRules = JSON.stringify([
    // record_call_result（含 result_category）
    { tool_name: 'record_call_result', match: 'result == "ptp"', response: '{"result_category": "positive", "callback_time": null, "result": null, "remark": null, "ptp_date": null}' },
    { tool_name: 'record_call_result', match: 'result == "refusal"', response: '{"result_category": "negative", "callback_time": null, "result": null, "remark": null, "ptp_date": null}' },
    { tool_name: 'record_call_result', match: '', response: '{"result_category": "neutral", "callback_time": null, "result": null, "remark": null, "ptp_date": null}' },
    // send_followup_sms
    { tool_name: 'send_followup_sms', match: 'phone == "13900000099"', response: '{"phone": null, "status": null, "context": null, "sms_type": null}' },
    { tool_name: 'send_followup_sms', match: 'sms_type == "payment_link"', response: '{"phone": null, "status": null, "context": null, "sms_type": null}' },
    { tool_name: 'send_followup_sms', match: 'sms_type == "plan_detail"', response: '{"phone": null, "status": null, "context": null, "sms_type": null}' },
    { tool_name: 'send_followup_sms', match: '', response: '{"phone": null, "status": null, "context": null, "sms_type": null}' },
    // create_callback_task
    { tool_name: 'create_callback_task', match: '', response: '{"callback_task_id": "CB-MOCK-001", "callback_phone": null, "product_name": null, "customer_name": null, "status": null, "original_task_id": null, "preferred_time": null}' },
    // record_marketing_result（含 conversion_tag, is_dnd）
    { tool_name: 'record_marketing_result', match: 'result == "converted"', response: '{"conversion_tag": "converted", "is_dnd": false, "dnd_note": null, "is_callback": false, "callback_time": null, "result": null, "campaign_id": null, "phone": null}' },
    { tool_name: 'record_marketing_result', match: 'result == "dnd"', response: '{"conversion_tag": "dnd", "is_dnd": true, "dnd_note": "客户已加入免打扰名单，本活动不再拨打。", "is_callback": false, "callback_time": null, "result": null, "campaign_id": null, "phone": null}' },
    { tool_name: 'record_marketing_result', match: '', response: '{"conversion_tag": "cold", "is_dnd": false, "dnd_note": null, "is_callback": false, "callback_time": null, "result": null, "campaign_id": null, "phone": null}' },
  ]);

  const accountMockRules = JSON.stringify([
    // verify_identity
    { tool_name: 'verify_identity', match: 'otp == "1234"', response: '{"verified": true, "customer_name": "张三", "verification_method": null}' },
    { tool_name: 'verify_identity', match: 'otp == "0000"', response: '{"verified": true, "customer_name": "用户", "verification_method": null}' },
    { tool_name: 'verify_identity', match: '', response: '{"verified": false, "verification_method": null, "customer_name": null}' },
    // check_account_balance
    { tool_name: 'check_account_balance', match: 'phone == "13800000003"', response: '{"phone": "13800000003", "balance": -23.5, "has_arrears": true, "arrears_amount": 23.5, "status": "suspended"}' },
    { tool_name: 'check_account_balance', match: 'phone == "13800000001"', response: '{"phone": "13800000001", "balance": 45.8, "has_arrears": false, "arrears_amount": 0, "status": "active"}' },
    { tool_name: 'check_account_balance', match: '', response: '{"balance": 0, "has_arrears": false, "arrears_amount": 0, "status": "active", "phone": null}' },
    // check_contracts
    { tool_name: 'check_contracts', match: 'phone == "13800000001"', response: '{"phone": "13800000001", "contracts": [{"contract_id": "CT001", "name": "24个月合约套餐", "end_date": "2027-06-30", "penalty": 200, "risk_level": "high"}], "has_active_contracts": true, "has_high_risk": true}' },
    { tool_name: 'check_contracts', match: 'phone == "13800000002"', response: '{"phone": "13800000002", "contracts": [], "has_active_contracts": false, "has_high_risk": false}' },
    { tool_name: 'check_contracts', match: '', response: '{"contracts": [], "has_active_contracts": false, "has_high_risk": false, "phone": null}' },
    // apply_service_suspension
    { tool_name: 'apply_service_suspension', match: 'phone == "13800000001"', response: '{"success": true, "phone": "13800000001", "suspension_type": "temporary", "effective_date": "2026-03-22", "resume_deadline": "2026-06-22", "monthly_fee": 5.00, "message": "停机保号已生效，号码 13800000001 的语音/短信/流量服务已暂停，每月保号费 ¥5.00，请在 2026-06-22 前办理复机"}' },
    { tool_name: 'apply_service_suspension', match: 'phone == "13800000003"', response: '{"success": false, "message": "该号码存在欠费，请先结清欠费后再办理停机保号"}' },
    { tool_name: 'apply_service_suspension', match: '', response: '{"success": true, "suspension_type": "temporary", "effective_date": "2026-03-22", "resume_deadline": "2026-06-22", "monthly_fee": 5.00, "message": "停机保号已生效"}' },
  ]);

  db.insert(mcpServers).values([
    {
      id: 'mcp-internal', name: 'internal-service',
      description: '统一内部服务（用户信息、业务办理、故障诊断、外呼、账户）',
      transport: 'http', enabled: true, kind: 'internal',
      url: `http://127.0.0.1:${process.env.MCP_INTERNAL_PORT ?? 18003}/mcp`,
      tools_json: JSON.stringify([
        // user-info
        { name: 'query_subscriber', description: '根据手机号查询电信用户信息（套餐、状态、余额、用量分析、增值业务详情、欠费分层）', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' } }, required: ['phone'] } },
        { name: 'query_bill', description: '查询用户指定月份的账单明细（含费用拆解 breakdown）', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, month: { type: 'string', description: '账单月份，格式 YYYY-MM' } }, required: ['phone'] } },
        { name: 'query_plans', description: '获取所有可用套餐列表，或查询指定套餐详情', inputSchema: { type: 'object', properties: { plan_id: { type: 'string', description: '套餐 ID，不传则返回所有套餐列表' } } } },
        { name: 'analyze_bill_anomaly', description: '分析用户账单异常：自动对比当月与上月账单，定位费用异常原因', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, month: { type: 'string', description: '当月账期，格式 YYYY-MM' } }, required: ['phone', 'month'] } },
        // business
        { name: 'cancel_service', description: '退订用户已订阅的增值业务', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, service_id: { type: 'string', description: '要退订的业务 ID（如 video_pkg、sms_100）' } }, required: ['phone', 'service_id'] } },
        { name: 'issue_invoice', description: '为指定用户的指定月份账单开具电子发票', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, month: { type: 'string', description: '账单月份，格式 YYYY-MM' }, email: { type: 'string', description: '发票接收邮箱' } }, required: ['phone', 'month', 'email'] } },
        // diagnosis
        { name: 'diagnose_network', description: '对指定手机号进行网络故障诊断', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, issue_type: { type: 'string', enum: ['no_signal', 'slow_data', 'call_drop', 'no_network'], description: '故障类型' }, lang: { type: 'string', enum: ['zh', 'en'], description: '语言' } }, required: ['phone', 'issue_type'] } },
        { name: 'diagnose_app', description: '对指定手机号的营业厅 App 进行问题诊断', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, issue_type: { type: 'string', enum: ['app_locked', 'login_failed', 'device_incompatible', 'suspicious_activity'], description: '问题类型' } }, required: ['phone', 'issue_type'] } },
        // outbound
        { name: 'record_call_result', description: '记录本次外呼通话结果', inputSchema: { type: 'object', properties: { result: { type: 'string', enum: ['ptp', 'refusal', 'dispute', 'no_answer', 'busy', 'power_off', 'converted', 'callback', 'not_interested', 'non_owner', 'verify_failed', 'dnd'], description: '通话结果' }, remark: { type: 'string', description: '备注' }, callback_time: { type: 'string', description: '回拨时间' }, ptp_date: { type: 'string', description: '承诺还款日期' } }, required: ['result'] } },
        { name: 'send_followup_sms', description: '向客户发送跟进短信（含静默时段校验）', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '客户手机号' }, sms_type: { type: 'string', enum: ['payment_link', 'plan_detail', 'callback_reminder', 'product_detail'], description: '短信类型' }, context: { type: 'string', enum: ['collection', 'marketing'], description: '发送场景' } }, required: ['phone', 'sms_type'] } },
        { name: 'create_callback_task', description: '创建回访任务', inputSchema: { type: 'object', properties: { original_task_id: { type: 'string', description: '原始任务 ID' }, callback_phone: { type: 'string', description: '回访电话' }, preferred_time: { type: 'string', description: '客户期望的回访时间' }, customer_name: { type: 'string', description: '客户姓名' }, product_name: { type: 'string', description: '关联产品名' } }, required: ['original_task_id', 'callback_phone', 'preferred_time'] } },
        { name: 'record_marketing_result', description: '记录营销外呼的通话结果', inputSchema: { type: 'object', properties: { campaign_id: { type: 'string', description: '营销活动 ID' }, phone: { type: 'string', description: '客户手机号' }, result: { type: 'string', enum: ['converted', 'callback', 'not_interested', 'no_answer', 'busy', 'wrong_number', 'dnd'], description: '营销结果' }, callback_time: { type: 'string', description: '回拨时间' } }, required: ['campaign_id', 'phone', 'result'] } },
        // account
        { name: 'verify_identity', description: '验证用户身份（通过短信验证码）', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, otp: { type: 'string', description: '短信验证码' } }, required: ['phone', 'otp'] } },
        { name: 'check_account_balance', description: '查询用户账户余额和欠费状态', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' } }, required: ['phone'] } },
        { name: 'check_contracts', description: '查询用户当前有效合约列表', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' } }, required: ['phone'] } },
        { name: 'apply_service_suspension', description: '执行停机保号操作，暂停语音/短信/流量服务，保留号码', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' } }, required: ['phone'] } },
      ]),
      mock_rules: JSON.stringify([...JSON.parse(userInfoMockRules), ...JSON.parse(businessMockRules), ...JSON.parse(diagnosisMockRules), ...JSON.parse(outboundMockRules), ...JSON.parse(accountMockRules)]),
      created_at: now, updated_at: now,
    },
    // ── 待接入服务（enabled=false，测试不可用场景）──
    {
      id: 'mcp-payment', name: 'payment-service',
      description: '支付服务（待接入）',
      transport: 'http', enabled: false, kind: 'planned',
      url: 'http://127.0.0.1:18009/mcp',
      tools_json: JSON.stringify([
        { name: 'process_payment', description: '处理用户缴费（待接入）', inputSchema: { type: 'object', properties: { phone: { type: 'string' }, amount: { type: 'number' } }, required: ['phone', 'amount'] } },
      ]),
      mock_rules: null,
      created_at: now, updated_at: now,
    },
    // ── 外部第三方 MCP（remote_mcp 类型，需配置 API Key 后启用）──
    {
      id: 'mcp-amap', name: 'amap-maps-service',
      description: '高德地图 MCP 服务（POI 搜索、周边搜索、地理编码、路径规划）',
      transport: 'http', enabled: false, kind: 'external',
      url: 'https://mcp.amap.com/sse',
      tools_json: JSON.stringify([
        { name: 'maps_text_search', description: '关键词搜索 POI（如"营业厅"、"电信大楼"）', inputSchema: { type: 'object', properties: { keywords: { type: 'string', description: '搜索关键词' }, city: { type: 'string', description: '城市名称' }, page_size: { type: 'number', description: '每页结果数' } }, required: ['keywords'] } },
        { name: 'maps_around_search', description: '周边搜索（以某点为圆心，搜索指定半径内的 POI）', inputSchema: { type: 'object', properties: { keywords: { type: 'string', description: '搜索关键词' }, location: { type: 'string', description: '中心点坐标，格式: 经度,纬度' }, radius: { type: 'number', description: '搜索半径（米），默认 3000' } }, required: ['location'] } },
        { name: 'maps_geo', description: '地理编码：将地址转换为经纬度坐标', inputSchema: { type: 'object', properties: { address: { type: 'string', description: '待解析地址' }, city: { type: 'string', description: '城市名称（提高准确度）' } }, required: ['address'] } },
        { name: 'maps_direction_walking', description: '步行路径规划：规划两点间步行路线', inputSchema: { type: 'object', properties: { origin: { type: 'string', description: '起点坐标，格式: 经度,纬度' }, destination: { type: 'string', description: '终点坐标，格式: 经度,纬度' } }, required: ['origin', 'destination'] } },
      ]),
      mock_rules: null,
      created_at: now, updated_at: now,
    },
  ]).onConflictDoNothing().run();

  // 补全 Mock 规则：如果已有记录的 mock_rules 为空或规则数少于 seed 定义，用 seed 覆盖
  const mcpSeedRules: Record<string, string> = {
    'mcp-internal': JSON.stringify([...JSON.parse(userInfoMockRules), ...JSON.parse(businessMockRules), ...JSON.parse(diagnosisMockRules), ...JSON.parse(outboundMockRules), ...JSON.parse(accountMockRules)]),
  };
  for (const [id, seedRules] of Object.entries(mcpSeedRules)) {
    const row = db.select().from(mcpServers).where(eq(mcpServers.id, id)).get();
    if (!row) continue;
    const existingRules = row.mock_rules ? JSON.parse(row.mock_rules) : [];
    const seedRulesParsed = JSON.parse(seedRules);
    if (existingRules.length < seedRulesParsed.length) {
      db.update(mcpServers).set({ mock_rules: seedRules }).where(eq(mcpServers.id, id)).run();
    }
  }

  // 补全工具定义：如果已有记录的 tools_json 中工具缺少 inputSchema，用 seed 补全
  const mcpSeedTools: Record<string, string> = {};
  // 从 insert values 中提取 seed 的 tools_json（重新构建，避免重复定义）
  for (const row of db.select().from(mcpServers).all()) {
    // 只处理 seed 创建的 5 个 server
    if (row.id !== 'mcp-internal') continue;
    if (!row.tools_json) continue;
    const tools = JSON.parse(row.tools_json) as Array<{ name: string; inputSchema?: Record<string, unknown> }>;
    const hasEmptySchema = tools.some(t => !t.inputSchema || Object.keys(t.inputSchema).length === 0);
    if (!hasEmptySchema) continue;
    // Need to backfill — find the seed definition from the insert above
    mcpSeedTools[row.id] = row.id; // mark for update
  }
  // Seed tool definitions with full inputSchema
  const seedToolDefs: Record<string, Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }>> = {
    'mcp-internal': [
      // user-info
      { name: 'query_subscriber', description: '根据手机号查询电信用户信息（套餐、状态、余额、用量分析、增值业务详情、欠费分层）', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' } }, required: ['phone'] } },
      { name: 'query_bill', description: '查询用户指定月份的账单明细（含费用拆解 breakdown）', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, month: { type: 'string', description: '账单月份，格式 YYYY-MM' } }, required: ['phone'] } },
      { name: 'query_plans', description: '获取所有可用套餐列表，或查询指定套餐详情', inputSchema: { type: 'object', properties: { plan_id: { type: 'string', description: '套餐 ID，不传则返回所有套餐列表' } } } },
      { name: 'analyze_bill_anomaly', description: '分析用户账单异常：自动对比当月与上月账单，定位费用异常原因', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, month: { type: 'string', description: '当月账期，格式 YYYY-MM' } }, required: ['phone', 'month'] } },
      // business
      { name: 'cancel_service', description: '退订用户已订阅的增值业务', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, service_id: { type: 'string', description: '要退订的业务 ID（如 video_pkg、sms_100）' } }, required: ['phone', 'service_id'] } },
      { name: 'issue_invoice', description: '为指定用户的指定月份账单开具电子发票', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, month: { type: 'string', description: '账单月份，格式 YYYY-MM' }, email: { type: 'string', description: '发票接收邮箱' } }, required: ['phone', 'month', 'email'] } },
      // diagnosis
      { name: 'diagnose_network', description: '对指定手机号进行网络故障诊断', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, issue_type: { type: 'string', enum: ['no_signal', 'slow_data', 'call_drop', 'no_network'], description: '故障类型' }, lang: { type: 'string', enum: ['zh', 'en'], description: '语言' } }, required: ['phone', 'issue_type'] } },
      { name: 'diagnose_app', description: '对指定手机号的营业厅 App 进行问题诊断', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, issue_type: { type: 'string', enum: ['app_locked', 'login_failed', 'device_incompatible', 'suspicious_activity'], description: '问题类型' } }, required: ['phone', 'issue_type'] } },
      // outbound
      { name: 'record_call_result', description: '记录本次外呼催收通话结果（含 PTP 日期校验和结果分类）', inputSchema: { type: 'object', properties: { result: { type: 'string', enum: ['ptp', 'refusal', 'dispute', 'no_answer', 'busy', 'power_off', 'converted', 'callback', 'not_interested', 'non_owner', 'verify_failed', 'dnd'], description: '通话结果' }, remark: { type: 'string', description: '备注' }, callback_time: { type: 'string', description: '回拨时间' }, ptp_date: { type: 'string', description: '承诺还款日期' } }, required: ['result'] } },
      { name: 'send_followup_sms', description: '向客户发送跟进短信（含静默时段校验）', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '客户手机号' }, sms_type: { type: 'string', enum: ['payment_link', 'plan_detail', 'callback_reminder', 'product_detail'], description: '短信类型' }, context: { type: 'string', enum: ['collection', 'marketing'], description: '发送场景' } }, required: ['phone', 'sms_type'] } },
      { name: 'create_callback_task', description: '创建回访任务', inputSchema: { type: 'object', properties: { original_task_id: { type: 'string', description: '原始任务 ID' }, callback_phone: { type: 'string', description: '回访电话' }, preferred_time: { type: 'string', description: '客户期望的回访时间' }, customer_name: { type: 'string', description: '客户姓名' }, product_name: { type: 'string', description: '关联产品名' } }, required: ['original_task_id', 'callback_phone', 'preferred_time'] } },
      { name: 'record_marketing_result', description: '记录营销外呼的通话结果（含转化标签、DND 标记）', inputSchema: { type: 'object', properties: { campaign_id: { type: 'string', description: '营销活动 ID' }, phone: { type: 'string', description: '客户手机号' }, result: { type: 'string', enum: ['converted', 'callback', 'not_interested', 'no_answer', 'busy', 'wrong_number', 'dnd'], description: '营销结果' }, callback_time: { type: 'string', description: '回拨时间' } }, required: ['campaign_id', 'phone', 'result'] } },
      // account
      { name: 'verify_identity', description: '验证用户身份（通过短信验证码）', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, otp: { type: 'string', description: '短信验证码' } }, required: ['phone', 'otp'] } },
      { name: 'check_account_balance', description: '查询用户账户余额和欠费状态', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' } }, required: ['phone'] } },
      { name: 'check_contracts', description: '查询用户当前有效合约列表', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' } }, required: ['phone'] } },
    ],
  };
  for (const [id, seedTools] of Object.entries(seedToolDefs)) {
    const row = db.select().from(mcpServers).where(eq(mcpServers.id, id)).get();
    if (!row) continue;
    const existing = row.tools_json ? JSON.parse(row.tools_json) as Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> : [];
    const hasEmptySchema = existing.some(t => !t.inputSchema || Object.keys(t.inputSchema).length === 0);
    if (!hasEmptySchema && existing.length >= seedTools.length) continue;
    // Merge: update inputSchema for existing tools, add missing tools
    const seedMap = new Map(seedTools.map(t => [t.name, t]));
    const merged = existing.map(t => {
      const seed = seedMap.get(t.name);
      if (seed && (!t.inputSchema || Object.keys(t.inputSchema).length === 0)) {
        return { ...t, inputSchema: seed.inputSchema, description: t.description || seed.description };
      }
      return t;
    });
    // Add tools that exist in seed but not in DB
    for (const st of seedTools) {
      if (!existing.some(t => t.name === st.name)) merged.push(st);
    }
    db.update(mcpServers).set({ tools_json: JSON.stringify(merged) }).where(eq(mcpServers.id, id)).run();
  }

  console.log('[seed] MCP Server 注册数据写入完成（Mock 规则与工具 Schema 已补全）');

  // ── 9b. MCP Tools ──────────────────────────────────────────────────────────
  console.log('[seed] 写入 MCP Tools...');
  db.delete(mcpTools).run();

  // ── 工具定义 ──────────────────────────────────────────────────────────────
  const toolDefs: Array<{
    tool_name: string; tool_desc: string; server_id: string;
    input_schema: Record<string, unknown>;
    mock_source: string;
    mocked?: boolean;
    readOnly?: boolean; // true=查询类（不拦截），false=操作类（需前置检查）
    disabled?: boolean; // true=LLM 不可见（disposition 模式），resolve() 仍可找到
  }> = [
    // user-info-service（全部查询类）
    { server_id: 'mcp-internal',tool_name: 'query_subscriber', tool_desc: '根据手机号查询电信用户信息（套餐、状态、余额、用量分析、增值业务详情、欠费分层）', input_schema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' } }, required: ['phone'] }, mock_source: 'mcp-internal', readOnly: true },
    { server_id: 'mcp-internal',tool_name: 'query_bill', tool_desc: '查询用户指定月份的账单明细（含费用拆解 breakdown）', input_schema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, month: { type: 'string', description: '账单月份，格式 YYYY-MM' } }, required: ['phone'] }, mock_source: 'mcp-internal', readOnly: true },
    { server_id: 'mcp-internal',tool_name: 'query_plans', tool_desc: '获取所有可用套餐列表，或查询指定套餐详情', input_schema: { type: 'object', properties: { plan_id: { type: 'string', description: '套餐 ID' } } }, mock_source: 'mcp-internal', readOnly: true },
    { server_id: 'mcp-internal',tool_name: 'analyze_bill_anomaly', tool_desc: '分析用户账单异常：自动对比当月与上月账单，定位费用异常原因', input_schema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, month: { type: 'string', description: '当月账期，格式 YYYY-MM' } }, required: ['phone', 'month'] }, mock_source: 'mcp-internal', readOnly: true },
    // business-service（cancel/issue 是操作类）
    { server_id: 'mcp-internal',tool_name: 'cancel_service', tool_desc: '退订用户已订阅的增值业务', input_schema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, service_id: { type: 'string', description: '要退订的业务 ID' } }, required: ['phone', 'service_id'] }, mock_source: 'mcp-internal', readOnly: false, disabled: true },
    { server_id: 'mcp-internal', tool_name: 'issue_invoice', tool_desc: '为指定用户的指定月份账单开具电子发票', input_schema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, month: { type: 'string', description: '账单月份' }, email: { type: 'string', description: '邮箱' } }, required: ['phone', 'month', 'email'] }, mock_source: 'mcp-internal', readOnly: false, disabled: true },
    // diagnosis-service（全部查询类）
    { server_id: 'mcp-internal', tool_name: 'diagnose_network', tool_desc: '对指定手机号进行网络故障诊断', input_schema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, issue_type: { type: 'string', enum: ['no_signal', 'slow_data', 'call_drop', 'no_network'], description: '故障类型' } }, required: ['phone', 'issue_type'] }, mock_source: 'mcp-internal', readOnly: true },
    { server_id: 'mcp-internal', tool_name: 'diagnose_app', tool_desc: '对指定手机号的营业厅 App 进行问题诊断', input_schema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, issue_type: { type: 'string', enum: ['app_locked', 'login_failed', 'device_incompatible', 'suspicious_activity'], description: '问题类型' } }, required: ['phone', 'issue_type'] }, mock_source: 'mcp-internal', readOnly: true },
    // outbound-service（record/send/create 是操作类）
    { server_id: 'mcp-internal', tool_name: 'record_call_result', tool_desc: '记录本次外呼催收通话结果（含 PTP 日期校验和结果分类）', input_schema: { type: 'object', properties: { result: { type: 'string', enum: ['ptp', 'refusal', 'dispute', 'no_answer', 'busy', 'power_off', 'converted', 'callback', 'not_interested', 'non_owner', 'verify_failed', 'dnd'], description: '通话结果' }, remark: { type: 'string', description: '备注' }, ptp_date: { type: 'string', description: '承诺还款日期' }, callback_time: { type: 'string', description: '回访时间' } }, required: ['result'] }, mock_source: 'mcp-internal', readOnly: false },
    { server_id: 'mcp-internal', tool_name: 'send_followup_sms', tool_desc: '向客户发送跟进短信（含静默时段校验）', input_schema: { type: 'object', properties: { phone: { type: 'string', description: '客户手机号' }, sms_type: { type: 'string', enum: ['payment_link', 'plan_detail', 'callback_reminder', 'product_detail'], description: '短信类型' }, context: { type: 'string', enum: ['collection', 'marketing'], description: '发送场景' } }, required: ['phone', 'sms_type'] }, mock_source: 'mcp-internal', readOnly: false },
    { server_id: 'mcp-internal', tool_name: 'create_callback_task', tool_desc: '创建回访任务', input_schema: { type: 'object', properties: { original_task_id: { type: 'string', description: '原始任务 ID' }, callback_phone: { type: 'string', description: '回访电话' }, preferred_time: { type: 'string', description: '回访时间' } }, required: ['original_task_id', 'callback_phone', 'preferred_time'] }, mock_source: 'mcp-internal', readOnly: false },
    { server_id: 'mcp-internal', tool_name: 'record_marketing_result', tool_desc: '记录营销外呼的通话结果（含转化标签、DND 标记）', input_schema: { type: 'object', properties: { campaign_id: { type: 'string', description: '营销活动 ID' }, phone: { type: 'string', description: '客户手机号' }, result: { type: 'string', enum: ['converted', 'callback', 'not_interested', 'no_answer', 'busy', 'wrong_number', 'dnd'], description: '营销结果' }, callback_time: { type: 'string', description: '回访时间' } }, required: ['campaign_id', 'phone', 'result'] }, mock_source: 'mcp-internal', readOnly: false },
    // account-service（verify/check 是查询类，apply 是操作类）
    { server_id: 'mcp-internal', tool_name: 'verify_identity', tool_desc: '验证用户身份（通过短信验证码）', input_schema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, otp: { type: 'string', description: '短信验证码' } }, required: ['phone', 'otp'] }, mock_source: 'mcp-internal', readOnly: true },
    { server_id: 'mcp-internal', tool_name: 'check_account_balance', tool_desc: '查询用户账户余额和欠费状态', input_schema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' } }, required: ['phone'] }, mock_source: 'mcp-internal', readOnly: true },
    { server_id: 'mcp-internal', tool_name: 'check_contracts', tool_desc: '查询用户当前有效合约列表', input_schema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' } }, required: ['phone'] }, mock_source: 'mcp-internal', readOnly: true },
    { server_id: 'mcp-internal', tool_name: 'apply_service_suspension', tool_desc: '执行停机保号操作，暂停语音/短信/流量服务，保留号码', input_schema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' } }, required: ['phone'] }, mock_source: 'mcp-internal', readOnly: false, mocked: true, disabled: true },
    // L2 聚合读工具（ScriptAdapter in-memory handler，不经 MCP Server）
    { server_id: 'mcp-internal', tool_name: 'get_bill_context', tool_desc: '一次性获取用户账单完整上下文（用户信息+账单明细+异常分析），减少多轮工具调用', input_schema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, month: { type: 'string', description: '账单月份，格式 YYYY-MM，不填则返回最近3个月' } }, required: ['phone'] }, mock_source: 'mcp-internal', readOnly: true },
    { server_id: 'mcp-internal', tool_name: 'get_plan_context', tool_desc: '一次性获取用户套餐完整上下文（用户信息+可用套餐列表），用于套餐查询和变更咨询', input_schema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' } }, required: ['phone'] }, mock_source: 'mcp-internal', readOnly: true },
    { server_id: 'mcp-internal', tool_name: 'get_cancel_context', tool_desc: '一次性获取退订所需完整上下文（用户信息+套餐列表+账单），用于业务退订前的信息收集', input_schema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' } }, required: ['phone'] }, mock_source: 'mcp-internal', readOnly: true },
    // amap-maps-service（外部第三方 MCP，全部查询类）
    { server_id: 'mcp-amap', tool_name: 'maps_text_search', tool_desc: '关键词搜索 POI（如"营业厅"、"电信大楼"）', input_schema: { type: 'object', properties: { keywords: { type: 'string', description: '搜索关键词' }, city: { type: 'string', description: '城市名称' }, page_size: { type: 'number', description: '每页结果数' } }, required: ['keywords'] }, mock_source: '', readOnly: true },
    { server_id: 'mcp-amap', tool_name: 'maps_around_search', tool_desc: '周边搜索（以某点为圆心，搜索指定半径内的 POI）', input_schema: { type: 'object', properties: { keywords: { type: 'string', description: '搜索关键词' }, location: { type: 'string', description: '中心点坐标，格式: 经度,纬度' }, radius: { type: 'number', description: '搜索半径（米）' } }, required: ['location'] }, mock_source: '', readOnly: true },
    { server_id: 'mcp-amap', tool_name: 'maps_geo', tool_desc: '地理编码：将地址转换为经纬度坐标', input_schema: { type: 'object', properties: { address: { type: 'string', description: '待解析地址' }, city: { type: 'string', description: '城市名称' } }, required: ['address'] }, mock_source: '', readOnly: true },
    { server_id: 'mcp-amap', tool_name: 'maps_direction_walking', tool_desc: '步行路径规划：规划两点间步行路线', input_schema: { type: 'object', properties: { origin: { type: 'string', description: '起点坐标' }, destination: { type: 'string', description: '终点坐标' } }, required: ['origin', 'destination'] }, mock_source: '', readOnly: true },
  ];

  // 从 server 的 mock_rules 中提取每个 tool 的 rules
  const allServerRules = new Map<string, Array<{ tool_name: string; match: string; response: string }>>();
  for (const server of db.select().from(mcpServers).all()) {
    if (server.mock_rules) {
      try { allServerRules.set(server.id, JSON.parse(server.mock_rules)); } catch { /* ignore */ }
    }
  }

  for (const t of toolDefs) {
    const serverRules = allServerRules.get(t.mock_source) ?? [];
    const toolRules = serverRules.filter(r => r.tool_name === t.tool_name);

    db.insert(mcpTools).values({
      id: `tool-${t.tool_name}`,
      name: t.tool_name,
      description: t.tool_desc,
      server_id: t.server_id,
      input_schema: JSON.stringify(t.input_schema),
      mock_rules: toolRules.length > 0 ? JSON.stringify(toolRules) : null,
      annotations: JSON.stringify({ readOnlyHint: t.readOnly ?? false }),
      mocked: t.mocked ?? false,
      disabled: t.disabled ?? false,
      created_at: now,
      updated_at: now,
    }).onConflictDoNothing().run();
  }

  // ── 已下线工具（disabled=true，测试禁用拦截场景）──
  db.insert(mcpTools).values({
    id: 'tool-transfer_balance',
    name: 'transfer_balance',
    description: '余额转移（已下线）',
    server_id: 'mcp-internal',
    input_schema: JSON.stringify({ type: 'object', properties: { from_phone: { type: 'string' }, to_phone: { type: 'string' }, amount: { type: 'number' } }, required: ['from_phone', 'to_phone', 'amount'] }),
    mocked: false,
    disabled: true,
    annotations: JSON.stringify({ readOnlyHint: false }),
    created_at: now,
    updated_at: now,
  }).onConflictDoNothing().run();

  // Output Schema（输出契约）— 存文件路径，实际内容在 packages/shared-db/src/schemas/*.json
  const SCHEMA_DIR = 'packages/shared-db/src/schemas';
  const toolNames = [
    'query_subscriber', 'query_bill', 'query_plans', 'analyze_bill_anomaly',
    'cancel_service', 'issue_invoice', 'diagnose_network', 'diagnose_app',
    'record_call_result', 'send_followup_sms', 'create_callback_task',
    'record_marketing_result', 'verify_identity', 'check_account_balance', 'check_contracts',
    'apply_service_suspension',
    'maps_text_search', 'maps_around_search', 'maps_geo', 'maps_direction_walking',
  ];
  for (const toolName of toolNames) {
    const schemaPath = `${SCHEMA_DIR}/${toolName}.json`;
    db.update(mcpTools).set({ output_schema: schemaPath, updated_at: now }).where(eq(mcpTools.name, toolName)).run();
  }
  console.log(`[seed] Output Schema: ${toolNames.length} 个工具已关联契约文件`);

  console.log(`[seed] MCP Tools: ${toolDefs.length} 个`);

  // ── 9c. Connectors（三层架构：MCP Server 的下游后端依赖）─────────────────
  // Connectors = MCP Server 往下游访问的依赖边界，不是 MCP Server 自身
  // 按 mock_apis 业务域拆分，未来替换真实系统时只需改 URL + auth
  console.log('[seed] 写入 Connectors...');
  db.delete(connectors).run();

  const MOCK_BASE = `http://127.0.0.1:${process.env.MOCK_APIS_PORT ?? 18008}`;
  const connectorDefs: Array<{
    id: string; name: string; type: string;
    config: Record<string, unknown>; description: string;
  }> = [
    { id: 'conn-customer',   name: 'customer-api',   type: 'api', description: '客户信息服务（用户档案、合约、增值业务、偏好）',   config: { base_url: `${MOCK_BASE}/api/customer`,  timeout: 10000 } },
    { id: 'conn-billing',    name: 'billing-api',    type: 'api', description: '计费服务（账单查询、账单明细、异常分析、缴费记录）', config: { base_url: `${MOCK_BASE}/api/billing`,   timeout: 10000 } },
    { id: 'conn-catalog',    name: 'catalog-api',    type: 'api', description: '产品目录服务（套餐列表、增值业务目录）',            config: { base_url: `${MOCK_BASE}/api/catalog`,   timeout: 10000 } },
    { id: 'conn-orders',     name: 'orders-api',     type: 'api', description: '订单服务（退订、工单查询、退款）',                  config: { base_url: `${MOCK_BASE}/api/orders`,    timeout: 10000 } },
    { id: 'conn-invoice',    name: 'invoice-api',    type: 'api', description: '发票服务（电子发票开具）',                          config: { base_url: `${MOCK_BASE}/api/invoice`,   timeout: 10000 } },
    { id: 'conn-identity',   name: 'identity-api',   type: 'api', description: '身份认证服务（OTP 发送、验证码校验、登录事件）',    config: { base_url: `${MOCK_BASE}/api/identity`,  timeout: 10000 } },
    { id: 'conn-diagnosis',  name: 'diagnosis-api',  type: 'api', description: '诊断服务（网络故障分析、App 问题分析）',            config: { base_url: `${MOCK_BASE}/api/diagnosis`, timeout: 10000 } },
    { id: 'conn-outreach',   name: 'outreach-api',   type: 'api', description: '触达服务（通话结果、短信、营销结果、人工转接）',    config: { base_url: `${MOCK_BASE}/api/outreach`,  timeout: 10000 } },
    { id: 'conn-callback',   name: 'callback-api',   type: 'api', description: '回访服务（创建回访任务）',                          config: { base_url: `${MOCK_BASE}/api/callback`,  timeout: 10000 } },
  ];

  for (const c of connectorDefs) {
    db.insert(connectors).values({
      id: c.id,
      name: c.name,
      type: c.type,
      config: JSON.stringify(c.config),
      status: 'active',
      description: c.description,
      created_at: now,
      updated_at: now,
    }).onConflictDoNothing().run();
  }
  console.log(`[seed] Connectors: ${connectorDefs.length} 个连接器已写入`);

  // ── 9d. Tool Implementations（Tool Runtime：声明工具→适配器→连接器绑定）──
  console.log('[seed] 写入 Tool Implementations...');
  db.delete(toolImplementations).run();

  // tool_id → connector mapping: 每个工具绑定到其 MCP Server 对应的 connector
  // config.executionPolicy 用于 Pipeline govern 步骤的渠道/超时/确认控制
  const implDefs: Array<{
    tool_name: string; adapter_type: string; connector_id?: string; host_server_id: string; handler_key?: string;
    config?: Record<string, unknown>;
  }> = [
    // user-info-service (:18003) — 查询类，不限渠道
    { tool_name: 'query_subscriber',     adapter_type: 'script', connector_id: 'conn-customer',  host_server_id: 'mcp-internal',  handler_key: 'user_info.query_subscriber' },
    { tool_name: 'query_bill',           adapter_type: 'script', connector_id: 'conn-billing',   host_server_id: 'mcp-internal',  handler_key: 'user_info.query_bill' },
    { tool_name: 'query_plans',          adapter_type: 'script', connector_id: 'conn-catalog',   host_server_id: 'mcp-internal',  handler_key: 'user_info.query_plans' },
    { tool_name: 'analyze_bill_anomaly', adapter_type: 'script', connector_id: 'conn-billing',   host_server_id: 'mcp-internal',  handler_key: 'user_info.analyze_bill_anomaly' },
    // business-service (:18004) — 操作类，限呼入渠道
    { tool_name: 'cancel_service',       adapter_type: 'script', connector_id: 'conn-orders',    host_server_id: 'mcp-internal',   handler_key: 'business.cancel_service',
      config: { executionPolicy: { allowedChannels: ['online', 'voice'], timeoutMs: 15000, confirmRequired: true } } },
    { tool_name: 'issue_invoice',        adapter_type: 'api_proxy', connector_id: 'conn-invoice', host_server_id: 'mcp-internal',
      config: { executionPolicy: { allowedChannels: ['online', 'voice'], timeoutMs: 10000 } } },
    // diagnosis-service (:18005) — 查询类，不限渠道
    { tool_name: 'diagnose_network',     adapter_type: 'script', connector_id: 'conn-diagnosis', host_server_id: 'mcp-internal',  handler_key: 'diagnosis.diagnose_network' },
    { tool_name: 'diagnose_app',         adapter_type: 'script', connector_id: 'conn-diagnosis', host_server_id: 'mcp-internal',  handler_key: 'diagnosis.diagnose_app' },
    // outbound-service (:18006) — 外呼专用
    { tool_name: 'record_call_result',   adapter_type: 'script', connector_id: 'conn-outreach',  host_server_id: 'mcp-internal',   handler_key: 'outbound.record_call_result',
      config: { executionPolicy: { allowedChannels: ['outbound'], timeoutMs: 5000 } } },
    { tool_name: 'send_followup_sms',    adapter_type: 'script', connector_id: 'conn-outreach',  host_server_id: 'mcp-internal',   handler_key: 'outbound.send_followup_sms',
      config: { executionPolicy: { allowedChannels: ['outbound'], timeoutMs: 5000 } } },
    { tool_name: 'create_callback_task', adapter_type: 'api_proxy', connector_id: 'conn-callback', host_server_id: 'mcp-internal',
      config: { executionPolicy: { allowedChannels: ['outbound'], timeoutMs: 10000 } } },
    { tool_name: 'record_marketing_result', adapter_type: 'script', connector_id: 'conn-outreach', host_server_id: 'mcp-internal', handler_key: 'outbound.record_marketing_result',
      config: { executionPolicy: { allowedChannels: ['outbound'], timeoutMs: 5000 } } },
    // account-service (:18007) — 混合
    { tool_name: 'verify_identity',      adapter_type: 'api_proxy', connector_id: 'conn-identity', host_server_id: 'mcp-internal',
      config: { executionPolicy: { allowedChannels: ['online', 'voice'], timeoutMs: 10000 } } },
    { tool_name: 'check_account_balance', adapter_type: 'script', connector_id: 'conn-billing',  host_server_id: 'mcp-internal',   handler_key: 'account.check_account_balance' },
    { tool_name: 'check_contracts',      adapter_type: 'script', connector_id: 'conn-customer',  host_server_id: 'mcp-internal',   handler_key: 'account.check_contracts' },
    { tool_name: 'apply_service_suspension', adapter_type: 'script', connector_id: 'conn-orders', host_server_id: 'mcp-internal', handler_key: 'account.apply_service_suspension',
      config: { executionPolicy: { allowedChannels: ['online', 'voice'], timeoutMs: 15000, confirmRequired: true } } },
    // L2 聚合读工具 — ScriptAdapter in-memory handler，内部并行调用底层 MCP 工具
    { tool_name: 'get_bill_context',   adapter_type: 'script', host_server_id: 'mcp-internal', handler_key: 'aggregated.get_bill_context' },
    { tool_name: 'get_plan_context',   adapter_type: 'script', host_server_id: 'mcp-internal', handler_key: 'aggregated.get_plan_context' },
    { tool_name: 'get_cancel_context', adapter_type: 'script', host_server_id: 'mcp-internal', handler_key: 'aggregated.get_cancel_context' },
    // amap-maps-service — 外部第三方 MCP（通过 server URL 直连，无需 connector）
    { tool_name: 'maps_text_search',       adapter_type: 'remote_mcp', host_server_id: 'mcp-amap' },
    { tool_name: 'maps_around_search',     adapter_type: 'remote_mcp', host_server_id: 'mcp-amap' },
    { tool_name: 'maps_geo',               adapter_type: 'remote_mcp', host_server_id: 'mcp-amap' },
    { tool_name: 'maps_direction_walking', adapter_type: 'remote_mcp', host_server_id: 'mcp-amap' },
  ];

  // Resolve tool_name → tool_id
  const allTools = db.select().from(mcpTools).all();
  const toolNameToId = new Map(allTools.map(t => [t.name, t.id]));

  let implCount = 0;
  for (const impl of implDefs) {
    const toolId = toolNameToId.get(impl.tool_name);
    if (!toolId) continue;
    db.insert(toolImplementations).values({
      id: `impl-${impl.tool_name}`,
      tool_id: toolId,
      host_server_id: impl.host_server_id,
      adapter_type: impl.adapter_type,
      connector_id: impl.connector_id ?? null,
      handler_key: impl.handler_key ?? null,
      config: impl.config ? JSON.stringify(impl.config) : null,
      status: 'active',
      created_at: now,
      updated_at: now,
    }).onConflictDoNothing().run();
    implCount++;
  }
  console.log(`[seed] Tool Implementations: ${implCount} 个绑定已写入`);

  // ── 9e. Skill-Tool Bindings（显式化 Skill → Tool 关系）────────────────────
  console.log('[seed] 写入 Skill-Tool Bindings...');
  db.delete(skillToolBindings).run();
  db.insert(skillToolBindings).values([
    // bill-inquiry
    { skill_id: 'bill-inquiry', tool_name: 'query_subscriber',     call_order: 1, purpose: 'query',  trigger_condition: '确认用户身份和基本状态' },
    { skill_id: 'bill-inquiry', tool_name: 'query_bill',           call_order: 2, purpose: 'query',  trigger_condition: '查询指定月份账单明细' },
    { skill_id: 'bill-inquiry', tool_name: 'analyze_bill_anomaly', call_order: 3, purpose: 'query',  trigger_condition: '账单费用异常时自动对比分析' },
    // plan-inquiry
    { skill_id: 'plan-inquiry', tool_name: 'query_subscriber', call_order: 1, purpose: 'query', trigger_condition: '查询当前套餐和用量' },
    { skill_id: 'plan-inquiry', tool_name: 'query_plans',      call_order: 2, purpose: 'query', trigger_condition: '获取套餐列表或详情' },
    // service-cancel
    { skill_id: 'service-cancel', tool_name: 'query_subscriber', call_order: 1, purpose: 'query',  trigger_condition: '查询已订增值业务列表' },
    { skill_id: 'service-cancel', tool_name: 'query_bill',       call_order: 2, purpose: 'query',  trigger_condition: '未知扣费时查账单明细' },
    { skill_id: 'service-cancel', tool_name: 'cancel_service',   call_order: 3, purpose: 'action', trigger_condition: '用户确认后执行退订' },
    // fault-diagnosis
    { skill_id: 'fault-diagnosis', tool_name: 'diagnose_network', call_order: 1, purpose: 'query', trigger_condition: '网络故障诊断' },
    // telecom-app
    { skill_id: 'telecom-app', tool_name: 'diagnose_app',             call_order: 1, purpose: 'query', trigger_condition: 'App 问题诊断' },
    { skill_id: 'telecom-app', tool_name: 'query_subscriber',         call_order: 2, purpose: 'query', trigger_condition: '核实账号状态（欠费/停机）' },
    { skill_id: 'telecom-app', tool_name: 'maps_around_search',       call_order: 3, purpose: 'query', trigger_condition: '用户询问附近营业厅时搜索周边 POI' },
    { skill_id: 'telecom-app', tool_name: 'maps_direction_walking',   call_order: 4, purpose: 'query', trigger_condition: '为用户规划前往营业厅的步行路线' },
    // outbound-collection
    { skill_id: 'outbound-collection', tool_name: 'record_call_result',   call_order: 1, purpose: 'action', trigger_condition: '记录通话结果' },
    { skill_id: 'outbound-collection', tool_name: 'send_followup_sms',    call_order: 2, purpose: 'action', trigger_condition: '发送还款链接短信' },
    { skill_id: 'outbound-collection', tool_name: 'create_callback_task', call_order: 3, purpose: 'action', trigger_condition: '创建回访任务' },
    // outbound-marketing
    { skill_id: 'outbound-marketing', tool_name: 'record_marketing_result', call_order: 1, purpose: 'action', trigger_condition: '记录营销结果' },
    { skill_id: 'outbound-marketing', tool_name: 'send_followup_sms',       call_order: 2, purpose: 'action', trigger_condition: '发送套餐详情短信' },
  ]).run();
  console.log('[seed] Skill-Tool Bindings: 18 条绑定已写入');

  // ── 9f. Execution Records（历史审计记录，覆盖全部 ErrorCode + adapter 组合）──
  console.log('[seed] 写入历史执行记录...');
  db.delete(executionRecords).run();
  db.insert(executionRecords).values([
    { id: 'er-seed-001', trace_id: 'tr-seed-001', tool_name: 'query_subscriber',          channel: 'online',   adapter_type: 'script',     session_id: 'sess-seed-001', user_phone: '13800000001', skill_name: 'bill-inquiry',          success: true,  has_data: true,  error_code: null,                latency_ms: 120, input_json: '{"phone":"13800000001"}', output_preview: '{"name":"张三","status":"active"}', created_at: yesterday },
    { id: 'er-seed-002', trace_id: 'tr-seed-002', tool_name: 'query_bill',                 channel: 'online',   adapter_type: 'script',     session_id: 'sess-seed-001', user_phone: '13800000001', skill_name: 'bill-inquiry',          success: true,  has_data: true,  error_code: null,                latency_ms: 85,  input_json: '{"phone":"13800000001","month":"2026-03"}', output_preview: '{"total":68}', created_at: yesterday },
    { id: 'er-seed-003', trace_id: 'tr-seed-003', tool_name: 'cancel_service',             channel: 'online',   adapter_type: 'script',     session_id: 'sess-seed-002', user_phone: '13800000001', skill_name: 'service-cancel',        success: true,  has_data: true,  error_code: null,                latency_ms: 230, input_json: '{"phone":"13800000001","service_id":"video_pkg"}', output_preview: '{"effective_end":"次月1日"}', created_at: yesterday },
    { id: 'er-seed-004', trace_id: 'tr-seed-004', tool_name: 'issue_invoice',              channel: 'online',   adapter_type: 'api',        session_id: 'sess-seed-003', user_phone: '13800000001', skill_name: 'bill-inquiry',          success: true,  has_data: true,  error_code: null,                latency_ms: 340, input_json: '{"phone":"13800000001","month":"2026-03","email":"test@example.com"}', output_preview: '{"invoice_no":"INV-001"}', created_at: yesterday },
    { id: 'er-seed-005', trace_id: 'tr-seed-005', tool_name: 'verify_identity',            channel: 'voice',    adapter_type: 'api',        session_id: 'sess-seed-004', user_phone: '13800000002', skill_name: 'service-cancel',        success: false, has_data: false, error_code: 'VALIDATION_FAILED', latency_ms: 15,  input_json: '{"phone":"13800000002","otp":""}', output_preview: null, created_at: yesterday },
    { id: 'er-seed-006', trace_id: 'tr-seed-006', tool_name: 'apply_service_suspension',   channel: 'online',   adapter_type: 'mock',       session_id: 'sess-seed-005', user_phone: '13800000001', skill_name: null,                    success: true,  has_data: true,  error_code: null,                latency_ms: 5,   input_json: '{"phone":"13800000001"}', output_preview: '{"suspension_type":"temporary"}', created_at: yesterday },
    { id: 'er-seed-007', trace_id: 'tr-seed-007', tool_name: 'diagnose_network',           channel: 'online',   adapter_type: 'script',     session_id: 'sess-seed-006', user_phone: '13800000003', skill_name: 'fault-diagnosis',       success: false, has_data: false, error_code: 'TIMEOUT',           latency_ms: 10000, input_json: '{"phone":"13800000003","issue_type":"slow_data"}', output_preview: null, created_at: yesterday },
    { id: 'er-seed-008', trace_id: 'tr-seed-008', tool_name: 'send_followup_sms',          channel: 'online',   adapter_type: 'script',     session_id: 'sess-seed-007', user_phone: '13800000001', skill_name: 'outbound-collection',   success: false, has_data: false, error_code: 'POLICY_REJECTED',   latency_ms: 2,   input_json: '{"phone":"13800000001","sms_type":"payment_link"}', output_preview: null, created_at: yesterday },
  ]).run();
  console.log('[seed] Execution Records: 8 条历史记录已写入');

  // ── 9g. Skill Instances + Events（历史执行实例，覆盖完整生命周期）─────────
  console.log('[seed] 写入历史技能实例...');
  platformDb.delete(skillInstanceEvents).run();
  platformDb.delete(skillInstances).run();
  platformDb.insert(skillInstances).values([
    { id: 'si-seed-001', session_id: 'sess-seed-002', skill_id: 'service-cancel', skill_version: 1, status: 'completed', current_step_id: 'std-cancel-service', pending_confirm: 0, revision: 5, started_at: yesterday, updated_at: yesterday, finished_at: yesterday },
    { id: 'si-seed-002', session_id: 'sess-seed-006', skill_id: 'fault-diagnosis', skill_version: 1, status: 'failed',    current_step_id: 'diag-run-diagnose',  pending_confirm: 0, revision: 2, started_at: yesterday, updated_at: yesterday, finished_at: yesterday },
  ]).run();
  platformDb.insert(skillInstanceEvents).values([
    // service-cancel 完整流程
    { instance_id: 'si-seed-001', seq: 1, event_type: 'step_enter',     step_id: 'std-query-subscriber', tool_name: null,             payload_json: null },
    { instance_id: 'si-seed-001', seq: 2, event_type: 'tool_call',      step_id: 'std-query-subscriber', tool_name: 'query_subscriber', payload_json: '{"phone":"13800000001"}' },
    { instance_id: 'si-seed-001', seq: 3, event_type: 'user_confirm',   step_id: 'std-cancel-service',   tool_name: null,             payload_json: '{"confirmed":true,"service_id":"video_pkg"}' },
    { instance_id: 'si-seed-001', seq: 4, event_type: 'tool_call',      step_id: 'std-cancel-service',   tool_name: 'cancel_service',   payload_json: '{"phone":"13800000001","service_id":"video_pkg"}' },
    { instance_id: 'si-seed-001', seq: 5, event_type: 'skill_complete', step_id: 'std-cancel-service',   tool_name: null,             payload_json: null },
    // fault-diagnosis 超时失败
    { instance_id: 'si-seed-002', seq: 1, event_type: 'step_enter',     step_id: 'diag-run-diagnose',    tool_name: null,             payload_json: null },
    { instance_id: 'si-seed-002', seq: 2, event_type: 'tool_error',     step_id: 'diag-run-diagnose',    tool_name: 'diagnose_network', payload_json: '{"error_code":"TIMEOUT","latency_ms":10000}' },
  ]).run();
  console.log('[seed] Skill Instances: 2 个实例 + 7 条事件已写入');

  // ── 10. 技能注册 + v1 版本快照（upsert：已存在则跳过）─────────────────────
  console.log('[seed] 初始化技能注册表和版本快照...');

  const { initializeSkillVersion } = await import('../../../km_service/src/skills/version-manager');

  const bizSkills = [
    { id: 'bill-inquiry',         desc: '电信账单查询技能' },
    { id: 'fault-diagnosis',      desc: '电信网络故障排查技能' },
    { id: 'outbound-collection',  desc: '外呼催收技能' },
    { id: 'outbound-marketing',   desc: '外呼营销技能' },
    { id: 'plan-inquiry',         desc: '套餐查询与推荐技能' },
    { id: 'service-cancel',       desc: '增值业务退订技能' },
    { id: 'telecom-app',          desc: '营业厅App问题诊断技能' },
  ];

  for (const skill of bizSkills) {
    await initializeSkillVersion(skill.id, skill.desc);
  }
  console.log(`[seed] 技能注册完成：${bizSkills.length} 个技能已发布 (v1)`);

  // 同步技能元数据到 skill_registry 表（直接调用 km_service 模块，seed 阶段 km_service 未启动）
  console.log('[seed] 同步技能元数据...');
  const { refreshSkillsCache } = await import('../../../km_service/src/engine-stubs');
  refreshSkillsCache();
  console.log('[seed] 技能元数据同步完成');

  // ── MCP/工具数据同步到 km.db ─────────────────────────────────────────────
  // km_service 从 km.db 读取 mcp_servers/mcp_tools/connectors/tool_implementations，
  // 但 seed 写入了 platform.db。这里同步一份到 km.db。
  console.log('[seed] 同步 MCP 数据到 km.db...');
  const mcpTables = ['mcp_servers', 'mcp_tools', 'connectors', 'tool_implementations', 'skill_tool_bindings'];
  for (const table of mcpTables) {
    try {
      kmSqlite.exec(`DELETE FROM ${table}`);
      const rows = platformSqlite.prepare(`SELECT * FROM ${table}`).all();
      if (rows.length === 0) continue;
      const cols = Object.keys(rows[0] as Record<string, unknown>);
      const placeholders = cols.map(() => '?').join(', ');
      const stmt = kmSqlite.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`);
      for (const row of rows) {
        stmt.run(...cols.map(c => (row as Record<string, unknown>)[c]));
      }
      console.log(`[seed]   ${table}: ${rows.length} 行已同步`);
    } catch (e) {
      console.warn(`[seed]   ${table}: 同步跳过 (${e instanceof Error ? e.message : e})`);
    }
  }

  console.log('[seed] 初始化完成！');
  kmSqlite.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed] 失败:', err);
  process.exit(1);
});
