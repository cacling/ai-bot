import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { type CoreMessage, generateText, jsonSchema } from 'ai';
import { experimental_createMCPClient as createMCPClient } from 'ai';
import { chatModel } from './llm';
import { skillsTools, getSkillsDescriptionByChannel, getToolSkillMap, getSkillContent, getSkillMermaid } from './skills';
import { logger } from '../services/logger';
import { type TurnRecord, type ToolRecord, type HandoffAnalysis } from '../agent/card/handoff-analyzer';
import { t } from '../services/i18n';
import { translateText } from '../services/translate-lang';
import { isNoDataResult } from '../services/tool-result';
import { extractMermaidFromContent, highlightMermaidTool, highlightMermaidBranch, determineBranch, stripMermaidMarkers, extractStateNames, highlightMermaidProgress } from '../services/mermaid';
import { analyzeProgress } from '../agent/card/progress-tracker';
import { matchMockRule, getMockedToolNames, getMockedToolDefinitions } from '../services/mock-engine';
import { executeDbTool, type DbExecutionConfig } from '../services/db-executor';
import { mcpTools as mcpToolsTable, mcpResources as mcpResourcesTable } from '../db/schema';
import { eq as dbEq } from 'drizzle-orm';
import { SOPGuard } from './sop-guard';

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


const SYSTEM_PROMPT_TEMPLATE =
  readFileSync(resolve(import.meta.dir, 'inbound-base-system-prompt.md'), 'utf-8') +
  '\n\n' +
  readFileSync(resolve(import.meta.dir, 'inbound-online-system-prompt.md'), 'utf-8');

const ENGLISH_LANG_INSTRUCTION = `**LANGUAGE REQUIREMENT (MANDATORY — HIGHEST PRIORITY)**\nYou MUST reply ONLY in English for this entire conversation. All responses must be in English. Do not switch to Chinese under any circumstances, even if the user writes in Chinese or tool results contain Chinese data. Always translate any Chinese data from tool results into English before including it in your response.\nWhen calling tools that accept a \`lang\` parameter (such as diagnose_network, diagnose_app), always pass \`lang: "en"\` to receive English diagnostic output.`;

function buildSystemPrompt(phone: string, lang: 'zh' | 'en' = 'zh', subscriberName?: string, planName?: string): string {
  const locale = lang === 'en' ? 'en-US' : 'zh-CN';
  const today = new Date().toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const defaultName = lang === 'en' ? 'Customer' : '用户';
  const defaultPlan = lang === 'en' ? 'Unknown Plan' : '未知套餐';
  const base = SYSTEM_PROMPT_TEMPLATE
    .replace('{{PHONE}}', phone)
    .replace('{{SUBSCRIBER_NAME}}', subscriberName ?? defaultName)
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
}


export type { HandoffAnalysis };

export type CardData =
  | { type: 'bill_card'; data: BillCardData }
  | { type: 'cancel_card'; data: CancelCardData }
  | { type: 'plan_card'; data: PlanCardData }
  | { type: 'diagnostic_card'; data: DiagnosticCardData }
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

export type DiagramUpdateCallback = (skillName: string, mermaid: string) => void;
export type TextDeltaCallback = (delta: string) => void;

