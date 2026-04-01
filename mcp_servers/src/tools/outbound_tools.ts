/**
 * 外呼服务 — record_call_result, send_followup_sms, create_callback_task, record_marketing_result
 * Port: 18006
 *
 * 领域规则内置：PTP 日期校验、静默时段、结果分类标签、转化标签、DND 标记、SMS 类型校验
 */
import { outboundPost, mcpLog, z, McpServer } from "../shared/server.js";

// ── 领域规则 ─────────────────────────────────────────────────────────────────
const MAX_PTP_DAYS = 7;
const QUIET_HOUR_START = 21;
const QUIET_HOUR_END = 8;
const MARKETING_ALLOWED_SMS = ["plan_detail", "product_detail", "callback_reminder"];

type ResultCategory = "positive" | "negative" | "neutral";
function categorizeCallResult(result: string): ResultCategory {
  if (["ptp", "converted", "callback"].includes(result)) return "positive";
  if (["refusal", "non_owner", "verify_failed", "dnd"].includes(result)) return "negative";
  return "neutral";
}

type ConversionTag = "converted" | "warm_lead" | "cold" | "lost" | "dnd";
function tagConversion(result: string): ConversionTag {
  switch (result) {
    case "converted": return "converted";
    case "callback": return "warm_lead";
    case "not_interested": return "cold";
    case "dnd": return "dnd";
    case "wrong_number": return "lost";
    default: return "cold";
  }
}

function isQuietHours(): boolean {
  const h = new Date().getHours();
  return h >= QUIET_HOUR_START || h < QUIET_HOUR_END;
}

// ── Server ───────────────────────────────────────────────────────────────────

