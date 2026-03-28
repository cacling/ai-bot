/**
 * i18n.ts — 双语翻译字典（中文 / English）
 *
 * 使用方式：
 *   const t = T[lang];
 *   t.tab_chat  // 直接取值
 *   t.voice_state['idle']  // 嵌套 map
 */

export type Lang = 'zh' | 'en';

interface Translations {
  // ── 导航栏 ────────────────────────────────────────
  tab_chat:    string;
  tab_voice:   string;
  tab_outbound: string;
  tab_editor:  string;

  // ── Chat 页面 ─────────────────────────────────────
  chat_bot_name:       string;
  chat_bot_subtitle:   string;
  chat_transfer:       string;
  chat_reset:          string;
  chat_faq_hint:       string;
  chat_suggestion_title: string;
  chat_placeholder:    string;
  agent_reply_placeholder: string;
  chat_faq:            string[];
  chat_greeting:       string;
  chat_date_locale:    string;

  // ── 语音客服页面 ──────────────────────────────────
  voice_bot_name:        string;
  voice_bot_subtitle:    string;
  voice_reset:           string;
  voice_transfer_btn:    string;
  voice_empty_title:     string;
  voice_empty_subtitle:  string;
  voice_hint_idle:       string;
  voice_hint_active:     string;
  voice_state:           Record<string, string>;
  voice_transfer_reason: Record<string, string>;
  voice_handoff_title:   string;
  voice_row_intent:      string;
  voice_row_issue:       string;
  voice_row_next:        string;
  voice_row_phone:       string;
  voice_row_risk:        string;
  voice_row_business:    string;
  voice_row_actions:     string;
  voice_row_info:        string;
  voice_hotline_label:   string;
  voice_hotline_number:  string;

  // ── 外呼机器人页面 ────────────────────────────────
  outbound_bot_name:       string;
  outbound_bot_subtitle:   string;
  outbound_task_collection: string;
  outbound_task_marketing:  string;
  outbound_detail_collection: string;
  outbound_detail_marketing:  string;
  outbound_row_name:        string;
  outbound_row_product:     string;
  outbound_row_amount:      string;
  outbound_row_days:        string;
  outbound_row_current_plan: string;
  outbound_row_target_plan:  string;
  outbound_row_campaign:     string;
  outbound_hint_idle:        string;
  outbound_hint_active:      string;
  outbound_state:            Record<string, string>;
  outbound_transfer_reason:  Record<string, string>;
  outbound_handoff_title:    string;
  outbound_row_intent:       string;
  outbound_row_issue:        string;
  outbound_row_next:         string;
  outbound_row_actions:      string;
  outbound_row_phone:        string;
  outbound_hotline_label:    string;
  outbound_hotline_number:   string;
  outbound_mic_denied:       string;

  // ── 流程图面板 ────────────────────────────────────
  diagram_title_default:   string;
  diagram_empty_title:     string;
  diagram_empty_subtitle:  string;
  diagram_loading:         string;
  diagram_error:           string;
  diagram_footer_active:   string;
  diagram_footer_waiting:  string;
  diagram_skill_labels:    Record<string, string>;
  diagram_clear:           string;

  // ── 消息气泡内嵌卡片 ──────────────────────────────
  card_bill_title:       string;
  card_bill_total:       string;
  card_bill_plan_fee:    string;
  card_bill_data_fee:    string;
  card_bill_voice_fee:   string;
  card_bill_vas_fee:     string;
  card_bill_tax:         string;
  card_bill_paid:        string;
  card_bill_overdue:     string;
  card_bill_pending:     string;

  card_cancel_title:     string;
  card_cancel_service:   string;
  card_cancel_savings:   string;
  card_cancel_effective: string;
  card_cancel_phone:     string;
  card_cancel_notice:    string; // 含 {date} 占位符

  card_plan_title:       string;
  card_plan_unlimited:   string;
  card_plan_voice_unit:  string; // '分钟' / 'min'
  card_plan_data_label:  string;
  card_plan_voice_label: string;
  card_plan_per_month:   string;

  card_diag_default:     string;
  card_diag_labels:      Record<string, string>;

  card_anomaly_title:         string;
  card_anomaly_normal:        string;
  card_anomaly_detected:      string;
  card_anomaly_current:       string;
  card_anomaly_previous:      string;
  card_anomaly_change:        string;
  card_anomaly_cause:         string;
  card_anomaly_recommendation: string;
  card_anomaly_cause_labels:  Record<string, string>;