export interface RunAgentOptions {
  /** @deprecated 使用工具级 mock 控制（MCP 管理中每个工具的 Mock 开关）。传 true 时回退为：对所有配了 mock_rules 的工具走 mock */
  useMock?: boolean;
  skillContent?: string; // 预注入的 SKILL.md 内容（测试时使用，避免依赖 LLM 调用 get_skill_instructions）
  skillName?: string; // 预设的技能名（配合 skillContent，用于进度追踪）
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
  overrideSkillsDir?: string,
  options?: RunAgentOptions,
): Promise<AgentResult> {
  const effectiveSkillsDir = overrideSkillsDir ?? SKILLS_DIR;
  const t_run_start = Date.now();
  const { tools: rawMcpTools } = await getMCPTools();

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

  // 注入 DB 类型工具：resource.type === 'db' 且工具非 mocked
  try {
    const allToolRows = db.select().from(mcpToolsTable).all()
      .filter(t => !t.mocked && !t.disabled && t.execution_config);
    for (const row of allToolRows) {
      if (row.name in mockWrappedTools) continue;
      try {
        const cfg = JSON.parse(row.execution_config!) as { resource_id?: string };
        if (!cfg.resource_id) continue;
        const resource = db.select().from(mcpResourcesTable).where(dbEq(mcpResourcesTable.id, cfg.resource_id)).get();
        if (!resource || resource.type !== 'db') continue;
        // 从资源读取 DB 配置
        const dbConfig: DbExecutionConfig = {
          table: resource.db_table ?? '',
          operation: (resource.db_operation as any) ?? 'select_one',
          where: resource.db_where ? JSON.parse(resource.db_where) : [],
          columns: resource.db_columns ? JSON.parse(resource.db_columns) : undefined,
          set_columns: resource.db_set_columns ? JSON.parse(resource.db_set_columns) : undefined,
          set_fixed: resource.db_set_fixed ? JSON.parse(resource.db_set_fixed) : undefined,
        };
        if (!dbConfig.table) continue;
        const schema = row.input_schema ? JSON.parse(row.input_schema) : { type: 'object', properties: {} };
        mockWrappedTools[row.name] = {
          description: row.description,
          parameters: jsonSchema(schema as any),
          execute: async (args: Record<string, unknown>) => {
            logger.info('agent', 'db_tool_execute', { tool: row.name, table: dbConfig.table });
            const result = executeDbTool(dbConfig, args);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          },
        };
        logger.info('agent', 'db_tool_injected', { tool: row.name, table: dbConfig.table });
      } catch { /* 解析失败跳过 */ }
    }
  } catch { /* mcp_tools 表不存在时跳过 */ }

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
          // Execute the tool
          const result = await tool.execute(...args);
          // Record successful call
          sopGuard.recordToolCall(name);
          sopGuard.resetViolations();
          return result;
        },
      },
    ]),
  );

  const t_mcp_ready = Date.now();
  logger.info('agent', 'mcp_ready', { mcp_init_ms: t_mcp_ready - t_run_start });

  let systemPrompt = buildSystemPrompt(userPhone, lang, subscriberName, planName);
  // Inject pre-loaded skill content (for test endpoint — ensures SOP is visible without get_skill_instructions)
  if (options?.skillContent) {
    systemPrompt += '\n\n---\n### 当前测试技能操作指南\n\n' + options.skillContent;
  }

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
  let lastActiveSkill: string | undefined = options?.skillName; // 追踪当前活跃 skill，用于通用工具的流程图高亮

  try {
    const result = await generateText({
      model: chatModel,
      system: systemPrompt,
      messages: [...history, { role: 'user', content: userMessage }],
      tools: {
        ...sopWrappedTools,
        ...skillsTools,
      },
      maxSteps: 10,
      abortSignal: controller.signal,
      onStepFinish: ({ toolCalls, toolResults, finishReason }) => {
        stepCount += 1;
        const now = Date.now();
        const tools = (toolCalls ?? []).map((tc) => tc.toolName);
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
                if (rawMermaid) onDiagramUpdate(skillName, stripMermaidMarkers(rawMermaid));
              }
            }
            const skillName = getSkillToolMap()[tc.toolName] ?? lastActiveSkill;
            if (skillName) {
              const rawMermaid = getSkillMermaid(skillName);
              if (rawMermaid) onDiagramUpdate(skillName, stripMermaidMarkers(rawMermaid));
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
    const text =
      result.text ||
      [...(result.steps ?? [])].reverse().find((s) => s.text)?.text ||
      (transferRequested ? transferDefault : '');

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
            const highlighted = highlightMermaidProgress(result.rawMermaid, result.stateName);
            progressCallback(progressSkill, stripMermaidMarkers(highlighted));
          } catch (err) { logger.warn('agent', 'progress_tracking_error', { skill: progressSkill, error: String(err) }); }
        })();
      } else {
        // HTTP (test endpoint): run synchronously, embed progress in returned skill_diagram
        try {
          const result = await runProgressTracking();
          if (result) {
            const highlighted = highlightMermaidProgress(result.rawMermaid, result.stateName);
            skillDiagram = { skill_name: progressSkill, mermaid: stripMermaidMarkers(highlighted) };
          }
        } catch (err) { logger.warn('agent', 'progress_tracking_error', { skill: progressSkill, error: String(err) }); }
      }
    }

    return { text, card, skill_diagram: skillDiagram, transferData };
  } finally {
    clearTimeout(timeoutId);
    // Persistent MCP client is intentionally kept open across requests.
  }
}
