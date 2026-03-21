/**
 * i18n.ts — 后端用户可见字符串的集中管理
 *
 * 所有通过 WebSocket 或 API 返回给前端的文本都应使用 t() 函数，
 * 而非在业务代码中散落 lang === 'en' ? ... : ... 三元表达式。
 */

export type Lang = 'zh' | 'en';

// ── 工具名映射 ──────────────────────────────────────────────────────────────

export const TOOL_LABELS: Record<Lang, Record<string, string>> = {
  zh: {
    query_subscriber: '查询账户信息',
    query_bill:       '查询账单',
    query_plans:      '查询套餐',
    cancel_service:   '退订业务',
    diagnose_network: '网络诊断',
    diagnose_app:     'App问题诊断',
  },
  en: {
    query_subscriber: 'Account query',
    query_bill:       'Bill query',
    query_plans:      'Plan query',
    cancel_service:   'Service cancellation',
    diagnose_network: 'Network diagnosis',
    diagnose_app:     'App diagnosis',
  },
};

export const OUTBOUND_TOOL_LABELS: Record<Lang, Record<string, string>> = {
  zh: { record_call_result: '记录通话结果', send_followup_sms: '发送跟进短信', transfer_to_human: '转人工坐席', create_callback_task: '创建回访任务' },
  en: { record_call_result: 'Record Call Result', send_followup_sms: 'Send Follow-up SMS', transfer_to_human: 'Transfer to Agent', create_callback_task: 'Create Callback Task' },
};

export const SMS_LABELS: Record<Lang, Record<string, string>> = {
  zh: { payment_link: '还款链接', plan_detail: '套餐详情', callback_reminder: '回访提醒', product_detail: '产品详情' },
  en: { payment_link: 'Payment link', plan_detail: 'Plan details', callback_reminder: 'Callback reminder', product_detail: 'Product details' },
};

// ── 字符串字典 ──────────────────────────────────────────────────────────────

type MsgFn = string | ((...args: any[]) => string);

