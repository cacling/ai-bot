/**
 * 用户信息服务 — query_subscriber, query_bill, query_plans, analyze_bill_anomaly
 * Port: 18003
 *
 * 重构2：MCP Server = 防腐层，不再直查 SQLite，改为调用 mock_apis (demo backend)
 */
import { backendGet, backendPost, mcpLog, monthLabel, z, McpServer, performance } from "../shared/server.js";

// ── 领域规则（保留在 MCP Server 内，属于 Skill→Tool 的语义适配）────────────
const OVERDUE_NORMAL_MAX = 90;
const OVERDUE_PRE_CANCEL_MAX = 180;
const ANOMALY_THRESHOLD = 0.2;

type ArrearsLevel = "none" | "normal" | "pre_cancel" | "recycled";

function classifyArrears(status: string, balance: number, overdueDays: number): ArrearsLevel {
  if (status === "cancelled") return "recycled";
  if (balance >= 0) return "none";
  if (overdueDays > OVERDUE_PRE_CANCEL_MAX) return "recycled";
  if (overdueDays > OVERDUE_NORMAL_MAX) return "pre_cancel";
  return "normal";
}

function usageRatio(used: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((used / total) * 100) / 100;
}

interface FeeBreakdown { item: string; amount: number; ratio: number }

function buildBreakdown(bill: { total: number; plan_fee: number; data_fee: number; voice_fee: number; value_added_fee: number; tax: number }): FeeBreakdown[] {
  const total = bill.total || 1;
  return [
    { item: "套餐月费", amount: bill.plan_fee, ratio: Math.round((bill.plan_fee / total) * 100) / 100 },
    { item: "流量费", amount: bill.data_fee, ratio: Math.round((bill.data_fee / total) * 100) / 100 },
    { item: "通话费", amount: bill.voice_fee, ratio: Math.round((bill.voice_fee / total) * 100) / 100 },
    { item: "增值业务费", amount: bill.value_added_fee, ratio: Math.round((bill.value_added_fee / total) * 100) / 100 },
    { item: "税费", amount: bill.tax, ratio: Math.round((bill.tax / total) * 100) / 100 },
  ].filter(i => i.amount > 0);
}

function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * 标准化月份参数：无论 LLM 传什么格式，统一输出 "YYYY-MM"。
 * 支持格式：2026-02, 2026-2, 2026年2月, 2月, 02 等。
 * 缺年份时自动补当前年。
 */
function normalizeMonth(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();

  // "2026-02" or "2026-2"
  const dashMatch = s.match(/^(\d{4})-(\d{1,2})$/);
  if (dashMatch) return `${dashMatch[1]}-${dashMatch[2].padStart(2, '0')}`;

  // "2026年2月" or "2026年02月"
  const cnFullMatch = s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月?/);
  if (cnFullMatch) return `${cnFullMatch[1]}-${cnFullMatch[2].padStart(2, '0')}`;

  // "2月" or "02月" or just "2" (month only, assume current year)
  const cnMonthOnly = s.match(/^(\d{1,2})\s*月?$/);
  if (cnMonthOnly) {
    const m = parseInt(cnMonthOnly[1]);
    if (m >= 1 && m <= 12) return `${new Date().getFullYear()}-${String(m).padStart(2, '0')}`;
  }

  // Already valid or unrecognized — return as-is
  return s;
}

// ── Server ───────────────────────────────────────────────────────────────────

