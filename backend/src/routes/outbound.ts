/**
 * outbound.ts — 语音外呼 WebSocket 代理路由
 *
 * 与 voice.ts（入呼）的核心区别：
 * 1. 连接建立后立即触发 response.create，让机器人先说开场白
 * 2. 使用外呼专用 system prompt（含任务信息注入）
 * 3. 使用外呼专用工具集（record_call_result / send_followup_sms / transfer_to_human）
 * 4. 工具调用在本地处理（mock），不走 MCP
 */

import { Hono } from 'hono';
import NodeWebSocket from 'ws';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { analyzeHandoff } from '../skills/handoff-analyzer';
import { analyzeEmotion } from '../skills/emotion-analyzer';
import { logger } from '../logger';
import { upgradeWebSocket, TRANSFER_PHRASE_RE, VoiceSessionState } from './voice';
import { sessionBus } from '../session-bus';

// ── 配置 ──────────────────────────────────────────────────────────────────────

const SKILLS_DIR = resolve(
  process.env.SKILLS_DIR
    ? resolve(process.cwd(), process.env.SKILLS_DIR)
    : resolve(import.meta.dir, '../..', 'skills')
);

const ZHIPU_API_KEY      = process.env.ZHIPU_API_KEY ?? '';
const GLM_REALTIME_URL   = process.env.GLM_REALTIME_URL ?? 'wss://open.bigmodel.cn/api/paas/v4/realtime';
const GLM_REALTIME_MODEL = process.env.GLM_REALTIME_MODEL ?? 'glm-realtime-flash';
const DEFAULT_PHONE      = '13800000001';

// ── Mock 数据 ─────────────────────────────────────────────────────────────────

interface CollectionCase {
  case_id:        string;
  customer_name:  string;
  overdue_amount: number;
  overdue_days:   number;
  due_date:       string;
  product_name:   string;
  strategy:       string;
}

interface MarketingTask {
  campaign_id:    string;
  campaign_name:  string;
  customer_name:  string;
  current_plan:   string;
  target_plan_name: string;
  target_plan_fee:  number;
  target_plan_data: string;
  target_plan_voice: string;
  target_plan_features: string[];
  promo_note:     string;
  talk_template:  string;
}

interface BankMarketingTask {
  task_id:          string;
  bank_name:        string;
  product_type:     'loan' | 'wealth' | 'credit_card';
  product_name:     string;
  customer_name:    string;
  customer_phone:   string;
  customer_segment: string;
  offer_headline:   string;
  offer_details:    string[];
  offer_expiry:     string;
  talk_template:    string;
}

interface CallbackTask {
  task_id:          string;
  original_task_id: string;
  customer_name:    string;
  callback_phone:   string;
  preferred_time:   string;
  product_name:     string;
  created_at:       string;
  status:           'pending' | 'completed' | 'cancelled';
}

// In-memory DND list and callback tasks (mock persistence)
const DND_LIST = new Set<string>();
const CALLBACK_TASKS: CallbackTask[] = [];

const MOCK_COLLECTION_CASES: Record<string, CollectionCase> = {
  C001: {
    case_id:        'C001',
    customer_name:  '张明',
    overdue_amount: 386,
    overdue_days:   30,
    due_date:       '2026-03-15',
    product_name:   '宽带包年套餐',
    strategy:       '轻催',
  },
  C002: {
    case_id:        'C002',
    customer_name:  '李华',
    overdue_amount: 1280,
    overdue_days:   45,
    due_date:       '2026-03-10',
    product_name:   '家庭融合套餐',
    strategy:       '中催',
  },
  C003: {
    case_id:        'C003',
    customer_name:  '王芳',
    overdue_amount: 520,
    overdue_days:   15,
    due_date:       '2026-03-20',
    product_name:   '流量月包',
    strategy:       '轻催',
  },
};

