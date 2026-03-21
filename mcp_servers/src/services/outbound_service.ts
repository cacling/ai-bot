/**
 * 外呼服务 — record_call_result, send_followup_sms, create_callback_task, record_marketing_result
 * Port: 18006
 *
 * 领域规则内置：PTP 日期校验、静默时段、结果分类标签、转化标签、DND 标记、SMS 类型校验
 */
import { db, callbackTasks, mcpLog, startMcpHttpServer, z, McpServer } from "../shared/server.js";

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

function createServer(): McpServer {
  const server = new McpServer({ name: "outbound-service", version: "1.0.0" });

  server.tool("record_call_result", "记录本次外呼催收通话结果（含 PTP 日期校验和结果分类）", {
    result: z.enum(["ptp", "refusal", "dispute", "no_answer", "busy", "power_off", "converted", "callback", "not_interested", "non_owner", "verify_failed", "dnd"]).describe("通话结果"),
    remark: z.string().optional().describe("备注信息"),
    callback_time: z.string().optional().describe("约定回访时间"),
    ptp_date: z.string().optional().describe("承诺还款日期"),
  }, async ({ result, remark, callback_time, ptp_date }) => {
    // PTP 必须提供日期
    if (result === "ptp" && !ptp_date) {
      return { content: [{ type: "text", text: JSON.stringify({ success: false, message: "承诺还款（ptp）必须提供 ptp_date 参数。", validation_error: "ptp_date_required" }) }] };
    }
    // PTP 日期合规校验
    if (result === "ptp" && ptp_date) {
      const days = Math.ceil((new Date(ptp_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (days > MAX_PTP_DAYS) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `承诺还款日期超出 ${MAX_PTP_DAYS} 天限制（${days} 天），请协商更近的日期。`, validation_error: "ptp_date_exceeds_limit" }) }] };
      }
      if (days < 0) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, message: "承诺还款日期已过期，请提供未来日期。", validation_error: "ptp_date_in_past" }) }] };
      }
    }

    mcpLog("outbound", "record_call_result", { result, remark, callback_time, ptp_date });
    const extra = ptp_date ? `，承诺还款日期：${ptp_date}` : callback_time ? `，约定回访时间：${callback_time}` : "";
    const remarkStr = remark ? `，备注：${remark}` : "";
    return { content: [{ type: "text", text: JSON.stringify({
      success: true,
      message: `通话结果已记录：${result}${extra}${remarkStr}`,
      result_category: categorizeCallResult(result),
      result_label: result,
    }) }] };
  });

  server.tool("send_followup_sms", "向客户发送跟进短信（含静默时段校验）", {
    phone: z.string().describe("客户手机号"),
    sms_type: z.enum(["payment_link", "plan_detail", "callback_reminder", "product_detail"]).describe("短信类型"),
    context: z.enum(["collection", "marketing"]).optional().describe("发送场景，营销场景限制短信类型"),
  }, async ({ phone, sms_type, context }) => {
    // 静默时段校验（催收场景）
    if (context === "collection" && isQuietHours()) {
      return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `静默时段（${QUIET_HOUR_START}:00-${QUIET_HOUR_END}:00）不可发送催收短信。`, validation_error: "quiet_hours" }) }] };
    }
    // 营销场景 SMS 类型校验
    if (context === "marketing" && !MARKETING_ALLOWED_SMS.includes(sms_type)) {
      return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `营销场景不允许发送"${sms_type}"类型短信，允许类型：${MARKETING_ALLOWED_SMS.join("、")}。`, validation_error: "invalid_sms_type" }) }] };
    }

    mcpLog("outbound", "send_followup_sms", { phone, sms_type, context });
    const labels: Record<string, string> = { payment_link: "还款链接", plan_detail: "套餐详情", callback_reminder: "回访提醒", product_detail: "产品详情" };
    return { content: [{ type: "text", text: JSON.stringify({ success: true, message: `${labels[sms_type] ?? sms_type}短信已发送至 ${phone}` }) }] };
  });

  server.tool("create_callback_task", "创建回访任务", {
    original_task_id: z.string().describe("原始外呼任务 ID"),
    callback_phone: z.string().describe("回访电话号码"),
    preferred_time: z.string().describe("客户期望的回访时间"),
    customer_name: z.string().optional().describe("客户姓名"),
    product_name: z.string().optional().describe("关联产品名称"),
  }, async ({ original_task_id, callback_phone, preferred_time, customer_name, product_name }) => {
    const taskId = `CB-${Date.now().toString(36)}`;
    mcpLog("outbound", "create_callback_task", { taskId, original_task_id, callback_phone, preferred_time });
    await db.insert(callbackTasks).values({ task_id: taskId, original_task_id, customer_name: customer_name ?? "", callback_phone, preferred_time, product_name: product_name ?? "", created_at: new Date().toISOString(), status: "pending" });
    return { content: [{ type: "text", text: JSON.stringify({ success: true, callback_task_id: taskId, message: `回访任务已创建，将于 ${preferred_time} 回访 ${callback_phone}` }) }] };
  });

  server.tool("record_marketing_result", "记录营销外呼的通话结果（含转化标签、DND 标记）", {
    campaign_id: z.string().describe("营销活动 ID"),
    phone: z.string().describe("客户手机号"),
    result: z.enum(["converted", "callback", "not_interested", "no_answer", "busy", "wrong_number", "dnd"]).describe("营销结果"),
    callback_time: z.string().optional().describe("约定回访时间"),
  }, async ({ campaign_id, phone, result, callback_time }) => {
    mcpLog("outbound", "record_marketing_result", { campaign_id, phone, result, callback_time });
    const isDND = result === "dnd";
    const extra = callback_time ? `，约定回访时间：${callback_time}` : "";
    return { content: [{ type: "text", text: JSON.stringify({
      success: true,
      message: `营销结果已记录：${result}${extra}`,
      conversion_tag: tagConversion(result),
      is_dnd: isDND,
      dnd_note: isDND ? "客户已加入免打扰名单，本活动不再拨打。" : null,
      is_callback: result === "callback",
      callback_time: callback_time ?? null,
    }) }] };
  });

  return server;
}

startMcpHttpServer("outbound-service", Number(process.env.PORT ?? 18006), createServer);