export function registerUserInfoTools(server: McpServer): void {
  server.tool("query_subscriber", "根据手机号查询电信用户信息（套餐、状态、余额、用量分析、增值业务详情、欠费分层）", {
    phone: z.string().describe('用户手机号，如 "13800000001"'),
  }, async ({ phone }) => {
    const t0 = performance.now();
    try {
      const [subRes, svcRes] = await Promise.all([
        backendGet<{ success: boolean; subscriber: any }>(`/api/customer/subscribers/${phone}`),
        backendGet<{ success: boolean; services: any[] }>(`/api/customer/subscribers/${phone}/services`),
      ]);

      if (!subRes.success) {
        mcpLog("user-info", "query_subscriber", { phone, found: false, ms: Math.round(performance.now() - t0) });
        return { content: [{ type: "text" as const, text: JSON.stringify({ phone, name: null, status: null, balance: 0, plan_fee: 0, data_used_gb: 0, data_total_gb: 0, data_usage_ratio: 0, voice_used_min: 0, voice_total_min: 0, voice_usage_ratio: 0, is_arrears: false, arrears_level: null, overdue_days: 0, services: [], vas_total_fee: 0 }) }] };
      }

      const sub = subRes.subscriber;
      const plan = sub.plan;
      const services = (svcRes.services ?? []).map((s: any) => ({
        service_id: s.service_id,
        name: s.name ?? s.service_id,
        monthly_fee: s.monthly_fee ?? 0,
        subscribed_at: s.subscribed_at ?? null,
        effective_start: s.effective_start ?? null,
        effective_end: s.effective_end ?? null,
        auto_renew: s.auto_renew ?? false,
        order_id: s.order_id ?? null,
      }));
      const vasTotalFee = services.reduce((sum: number, s: any) => sum + s.monthly_fee, 0);
      const dataTotal = plan?.data_gb ?? -1;
      const voiceTotal = plan?.voice_min ?? -1;
      const arrearsLevel = classifyArrears(sub.status, sub.balance, sub.overdue_days ?? 0);

      mcpLog("user-info", "query_subscriber", { phone, found: true, ms: Math.round(performance.now() - t0) });
      return { content: [{ type: "text" as const, text: JSON.stringify({
        phone: sub.msisdn,
        name: sub.name,
        gender: sub.gender ?? null,
        status: sub.status,
        balance: sub.balance,
        plan_name: plan?.name ?? null,
        plan_type: plan?.plan_type ?? null,
        plan_fee: plan?.monthly_fee ?? 0,
        data_used_gb: sub.data_used_gb ?? 0,
        data_total_gb: dataTotal,
        data_usage_ratio: usageRatio(sub.data_used_gb ?? 0, dataTotal),
        voice_used_min: sub.voice_used_min ?? 0,
        voice_total_min: voiceTotal,
        voice_usage_ratio: usageRatio(sub.voice_used_min ?? 0, voiceTotal),
        is_arrears: sub.balance < 0,
        arrears_level: arrearsLevel,
        overdue_days: sub.overdue_days ?? 0,
        services,
        vas_total_fee: vasTotalFee,
      }) }] };
    } catch (err) {
      mcpLog("user-info", "query_subscriber", { phone, error: String(err), ms: Math.round(performance.now() - t0) });
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, message: String(err) }) }] };
    }
  });

  server.tool("query_bill", "查询用户指定月份的账单明细（含费用拆解 breakdown）", {
    phone: z.string().describe("用户手机号"),
    month: z.string().optional().describe('账单月份，格式 "YYYY-MM"，不填则返回最近3个月'),
  }, async ({ phone, month: rawMonth }) => {
    const month = normalizeMonth(rawMonth);
    const t0 = performance.now();
    try {
      if (month) {
        const res = await backendGet<{ success: boolean; bill?: any }>(`/api/billing/accounts/${phone}/bills/${month}`);
        if (!res.success || !res.bill) {
          mcpLog("user-info", "query_bill", { phone, month, found: false, ms: Math.round(performance.now() - t0) });
          return { content: [{ type: "text" as const, text: JSON.stringify({ bills: [], count: 0, requested_month: month, note: `未找到 ${month} 的账单` }) }] };
        }
        const bill = res.bill;
        const label = monthLabel(bill.month);
        const enriched = { ...bill, month_label: label, breakdown: buildBreakdown(bill), items: bill.items ?? [], payable: bill.status === "unpaid" };
        mcpLog("user-info", "query_bill", { phone, month, found: true, ms: Math.round(performance.now() - t0) });
        return { content: [{ type: "text" as const, text: JSON.stringify({ bills: [enriched], count: 1, requested_month: month, note: `本结果为${label}账单` }) }] };
      }

      const res = await backendGet<{ success: boolean; bills: any[] }>(`/api/billing/accounts/${phone}/bills?limit=3`);
      if (!res.success) {
        mcpLog("user-info", "query_bill", { phone, found: false, ms: Math.round(performance.now() - t0) });
        return { content: [{ type: "text" as const, text: JSON.stringify({ bills: [], count: 0, requested_month: null, note: `未找到手机号 ${phone} 的账单记录` }) }] };
      }
      const labeled = (res.bills ?? []).map((b: any) => ({ ...b, month_label: monthLabel(b.month), breakdown: buildBreakdown(b), items: b.items ?? [], payable: b.status === "unpaid" }));
      mcpLog("user-info", "query_bill", { phone, found: true, count: labeled.length, ms: Math.round(performance.now() - t0) });
      return { content: [{ type: "text" as const, text: JSON.stringify({ bills: labeled, count: labeled.length, requested_month: null, note: `以下为最近${labeled.length}个月账单` }) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, message: String(err) }) }] };
    }
  });

  server.tool("query_plans", "获取所有可用套餐列表，或查询指定套餐详情", {
    plan_id: z.string().optional().describe("套餐 ID，不填则返回全部套餐"),
  }, async ({ plan_id }) => {
    const t0 = performance.now();
    try {
      if (plan_id) {
        const res = await backendGet<{ success: boolean; plan?: any }>(`/api/catalog/plans/${plan_id}`);
        if (!res.success || !res.plan) {
          mcpLog("user-info", "query_plans", { plan_id, found: false, ms: Math.round(performance.now() - t0) });
          return { content: [{ type: "text" as const, text: JSON.stringify({ plans: [], count: 0, requested_plan_id: plan_id }) }] };
        }
        mcpLog("user-info", "query_plans", { plan_id, found: true, ms: Math.round(performance.now() - t0) });
        return { content: [{ type: "text" as const, text: JSON.stringify({ plans: [res.plan], count: 1, requested_plan_id: plan_id }) }] };
      }
      const res = await backendGet<{ success: boolean; plans: any[] }>(`/api/catalog/plans`);
      mcpLog("user-info", "query_plans", { found: true, count: res.plans?.length, ms: Math.round(performance.now() - t0) });
      return { content: [{ type: "text" as const, text: JSON.stringify({ plans: res.plans ?? [], count: res.plans?.length ?? 0, requested_plan_id: null }) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, message: String(err) }) }] };
    }
  });

  server.tool("analyze_bill_anomaly", "分析用户账单异常：自动对比当月与上月账单，计算差额和涨幅，定位费用异常原因，给出处理建议", {
    phone: z.string().describe("用户手机号"),
    month: z.string().describe('当月账期，格式 YYYY-MM'),
  }, async ({ phone, month: rawMonth }) => {
    const month = normalizeMonth(rawMonth) ?? rawMonth;
    const t0 = performance.now();
    try {
      const res = await backendPost<{ success: boolean; [key: string]: any }>('/api/billing/anomaly/analyze', { msisdn: phone, month });
      if (!res.success) {
        mcpLog("user-info", "analyze_bill_anomaly", { phone, month, found: false, ms: Math.round(performance.now() - t0) });
        return { content: [{ type: "text" as const, text: JSON.stringify({ is_anomaly: false, current_month: month, previous_month: prevMonth(month), current_total: 0, previous_total: 0, diff: 0, change_ratio: 0, primary_cause: "unknown", causes: [], recommendation: res.message ?? "账单未找到。" }) }] };
      }

      const isAnomaly = Math.abs(res.change_ratio) > ANOMALY_THRESHOLD;
      const primaryCause = res.primary_cause ?? "unknown";
      const recs: Record<string, string> = {
        data_fee: "流量超出套餐额度，建议购买流量加油包或升级套餐。",
        voice_fee: "通话时长超出套餐额度，建议购买通话加油包或升级套餐。",
        value_added_fee: "增值业务费用增加，建议在 APP 中查看已订业务并退订不需要的服务。",
        roaming: "存在国际漫游费用，建议确认漫游包是否覆盖当地网络，或考虑升级漫游套餐。",
        unknown: "无法定位具体原因，建议拨打 10086 由人工客服核查。",
      };

      console.log(`[user-info/analyze_bill_anomaly] raw response from mock_apis:`, JSON.stringify({ causes: res.causes, item_details: res.item_details, summary: res.summary, changed_items_text: res.changed_items_text }));
      mcpLog("user-info", "analyze_bill_anomaly", { phone, month, is_anomaly: isAnomaly, primary_cause: primaryCause, causes_count: (res.causes ?? []).length, ms: Math.round(performance.now() - t0) });
      return { content: [{ type: "text" as const, text: JSON.stringify({
        is_anomaly: isAnomaly,
        current_month: month,
        previous_month: res.previous_month ?? prevMonth(month),
        current_total: res.current_total ?? 0,
        previous_total: res.previous_total ?? 0,
        diff: res.diff ?? 0,
        change_ratio: Math.round((res.change_ratio ?? 0) * 100),
        primary_cause: primaryCause,
        causes: res.causes ?? [],
        item_details: res.item_details ?? [],
        summary: res.summary ?? null,
        changed_items_text: res.changed_items_text ?? [],
        recommendation: recs[primaryCause] ?? recs.unknown,
      }) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, message: String(err) }) }] };
    }
  });

}
