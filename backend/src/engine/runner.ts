import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { type CoreMessage, generateText, jsonSchema } from 'ai';
import { experimental_createMCPClient as createMCPClient } from 'ai';
import { chatModel } from './llm';
import { skillsTools, SOP_ENFORCEMENT_SUFFIX, getSkillsDescriptionByChannel, getToolSkillMap, getSkillContent, getSkillMermaid } from './skills';
import { logger } from '../services/logger';
import { type TurnRecord, type ToolRecord, type HandoffAnalysis } from '../agent/card/handoff-analyzer';
import { t } from '../services/i18n';
import { translateText } from '../services/translate-lang';
import { isNoDataResult, isErrorResult } from '../services/tool-result';
import { extractMermaidFromContent, highlightMermaidTool, highlightMermaidBranch, determineBranch, stripMermaidMarkers, extractStateNames, highlightMermaidProgress, buildNodeTypeMap } from '../services/mermaid';
import { analyzeProgress } from '../agent/card/progress-tracker';
import { skillWorkflowSpecs } from '../db/schema';
import { eq as dbEq, and as dbAnd, desc as dbDesc } from 'drizzle-orm';
import { SOPGuard } from './sop-guard';
import { randomUUID } from 'crypto';
import { type NormalizedQuery } from '../services/query-normalizer';
import { formatNormalizedContext } from '../services/query-normalizer';
import { ToolRuntime, type RuntimeChannel, type GovernPolicy } from '../tool-runtime';
import { SopPolicy } from '../tool-runtime/policies/sop-policy';
import { parseDisposition, executeDisposition } from './disposition-executor';

// Re-export for test file
export { extractMermaidFromContent, highlightMermaidTool, highlightMermaidBranch, determineBranch, stripMermaidMarkers };

import { db } from '../db';
import { mcpServers } from '../db/schema';

const TELECOM_MCP_URL = process.env.TELECOM_MCP_URL ?? `http://127.0.0.1:${process.env.MCP_INTERNAL_PORT ?? 18003}/mcp`;

// ── Tool Runtime singleton (Phase 4) ──
let onlineRuntime: ToolRuntime | null = null;
function getToolRuntime(): ToolRuntime {
  if (!onlineRuntime) onlineRuntime = new ToolRuntime();
  return onlineRuntime;
}

import { BIZ_SKILLS_DIR as SKILLS_DIR } from '../services/paths';

/** Tool → skill name mapping for diagram highlighting (auto-generated from SKILL.md %% tool:xxx annotations) */
function getSkillToolMap(): Record<string, string> {
  return getToolSkillMap();
}


/** Find the latest published workflow spec for a skill */
function findPublishedSpec(skillId: string) {
  try {
    return db.select().from(skillWorkflowSpecs)
      .where(dbAnd(dbEq(skillWorkflowSpecs.skill_id, skillId), dbEq(skillWorkflowSpecs.status, 'published')))
      .orderBy(dbDesc(skillWorkflowSpecs.version_no))
      .get();
  } catch { return undefined; }
}

const SYSTEM_PROMPT_TEMPLATE =
  readFileSync(resolve(import.meta.dir, 'inbound-base-system-prompt.md'), 'utf-8') +
  '\n\n' +
  readFileSync(resolve(import.meta.dir, 'inbound-online-system-prompt.md'), 'utf-8');

const ENGLISH_LANG_INSTRUCTION = `**LANGUAGE REQUIREMENT (MANDATORY — HIGHEST PRIORITY)**\nYou MUST reply ONLY in English for this entire conversation. All responses must be in English. Do not switch to Chinese under any circumstances, even if the user writes in Chinese or tool results contain Chinese data. Always translate any Chinese data from tool results into English before including it in your response.\nWhen calling tools that accept a \`lang\` parameter (such as diagnose_network, diagnose_app), always pass \`lang: "en"\` to receive English diagnostic output.`;