const MOCK_BANK_MARKETING_TASKS: Record<string, BankMarketingTask> = {
  B001: {
    task_id:          'B001',
    bank_name:        '建设银行',
    product_type:     'loan',
    product_name:     '快享贷（个人消费贷款）',
    customer_name:    '王建国',
    customer_phone:   '13812345001',
    customer_segment: '优质客户',
    offer_headline:   '最高50万额度，年利率低至3.65%，当日到账',
    offer_details:    ['最高50万额度，当日审批最快2小时到账', '年利率低至3.65%，比信用卡分期省60%', '线上申请无需抵押，随借随还'],
    offer_expiry:     '2026-03-31',
    talk_template:    'loan_v1',
  },
  B002: {
    task_id:          'B002',
    bank_name:        '建设银行',
    product_type:     'wealth',
    product_name:     '睿盈180天理财产品',
    customer_name:    '赵雪梅',
    customer_phone:   '13812345002',
    customer_segment: '高净值客户',
    offer_headline:   '预期年化4.2%，历史业绩稳定，5万起购',
    offer_details:    ['预期年化收益率4.2%，历史业绩持续稳定', '银行自营风险可控，风险等级R2（稳健型）', '5万元起购，180天持有期，到期自动赎回'],
    offer_expiry:     '2026-04-15',
    talk_template:    'wealth_v2',
  },
  B003: {
    task_id:          'B003',
    bank_name:        '建设银行',
    product_type:     'credit_card',
    product_name:     '钻石Plus信用卡',
    customer_name:    '陈志远',
    customer_phone:   '13812345003',
    customer_segment: '存量白金卡客户',
    offer_headline:   '额度提升至10万，专属机场贵宾厅及餐饮权益',
    offer_details:    ['信用额度提升至10万元', '机场贵宾厅、高端酒店8折、餐饮满减等专属权益', '年消费满12万自动免年费'],
    offer_expiry:     '2026-03-20',
    talk_template:    'credit_card_v1',
  },
};

const MOCK_MARKETING_TASKS: Record<string, MarketingTask> = {
  M001: {
    campaign_id:    'M001',
    campaign_name:  '5G升级专项活动',
    customer_name:  '陈伟',
    current_plan:   '4G畅享套餐 99元/月（100GB流量）',
    target_plan_name: '5G畅享套餐',
    target_plan_fee:  199,
    target_plan_data: '300GB（5G速率）',
    target_plan_voice: '600分钟',
    target_plan_features: ['解锁5G网速', '流量翻三倍', '首月免月租'],
    promo_note:     '首月免月租，本月底前办理有效',
    talk_template:  '5G_upgrade_v2',
  },
  M002: {
    campaign_id:    'M002',
    campaign_name:  '家庭融合推广活动',
    customer_name:  '刘丽',
    current_plan:   '个人4G套餐 79元/月（50GB流量）+ 宽带 100元/月',
    target_plan_name: '家庭融合套餐',
    target_plan_fee:  299,
    target_plan_data: '主卡200GB + 3张副卡各50GB',
    target_plan_voice: '主卡不限分钟',
    target_plan_features: ['手机+宽带500M合一', '3张副卡共享流量', '每月节省约100元'],
    promo_note:     '宽带免费升速至500M，24个月合约',
    talk_template:  'family_bundle_v1',
  },
  M003: {
    campaign_id:    'M003',
    campaign_name:  '国际漫游出行季活动',
    customer_name:  '赵强',
    current_plan:   '5G商务套餐 159元/月',
    target_plan_name: '国际漫游月包',
    target_plan_fee:  98,
    target_plan_data: '日韩港澳台及东南亚10国每日1GB高速',
    target_plan_voice: '接听免费，拨出0.5元/分钟',
    target_plan_features: ['落地即用', '超量不断网', '比直接漫游省60%'],
    promo_note:     '出境前1天激活即可，30天内有效',
    talk_template:  'roaming_v1',
  },
};

