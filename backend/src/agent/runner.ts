import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { type CoreMessage, generateText } from 'ai';
import { experimental_createMCPClient as createMCPClient } from 'ai';
import { chatModel } from './llm';
import { skillsTools } from './skills';
import { logger } from '../logger';
import { type TurnRecord, type ToolRecord, type HandoffAnalysis } from '../skills/handoff-analyzer';

const TELECOM_MCP_URL = process.env.TELECOM_MCP_URL ?? 'http://localhost:8003/mcp';

const SKILLS_DIR = resolve(
  process.env.SKILLS_DIR
    ? resolve(process.cwd(), process.env.SKILLS_DIR)
    : resolve(import.meta.dir, '../..', 'skills')
);

/** Tool → skill name mapping for diagram highlighting */
const SKILL_TOOL_MAP: Record<string, string> = {
  diagnose_network: 'fault-diagnosis',
  diagnose_app: 'telecom-app',
};

/** Wrap the line annotated with `%% tool:<toolName>` inside a mermaid `rect` block (yellow). */
export function highlightMermaidTool(rawMermaid: string, toolName: string): string {
  const marker = `%% tool:${toolName}`;
  return rawMermaid
    .split('\n')
    .map((line) => {
      if (!line.includes(marker)) return line;
      const indent = line.match(/^(\s*)/)?.[1] ?? '';
      return `${indent}rect rgba(255, 200, 0, 0.35)\n${indent}  ${line.trimStart()}\n${indent}end`;
    })
    .join('\n');
}

/** Wrap the line annotated with `%% branch:<branchName>` inside a mermaid `rect` block (green). */
export function highlightMermaidBranch(rawMermaid: string, branchName: string): string {
  const marker = `%% branch:${branchName}`;
  return rawMermaid
    .split('\n')
    .map((line) => {
      if (!line.includes(marker)) return line;
      const indent = line.match(/^(\s*)/)?.[1] ?? '';
      return `${indent}rect rgba(100, 220, 120, 0.4)\n${indent}  ${line.trimStart()}\n${indent}end`;
    })
    .join('\n');
}

/**
 * Determine which mermaid branch to highlight based on diagnostic_steps returned by diagnose_network.
 * Returns a branch name matching the `%% branch:<name>` markers in SKILL.md.
 */
export function determineBranch(
  diagnosticSteps: Array<{ step: string; status: 'ok' | 'warning' | 'error' }>
): string {
  for (const s of diagnosticSteps) {
    if (s.status === 'ok') continue;
    const name = s.step;
    if (name === '账号状态检查' || name === 'Account Status') return 'account_error';
    if ((name === '流量余额检查' || name === 'Data Balance') && s.status === 'error') return 'data_exhausted';
    if (name === 'APN 配置检查' || name === 'APN Configuration') return 'apn_warning';
    if (name === '基站信号检测' || name === 'Base Station Signal') return 'signal_weak';
    if (name === '网络拥塞检测' || name === 'Network Congestion') return 'congestion';
  }
  return 'all_ok';
}

const SYSTEM_PROMPT_TEMPLATE =
  readFileSync(resolve(import.meta.dir, 'inbound-base-system-prompt.md'), 'utf-8') +
  '\n\n' +
  readFileSync(resolve(import.meta.dir, 'inbound-online-system-prompt.md'), 'utf-8');

const ENGLISH_LANG_INSTRUCTION = `\n\n---\n\n**LANGUAGE REQUIREMENT (MANDATORY)**\nYou MUST reply ONLY in English for this entire conversation. All responses must be in English. Do not switch to Chinese under any circumstances, even if the user writes in Chinese.\nWhen calling tools that accept a \`lang\` parameter (such as diagnose_network, diagnose_app), always pass \`lang: "en"\` to receive English diagnostic output.`;

function buildSystemPrompt(phone: string, lang: 'zh' | 'en' = 'zh'): string {
  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const base = SYSTEM_PROMPT_TEMPLATE
    .replace('{{PHONE}}', phone)
    .replace('{{CURRENT_DATE}}', today);
  return lang === 'en' ? base + ENGLISH_LANG_INSTRUCTION : base;
}

// Persistent MCP client — created once and reused across requests.
// The client stays open; we never close it after individual requests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let persistentMCPClient: any | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let persistentMCPTools: Record<string, any> | null = null;