function buildSystemPrompt(phone: string, lang: 'zh' | 'en' = 'zh', subscriberName?: string, planName?: string, gender?: string): string {
  const locale = lang === 'en' ? 'en-US' : 'zh-CN';
  const today = new Date().toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const defaultName = lang === 'en' ? 'Customer' : '用户';
  const defaultPlan = lang === 'en' ? 'Unknown Plan' : '未知套餐';
  // 根据性别生成带称呼的姓名
  let displayName = subscriberName ?? defaultName;
  if (subscriberName && gender) {
    const title = lang === 'en'
      ? (gender === 'male' ? 'Mr. ' : gender === 'female' ? 'Ms. ' : '')
      : (gender === 'male' ? '先生' : gender === 'female' ? '女士' : '');
    displayName = lang === 'en' ? `${title}${subscriberName}` : `${subscriberName}${title}`;
  }
  const base = SYSTEM_PROMPT_TEMPLATE
    .replace('{{PHONE}}', phone)
    .replace('{{SUBSCRIBER_NAME}}', displayName)
    .replace('{{PLAN_NAME}}', planName ?? defaultPlan)
    .replace('{{CURRENT_DATE}}', today)
    .replace('{{AVAILABLE_SKILLS}}', getSkillsDescriptionByChannel('online'));
  return lang === 'en' ? ENGLISH_LANG_INSTRUCTION + '\n\n' + base : base;
}

// Persistent MCP clients — one per server, created once and reused.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const persistentClients = new Map<string, any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let allMCPTools: Record<string, any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let persistentMCPTools: Record<string, any> | null = null;

/** Get all disabled tools across all servers */
function getAllDisabledTools(): Set<string> {
  const disabled = new Set<string>();
  try {
    for (const server of db.select().from(mcpServers).all()) {
      if (server.disabled_tools) {
        for (const name of JSON.parse(server.disabled_tools) as string[]) disabled.add(name);
      }
    }
  } catch { /* ignore */ }
  return disabled;
}