// ── 外呼 system prompt ────────────────────────────────────────────────────────

const OUTBOUND_PROMPT_TEMPLATE =
  readFileSync(resolve(import.meta.dir, '../agent/outbound-system-prompt.md'), 'utf-8');

const ENGLISH_LANG_INSTRUCTION = `

---

**LANGUAGE REQUIREMENT (MANDATORY)**
You MUST speak ONLY in English for this entire call. All spoken responses must be in English. Do not switch to Chinese under any circumstances, even if the customer speaks Chinese.`;

function buildOutboundPrompt(phone: string, taskType: 'collection' | 'marketing' | 'bank-marketing', taskInfo: CollectionCase | MarketingTask | BankMarketingTask, lang: 'zh' | 'en' = 'zh'): string {
  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const taskInfoStr = JSON.stringify(taskInfo, null, 2);
  const taskTypeLabel =
    taskType === 'collection'    ? '欠款催收（collection）' :
    taskType === 'bank-marketing'? '银行外呼营销（bank-marketing）' :
    '套餐营销（marketing）';
  const base = OUTBOUND_PROMPT_TEMPLATE
    .replace('{{PHONE}}', phone)
    .replace('{{CURRENT_DATE}}', today)
    .replace('{{TASK_TYPE}}', taskTypeLabel)
    .replace('{{TASK_INFO}}', taskInfoStr);
  return lang === 'en' ? base + ENGLISH_LANG_INSTRUCTION : base;
}

// ── Mermaid 提取 & 高亮 ───────────────────────────────────────────────────────

