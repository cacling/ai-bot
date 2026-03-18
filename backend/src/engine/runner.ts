import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { type CoreMessage, generateText } from 'ai';
import { experimental_createMCPClient as createMCPClient } from 'ai';
import { chatModel } from './llm';
import { skillsTools, getSkillsDescriptionByChannel } from './skills';
import { logger } from '../services/logger';
import { type TurnRecord, type ToolRecord, type HandoffAnalysis } from '../agent/card/handoff-analyzer';
import { t } from '../services/i18n';
import { translateText } from '../services/translate-lang';
import { isNoDataResult } from '../services/tool-result';
import { extractMermaidFromContent, highlightMermaidTool, highlightMermaidBranch, determineBranch, stripMermaidMarkers, extractStateNames, highlightMermaidProgress } from '../services/mermaid';
import { analyzeProgress } from '../agent/card/progress-tracker';
import { matchMockRule } from '../services/mock-engine';
import { SOPGuard } from './sop-guard';

// Re-export for test file
export { extractMermaidFromContent, highlightMermaidTool, highlightMermaidBranch, determineBranch, stripMermaidMarkers };

import { db } from '../db';
import { mcpServers } from '../db/schema';

const TELECOM_MCP_URL = process.env.TELECOM_MCP_URL ?? 'http://127.0.0.1:18003/mcp';

import { BIZ_SKILLS_DIR as SKILLS_DIR } from '../services/paths';

/** Tool → skill name mapping for diagram highlighting (fallback when no active skill) */
const SKILL_TOOL_MAP: Record<string, string> = {
  query_subscriber: 'service-cancel',
  query_bill: 'bill-inquiry',
  query_plans: 'plan-inquiry',
  cancel_service: 'service-cancel',
  diagnose_network: 'fault-diagnosis',
  diagnose_app: 'telecom-app',
  issue_invoice: 'bill-inquiry',
  verify_identity: 'service-suspension',
  check_account_balance: 'service-suspension',
  check_contracts: 'service-suspension',
  apply_service_suspension: 'service-suspension',
  record_call_result: 'outbound-collection',
  send_followup_sms: 'outbound-collection',
  create_callback_task: 'outbound-collection',
  record_marketing_result: 'outbound-marketing',
};


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
  useMock?: boolean; // true = 使用 mock 规则替代真实 MCP 调用（沙箱默认行为）
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
  const useMock = options?.useMock ?? false;
  const t_run_start = Date.now();
  const { tools: rawMcpTools } = await getMCPTools();

  // If useMock, wrap each MCP tool to try mock rules first
  const mockWrappedTools = useMock
    ? Object.fromEntries(
        Object.entries(rawMcpTools as Record<string, any>).map(([name, tool]) => [
          name,
          {
            ...tool,
            execute: async (...args: any[]) => {
              // args[0] is the tool input object from AI SDK
              const toolInput = args[0] ?? {};
              const mockResult = matchMockRule(name, toolInput);
              if (mockResult !== null) {
                logger.info('agent', 'mock_tool_used', { tool: name });
                return { content: [{ type: 'text', text: mockResult }] };
              }
              // No mock rule → fall through to real MCP
              return tool.execute(...args);
            },
          },
        ]),
      )
    : rawMcpTools;
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

  const systemPrompt = buildSystemPrompt(userPhone, lang, subscriberName, planName);

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
  let lastActiveSkill: string | undefined; // 追踪当前活跃 skill，用于通用工具的流程图高亮

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

        // Push diagram updates via callback (for WebSocket chat channel)
        if (onDiagramUpdate) {
          for (const tc of toolCalls ?? []) {
            // get_skill_instructions: push un-highlighted diagram so the panel appears early
            if (tc.toolName === 'get_skill_instructions') {
              const args = tc.args as { skill_name?: string };
              const skillName = args.skill_name;
              if (skillName) {
                lastActiveSkill = skillName;
                try {
                  const skillPath = resolve(SKILLS_DIR, skillName, 'SKILL.md');
                  if (existsSync(skillPath)) {
                    const rawMermaid = extractMermaidFromContent(readFileSync(skillPath, 'utf-8'));
                    if (rawMermaid) onDiagramUpdate(skillName, stripMermaidMarkers(rawMermaid));
                  }
                } catch { /* ignore */ }
              }
            }
            // MCP skill tools: send un-highlighted diagram immediately;
            // progressHL will be applied later by the async progress tracker.
            const skillName = SKILL_TOOL_MAP[tc.toolName] ?? lastActiveSkill;
            if (skillName) {
              lastActiveSkill = skillName;
              try {
                const skillPath = resolve(SKILLS_DIR, skillName, 'SKILL.md');
                if (existsSync(skillPath)) {
                  const rawMermaid = extractMermaidFromContent(readFileSync(skillPath, 'utf-8'));
                  if (rawMermaid) {
                    onDiagramUpdate(skillName, stripMermaidMarkers(rawMermaid));
                  }
                }
              } catch { /* ignore */ }
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
            const mappedSkill = SKILL_TOOL_MAP[toolResult.toolName as string];
            if (mappedSkill) {
              try {
                const sp = resolve(SKILLS_DIR, mappedSkill, 'SKILL.md');
                if (existsSync(sp)) {
                  const mm = extractMermaidFromContent(readFileSync(sp, 'utf-8'));
                  if (mm) skillDiagram = { skill_name: mappedSkill, mermaid: stripMermaidMarkers(mm) };
                }
              } catch { /* ignore */ }
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

    // ── 异步流程进度追踪（text chat 通道） ──
    // 如果有活跃 skill 且有 onDiagramUpdate 回调，异步判断当前进度并推送高亮
    if (lastActiveSkill && onDiagramUpdate && text) {
      const progressSkill = lastActiveSkill;
      const progressCallback = onDiagramUpdate;
      const recentTurns = [
        ...history.slice(-4).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', text: typeof m.content === 'string' ? m.content : '' })),
        { role: 'user', text: userMessage },
        { role: 'assistant', text },
      ];
      // Fire-and-forget: don't block response
      (async () => {
        try {
          const skillPath = resolve(SKILLS_DIR, progressSkill, 'SKILL.md');
          if (!existsSync(skillPath)) return;
          const rawMermaid = extractMermaidFromContent(readFileSync(skillPath, 'utf-8'));
          if (!rawMermaid) return;
          const stateNames = extractStateNames(rawMermaid);
          const stateName = await analyzeProgress(recentTurns, stateNames);
          if (!stateName) return;
          logger.info('agent', 'progress_tracked', { skill: progressSkill, state: stateName });
          const highlighted = highlightMermaidProgress(rawMermaid, stateName);
          progressCallback(progressSkill, stripMermaidMarkers(highlighted));
        } catch (err) { logger.warn('agent', 'inline_progress_tracking_error', { skill: progressSkill, error: String(err) }); }
      })();
    }

    return { text, card, skill_diagram: skillDiagram, transferData };
  } finally {
    clearTimeout(timeoutId);
    // Persistent MCP client is intentionally kept open across requests.
  }
}