const messages: Record<string, Record<Lang, MsgFn>> = {
  // ── 通用 ──
  list_separator:       { zh: '、', en: ', ' },
  status_in_progress:   { zh: '处理中', en: 'In Progress' },
  priority_high:        { zh: '高', en: 'high' },
  priority_medium:      { zh: '中', en: 'medium' },
  priority_low:         { zh: '低', en: 'low' },

  // ── 工具结果后缀 ──
  tool_success:         { zh: (label: string) => `${label}（成功）`, en: (label: string) => `${label} (success)` },
  tool_failed:          { zh: (label: string) => `${label}（失败）`, en: (label: string) => `${label} (failed)` },
  tool_no_data:         { zh: (label: string) => `${label}（无数据）`, en: (label: string) => `${label} (no data)` },
  tool_unknown:         { zh: (name: string) => `未知工具：${name}`, en: (name: string) => `Unknown tool: ${name}` },

  // ── 转人工 handoff ──
  handoff_default_intent:       { zh: '转人工客服', en: 'Transfer to human agent' },
  handoff_default_inquiry:      { zh: '用户咨询', en: 'Customer inquiry' },
  handoff_reason_user_request:  { zh: '用户要求人工服务', en: 'Customer requested human agent' },
  handoff_next_action_greet:    { zh: '请主动问候用户，了解具体需求', en: 'Greet the customer and understand their needs' },
  handoff_issue_incomplete:     {
    zh: (intent: string) => `${intent}相关问题，AI 分析未完成，请查看对话记录`,
    en: (intent: string) => `${intent} issue, AI analysis incomplete, please review conversation`,
  },
  handoff_summary_basic:        {
    zh: (msg: string, hasTools: boolean) => `用户咨询"${msg}"，${hasTools ? '机器人已执行相关查询，' : ''}用户要求转人工客服处理。`,
    en: (msg: string, hasTools: boolean) => `Customer asked "${msg}". ${hasTools ? 'Bot executed queries. ' : ''}Transferred to human agent.`,
  },
  handoff_summary_inferred:     {
    zh: (intent: string, tools: string) => `用户本次咨询${intent}，机器人${tools ? `已查询${tools}` : '暂未执行查询'}，最终要求转人工客服处理。`,
    en: (intent: string, tools: string) => `Customer inquiry: ${intent}. ${tools ? `Bot queried: ${tools}` : 'No queries executed yet'}. Transferred to human agent.`,
  },

  // ── 外呼 handoff ──
  outbound_default_intent:      { zh: '外呼通话', en: 'Outbound call' },
  outbound_task_collection:     { zh: '催收', en: 'collection' },
  outbound_task_marketing:      { zh: '营销', en: 'marketing' },
  outbound_biz_collection:      { zh: '欠款催收', en: 'Debt Collection' },
  outbound_biz_marketing:       { zh: '套餐营销', en: 'Plan Marketing' },
  outbound_task_type_collection: { zh: '欠款催收（collection）', en: 'Debt Collection' },
  outbound_task_type_marketing:  { zh: '套餐营销（marketing）', en: 'Plan Marketing' },
  outbound_next_action_continue: { zh: '请查看外呼任务详情，继续与客户沟通', en: 'Please review the outbound task details and continue the conversation with the customer' },
  outbound_handoff_summary:     {
    zh: (taskLabel: string, tools: string) => `外呼${taskLabel}通话，${tools ? `已执行：${tools}` : '暂未执行工具'}，最终转人工处理。`,
    en: (taskLabel: string, tools: string) => `Outbound ${taskLabel} call. ${tools ? `Actions taken: ${tools}` : 'No tools executed yet'}. Transferred to human agent.`,
  },
  outbound_issue:               {
    zh: (taskLabel: string, taskId: string) => `外呼${taskLabel}任务，任务ID：${taskId}`,
    en: (taskLabel: string, taskId: string) => `Outbound ${taskLabel} task, ID: ${taskId}`,
  },

  // ── 外呼工具结果 ──
  outbound_record_result:       {
    zh: (result: string, extra: string, remark: string) => `通话结果已记录：${result}${extra}${remark}`,
    en: (result: string, extra: string, remark: string) => `Call result recorded: ${result}${extra}${remark}`,
  },
  outbound_record_ptp:          { zh: (d: string) => `，承诺还款日：${d}`, en: (d: string) => `, promised payment date: ${d}` },
  outbound_record_callback:     { zh: (t: string) => `，回访时间：${t}`, en: (t: string) => `, callback time: ${t}` },
  outbound_record_remark:       { zh: (r: string) => `，备注：${r}`, en: (r: string) => `, remark: ${r}` },
  outbound_sms_sent:            {
    zh: (label: string, phone: string) => `${label}短信已发送至 ${phone}`,
    en: (label: string, phone: string) => `${label} SMS sent to ${phone}`,
  },
  outbound_callback_created:    {
    zh: (phone: string, time: string) => `回访任务已创建，将于 ${time} 联系 ${phone}`,
    en: (phone: string, time: string) => `Callback task created. Will contact ${phone} at ${time}`,
  },

  // ── 合规 ──
  compliance_block:             {
    zh: (kw: string) => `发言被拦截：包含不规范用语「${kw}」，请修改后重新发送`,
    en: (kw: string) => `Message blocked: contains non-compliant terms "${kw}". Please revise and resend.`,
  },
  compliance_warning:           {
    zh: (kw: string) => `注意：发言包含敏感表述「${kw}」，建议调整措辞`,
    en: (kw: string) => `Warning: message contains sensitive terms "${kw}". Consider rephrasing.`,
  },
  sensitive_content_error:      {
    zh: '对话涉及敏感话题，语音服务暂时中断。请稍后重试，或转接人工客服为您处理。',
    en: 'The conversation touched on a sensitive topic and the voice service was temporarily interrupted. Please try again or transfer to a human agent.',
  },
  sensitive_content_alert:      {
    zh: '语音模型因敏感内容拦截而中断会话',
    en: 'Voice model interrupted session due to sensitive content filter',
  },

  // ── 问候 ──
  greeting_with_subscriber:     {
    zh: (name: string, plan: string, gender?: string) => {
      const title = gender === 'male' ? '先生' : gender === 'female' ? '女士' : '';
      return `您好，${name}${title}！我是客服小通，您当前使用的是${plan}，请问今天有什么可以帮您？`;
    },
    en: (name: string, plan: string, gender?: string) => {
      const title = gender === 'male' ? 'Mr. ' : gender === 'female' ? 'Ms. ' : '';
      return `Hello, ${title}${name}! I'm Xiaotong from customer service. You're currently on the ${plan} plan. How can I help you today?`;
    },
  },
  greeting_generic:             {
    zh: '您好！我是客服小通，请问今天有什么可以帮您？',
    en: "Hello! I'm Xiaotong from customer service. How can I help you today?",
  },

  // ── 转接默认话术 ──
  transfer_default:             {
    zh: '好的，我这就为您转接人工客服，请稍候。',
    en: "Please hold on, I'm transferring you to a human agent now.",
  },
};

// ── t() 函数 ────────────────────────────────────────────────────────────────

/**
 * 根据 key 和 lang 取出本地化字符串。
 * - 静态字符串直接返回
 * - 模板函数传入 args 后返回
 */
export function t(key: string, lang: Lang, ...args: any[]): string {
  const entry = messages[key]?.[lang] ?? messages[key]?.zh ?? key;
  return typeof entry === 'function' ? entry(...args) : entry;
}