function extractMermaidFromContent(markdown: string, lang: 'zh' | 'en' = 'zh'): string | null {
  if (lang === 'en') {
    const enMatch = markdown.match(/<!--\s*lang:en\s*-->\s*```mermaid\n([\s\S]*?)```/);
    if (enMatch) return enMatch[1].trim();
  }
  const match = markdown.match(/```mermaid\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

/**
 * Wrap the line annotated with `%% tool:<toolName>` inside a mermaid `rect` block.
 * Always rebuilds from rawMermaid so only the current tool's step is highlighted.
 */
function highlightMermaidTool(rawMermaid: string, toolName: string): string {
  const HIGHLIGHT_COLOR = 'rgba(255, 200, 0, 0.35)';
  const marker = `%% tool:${toolName}`;
  return rawMermaid
    .split('\n')
    .map((line) => {
      if (!line.includes(marker)) return line;
      const indent = line.match(/^(\s*)/)?.[1] ?? '';
      return `${indent}rect ${HIGHLIGHT_COLOR}\n${indent}  ${line.trimStart()}\n${indent}end`;
    })
    .join('\n');
}

// ── 外呼工具映射中文名 ────────────────────────────────────────────────────────

const TOOL_LABEL: Record<string, string> = {
  record_call_result:   '记录通话结果',
  send_followup_sms:    '发送跟进短信',
  transfer_to_human:    '转人工坐席',
  add_to_dnd:           '加入免打扰名单',
  create_callback_task: '创建回访任务',
};

// ── GLM 外呼工具定义 ──────────────────────────────────────────────────────────

const OUTBOUND_TOOLS = [
  {
    type: 'function',
    name: 'record_call_result',
    description: '记录本次外呼通话结果。通话结束前必须调用。',
    parameters: {
      type: 'object',
      properties: {
        result: {
          type: 'string',
          enum: ['ptp', 'refusal', 'dispute', 'no_answer', 'busy',
                 'converted', 'callback', 'not_interested', 'non_owner', 'verify_failed'],
          description: '通话结果：ptp=承诺还款，refusal=拒绝还款，dispute=提出异议，converted=成功转化，callback=待回访，not_interested=不感兴趣',
        },
        remark: {
          type: 'string',
          description: '备注信息（异议原因、客户说的关键话语等）',
        },
        callback_time: {
          type: 'string',
          description: '约定回访时间，result=callback 时必填，格式如 "2026-03-15 上午10点"',
        },
        ptp_date: {
          type: 'string',
          description: '承诺还款日期，result=ptp 时必填，格式如 "2026-03-18"',
        },
      },
      required: ['result'],
    },
  },
  {
    type: 'function',
    name: 'send_followup_sms',
    description: '向客户发送跟进短信',
    parameters: {
      type: 'object',
      properties: {
        sms_type: {
          type: 'string',
          enum: ['payment_link', 'plan_detail', 'callback_reminder', 'product_detail'],
          description: '短信类型：payment_link=还款链接，plan_detail=套餐详情，callback_reminder=回访提醒，product_detail=产品详情',
        },
      },
      required: ['sms_type'],
    },
  },
  {
    type: 'function',
    name: 'transfer_to_human',
    description: '转接人工坐席。客户主动要求、情绪激烈投诉、或高风险情况时调用。',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          enum: ['user_request', 'emotional_complaint', 'high_risk_operation', 'dispute_review'],
          description: '转人工原因',
        },
        current_intent: { type: 'string', description: '客户当前意图' },
        recommended_action: { type: 'string', description: '建议坐席下一步动作' },
      },
      required: ['reason', 'current_intent'],
    },
  },
  {
    type: 'function',
    name: 'add_to_dnd',
    description: '将客户加入免打扰名单。客户明确表示不需要、拒绝营销时调用，加入后系统不会再拨打营销电话。',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: '客户拒绝原因（简短描述客户说的话）',
        },
      },
      required: ['reason'],
    },
  },
  {
    type: 'function',
    name: 'create_callback_task',
    description: '创建回访任务。客户感兴趣但当前不方便，约定下次回访时间时调用。',
    parameters: {
      type: 'object',
      properties: {
        callback_phone: {
          type: 'string',
          description: '回访电话号码（若客户未变更则使用当前号码）',
        },
        preferred_time: {
          type: 'string',
          description: '客户期望的回访时间，格式如 "2026-03-18 上午10点"',
        },
      },
      required: ['preferred_time'],
    },
  },
];

// ── 路由 ──────────────────────────────────────────────────────────────────────

const outbound = new Hono();

outbound.get(
  '/ws/outbound',
  upgradeWebSocket((c) => {
    const userPhone  = c.req.query('phone') ?? DEFAULT_PHONE;
    const taskParam  = (c.req.query('task') ?? 'marketing') as 'collection' | 'marketing' | 'bank-marketing';
    const lang       = (c.req.query('lang') ?? 'zh') as 'zh' | 'en';
    const defaultId  = taskParam === 'collection' ? 'C001' : taskParam === 'bank-marketing' ? 'B001' : 'M001';
    const taskId     = c.req.query('id') ?? defaultId;
    const sessionId  = crypto.randomUUID();

    // 解析任务信息
    const taskInfo: CollectionCase | MarketingTask | BankMarketingTask | undefined =
      taskParam === 'collection'     ? MOCK_COLLECTION_CASES[taskId] :
      taskParam === 'bank-marketing' ? MOCK_BANK_MARKETING_TASKS[taskId] :
      MOCK_MARKETING_TASKS[taskId];

    if (!taskInfo) {
      logger.warn('outbound', 'unknown_task_id', { taskParam, taskId });
    }

    const resolvedTask = taskInfo ?? (
      taskParam === 'collection'     ? MOCK_COLLECTION_CASES['C001'] :
      taskParam === 'bank-marketing' ? MOCK_BANK_MARKETING_TASKS['B001'] :
      MOCK_MARKETING_TASKS['M001']
    );
    const systemPrompt = buildOutboundPrompt(userPhone, taskParam, resolvedTask, lang);

    let glmWs: InstanceType<typeof NodeWebSocket> | null = null;
    const state = new VoiceSessionState(userPhone, sessionId);
    let pendingHandoff: Promise<void> | null = null;

    // ── 转人工触发器 ──────────────────────────────────────────────────────────
    function triggerHandoff(ws: { send: (data: string) => void }, reason: string, toolArgs: Record<string, unknown> = {}) {
      if (state.transferTriggered) return;
      state.transferTriggered = true;

      const toolFreq = state.toolCalls.reduce<Record<string, number>>((acc, tc) => {
        acc[tc.tool] = (acc[tc.tool] ?? 0) + 1; return acc;
      }, {});
      const topTool = Object.entries(toolFreq).sort((a, b) => b[1] - a[1])[0]?.[0];
      const inferredIntent = (toolArgs.current_intent as string) ?? (topTool ? TOOL_LABEL[topTool] : undefined) ?? '外呼通话';
      const toolNames = [...new Set(state.toolCalls.map(tc => TOOL_LABEL[tc.tool] ?? tc.tool))].join('、');
      const taskLabel = taskParam === 'collection' ? '催收' : taskParam === 'bank-marketing' ? '银行营销' : '营销';
      const businessObj = taskParam === 'collection' ? '欠款催收' : taskParam === 'bank-marketing' ? '银行外呼营销' : '套餐营销';
      const inferredSummary = `外呼${taskLabel}通话，${toolNames ? `已执行：${toolNames}` : '暂未执行工具'}，最终转人工处理。`;

      const fallback = {
        customer_intent:       inferredIntent,
        main_issue:            `外呼${taskLabel}任务，任务ID：${taskId}`,
        business_object:       [businessObj],
        confirmed_information: Object.entries(state.collectedSlots).map(([k, v]) => `${k}: ${v}`),
        actions_taken:         state.toolCalls.slice(-5).map(tc => {
          const label = TOOL_LABEL[tc.tool] ?? tc.tool;
          return tc.success ? `${label}（成功）` : `${label}（失败）`;
        }),
        current_status:        '处理中',
        handoff_reason:        reason,
        next_action:           (toolArgs.recommended_action as string) ?? '请查看外呼任务详情，继续与客户沟通',
        priority:              taskParam === 'collection' ? '中' : '低',
        risk_flags:            [] as string[],
        session_summary:       inferredSummary,
      };

      const analysisWithTimeout = Promise.race([
        analyzeHandoff(state.turns, state.toolCalls),
        new Promise<typeof fallback>(resolve => setTimeout(() => resolve(fallback), 20000)),
      ]);

      pendingHandoff = analysisWithTimeout
        .catch(() => fallback)
        .then(analysis => {
          const ctx = {
            user_phone:            userPhone,
            session_id:            sessionId,
            timestamp:             new Date().toISOString(),
            transfer_reason:       reason,
            customer_intent:       analysis.customer_intent,
            main_issue:            analysis.main_issue,
            business_object:       analysis.business_object,
            confirmed_information: analysis.confirmed_information,
            actions_taken:         analysis.actions_taken,
            current_status:        analysis.current_status,
            handoff_reason:        analysis.handoff_reason,
            next_action:           analysis.next_action,
            priority:              analysis.priority,
            risk_flags:            analysis.risk_flags,
            session_summary:       analysis.session_summary,
          };
          logger.info('outbound', 'transfer_to_human_done', { session: sessionId, intent: ctx.customer_intent });
          try { ws.send(JSON.stringify({ type: 'transfer_to_human', context: ctx })); } catch {}
          sessionBus.publish(userPhone, { source: 'voice', type: 'handoff_card', data: ctx as Record<string, unknown>, msg_id: crypto.randomUUID() });
        });
    }

    return {
      onOpen(_evt, ws) {
        logger.info('outbound', 'client_connected', { session: sessionId, phone: userPhone, task: taskParam, id: taskId });

        if (!ZHIPU_API_KEY) {
          ws.send(JSON.stringify({ type: 'error', message: 'ZHIPU_API_KEY 未配置' }));
          ws.close();
          return;
        }

        const glmUrl = `${GLM_REALTIME_URL}?model=${GLM_REALTIME_MODEL}`;
        glmWs = new NodeWebSocket(glmUrl, {
          headers: { Authorization: `Bearer ${ZHIPU_API_KEY}` },
        });

        glmWs.on('open', () => {
          logger.info('outbound', 'glm_connected', { session: sessionId });
          glmWs!.send(JSON.stringify({
            event_id: crypto.randomUUID(),
            client_timestamp: Date.now(),
            type: 'session.update',
            session: {
              beta_fields: { chat_mode: 'audio' },
              modalities: ['text', 'audio'],
              instructions: systemPrompt,
              voice: 'tongtong',
              input_audio_format: 'pcm',
              output_audio_format: 'mp3',
              turn_detection: {
                type: 'server_vad',
                silence_duration_ms: 1500,
                threshold: 0.6,
                interrupt_response: false,
              },
              temperature: 0.2,
              tools: OUTBOUND_TOOLS,
            },
          }));
        });

        glmWs.on('message', async (data: Buffer) => {
          try {
            const text = data.toString();
            const msg  = JSON.parse(text);

            logger.info('outbound', 'glm_event', { session: sessionId, type: msg.type, preview: text.slice(0, 200) });

            // 会话就绪后：触发机器人开口 + 推送 skill 时序图
            if (msg.type === 'session.updated') {
              logger.info('outbound', 'trigger_bot_opening', { session: sessionId });
              glmWs!.send(JSON.stringify({
                event_id: crypto.randomUUID(),
                client_timestamp: Date.now(),
                type: 'response.create',
              }));
              // 推送当前任务对应的 skill 时序图
              const skillName =
                taskParam === 'collection'     ? 'outbound-collection' :
                taskParam === 'bank-marketing' ? 'outbound-marketing-bank' :
                'outbound-marketing';
              try {
                const skillPath = resolve(SKILLS_DIR, skillName, 'SKILL.md');
                if (existsSync(skillPath)) {
                  const skillContent = readFileSync(skillPath, 'utf-8');
                  const mermaid = extractMermaidFromContent(skillContent, lang);
                  if (mermaid) {
                    ws.send(JSON.stringify({ type: 'skill_diagram_update', skill_name: skillName, mermaid }));
                    sessionBus.publish(userPhone, { source: 'voice', type: 'skill_diagram_update', skill_name: skillName, mermaid, msg_id: crypto.randomUUID() });
                    logger.info('outbound', 'skill_diagram_sent', { session: sessionId, skill: skillName });
                  }
                }
              } catch (e) {
                logger.warn('outbound', 'skill_diagram_error', { session: sessionId, error: String(e) });
              }
            }

            // 用户语音转写完成
            if (msg.type === 'conversation.item.input_audio_transcription.completed') {
              const transcript = (msg.transcript ?? '') as string;
              if (transcript) {
                state.addUserTurn(transcript);
                sessionBus.publish(userPhone, { source: 'voice', type: 'user_message', text: transcript, msg_id: crypto.randomUUID() });
                analyzeEmotion(transcript, state.turns.slice(-5))
                  .then(emotion => {
                    try { ws.send(JSON.stringify({ type: 'emotion_update', text: transcript, emotion })); } catch {}
                    sessionBus.publish(userPhone, { source: 'voice', type: 'emotion_update', label: emotion.label, emoji: emotion.emoji, color: emotion.color, msg_id: crypto.randomUUID() });
                  })
                  .catch(() => {});
              }
            }

            // bot 回复完整文本
            if (msg.type === 'response.audio_transcript.done') {
              const transcript = (msg.transcript ?? '') as string;
              if (transcript) {
                state.addAssistantTurn(transcript);
                sessionBus.publish(userPhone, { source: 'voice', type: 'response', text: transcript, msg_id: crypto.randomUUID() });
                if (!state.transferTriggered && TRANSFER_PHRASE_RE.test(transcript)) {
                  logger.info('outbound', 'transfer_detected_via_speech', { session: sessionId });
                  triggerHandoff(ws, 'user_request');
                }
              }
            }

            // 工具调用拦截
            if (msg.type === 'response.function_call_arguments.done') {
              const toolName = msg.name as string;
              const toolArgs = JSON.parse(msg.arguments ?? '{}') as Record<string, unknown>;
              logger.info('outbound', 'tool_called', { session: sessionId, tool: toolName, args: toolArgs });

              // 转人工
              if (toolName === 'transfer_to_human') {
                const reason = (toolArgs.reason ?? 'user_request') as string;
                // 高亮转人工步骤
                try {
                  const currentSkillName =
                    taskParam === 'collection'     ? 'outbound-collection' :
                    taskParam === 'bank-marketing' ? 'outbound-marketing-bank' :
                    'outbound-marketing';
                  const skillPath = resolve(SKILLS_DIR, currentSkillName, 'SKILL.md');
                  if (existsSync(skillPath)) {
                    const rawMermaid = extractMermaidFromContent(readFileSync(skillPath, 'utf-8'), lang);
                    if (rawMermaid) {
                      ws.send(JSON.stringify({ type: 'skill_diagram_update', skill_name: currentSkillName, mermaid: highlightMermaidTool(rawMermaid, 'transfer_to_human') }));
                    }
                  }
                } catch {}
                try {
                  glmWs!.send(JSON.stringify({ event_id: crypto.randomUUID(), client_timestamp: Date.now(), type: 'conversation.item.create', item: { type: 'function_call_output', call_id: msg.call_id, output: '{"ok":true}' } }));
                  glmWs!.send(JSON.stringify({ event_id: crypto.randomUUID(), client_timestamp: Date.now(), type: 'response.create' }));
                } catch {}
                triggerHandoff(ws, reason, toolArgs);
                return;
              }

              // 本地 mock 处理其他工具
              let toolResult = '';

              if (toolName === 'record_call_result') {
                const result = toolArgs.result as string;
                const remark = toolArgs.remark ? `，备注：${toolArgs.remark}` : '';
                const extra = toolArgs.ptp_date ? `，承诺还款日：${toolArgs.ptp_date}` : (toolArgs.callback_time ? `，回访时间：${toolArgs.callback_time}` : '');
                toolResult = JSON.stringify({ success: true, message: `通话结果已记录：${result}${extra}${remark}` });
                logger.info('outbound', 'record_call_result', { session: sessionId, result, remark: toolArgs.remark, taskId });
              } else if (toolName === 'send_followup_sms') {
                const smsType = toolArgs.sms_type as string;
                const smsLabel: Record<string, string> = { payment_link: '还款链接', plan_detail: '套餐详情', callback_reminder: '回访提醒', product_detail: '产品详情' };
                toolResult = JSON.stringify({ success: true, message: `${smsLabel[smsType] ?? smsType}短信已发送至 ${userPhone}` });
                logger.info('outbound', 'send_followup_sms', { session: sessionId, smsType, phone: userPhone });
              } else if (toolName === 'add_to_dnd') {
                DND_LIST.add(userPhone);
                const reason = (toolArgs.reason ?? '') as string;
                logger.info('outbound', 'add_to_dnd', { session: sessionId, phone: userPhone, reason, taskId });
                toolResult = JSON.stringify({ success: true, message: `已将 ${userPhone} 加入免打扰名单，后续不会拨打营销电话` });
              } else if (toolName === 'create_callback_task') {
                const cbPhone = (toolArgs.callback_phone ?? userPhone) as string;
                const cbTime  = (toolArgs.preferred_time ?? '') as string;
                const bankTask = resolvedTask as BankMarketingTask;
                const cbTask: CallbackTask = {
                  task_id:          crypto.randomUUID(),
                  original_task_id: taskId,
                  customer_name:    bankTask.customer_name ?? '',
                  callback_phone:   cbPhone,
                  preferred_time:   cbTime,
                  product_name:     bankTask.product_name ?? '',
                  created_at:       new Date().toISOString(),
                  status:           'pending',
                };
                CALLBACK_TASKS.push(cbTask);
                logger.info('outbound', 'create_callback_task', { session: sessionId, taskId, cbPhone, cbTime });
                toolResult = JSON.stringify({ success: true, message: `回访任务已创建，将于 ${cbTime} 联系 ${cbPhone}`, callback_task_id: cbTask.task_id });
              } else {
                toolResult = JSON.stringify({ error: `未知工具：${toolName}` });
              }

              // 推送高亮版时序图（当前工具步骤高亮，上一步自动清除）
              try {
                const currentSkillName =
                  taskParam === 'collection'     ? 'outbound-collection' :
                  taskParam === 'bank-marketing' ? 'outbound-marketing-bank' :
                  'outbound-marketing';
                const skillPath = resolve(SKILLS_DIR, currentSkillName, 'SKILL.md');
                if (existsSync(skillPath)) {
                  const rawMermaid = extractMermaidFromContent(readFileSync(skillPath, 'utf-8'), lang);
                  if (rawMermaid) {
                    const highlighted = highlightMermaidTool(rawMermaid, toolName);
                    ws.send(JSON.stringify({ type: 'skill_diagram_update', skill_name: currentSkillName, mermaid: highlighted }));
                  }
                }
              } catch (e) {
                logger.warn('outbound', 'skill_diagram_highlight_error', { session: sessionId, tool: toolName, error: String(e) });
              }

              glmWs!.send(JSON.stringify({ event_id: crypto.randomUUID(), client_timestamp: Date.now(), type: 'conversation.item.create', item: { type: 'function_call_output', call_id: msg.call_id, output: toolResult } }));
              glmWs!.send(JSON.stringify({ event_id: crypto.randomUUID(), client_timestamp: Date.now(), type: 'response.create' }));
              return;
            }

            // 其余事件透传
            ws.send(text);
          } catch (e) {
            logger.warn('outbound', 'glm_message_error', { session: sessionId, error: String(e) });
          }
        });

        glmWs.on('close', async (code: number, reason: Buffer) => {
          logger.info('outbound', 'glm_closed', { session: sessionId, code, reason: reason?.toString('utf8') || '(none)' });
          if (pendingHandoff) { try { await pendingHandoff; } catch {} }
          try { ws.close(); } catch {}
        });

        glmWs.on('error', (err: Error) => {
          logger.error('outbound', 'glm_ws_error', { session: sessionId, error: err.message });
          try { ws.send(JSON.stringify({ type: 'error', message: `GLM 连接错误: ${err.message}` })); ws.close(); } catch {}
        });
      },

      onMessage(evt, _ws) {
        if (glmWs?.readyState === NodeWebSocket.OPEN) glmWs.send(evt.data.toString());
      },

      onClose() {
        logger.info('outbound', 'client_disconnected', { session: sessionId });
        if (glmWs && glmWs.readyState !== NodeWebSocket.CLOSED) glmWs.close();
        glmWs = null;
      },

      onError() {
        logger.error('outbound', 'client_ws_error', { session: sessionId });
        glmWs?.close();
        glmWs = null;
      },
    };
  })
);

export default outbound;

// ── 对外暴露 mock 数据（供前端初始化下拉列表使用）──────────────────────────────
export { MOCK_COLLECTION_CASES, MOCK_MARKETING_TASKS, MOCK_BANK_MARKETING_TASKS, DND_LIST, CALLBACK_TASKS };
export type { CollectionCase, MarketingTask, BankMarketingTask, CallbackTask };