async function getMCPTools() {
  if (persistentMCPClient && persistentMCPTools) {
    return { tools: persistentMCPTools };
  }
  try {
    persistentMCPClient = await createMCPClient({
      transport: new StreamableHTTPClientTransport(new URL(TELECOM_MCP_URL)),
    });
  } catch (err) {
    logger.error('agent', 'mcp_connect_error', { url: TELECOM_MCP_URL, error: String(err) });
    throw err;
  }

  persistentMCPTools = await persistentMCPClient.tools();
  logger.info('agent', 'mcp_connected', { url: TELECOM_MCP_URL, tools: Object.keys(persistentMCPTools as object).length });

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

/** Extract a ```mermaid ... ``` block from markdown. When lang='en', prefers the block after <!-- lang:en -->, falls back to first block. */
export function extractMermaidFromContent(markdown: string, lang: 'zh' | 'en' = 'zh'): string | null {
  if (lang === 'en') {
    const enMatch = markdown.match(/<!--\s*lang:en\s*-->\s*```mermaid\n([\s\S]*?)```/);
    if (enMatch) return enMatch[1].trim();
  }
  const match = markdown.match(/```mermaid\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
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

export async function runAgent(
  userMessage: string,
  history: CoreMessage[],
  userPhone: string = '13800000001',
  lang: 'zh' | 'en' = 'zh',
  onDiagramUpdate?: DiagramUpdateCallback,
  onTextDelta?: TextDeltaCallback,
): Promise<AgentResult> {
  const t_run_start = Date.now();
  const { tools: mcpTools } = await getMCPTools();
  const t_mcp_ready = Date.now();
  logger.info('agent', 'mcp_ready', { mcp_init_ms: t_mcp_ready - t_run_start });

  const systemPrompt = buildSystemPrompt(userPhone, lang);

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

  try {
    const result = await generateText({
      model: chatModel,
      system: systemPrompt,
      messages: [...history, { role: 'user', content: userMessage }],
      tools: {
        ...mcpTools,
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
                try {
                  const skillPath = resolve(SKILLS_DIR, skillName, 'SKILL.md');
                  if (existsSync(skillPath)) {
                    const rawMermaid = extractMermaidFromContent(readFileSync(skillPath, 'utf-8'), lang);
                    if (rawMermaid) onDiagramUpdate(skillName, rawMermaid);
                  }
                } catch { /* ignore */ }
              }
            }
            // MCP skill tools: push tool-highlighted diagram, then branch-highlighted if result available
            const skillName = SKILL_TOOL_MAP[tc.toolName];
            if (skillName) {
              try {
                const skillPath = resolve(SKILLS_DIR, skillName, 'SKILL.md');
                if (existsSync(skillPath)) {
                  const rawMermaid = extractMermaidFromContent(readFileSync(skillPath, 'utf-8'), lang);
                  if (rawMermaid) {
                    // Try to find the tool result to determine branch
                    const toolResult = (toolResults as Array<{ toolCallId: string; toolName: string; result: unknown }> ?? [])
                      .find((tr) => tr.toolCallId === tc.toolCallId);
                    const branchName = toolResult ? (() => {
                      try {
                        let raw: unknown = toolResult.result;
                        if (raw && typeof raw === 'object' && 'content' in raw &&
                          Array.isArray((raw as { content: unknown[] }).content)) {
                          const first = (raw as { content: { type: string; text: string }[] }).content
                            .find((c) => c.type === 'text');
                          if (first?.text) raw = first.text;
                        }
                        const parsed = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
                        if (parsed.diagnostic_steps) return determineBranch(parsed.diagnostic_steps);
                      } catch { /* ignore */ }
                      return null;
                    })() : null;

                    const highlighted = branchName
                      ? highlightMermaidBranch(highlightMermaidTool(rawMermaid, tc.toolName), branchName)
                      : highlightMermaidTool(rawMermaid, tc.toolName);
                    onDiagramUpdate(skillName, highlighted);
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
            const mermaid = extractMermaidFromContent(content, lang);
            if (skillName && mermaid) skillDiagram = { skill_name: skillName, mermaid };
            continue;
          }

          // Collect tool records for handoff analysis
          const toolCallForRecord = (step.toolCalls ?? []).find(tc => tc.toolCallId === toolResult.toolCallId);
          const NO_DATA_RE = /没找到|未找到|不存在|没有.*记录|无记录|null|not.?found/i;
          const success = !content.includes('"error"') && !content.startsWith('Error:');
          collectedToolRecords.push({
            tool: toolResult.toolName as string,
            args: (toolCallForRecord?.args as Record<string, unknown>) ?? {},
            result_summary: content.slice(0, 150),
            success: success && !NO_DATA_RE.test(content),
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
            // Override skill diagram with branch+tool highlighted version so the final
            // response doesn't downgrade the diagram back to un-highlighted.
            try {
              const skillPath = resolve(SKILLS_DIR, 'fault-diagnosis', 'SKILL.md');
              if (existsSync(skillPath)) {
                const rawMermaid = extractMermaidFromContent(readFileSync(skillPath, 'utf-8'), lang);
                if (rawMermaid) {
                  const branchName = determineBranch(parsed.diagnostic_steps);
                  skillDiagram = {
                    skill_name: 'fault-diagnosis',
                    mermaid: highlightMermaidBranch(highlightMermaidTool(rawMermaid, 'diagnose_network'), branchName),
                  };
                }
              }
            } catch { /* ignore */ }
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
    const transferDefault = lang === 'en'
      ? 'Please hold on, I\'m transferring you to a human agent now.'
      : '好的，我这就为您转接人工客服，请稍候。';
    const text =
      result.text ||
      [...(result.steps ?? [])].reverse().find((s) => s.text)?.text ||
      (transferRequested ? transferDefault : '');

    return { text, card, skill_diagram: skillDiagram, transferData };
  } finally {
    clearTimeout(timeoutId);
    // Persistent MCP client is intentionally kept open across requests.
  }
}