  card_handoff_title:         string;
  card_handoff_priority:      string;
  card_handoff_intent:        string;
  card_handoff_action:        string;
  card_handoff_reason:        string;
  card_handoff_actions_taken: string;

  // ── 坐席工作台 UI ────────────────────────────────
  agent_title:           string;
  agent_status_active:   string;
  agent_tab_chat:        string;
  agent_tab_editor:      string;
  agent_dialog_title:    string;
  agent_empty_title:     string;
  agent_empty_subtitle:  string;
  agent_label_customer:  string;
  agent_label_agent:     string;
  agent_error_prefix:    string;
  transfer_to_bot:       string;

  // ── 卡片面板空状态 ────────────────────────────────
  card_emotion_empty:    string;
  card_handoff_empty:    string;
  card_outbound_empty:   string;

  // ── 情绪标签映射（key = 中文标签）────────────────
  emotion_labels: Record<string, string>;
}

export const T: Record<Lang, Translations> = {
  zh: {
    // 导航栏
    tab_chat:     '在线客服',
    tab_voice:    '语音客服',
    tab_outbound: '语音外呼',
    tab_editor:   '知识库',

    // Chat
    chat_bot_name:     '智能客服小通',
    chat_bot_subtitle: '7×24 小时全天候服务',
    chat_transfer:     '转人工',
    chat_reset:        '重置对话',
    chat_faq_hint:     '猜您想问：',
    chat_suggestion_title: '根据您的问题，推荐您这样问',
    chat_placeholder:  '输入您的问题，例如：查话费、网速慢…',
    agent_reply_placeholder: '输入您的回复…',
    chat_faq:          ['查话费', '退订业务', '查套餐', '故障报修', '人工客服'],
    chat_greeting:     '您好！我是智能客服小通 👋\n可以帮您查询话费账单、办理退订业务、推荐套餐，或协助排查网络故障。请问有什么可以帮您？',
    chat_date_locale:  'zh-CN',

    // 语音客服
    voice_bot_name:       '语音客服小通',
    voice_bot_subtitle:   '实时语音对话',
    voice_reset:          '重置对话',
    voice_transfer_btn:   '转人工',
    voice_empty_title:    '点击下方按钮开始语音对话',
    voice_empty_subtitle: '支持：查话费、退订业务、查套餐、故障报修',
    voice_hint_idle:      '连接后全程免唤醒，直接说话即可',
    voice_hint_active:    '点击方块按钮结束对话',
    voice_state: {
      disconnected: '点击开始语音对话',
      connecting:   '连接中...',
      idle:         '请说话，小通正在聆听',
      listening:    '正在聆听...',
      thinking:     '正在思考...',
      responding:   '小通回复中',
      transferred:  '已转接人工客服',
    },
    voice_transfer_reason: {
      user_request:           '用户主动要求转人工',
      unrecognized_intent:    '连续意图无法识别',
      emotional_complaint:    '用户情绪激烈 / 投诉',
      high_risk_operation:    '高风险操作需人工确认',
      tool_failure:           '工具连续调用失败',
      identity_verify_failed: '身份校验未通过',
      low_confidence:         '机器人置信度不足',
    },
    voice_handoff_title:  '已转接人工客服',
    voice_row_intent:     '用户意图',
    voice_row_issue:      '问题描述',
    voice_row_next:       '建议坐席',
    voice_row_phone:      '用户标识',
    voice_row_risk:       '风险标识',
    voice_row_business:   '业务对象',
    voice_row_actions:    '已执行动作',
    voice_row_info:       '已确认信息',
    voice_hotline_label:  '人工客服热线：',
    voice_hotline_number: '10000',

    // 外呼机器人
    outbound_bot_name:       '语音外呼机器人',
    outbound_bot_subtitle:   '主动外呼对话',
    outbound_task_collection: '欠款催收',
    outbound_task_marketing:  '外呼营销',
    outbound_detail_collection: '催收案件详情',
    outbound_detail_marketing:  '营销任务详情',
    outbound_row_name:         '客户姓名',
    outbound_row_product:      '逾期产品',
    outbound_row_amount:       '逾期金额',
    outbound_row_days:         '逾期天数',
    outbound_row_current_plan: '当前套餐',
    outbound_row_target_plan:  '推介套餐',
    outbound_row_campaign:     '活动名称',
    outbound_hint_idle:        '选择任务后点击拨号按钮，机器人将主动开口',
    outbound_hint_active:      '点击方块按钮结束通话',
    outbound_state: {
      idle:        '选择任务后点击"开始外呼"',
      connecting:  '连接中...',
      ringing:     '外呼中，机器人正在开场...',
      listening:   '客户正在说话...',
      thinking:    '机器人思考中...',
      responding:  '机器人回复中',
      transferred: '已转接人工坐席',
      ended:       '通话已结束',
    },
    outbound_transfer_reason: {
      user_request:        '客户主动要求转人工',
      emotional_complaint: '客户情绪激烈/投诉',
      high_risk_operation: '高风险操作需人工确认',
      dispute_review:      '异议需人工复核',
    },
    outbound_handoff_title:   '已转接人工坐席',
    outbound_row_intent:      '客户意图',
    outbound_row_issue:       '问题描述',
    outbound_row_next:        '建议坐席',
    outbound_row_actions:     '已执行动作',
    outbound_row_phone:       '用户标识',
    outbound_hotline_label:   '坐席热线：',
    outbound_hotline_number:  '10000',
    outbound_mic_denied:      '麦克风权限被拒绝，请在浏览器设置中允许访问麦克风',

    // 流程图面板
    diagram_title_default:  '流程图',
    diagram_empty_title:    '当前流程没有流程图',
    diagram_empty_subtitle: '触发网络故障排查等 Skill 后\n流程图将自动显示在此处',
    diagram_loading:        '正在渲染流程图…',
    diagram_error:          '流程图渲染失败',
    diagram_footer_active:  '当前已激活 ·',
    diagram_footer_waiting: '等待 Skill 激活…',
    diagram_skill_labels: {
      'fault-diagnosis': '故障排查流程',
      'bill-inquiry':    '账单查询流程',
      'service-cancel':  '退订业务流程',
      'plan-inquiry':    '套餐咨询流程',
      'outbound-collection':      '外呼催收流程',
      'outbound-marketing':       '外呼营销流程',
    },
    diagram_clear: '清除',

    // 消息气泡内嵌卡片
    card_bill_title:       '账单',
    card_bill_total:       '账单总额',
    card_bill_plan_fee:    '套餐月费',
    card_bill_data_fee:    '流量超额费',
    card_bill_voice_fee:   '通话超额费',
    card_bill_vas_fee:     '增值业务费',
    card_bill_tax:         '税费',
    card_bill_paid:        '已缴清',
    card_bill_overdue:     '逾期未缴',
    card_bill_pending:     '待缴费',

    card_cancel_title:     '退订确认',
    card_cancel_service:   '退订业务',
    card_cancel_savings:   '月费减少',
    card_cancel_effective: '生效时间',
    card_cancel_phone:     '手机号',
    card_cancel_notice:    '本月费用正常收取，退订将于 {date} 生效',

    card_plan_title:       '套餐详情',
    card_plan_unlimited:   '不限量',
    card_plan_voice_unit:  '分钟',
    card_plan_data_label:  '国内流量',
    card_plan_voice_label: '通话时长',
    card_plan_per_month:   '/月',

    card_diag_default:  '网络诊断',
    card_diag_labels: {
      no_signal:  '无信号诊断',
      slow_data:  '网速慢诊断',
      call_drop:  '通话中断诊断',
      no_network: '无法上网诊断',
    },

    card_anomaly_title:         '账单异常分析',
    card_anomaly_normal:        '费用正常',
    card_anomaly_detected:      '检测到异常',
    card_anomaly_current:       '本月',
    card_anomaly_previous:      '上月',
    card_anomaly_change:        '变化',
    card_anomaly_cause:         '主要原因',
    card_anomaly_recommendation: '建议',
    card_anomaly_cause_labels: {
      data_overage:  '流量超额',
      voice_overage: '通话超额',
      new_vas:       '增值业务变动',
      roaming:       '漫游费用',
      unknown:       '原因不明',
    },

    card_handoff_title:         '已转接人工客服',
    card_handoff_priority:      '优先级',
    card_handoff_intent:        '用户诉求',
    card_handoff_action:        '建议动作',
    card_handoff_reason:        '转接原因',
    card_handoff_actions_taken: '已执行操作',

    agent_title:          '坐席工作台',
    agent_status_active:  '对话中',
    agent_tab_chat:       '客户对话',
    agent_tab_editor:     '知识库',
    agent_dialog_title:   '客户对话记录',
    agent_empty_title:    '等待客服对话接入',
    agent_empty_subtitle: '在 /chat 发起对话后，此处将实时同步显示',
    agent_label_customer: '客户',
    agent_label_agent:    '坐席',
    agent_error_prefix:   '请求失败：',
    transfer_to_bot:      '转机器人',

    card_emotion_empty:  '等待客户发言…',
    card_handoff_empty:  '转人工后将自动显示工单摘要',
    card_outbound_empty: '切换外呼客户后将自动显示任务详情',

    emotion_labels: {
      '平静': '平静', '礼貌': '礼貌', '焦虑': '焦虑', '不满': '不满', '愤怒': '愤怒',
    },
  },

  en: {
    // 导航栏
    tab_chat:     'Chat Support',
    tab_voice:    'Voice Support',
    tab_outbound: 'Outbound Bot',
    tab_editor:   'Knowledge Base',

    // Chat
    chat_bot_name:     'AI Assistant',
    chat_bot_subtitle: '24/7 Customer Service',
    chat_transfer:     'Transfer',
    chat_reset:        'Reset',
    chat_faq_hint:     'You might want to ask:',
    chat_suggestion_title: 'Based on your question, try asking:',
    chat_placeholder:  'Type your question, e.g. check balance, slow network…',
    agent_reply_placeholder: 'Type your reply…',
    chat_faq:          ['Check bill', 'Unsubscribe', 'Plan info', 'Report issue', 'Human agent'],
    chat_greeting:     'Hello! I\'m your AI assistant 👋\nI can help you check bills, manage subscriptions, recommend plans, or troubleshoot network issues. How can I help you?',
    chat_date_locale:  'en-US',

    // 语音客服
    voice_bot_name:       'Voice Support',
    voice_bot_subtitle:   'Real-time Voice Chat',
    voice_reset:          'Reset',
    voice_transfer_btn:   'Transfer',
    voice_empty_title:    'Click the button below to start',
    voice_empty_subtitle: 'Supports: bill inquiry, unsubscribe, plan advice, fault report',
    voice_hint_idle:      'No wake word needed — just speak after connecting',
    voice_hint_active:    'Click the square button to end the call',
    voice_state: {
      disconnected: 'Click to start voice chat',
      connecting:   'Connecting...',
      idle:         'Speak now, the bot is listening',
      listening:    'Listening...',
      thinking:     'Thinking...',
      responding:   'Bot is responding',
      transferred:  'Transferred to human agent',
    },
    voice_transfer_reason: {
      user_request:           'User requested transfer',
      unrecognized_intent:    'Intent unrecognized repeatedly',
      emotional_complaint:    'User complaint / high emotion',
      high_risk_operation:    'High-risk action needs human review',
      tool_failure:           'Tool calls failed repeatedly',
      identity_verify_failed: 'Identity verification failed',
      low_confidence:         'Low bot confidence',
    },
    voice_handoff_title:  'Transferred to Human Agent',
    voice_row_intent:     'Intent',
    voice_row_issue:      'Issue',
    voice_row_next:       'Suggested action',
    voice_row_phone:      'User ID',
    voice_row_risk:       'Risk flags',
    voice_row_business:   'Business objects',
    voice_row_actions:    'Actions taken',
    voice_row_info:       'Confirmed info',
    voice_hotline_label:  'Support hotline: ',
    voice_hotline_number: '10000',

    // 外呼机器人
    outbound_bot_name:       'Outbound Voice Bot',
    outbound_bot_subtitle:   'Outbound Calls',
    outbound_task_collection: 'Debt Collection',
    outbound_task_marketing:  'Telecom Marketing',
    outbound_detail_collection: 'Collection Case',
    outbound_detail_marketing:  'Marketing Task',
    outbound_row_name:         'Customer',
    outbound_row_product:      'Product',
    outbound_row_amount:       'Amount due',
    outbound_row_days:         'Days overdue',
    outbound_row_current_plan: 'Current plan',
    outbound_row_target_plan:  'Recommended plan',
    outbound_row_campaign:     'Campaign',
    outbound_hint_idle:        'Select a task and click dial — the bot will open the conversation',
    outbound_hint_active:      'Click the square button to end the call',
    outbound_state: {
      idle:        'Select a task and click "Start Call"',
      connecting:  'Connecting...',
      ringing:     'Calling — bot is giving the opening...',
      listening:   'Customer is speaking...',
      thinking:    'Bot is thinking...',
      responding:  'Bot is responding',
      transferred: 'Transferred to human agent',
      ended:       'Call ended',
    },
    outbound_transfer_reason: {
      user_request:        'Customer requested transfer',
      emotional_complaint: 'Customer complaint / high emotion',
      high_risk_operation: 'High-risk action needs human review',
      dispute_review:      'Dispute needs human review',
    },
    outbound_handoff_title:   'Transferred to Human Agent',
    outbound_row_intent:      'Intent',
    outbound_row_issue:       'Issue',
    outbound_row_next:        'Suggested action',
    outbound_row_actions:     'Actions taken',
    outbound_row_phone:       'User ID',
    outbound_hotline_label:   'Agent hotline: ',
    outbound_hotline_number:  '10000',
    outbound_mic_denied:      'Microphone access denied. Please allow it in your browser settings.',

    // diagram panel
    diagram_title_default:  'Flowchart',
    diagram_empty_title:    'No flowchart for current flow',
    diagram_empty_subtitle: 'Trigger a skill like fault diagnosis\nand the flowchart will appear here',
    diagram_loading:        'Rendering flowchart…',
    diagram_error:          'Failed to render flowchart',
    diagram_footer_active:  'Active skill ·',
    diagram_footer_waiting: 'Waiting for skill activation…',
    diagram_skill_labels: {
      'fault-diagnosis': 'Fault Diagnosis',
      'bill-inquiry':    'Bill Inquiry',
      'service-cancel':  'Unsubscribe',
      'plan-inquiry':    'Plan Inquiry',
      'outbound-collection':      'Debt Collection',
      'outbound-marketing':       'Telecom Marketing',
    },
    diagram_clear: 'Clear',

    // Inline message cards
    card_bill_title:       'Bill',
    card_bill_total:       'Total Amount',
    card_bill_plan_fee:    'Plan Fee',
    card_bill_data_fee:    'Data Overage',
    card_bill_voice_fee:   'Voice Overage',
    card_bill_vas_fee:     'Value-Added Services',
    card_bill_tax:         'Tax',
    card_bill_paid:        'Paid',
    card_bill_overdue:     'Overdue',
    card_bill_pending:     'Pending',

    card_cancel_title:     'Cancellation Confirmed',
    card_cancel_service:   'Service',
    card_cancel_savings:   'Monthly Savings',
    card_cancel_effective: 'Effective Date',
    card_cancel_phone:     'Phone',
    card_cancel_notice:    'Current month charges apply. Cancellation takes effect on {date}.',

    card_plan_title:       'Plan Details',
    card_plan_unlimited:   'Unlimited',
    card_plan_voice_unit:  'min',
    card_plan_data_label:  'Data',
    card_plan_voice_label: 'Voice',
    card_plan_per_month:   '/mo',

    card_diag_default:  'Network Diagnosis',
    card_diag_labels: {
      no_signal:  'No Signal Diagnosis',
      slow_data:  'Slow Data Diagnosis',
      call_drop:  'Call Drop Diagnosis',
      no_network: 'No Internet Diagnosis',
    },

    card_anomaly_title:         'Bill Anomaly Analysis',
    card_anomaly_normal:        'Normal',
    card_anomaly_detected:      'Anomaly Detected',
    card_anomaly_current:       'This Month',
    card_anomaly_previous:      'Last Month',
    card_anomaly_change:        'Change',
    card_anomaly_cause:         'Primary Cause',
    card_anomaly_recommendation: 'Recommendation',
    card_anomaly_cause_labels: {
      data_overage:  'Data Overage',
      voice_overage: 'Voice Overage',
      new_vas:       'New VAS Charges',
      roaming:       'Roaming Charges',
      unknown:       'Unknown',
    },

    card_handoff_title:         'Transferred to Agent',
    card_handoff_priority:      'Priority',
    card_handoff_intent:        'Customer Intent',
    card_handoff_action:        'Suggested Action',
    card_handoff_reason:        'Transfer Reason',
    card_handoff_actions_taken: 'Actions Taken',

    agent_title:          'Agent Workstation',
    agent_status_active:  'In conversation',
    agent_tab_chat:       'Customer Chat',
    agent_tab_editor:     'Knowledge Base',
    agent_dialog_title:   'Customer Chat',
    agent_empty_title:    'Waiting for customer to connect',
    agent_empty_subtitle: 'Start a chat from /chat — messages will sync here in real time',
    agent_label_customer: 'Customer',
    agent_label_agent:    'Agent',
    agent_error_prefix:   'Request failed: ',
    transfer_to_bot:      'Transfer to Bot',

    card_emotion_empty:  'Waiting for customer…',
    card_handoff_empty:  'Handoff summary will appear here after transfer',
    card_outbound_empty: 'Switch to an outbound customer to see task details',

    emotion_labels: {
      '平静': 'Calm', '礼貌': 'Polite', '焦虑': 'Anxious', '不满': 'Dissatisfied', '愤怒': 'Angry',
    },
  },
};
