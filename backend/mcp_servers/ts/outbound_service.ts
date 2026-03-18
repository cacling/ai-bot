/**
 * 外呼服务 — record_call_result, send_followup_sms, create_callback_task, record_marketing_result
 * Port: 18006
 */
import { db, callbackTasks, mcpLog, startMcpHttpServer, z, McpServer } from "./shared.js";

function createServer(): McpServer {
  const server = new McpServer({ name: "outbound-service", version: "1.0.0" });

  server.tool("record_call_result", "记录本次外呼通话结果。通话结束前必须调用。", {
    result: z.enum(["ptp", "refusal", "dispute", "no_answer", "busy", "converted", "callback", "not_interested", "non_owner", "verify_failed"]).describe("通话结果"),
    remark: z.string().optional().describe("备注信息"),
    callback_time: z.string().optional().describe("约定回访时间"),
    ptp_date: z.string().optional().describe("承诺还款日期"),
  }, async ({ result, remark, callback_time, ptp_date }) => {
    mcpLog("outbound", "record_call_result", { result, remark, callback_time, ptp_date });
    const extra = ptp_date ? `，承诺还款日期：${ptp_date}` : callback_time ? `，约定回访时间：${callback_time}` : "";
    const remarkStr = remark ? `，备注：${remark}` : "";
    return { content: [{ type: "text", text: JSON.stringify({ success: true, message: `通话结果已记录：${result}${extra}${remarkStr}` }) }] };
  });

  server.tool("send_followup_sms", "向客户发送跟进短信", {
    phone: z.string().describe("客户手机号"),
    sms_type: z.enum(["payment_link", "plan_detail", "callback_reminder", "product_detail"]).describe("短信类型"),
  }, async ({ phone, sms_type }) => {
    mcpLog("outbound", "send_followup_sms", { phone, sms_type });
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

  server.tool("record_marketing_result", "记录营销外呼的通话结果", {
    campaign_id: z.string().describe("营销活动 ID"),
    phone: z.string().describe("客户手机号"),
    result: z.enum(["converted", "callback", "not_interested", "no_answer", "busy", "wrong_number", "dnd"]).describe("营销结果"),
    callback_time: z.string().optional().describe("约定回访时间"),
  }, async ({ campaign_id, phone, result, callback_time }) => {
    mcpLog("outbound", "record_marketing_result", { campaign_id, phone, result, callback_time });
    const extra = callback_time ? `，约定回访时间：${callback_time}` : "";
    return { content: [{ type: "text", text: JSON.stringify({ success: true, message: `营销结果已记录：${result}${extra}` }) }] };
  });

  return server;
}

startMcpHttpServer("outbound-service", Number(process.env.PORT ?? 18006), createServer);
