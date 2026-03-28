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
import { matchMockRule, getMockedToolNames, getMockedToolDefinitions } from '../services/mock-engine';
import { mcpTools as mcpToolsTable, skillWorkflowSpecs } from '../db/schema';
import { eq as dbEq, and as dbAnd, desc as dbDesc } from 'drizzle-orm';
import { SOPGuard } from './sop-guard';
import { randomUUID } from 'crypto';
import { type NormalizedQuery } from '../services/query-normalizer';
import { formatNormalizedContext } from '../services/query-normalizer';

/**
 * 重构2 工具路由模式
 * MCP Server = 业务域稳定边界（防腐层），SQLite/mock_apis/scripts = 二级实现路径
 * - 'mcp_only': 所有工具通过 MCP 协议获取（目标态）
 * - 'hybrid': 优先 MCP，API 工具回退到直接注入（过渡态）
 */
const TOOL_ROUTING_MODE = (process.env.TOOL_ROUTING_MODE ?? 'hybrid') as 'mcp_only' | 'hybrid';

// Re-export for test file
export { extractMermaidFromContent, highlightMermaidTool, highlightMermaidBranch, determineBranch, stripMermaidMarkers };

import { db } from '../db';
import { mcpServers } from '../db/schema';

const TELECOM_MCP_URL = process.env.TELECOM_MCP_URL ?? 'http://127.0.0.1:18003/mcp';

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

import { preprocessToolCall } from '../services/tool-call-middleware';

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

export type DiagramUpdateCallback = (skillName: string, mermaid: string, nodeTypeMap?: Record<string, string>, progressState?: string) => void;
export type TextDeltaCallback = (delta: string) => void;

export interface RunAgentOptions {
  /** @deprecated 使用工具级 mock 控制（MCP 管理中每个工具的 Mock 开关）。传 true 时回退为：对所有配了 mock_rules 的工具走 mock */
  useMock?: boolean;
  skillContent?: string; // 预注入的 SKILL.md 内容（测试时使用，避免依赖 LLM 调用 get_skill_instructions）
  skillName?: string; // 预设的技能名（配合 skillContent，用于进度追踪）
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
  const { tools: rawMcpToolsRaw } = await getMCPTools();

  // 修复 MCP client 的 arguments 序列化问题：
  // AI SDK 可能把 LLM 返回的 arguments 作为 JSON string 传递给 MCP client，
  // 而 MCP SDK 1.27+ 期望 arguments 是 Record<string, unknown>。
  // 在这里统一拦截，确保 arguments 是对象。
  const rawMcpTools = Object.fromEntries(
    Object.entries(rawMcpToolsRaw as Record<string, any>).map(([name, tool]) => [
      name,
      {
        ...tool,
        execute: async (...args: any[]) => {
          // args[0] 是 LLM 传的参数对象，可能被序列化为 string
          if (args[0] && typeof args[0] === 'string') {
            try { args[0] = JSON.parse(args[0]); } catch { /* keep as-is */ }
          }
          return tool.execute(...args);
        },
      },
    ]),
  );

  // 工具级 mock 控制：从 MCP 管理读取哪些工具标记为 mock 模式
  const mockedToolNames = getMockedToolNames();
  // 向后兼容：如果旧代码传了 useMock: true，对所有配了 mock_rules 的工具走 mock
  const legacyUseMock = options?.useMock ?? false;