export function registerOutboundTools(server: McpServer): void {
  // schema: result, result_category, remark, callback_time, ptp_date
  server.tool("record_call_result", "记录本次外呼催收通话结果（含 PTP 日期校验和结果分类）", {
    result: z.enum(["ptp", "refusal", "dispute", "no_answer", "busy", "power_off", "converted", "callback", "not_interested", "non_owner", "verify_failed", "dnd"]).describe("通话结果"),
    remark: z.string().optional().describe("备注信息"),
    callback_time: z.string().optional().describe("约定回访时间"),
    ptp_date: z.string().optional().describe("承诺还款日期"),
  }, async ({ result, remark, callback_time, ptp_date }) => {
    // PTP 必须提供日期
    if (result === "ptp" && !ptp_date) {
      return { content: [{ type: "text", text: JSON.stringify({ result, result_category: categorizeCallResult(result), remark: "ptp_date_required", callback_time: callback_time ?? null, ptp_date: null }) }] };
    }
    // PTP 日期合规校验
    if (result === "ptp" && ptp_date) {
      const days = Math.ceil((new Date(ptp_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (days > MAX_PTP_DAYS || days < 0) {
        return { content: [{ type: "text", text: JSON.stringify({ result, result_category: categorizeCallResult(result), remark: days < 0 ? "ptp_date_in_past" : "ptp_date_exceeds_limit", callback_time: callback_time ?? null, ptp_date }) }] };
      }
    }

    mcpLog("outbound", "record_call_result", { result, remark, callback_time, ptp_date });
    try {
      const res = await outboundPost<{ ok: boolean; result_id?: string }>('/results/call-results', {
        phone: "outbound_current",
        result,
        remark,
        callback_time,
        ptp_date,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify({
        result,
        result_id: res.result_id ?? null,
        result_category: categorizeCallResult(result),
        remark: remark ?? null,
        callback_time: callback_time ?? null,
        ptp_date: ptp_date ?? null,
        next_action: res.next_action ?? null,
      }) }] };
    } catch {
      return { content: [{ type: "text" as const, text: JSON.stringify({
        result,
        result_category: categorizeCallResult(result),
        remark: remark ?? null,
        callback_time: callback_time ?? null,
        ptp_date: ptp_date ?? null,
      }) }] };
    }
  });

  // schema: phone, sms_type, context, status
  server.tool("send_followup_sms", "向客户发送跟进短信（含静默时段校验）", {
    phone: z.string().describe("客户手机号"),
    sms_type: z.enum(["payment_link", "plan_detail", "callback_reminder", "product_detail"]).describe("短信类型"),
    context: z.enum(["collection", "marketing"]).optional().describe("发送场景，营销场景限制短信类型"),
  }, async ({ phone, sms_type, context }) => {
    // 静默时段校验
    if (context === "collection" && isQuietHours()) {
      return { content: [{ type: "text", text: JSON.stringify({ phone, sms_type, context: context ?? null, status: "blocked_quiet_hours" }) }] };
    }
    // 营销场景 SMS 类型校验
    if (context === "marketing" && !MARKETING_ALLOWED_SMS.includes(sms_type)) {
      return { content: [{ type: "text", text: JSON.stringify({ phone, sms_type, context: context ?? null, status: "blocked_invalid_type" }) }] };
    }

    mcpLog("outbound", "send_followup_sms", { phone, sms_type, context });
    try {
      const res = await outboundPost<{ ok: boolean; event_id?: string; status?: string; reason?: string }>('/results/sms-events', {
        phone,
        sms_type,
        context: context ?? null,
        status: 'sent',
      });
      return { content: [{ type: "text" as const, text: JSON.stringify({
        phone,
        sms_type,
        context: context ?? null,
        status: res.status ?? "sent",
        event_id: res.event_id ?? null,
        reason: res.reason ?? null,
      }) }] };
    } catch {
      return { content: [{ type: "text" as const, text: JSON.stringify({ phone, sms_type, context: context ?? null, status: "sent" }) }] };
    }
  });

  // schema: callback_task_id, original_task_id, callback_phone, preferred_time, customer_name, product_name, status
  server.tool("create_callback_task", "创建回访任务", {
    original_task_id: z.string().describe("原始外呼任务 ID"),
    callback_phone: z.string().describe("回访电话号码"),
    preferred_time: z.string().describe("客户期望的回访时间"),
    customer_name: z.string().optional().describe("客户姓名"),
    product_name: z.string().optional().describe("关联产品名称"),
  }, async ({ original_task_id, callback_phone, preferred_time, customer_name, product_name }) => {
    mcpLog("outbound", "create_callback_task", { original_task_id, callback_phone, preferred_time });
    try {
      const res = await outboundPost<{ ok: boolean; task_id?: string }>(
        '/tasks/callbacks',
        { original_task_id, callback_phone, preferred_time, customer_name, product_name }
      );
      return { content: [{ type: "text" as const, text: JSON.stringify({
        callback_task_id: res.task_id ?? `CB-${Date.now().toString(36)}`,
        original_task_id, callback_phone, preferred_time,
        customer_name: customer_name ?? null, product_name: product_name ?? null, status: "pending",
      }) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, message: String(err) }) }] };
    }
  });

  // schema: campaign_id, phone, result, conversion_tag, is_dnd, dnd_note, is_callback, callback_time
  server.tool("record_marketing_result", "记录营销外呼的通话结果（含转化标签、DND 标记）", {
    campaign_id: z.string().describe("营销活动 ID"),
    phone: z.string().describe("客户手机号"),
    result: z.enum(["converted", "callback", "not_interested", "no_answer", "busy", "wrong_number", "dnd"]).describe("营销结果"),
    callback_time: z.string().optional().describe("约定回访时间"),
  }, async ({ campaign_id, phone, result, callback_time }) => {
    mcpLog("outbound", "record_marketing_result", { campaign_id, phone, result, callback_time });
    const isDND = result === "dnd";
    try {
      const res = await outboundPost<{ ok: boolean; record_id?: string; is_dnd?: boolean }>('/results/marketing-results', {
        campaign_id,
        phone,
        result,
        callback_time,
        is_dnd: isDND,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify({
        campaign_id,
        phone,
        result,
        record_id: res.record_id ?? null,
        conversion_tag: tagConversion(result),
        is_dnd: res.is_dnd ?? isDND,
        dnd_note: (res.is_dnd ?? isDND) ? "客户已加入免打扰名单，本活动不再拨打。" : null,
        is_callback: result === "callback",
        callback_time: callback_time ?? null,
        followup: res.followup ?? null,
      }) }] };
    } catch {
      return { content: [{ type: "text" as const, text: JSON.stringify({
        campaign_id,
        phone,
        result,
        conversion_tag: tagConversion(result),
        is_dnd: isDND,
        dnd_note: isDND ? "客户已加入免打扰名单，本活动不再拨打。" : null,
        is_callback: result === "callback",
        callback_time: callback_time ?? null,
      }) }] };
    }
  });

}