async function getMCPTools() {
  // Connect to all enabled active servers (once per server)
  if (!allMCPTools) {
    const servers = db.select().from(mcpServers).all()
      .filter(s => s.enabled && s.status === 'active' && s.url);

    if (servers.length === 0) {
      servers.push({ id: 'fallback', name: 'telecom-service', url: TELECOM_MCP_URL } as typeof servers[0]);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merged: Record<string, any> = {};
    for (const server of servers) {
      if (!server.url) continue;
      try {
        let client = persistentClients.get(server.id);
        if (!client) {
          client = await createMCPClient({ transport: new StreamableHTTPClientTransport(new URL(server.url)) });
          persistentClients.set(server.id, client);
          logger.info('agent', 'mcp_connected', { name: server.name, url: server.url });
        }
        const tools = await client.tools();
        Object.assign(merged, tools);
      } catch (err) {
        logger.error('agent', 'mcp_connect_error', { name: server.name, url: server.url, error: String(err) });
        persistentClients.delete(server.id);
      }
    }
    allMCPTools = merged;
    logger.info('agent', 'mcp_tools_loaded', { servers: servers.length, tools: Object.keys(merged).length });
  }

  // Apply disabled_tools filter every call (reads DB, changes take effect without restart)
  const disabled = getAllDisabledTools();
  if (disabled.size > 0) {
    const filtered = { ...allMCPTools } as Record<string, unknown>;
    for (const name of disabled) delete filtered[name];
    persistentMCPTools = filtered;
  } else {
    persistentMCPTools = allMCPTools;
  }

  return { tools: persistentMCPTools };
}

export interface SkillDiagram {
  skill_name: string;
  mermaid: string;
  progressState?: string;
}

export interface TransferData {
  turns: TurnRecord[];
  toolRecords: ToolRecord[];
  args: { current_intent?: string; recommended_action?: string };
  userMessage: string;
}

export interface AgentResult {
  text: string;
  card?: CardData;
  skill_diagram?: SkillDiagram;
  transferData?: TransferData;
  toolRecords?: ToolRecord[];
  /** 完整的 response messages（含 tool calls/results），用于持久化多轮上下文 */
  responseMessages?: CoreMessage[];
}


export type { HandoffAnalysis };

export type CardData =
  | { type: 'bill_card'; data: BillCardData }
  | { type: 'cancel_card'; data: CancelCardData }
  | { type: 'plan_card'; data: PlanCardData }
  | { type: 'diagnostic_card'; data: DiagnosticCardData }
  | { type: 'anomaly_card'; data: AnomalyCardData }
  | { type: 'handoff_card'; data: HandoffAnalysis };

export interface BillCardData {
  month: string;
  total: number;
  plan_fee: number;
  data_fee: number;
  voice_fee: number;
  value_added_fee: number;
  tax: number;
  status: string;
}

export interface CancelCardData {
  service_name: string;
  monthly_fee: number;
  effective_end: string;
  phone: string;
}

export interface PlanCardData {
  name: string;
  monthly_fee: number;
  data_gb: number;
  voice_min: number;
  features: string[];
  description: string;
}

export interface DiagnosticCardData {
  issue_type: string;
  diagnostic_steps: Array<{ step: string; status: 'ok' | 'warning' | 'error'; detail: string }>;
  conclusion: string;
}

export interface AnomalyCardData {
  is_anomaly: boolean;
  current_month: string;
  previous_month: string;
  current_total: number;
  previous_total: number;
  diff: number;
  change_ratio: number;
  primary_cause: string;
  causes: Array<{ type: string; item: string; current_amount: number; previous_amount: number; diff: number }>;
  recommendation: string;
}

// ── Data-driven card extraction map ──────────────────────────────────────────
// Each extractor returns CardData | null from parsed tool result.
// Aggregated tools emit _cardType hints which are also resolved via this map.

type CardExtractor = (parsed: Record<string, unknown>) => CardData | null;

const CARD_EXTRACTORS: Record<string, CardExtractor> = {
  // L1/L3 direct tool results
  query_bill: (p) => {
    const d = (p.bill ?? (p.bills as unknown[])?.[0]) as BillCardData | undefined;
    return d ? { type: 'bill_card', data: d } : null;
  },
  cancel_service: (p) =>
    p.service_name ? { type: 'cancel_card', data: { service_name: p.service_name as string, monthly_fee: p.monthly_fee as number, effective_end: p.effective_end as string, phone: p.phone as string } } : null,
  query_plans: (p) => {
    const plan = p.plan ?? ((p.plans as unknown[])?.length === 1 ? (p.plans as unknown[])[0] : null);
    return plan ? { type: 'plan_card', data: plan as PlanCardData } : null;
  },
  diagnose_network: (p) =>
    p.diagnostic_steps ? { type: 'diagnostic_card', data: { issue_type: p.issue_type as string, diagnostic_steps: p.diagnostic_steps as DiagnosticCardData['diagnostic_steps'], conclusion: p.conclusion as string } } : null,
  analyze_bill_anomaly: (p) =>
    p.current_month ? { type: 'anomaly_card', data: p as unknown as AnomalyCardData } : null,

  // L2 aggregated tool results (nested structure)
  bill_card: (p) => {
    const d = (p.bill as BillCardData | undefined);
    return d ? { type: 'bill_card', data: d } : null;
  },
  anomaly_card: (p) => {
    const a = p.anomaly as Record<string, unknown> | undefined;
    return a?.current_month ? { type: 'anomaly_card', data: a as unknown as AnomalyCardData } : null;
  },
  plan_card: (p) => {
    const plans = p.plans as unknown[] | undefined;
    return plans?.length === 1 ? { type: 'plan_card', data: plans[0] as PlanCardData } : null;
  },
};

/** Extract card from parsed tool result, checking tool name first, then _cardType hint */
function extractCard(toolName: string, parsed: Record<string, unknown>): CardData | null {
  // Direct tool name match
  const extractor = CARD_EXTRACTORS[toolName];
  if (extractor) return extractor(parsed);
  // _cardType hint from aggregated tools
  const hint = parsed._cardType as string | undefined;
  if (hint && CARD_EXTRACTORS[hint]) return CARD_EXTRACTORS[hint](parsed);
  return null;
}

export type DiagramUpdateCallback = (skillName: string, mermaid: string, nodeTypeMap?: Record<string, string>, progressState?: string) => void;
export type TextDeltaCallback = (delta: string) => void;

export interface RunAgentOptions {
  /** @deprecated 使用工具级 mock 控制（MCP 管理中每个工具的 Mock 开关）。传 true 时回退为：对所有配了 mock_rules 的工具走 mock */
  useMock?: boolean;
  skillContent?: string; // 预注入的 SKILL.md 内容（测试时使用，避免依赖 LLM 调用 get_skill_instructions）
  skillName?: string; // 预设的技能名（配合 skillContent，用于进度追踪）
  sessionId?: string; // 预设会话 ID（测试/聊天多轮时用于保持 workflow 实例连续性）
  normalizedContext?: NormalizedQuery;
  /** 预编译的 WorkflowSpec（测试端点使用，直接激活 SOPGuard V2 plan） */
  workflowPlan?: import('./skill-workflow-types').WorkflowSpec;
}

export async function runAgent(
  userMessage: string,
  history: CoreMessage[],
  userPhone: string = '13800000001',
  lang: 'zh' | 'en' = 'zh',
  onDiagramUpdate?: DiagramUpdateCallback,
  onTextDelta?: TextDeltaCallback,
  subscriberName?: string,
  planName?: string,
  subscriberGender?: string,
  overrideSkillsDir?: string,
  options?: RunAgentOptions,
): Promise<AgentResult> {
  const effectiveSkillsDir = overrideSkillsDir ?? SKILLS_DIR;
  const t_run_start = Date.now();
  let t_mcp_ready = t_run_start;
  const requestSessionId = options?.sessionId ?? `sess_${randomUUID().slice(0, 12)}`;

  // ── Tool Runtime path (Phase 4): unified pipeline replaces mock/API/SOP/translation wrapping ──
  let sopWrappedTools: Record<string, any>;
  let sopGuard: SOPGuard;
  let lastActiveSkill: string | undefined = options?.skillName;

  {
    const runtime = getToolRuntime();
    sopGuard = new SOPGuard();

    // Activate plan FIRST so history replay runs in plan-aware mode
    if (options?.workflowPlan && options?.skillName) {
      sopGuard.activatePlan(options.skillName, options.workflowPlan);
    }

    // Replay history for SOP state continuity
    const toolResultMap = new Map<string, { success: boolean; hasData: boolean }>();
    for (const msg of history) {
      if (msg.role === 'tool' && Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'tool-result' && part.toolCallId) {
            const text = typeof part.result === 'string' ? part.result : JSON.stringify(part.result ?? '');
            toolResultMap.set(part.toolCallId, { success: !isErrorResult(text), hasData: !isNoDataResult(text) });
          }
        }
      }
    }
    for (const msg of history) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'tool-call' && part.toolName) {
            // Activate plan when get_skill_instructions is found in history
            // This ensures SOP state tracking works for subsequent tool replays (fork/join)
            if (part.toolName === 'get_skill_instructions') {
              const skillName = (part.args as any)?.skill_name?.replace(/_/g, '-') ?? '';
              if (skillName) {
                try {
                  const planRow = findPublishedSpec(skillName);
                  if (planRow) {
                    sopGuard.activatePlan(skillName, JSON.parse(planRow.spec_json));
                  }
                } catch { /* ignore */ }
              }
            }
            const result = toolResultMap.get(part.toolCallId) ?? { success: true, hasData: true };
            sopGuard.recordToolCall(part.toolName, result);
          }
        }
      }
    }
    sopGuard.onUserMessage(userMessage);

    // Load MCP tools into the runtime adapter
    const { tools: mcpPoolTools } = await getMCPTools();
    runtime.setMcpTools(mcpPoolTools as Record<string, any>);

    // Create request-scoped SOP policy
    const sopPolicy = new SopPolicy(sopGuard);

    // Build tool surface from registry
    const surface = runtime.getToolSurface();
    sopWrappedTools = {};
    for (const contract of surface) {
      const schema = contract.inputSchema ?? { type: 'object', properties: {} };
      sopWrappedTools[contract.name] = {
        description: contract.description,
        parameters: jsonSchema(schema as any),
        execute: async (args: Record<string, unknown>) => {
          // Fix MCP client arguments serialization
          if (typeof args === 'string') { try { args = JSON.parse(args); } catch { /* keep as-is */ } }

          const result = await runtime.callWithPolicies({
            toolName: contract.name,
            args,
            channel: 'online' as RuntimeChannel,
            sessionId: requestSessionId,
            userPhone,
            lang,
            activeSkillName: lastActiveSkill ?? null,
          }, [sopPolicy]);

          // Record in SOP guard for state tracking
          sopGuard.recordToolCall(contract.name, { success: result.success, hasData: result.hasData });
          if (result.success) sopGuard.resetViolations();

          // Translate if needed
          let rawText = result.rawText;
          if (lang !== 'zh' && result.success) {
            try { rawText = await translateText(rawText, lang); } catch { /* keep original */ }
          }

          return { content: [{ type: 'text', text: rawText }] };
        },
      };
    }

    t_mcp_ready = Date.now();
    logger.info('agent', 'mcp_ready', { mcp_init_ms: t_mcp_ready - t_run_start });
  }

  // Create plan-aware skills tools wrapper (activates SOPGuard V2 plan on skill load)
  const planAwareSkillsTools = { ...skillsTools };
  const originalGetSkillInstructions = skillsTools.get_skill_instructions;
  planAwareSkillsTools.get_skill_instructions = {
    ...originalGetSkillInstructions,
    execute: async (args: any, options: any) => {
      const result = await originalGetSkillInstructions.execute(args, options);
      // Activate plan if skill loaded successfully
      if (typeof result === 'string' && !result.startsWith('Error:')) {
        const skillName = args.skill_name?.replace(/_/g, '-') ?? '';
        try {
          const planRow = findPublishedSpec(skillName);
          if (planRow) {
            sopGuard.activatePlan(skillName, JSON.parse(planRow.spec_json));
            logger.info('sop-guard', 'plan_activated', { skill: skillName, version: planRow.version_no });
            // Replace verbose SOP suffix with lightweight version — promptHint handles state-specific guidance
            return (result as string).replace(SOP_ENFORCEMENT_SUFFIX,
              '\n\n---\n## SOP 执行要求\n按照状态图顺序执行，系统会自动约束工具调用顺序。\n');
          }
        } catch { /* ignore parse errors */ }
      }
      return result;
    },
  };

  let systemPrompt = buildSystemPrompt(userPhone, lang, subscriberName, planName, subscriberGender);
  // Inject pre-loaded skill content (for test endpoint — ensures SOP is visible without get_skill_instructions)
  if (options?.skillContent) {
    systemPrompt += '\n\n---\n### 当前测试技能操作指南\n\n' + options.skillContent;
  }
  if (options?.normalizedContext) {
    systemPrompt += formatNormalizedContext(options.normalizedContext);
  }

  // Inject SOP progress hint from SOPGuard V2 plan
  const sopHint = sopGuard.getPromptHint();
  if (sopHint) systemPrompt += '\n\n' + sopHint;

  // Per-request abort controller with 120s timeout
  const AGENT_TIMEOUT_MS = 180_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    logger.warn('agent', 'timeout', { ms: AGENT_TIMEOUT_MS });
    controller.abort();
  }, AGENT_TIMEOUT_MS);

  const t0 = t_mcp_ready; // LLM 阶段计时起点（MCP 初始化结束后）
  let stepCount = 0;
  let prevStepEnd = t_mcp_ready; // 用于计算每步增量耗时

  // 调试日志：history 概况
  const historyRoles = history.map(m => m.role);
  const historyChars = history.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length), 0);
  logger.info('agent', 'history_summary', { messages: history.length, roles: historyRoles, total_chars: historyChars });

  try {
    const result = await generateText({
      model: chatModel,
      system: systemPrompt,
      messages: [...history, { role: 'user', content: userMessage }],
      tools: {
        ...sopWrappedTools,
        ...planAwareSkillsTools,
      },
      maxSteps: 10,
      abortSignal: controller.signal,
      // 修复 SiliconFlow 模型偶尔输出格式错误的工具参数 JSON
      experimental_repairToolCall: async ({ toolCall, tools, parameterSchema, error }) => {
        const raw = typeof toolCall.args === 'string' ? toolCall.args : JSON.stringify(toolCall.args);
        // 尝试清理常见的 JSON 格式问题（混合转义引号等）
        try {
          const cleaned = raw
            .replace(/^"/, '').replace(/"$/, '')  // 去掉外层引号包裹
            .replace(/\\"/g, '"');                 // 统一转义
          const parsed = JSON.parse(cleaned);
          return { toolCallType: 'function' as const, toolCallId: toolCall.toolCallId, toolName: toolCall.toolName, args: JSON.stringify(parsed) };
        } catch {
          // 清理失败，返回 null 让 SDK 报错
          logger.warn('agent', 'tool_call_repair_failed', { tool: toolCall.toolName, raw: raw.slice(0, 200) });
          return null;
        }
      },
      onStepFinish: ({ toolCalls, toolResults, finishReason, text }) => {
        stepCount += 1;
        const now = Date.now();
        const tools = (toolCalls ?? []).map((tc) => tc.toolName);

        // 推送中间文本（让用户知道进度）
        if (onTextDelta && text && finishReason === 'tool-calls') {
          onTextDelta(text);
        }
        logger.info('agent', 'step_done', {
          n: stepCount,
          tools,
          reason: finishReason,
          delta_ms: now - prevStepEnd,
          elapsed_ms: now - t0,
        });
        prevStepEnd = now;

        // Track active skill from tool calls (needed for progress tracking)
        for (const tc of toolCalls ?? []) {
          if (tc.toolName === 'get_skill_instructions') {
            const args = tc.args as { skill_name?: string };
            if (args.skill_name) lastActiveSkill = args.skill_name;
          }
          const mappedSkill = getSkillToolMap()[tc.toolName] ?? lastActiveSkill;
          if (mappedSkill) lastActiveSkill = mappedSkill;
        }

        // Push diagram updates via callback (for WebSocket chat channel)
        if (onDiagramUpdate) {
          for (const tc of toolCalls ?? []) {
            if (tc.toolName === 'get_skill_instructions') {
              const args = tc.args as { skill_name?: string };
              const skillName = args.skill_name;
              if (skillName) {
                const rawMermaid = getSkillMermaid(skillName);
                if (rawMermaid) {
                  const specRow = findPublishedSpec(skillName);
                  const nodeTypeMap = specRow ? buildNodeTypeMap(JSON.parse(specRow.spec_json)) : undefined;
                  onDiagramUpdate(skillName, stripMermaidMarkers(rawMermaid), nodeTypeMap);
                }
              }
            }
            const skillName = getSkillToolMap()[tc.toolName] ?? lastActiveSkill;
            if (skillName) {
              const rawMermaid = getSkillMermaid(skillName);
              if (rawMermaid) {
                const specRow = findPublishedSpec(skillName);
                const nodeTypeMap = specRow ? buildNodeTypeMap(JSON.parse(specRow.spec_json)) : undefined;
                onDiagramUpdate(skillName, stripMermaidMarkers(rawMermaid), nodeTypeMap);
              }
            }
          }
        }
      },
    });

    // Extract structured card data and skill diagrams from tool call results
    let card: CardData | undefined;
    let skillDiagram: SkillDiagram | undefined;
    let transferRequested = false;
    let transferArgs: { current_intent?: string; recommended_action?: string } = {};
    const collectedToolRecords: ToolRecord[] = [];

    for (const step of result.steps ?? []) {
      // Build toolCallId → skill_name map for get_skill_instructions calls in this step
      const skillCallMap = new Map<string, string>();
      for (const toolCall of step.toolCalls ?? []) {
        if (toolCall.toolName === 'get_skill_instructions') {
          const args = toolCall.args as { skill_name?: string };
          if (args.skill_name) skillCallMap.set(toolCall.toolCallId, args.skill_name);
        }
      }

      for (const toolResult of step.toolResults ?? []) {
        try {
          // Vercel AI SDK MCP client wraps results as { content: [{ type: 'text', text: '...' }] }
          // Unwrap to get the actual JSON string before parsing
          let raw: unknown = toolResult.result;
          if (
            raw &&
            typeof raw === 'object' &&
            'content' in raw &&
            Array.isArray((raw as { content: unknown[] }).content)
          ) {
            const first = (raw as { content: { type: string; text: string }[] }).content
              .find((c) => c.type === 'text');
            if (first?.text) raw = first.text;
          }
          const content = typeof raw === 'string' ? raw : JSON.stringify(raw);
          logger.info('agent', 'tool_result_raw', {
            tool: toolResult.toolName,
            resultType: typeof toolResult.result,
            preview: content.slice(0, 120),
          });

          // Extract mermaid diagram from get_skill_instructions results (markdown, not JSON)
          if (toolResult.toolName === 'get_skill_instructions') {
            const skillName = skillCallMap.get(toolResult.toolCallId);
            const mermaid = extractMermaidFromContent(content);
            if (skillName && mermaid) skillDiagram = { skill_name: skillName, mermaid: stripMermaidMarkers(mermaid) };
            continue;
          }

          // Set skillDiagram for MCP skill tools (e.g. diagnose_network → fault-diagnosis)
          if (!skillDiagram) {
            const mappedSkill = getSkillToolMap()[toolResult.toolName as string];
            if (mappedSkill) {
              const mm = getSkillMermaid(mappedSkill);
              if (mm) skillDiagram = { skill_name: mappedSkill, mermaid: stripMermaidMarkers(mm) };
            }
          }

          // Collect tool records for handoff analysis
          const toolCallForRecord = (step.toolCalls ?? []).find(tc => tc.toolCallId === toolResult.toolCallId);
          const success = !content.includes('"error"') && !content.startsWith('Error:');
          collectedToolRecords.push({
            tool: toolResult.toolName as string,
            args: (toolCallForRecord?.args as Record<string, unknown>) ?? {},
            result_summary: content.slice(0, 150),
            success: success && !isNoDataResult(content),
          });

          const parsed = JSON.parse(content);
          const toolName = toolResult.toolName as string;

          // transfer_to_human is control flow, not a card
          if (toolName === 'transfer_to_human' && parsed.success) {
            transferRequested = true;
            const tc = (step.toolCalls ?? []).find(tc => tc.toolCallId === toolResult.toolCallId);
            if (tc) transferArgs = tc.args as typeof transferArgs;
            continue;
          }

          // Data-driven card extraction (handles direct tools, aggregated tools, _cardType hints)
          const extracted = extractCard(toolName, parsed);
          if (extracted) card = extracted;
        } catch {
          // ignore parse errors
        }
      }
    }

    // Collect transfer data for agent-side handoff analysis
    let transferData: TransferData | undefined;
    if (transferRequested) {
      const turns: TurnRecord[] = [
        ...(history as CoreMessage[]).map(m => ({
          role: m.role as 'user' | 'assistant',
          text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        })),
        { role: 'user' as const, text: userMessage },
      ];
      transferData = { turns, toolRecords: collectedToolRecords, args: transferArgs, userMessage };
    }

    const t_done = Date.now();

    // Log per-step text to diagnose empty response issues
    const stepTexts = (result.steps ?? []).map((s, i) => ({
      n: i + 1,
      textLen: s.text?.length ?? 0,
      preview: s.text?.slice(0, 60) ?? '',
    }));
    logger.info('agent', 'generate_done', {
      steps: result.steps?.length ?? 0,
      result_text_len: result.text?.length ?? 0,
      step_texts: stepTexts,
      mcp_init_ms: t_mcp_ready - t_run_start,
      llm_ms: t_done - t_mcp_ready,
      total_ms: t_done - t_run_start,
      card: card?.type ?? null,
    });

    // result.text only captures the final step's text.
    // When the model generates its response alongside a tool call (in an intermediate step),
    // that text is lost from result.text. Fall back to the last non-empty step text.
    // For transfer_to_human, the model-generated farewell text is often lost; use a default.
    const transferDefault = t('transfer_default', lang);
    let text =
      result.text ||
      [...(result.steps ?? [])].reverse().find((s) => s.text)?.text ||
      (transferRequested ? transferDefault : '');

    // ── 防御：LLM 将工具调用格式泄露到文本输出 ──
    // 部分模型（如 qwen）在长对话后可能退化，不走 function calling 协议，
    // 而是把 <tool_call> JSON 作为普通文本输出。用户会看到原始 JSON，体验极差。
    // 检测到此类输出时：清理掉原始标签，提示用户重试。
    if (text.includes('<tool_call>') || text.includes('</tool_call')) {
      logger.warn('agent', 'tool_call_leaked_as_text', {
        text_preview: text.slice(0, 200),
        history_len: history.length,
        steps: result.steps?.length ?? 0,
      });
      text = text
        .replace(/<tool_call>\s*[\s\S]*?<\/tool_call>?/g, '')
        .replace(/<tool_call>[\s\S]*/g, '')
        .trim();
      if (!text) {
        text = '系统处理遇到异常，请重新发送您的请求。';
      }
    }

    // ── L4 Disposition 检测与执行 ──
    const disposition = parseDisposition(text);
    if (disposition) {
      logger.info('agent', 'disposition_detected', { action: disposition.action, confirmed: disposition.confirmed, session: requestSessionId });
      if (disposition.confirmed) {
        const runtime = getToolRuntime();
        const execResult = await executeDisposition(runtime, disposition, {
          sessionId: requestSessionId,
          channel: 'online',
          userPhone,
          traceId: `trc_dsp_${randomUUID().slice(0, 12)}`,
        });

        // Record in SOP guard for state tracking
        sopGuard.recordToolCall(disposition.action, { success: execResult.success, hasData: !!execResult.result });

        // Extract card from disposition result via shared extractor map
        if (execResult.success && execResult.result) {
          try {
            const parsed = typeof execResult.result === 'string' ? JSON.parse(execResult.result) : execResult.result;
            const extracted = extractCard(disposition.action, parsed as Record<string, unknown>);
            if (extracted) card = extracted;
          } catch { /* ignore parse errors */ }
        }

        // Collect tool record for handoff analysis
        collectedToolRecords.push({
          tool: disposition.action,
          args: disposition.params,
          result_summary: JSON.stringify(execResult.result).slice(0, 150),
          success: execResult.success,
        });
      }
      // Strip disposition JSON from user-facing text
      text = text.replace(/```json\s*\n?[\s\S]*?\n?```/g, '').trim();
      if (!text) text = disposition.confirmed ? '操作已完成。' : '请确认是否执行此操作。';
    }

    // ── 流程进度追踪 ──
    if (lastActiveSkill && text) {
      const progressSkill = lastActiveSkill;
      const recentTurns = [
        ...history.slice(-4).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', text: typeof m.content === 'string' ? m.content : '' })),
        { role: 'user', text: userMessage },
        { role: 'assistant', text },
      ];

      const runProgressTracking = async () => {
        // 优先从技能缓存读（标准目录），sandbox 场景回退到文件读取
        let rawMermaid = overrideSkillsDir ? null : getSkillMermaid(progressSkill);
        if (!rawMermaid) {
          const skillPath = resolve(effectiveSkillsDir, progressSkill, 'SKILL.md');
          if (!existsSync(skillPath)) return null;
          rawMermaid = extractMermaidFromContent(readFileSync(skillPath, 'utf-8'));
        }
        if (!rawMermaid) return null;
        const stateNames = extractStateNames(rawMermaid);
        const stateName = await analyzeProgress(recentTurns, stateNames);
        if (!stateName) return null;
        logger.info('agent', 'progress_tracked', { skill: progressSkill, state: stateName });
        return { rawMermaid, stateName };
      };

      if (onDiagramUpdate) {
        // WebSocket: fire-and-forget, push via callback
        const progressCallback = onDiagramUpdate;
        (async () => {
          try {
            const result = await runProgressTracking();
            if (!result) return;
            const specRow = findPublishedSpec(progressSkill);
            const nodeTypeMap = specRow ? buildNodeTypeMap(JSON.parse(specRow.spec_json)) : undefined;
            progressCallback(progressSkill, stripMermaidMarkers(result.rawMermaid), nodeTypeMap, result.stateName);
          } catch (err) { logger.warn('agent', 'progress_tracking_error', { skill: progressSkill, error: String(err) }); }
        })();
      } else {
        // HTTP (test endpoint): run synchronously, embed progress in returned skill_diagram
        try {
          const result = await runProgressTracking();
          if (result) {
            skillDiagram = { skill_name: progressSkill, mermaid: stripMermaidMarkers(result.rawMermaid), progressState: result.stateName };
          }
        } catch (err) { logger.warn('agent', 'progress_tracking_error', { skill: progressSkill, error: String(err) }); }
      }
    }

    return { text, card, skill_diagram: skillDiagram, transferData, toolRecords: collectedToolRecords, responseMessages: result.response.messages };
  } finally {
    clearTimeout(timeoutId);
    // Persistent MCP client is intentionally kept open across requests.
  }
}

/** Get raw MCP tools for the workflow runtime (no SOP wrapping needed) */
export async function getMcpToolsForRuntime(): Promise<Record<string, any>> {
  const { tools } = await getMCPTools();
  return tools as Record<string, any>;
}