  const mockWrappedTools = Object.fromEntries(
    Object.entries(rawMcpTools as Record<string, any>).map(([name, tool]) => {
      const shouldMock = mockedToolNames.has(name) || legacyUseMock;
      if (!shouldMock) return [name, tool];
      return [name, {
        ...tool,
        execute: async (...args: any[]) => {
          const toolInput = args[0] ?? {};
          const mockResult = matchMockRule(name, toolInput);
          if (mockResult !== null) {
            logger.info('agent', 'mock_tool_used', { tool: name, source: mockedToolNames.has(name) ? 'per_tool' : 'legacy_global' });
            return { content: [{ type: 'text', text: mockResult }] };
          }
          // 没匹配到 mock 规则 → 回退到真实 MCP 调用
          return tool.execute(...args);
        },
      }];
    }),
  );
  // 注入 DB-only 的 mock 工具：这些工具在真实 MCP Server 中不存在，
  // 但用户已在 MCP 管理中手动创建并设为 Mock 模式
  const mockedDefs = getMockedToolDefinitions();
  for (const def of mockedDefs) {
    if (def.name in mockWrappedTools) continue; // 已经从真实 MCP 拿到了，跳过
    // 构造与 MCP 工具相同格式的 mock 工具对象
    mockWrappedTools[def.name] = {
      description: def.description,
      parameters: jsonSchema(def.inputSchema ?? { type: 'object', properties: {} } as any),
      execute: async (args: Record<string, unknown>) => {
        const mockResult = matchMockRule(def.name, args);
        if (mockResult !== null) {
          logger.info('agent', 'mock_tool_used', { tool: def.name, source: 'db_only_mock' });
          return { content: [{ type: 'text', text: mockResult }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, message: `工具 ${def.name} 处于 Mock 模式但未匹配到 Mock 规则` }) }] };
      },
    };
    logger.info('agent', 'mock_tool_injected', { tool: def.name });
  }

  // ── 重构2：API 工具注入（过渡期，MCP Server 内部调用 mock_apis）─────────
  // mcp_only: 不注入，所有工具已在 MCP Server 内部实现
  // hybrid: API 类型工具从 mcp_tools 表回退注入
  if (TOOL_ROUTING_MODE === 'hybrid') {
    try {
      const apiToolRows = db.select().from(mcpToolsTable).all()
        .filter(t => !t.mocked && !t.disabled && t.impl_type === 'api' && t.execution_config);
      for (const row of apiToolRows) {
        if (row.name in mockWrappedTools) continue;
        try {
          const cfg = JSON.parse(row.execution_config!) as { api?: { url: string; method?: string; timeout?: number; headers?: Record<string, string> } };
          if (!cfg.api?.url) continue;
          const schema = row.input_schema ? JSON.parse(row.input_schema) : { type: 'object', properties: {} };
          const apiConfig = cfg.api;
          mockWrappedTools[row.name] = {
            description: row.description,
            parameters: jsonSchema(schema as any),
            execute: async (args: Record<string, unknown>) => {
              logger.info('agent', 'api_tool_execute', { tool: row.name, url: apiConfig.url });
              const { executeApiTool } = await import('../services/api-executor');
              const result = await executeApiTool(apiConfig, args);
              return { content: [{ type: 'text', text: JSON.stringify(result) }] };
            },
          };
          logger.info('agent', 'api_tool_injected', { tool: row.name, url: apiConfig.url });
        } catch { /* 解析失败跳过 */ }
      }
    } catch { /* mcp_tools 表不存在时跳过 */ }
  } else {
    logger.info('agent', 'tool_routing_mcp_only', { note: 'All tools served by MCP Servers (business domain boundaries)' });
  }

  // Wrap MCP tools to translate results when lang !== 'zh'
  const effectiveMcpTools = mockWrappedTools;
  const mcpTools = lang === 'zh' ? effectiveMcpTools : Object.fromEntries(
    Object.entries(effectiveMcpTools as Record<string, any>).map(([name, tool]) => [
      name,
      {
        ...tool,
        execute: async (...args: any[]) => {
          const result = await tool.execute(...args);
          if (typeof result === 'string') {
            try { return await translateText(result, lang); } catch { return result; }
          }
          if (result && typeof result === 'object' && 'content' in result && Array.isArray(result.content)) {
            try {
              const translated = await Promise.all(
                result.content.map(async (c: any) => {
                  if (c.type === 'text' && c.text) {
                    try { return { ...c, text: await translateText(c.text, lang) }; } catch { return c; }
                  }
                  return c;
                }),
              );
              return { ...result, content: translated };
            } catch { return result; }
          }
          return result;
        },
      },
    ]),
  );
  // SOP Guard: wrap operation tools with precondition checks
  const sopGuard = new SOPGuard();
  // Activate plan FIRST so history replay runs in plan-aware mode
  if (options?.workflowPlan && options?.skillName) {
    sopGuard.activatePlan(options.skillName, options.workflowPlan);
  }
  // 从 history 中恢复已调用的工具（多轮对话时保持 SOP 状态连续）
  // Build a map of toolCallId → result from tool-result messages for accurate guard evaluation
  const toolResultMap = new Map<string, { success: boolean; hasData: boolean }>();
  for (const msg of history) {
    if (msg.role === 'tool' && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'tool-result' && part.toolCallId) {
          const text = typeof part.result === 'string' ? part.result : JSON.stringify(part.result ?? '');
          toolResultMap.set(part.toolCallId, {
            success: !isErrorResult(text),
            hasData: !isNoDataResult(text),
          });
        }
      }
    }
  }
  for (const msg of history) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'tool-call' && part.toolName) {
          // Activate plan when get_skill_instructions is found in history
          // This ensures SOP state tracking works for subsequent tool replays
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
  const sopWrappedTools = Object.fromEntries(
    Object.entries(mcpTools as Record<string, any>).map(([name, tool]) => [
      name,
      {
        ...tool,
        execute: async (...args: any[]) => {
          // Check SOP preconditions before executing
          const rejection = sopGuard.check(name);
          if (rejection) {
            if (sopGuard.shouldEscalate()) {
              logger.error('sop-guard', 'escalate_to_human', { tool: name });
              return { content: [{ type: 'text', text: JSON.stringify({ error: rejection + '\n连续违规，建议转接人工处理。请调用 transfer_to_human。' }) }] };
            }
            return { content: [{ type: 'text', text: JSON.stringify({ error: rejection }) }] };
          }
          // 参数标准化（通过统一中间件）
          if (args[0] && typeof args[0] === 'object') {
            preprocessToolCall({
              channel: 'online', toolName: name,
              toolArgs: args[0] as Record<string, unknown>,
              userPhone, lang, activeSkillName: lastActiveSkill ?? null,
            });
          }
          // 严格 MCP 对齐：注入治理字段（四层参数设计第 3-4 层）
          if (args[0] && typeof args[0] === 'object') {
            const enriched = args[0] as Record<string, unknown>;
            // 第三层：运行上下文（平台自动注入）
            if (!enriched.traceId) enriched.traceId = randomUUID();
            if (!enriched.sessionId) enriched.sessionId = `sess_${Date.now()}`;
            // 第四层：治理审计（平台自动注入）
            if (!enriched.operator) enriched.operator = JSON.stringify({ type: 'ai_skill', id: lastActiveSkill ?? 'unknown' });
          }
          // Execute the tool
          const toolResult = await tool.execute(...args);
          // Record call with result classification
          const toolSuccess = !isErrorResult(toolResult);
          const toolHasData = (() => {
            let text = '';
            if (typeof toolResult === 'string') text = toolResult;
            else if (toolResult && typeof toolResult === 'object' && 'content' in toolResult) text = (toolResult as any).content?.[0]?.text ?? '';
            return !isNoDataResult(text);
          })();
          sopGuard.recordToolCall(name, { success: toolSuccess, hasData: toolHasData });
          sopGuard.resetViolations();
          return toolResult;
        },
      },
    ]),
  );

  const t_mcp_ready = Date.now();
  logger.info('agent', 'mcp_ready', { mcp_init_ms: t_mcp_ready - t_run_start });

  let lastActiveSkill: string | undefined = options?.skillName;

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

          // analyze_bill_anomaly 返回不含 found/success，单独提取卡片
          if ((toolResult.toolName as string) === 'analyze_bill_anomaly' && parsed.current_month) {
            card = { type: 'anomaly_card', data: parsed as AnomalyCardData };
            continue;
          }

          if (!parsed.found && !parsed.success) continue;

          const toolName = toolResult.toolName as string;
          if (toolName === 'query_bill') {
            // 单条：{ bill: {...} }；多条：{ bills: [...] }，取最新（索引0）
            const billData: BillCardData | undefined = parsed.bill ?? parsed.bills?.[0];
            if (billData) card = { type: 'bill_card', data: billData };
          } else if (toolName === 'cancel_service' && parsed.success) {
            card = {
              type: 'cancel_card',
              data: {
                service_name: parsed.service_name,
                monthly_fee: parsed.monthly_fee,
                effective_end: parsed.effective_end,
                phone: parsed.phone,
              },
            };
          } else if (toolName === 'query_plans' && parsed.plan) {
            card = { type: 'plan_card', data: parsed.plan as PlanCardData };
          } else if (toolName === 'query_plans' && parsed.plans?.length === 1) {
            card = { type: 'plan_card', data: parsed.plans[0] as PlanCardData };
          } else if (toolName === 'diagnose_network' && parsed.success) {
            card = {
              type: 'diagnostic_card',
              data: {
                issue_type: parsed.issue_type,
                diagnostic_steps: parsed.diagnostic_steps,
                conclusion: parsed.conclusion,
              },
            };
            // Branch highlight is already sent during streaming (line ~272).
            // Do NOT override skillDiagram here — progress tracking (async) will
            // send the final progressHL version, and we don't want this branchHL
            // to overwrite it after the fact.
          } else if (toolName === 'transfer_to_human' && parsed.success) {
            transferRequested = true;
            // Capture args for fallback
            const tc = (step.toolCalls ?? []).find(tc => tc.toolCallId === toolResult.toolCallId);
            if (tc) transferArgs = tc.args as typeof transferArgs;
          }
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
