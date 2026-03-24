/**
 * sop-guard.ts — SOP 状态机拦截层
 *
 * 从 SKILL.md 的 mermaid 状态图中提取工具调用顺序约束，
 * 在操作类工具执行前验证前置工具是否已调用。
 *
 * 只拦截操作类工具（有副作用），查询类工具不限制。
 */

import { logger } from '../services/logger';
import { getToolsOverview } from '../agent/km/mcp/tools-overview';
import { getAvailableSkills, getSkillMermaid } from './skills';
import { type WorkflowSpec, type GuardType } from './skill-workflow-types';

// 操作类工具集合：从 SKILL.md 的 %% tool:xxx 依赖关系中动态生成
// 任何有前置依赖的工具就是操作类工具，其余为查询类
// 在 buildGlobalDependencies() 中构建
let _operationTools = new Set<string>();

/**
 * 从 mermaid 状态图中提取工具依赖关系。
 * 例如：cancel_service 需要先调用 query_subscriber
 *
 * 解析逻辑：沿着状态图的转移路径，找到每个操作类工具之前
 * 需要经过哪些查询类工具。
 */
interface ToolDependency {
  tool: string;                  // 操作类工具名
  requiredTools: string[];       // 必须先调用的工具
  description: string;           // 人类可读的描述（用于错误提示）
}

function extractToolDependencies(mermaid: string): ToolDependency[] {
  const deps: ToolDependency[] = [];
  const lines = mermaid.split('\n');

  // Step 1: Extract ALL transitions (not just tool-marked ones)
  const allTransitions: Array<{ from: string; to: string }> = [];
  // Step 2: Extract tool → state mapping (which state has which tool marker)
  const toolAtState = new Map<string, string>(); // stateFrom → toolName

  for (const line of lines) {
    const transMatch = line.match(/^\s*(\S+)\s*-->\s*([^:\s]+)/);
    if (!transMatch) continue;
    const from = transMatch[1];
    const to = transMatch[2];
    if (from === '[*]' || to === '[*]') {
      allTransitions.push({ from, to });
      // Still check for tool marker on [*] transitions
      const toolMatch = line.match(/%% tool:(\w+)/);
      if (toolMatch) toolAtState.set(from, toolMatch[1]);
      continue;
    }
    allTransitions.push({ from, to });

    const toolMatch = line.match(/%% tool:(\w+)/);
    if (toolMatch) {
      toolAtState.set(from, toolMatch[1]);
    }
  }

  // Step 3: For each tool, BFS backwards along ALL transitions
  // to find predecessor tools. Tools with predecessors are "operation" tools.
  for (const [state, toolName] of toolAtState) {

    const required = new Set<string>();
    const visited = new Set<string>();
    const queue = [state];
    visited.add(state);

    while (queue.length > 0) {
      const current = queue.shift()!;
      // Don't expand [*] — it connects all end states to the start,
      // and expanding it would let BFS cross from one branch to another
      if (current === '[*]') continue;
      // Find ALL transitions that lead TO this state (not just tool-marked)
      for (const t of allTransitions) {
        if (t.to === current && !visited.has(t.from)) {
          visited.add(t.from);
          // If this predecessor state has a tool marker, record it as required
          // (exclude self-dependency: a tool should never require itself)
          const predTool = toolAtState.get(t.from);
          if (predTool && predTool !== toolName) {
            required.add(predTool);
          }
          queue.push(t.from);
        }
      }
    }

    deps.push({
      tool: toolName,
      requiredTools: [...required],
      description: `${toolName} 需要先完成: ${[...required].join(', ') || '(无前置工具)'}`,
    });
  }

  return deps;
}

/**
 * 从所有 SKILL.md 中提取工具依赖关系，构建全局映射。
 */
function buildGlobalDependencies(): Map<string, ToolDependency> {
  const map = new Map<string, ToolDependency>();

  try {
    const skills = getAvailableSkills();

    for (const skill of skills) {
      const mermaid = getSkillMermaid(skill.name);
      if (!mermaid) continue;

      const deps = extractToolDependencies(mermaid);

      // Within a skill: same tool may appear in multiple branches.
      // Take INTERSECTION — only require tools common to ALL branches.
      const skillToolDeps = new Map<string, Set<string>[]>();
      for (const dep of deps) {
        const list = skillToolDeps.get(dep.tool) ?? [];
        list.push(new Set(dep.requiredTools));
        skillToolDeps.set(dep.tool, list);
      }

      for (const [toolName, branchDeps] of skillToolDeps) {
        // Intersect all branches
        let common = branchDeps[0] ? new Set(branchDeps[0]) : new Set<string>();
        for (let i = 1; i < branchDeps.length; i++) {
          for (const t of common) {
            if (!branchDeps[i].has(t)) common.delete(t);
          }
        }
        const required = [...common];

        // Across skills: intersect with existing (a tool is only blocked
        // if ALL skills that reference it agree on the prerequisite)
        const existing = map.get(toolName);
        if (existing) {
          const intersected = existing.requiredTools.filter(t => required.includes(t));
          existing.requiredTools = intersected;
          existing.description = `${toolName} 需要先完成: ${intersected.join(', ') || '(无前置工具)'}`;
        } else {
          map.set(toolName, {
            tool: toolName,
            requiredTools: required,
            description: `${toolName} 需要先完成: ${required.join(', ') || '(无前置工具)'}`,
          });
        }
      }
    }
  } catch (e) {
    logger.warn('sop-guard', 'build_deps_error', { error: String(e) });
  }

  // 操作类工具 = 有非空前置依赖 + annotations.readOnlyHint !== true
  // 从 mcp_tools 表的 annotations 列读取，readOnlyHint=true 的工具是查询类，不拦截
  const readOnlyTools = new Set<string>();
  try {
    const allTools = getToolsOverview();
    for (const t of allTools) {
      if (t.annotations) {
        try {
          const ann = typeof t.annotations === 'string' ? JSON.parse(t.annotations) : t.annotations;
          if (ann.readOnlyHint === true) readOnlyTools.add(t.name);
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  // Fallback: 如果 DB 没有 annotations 数据，用前缀规约兜底
  const QUERY_PREFIXES = ['query_', 'check_', 'verify_', 'get_', 'diagnose_', 'analyze_', 'search_'];
  _operationTools = new Set(
    [...map.entries()]
      .filter(([name, dep]) => {
        if (dep.requiredTools.length === 0) return false;
        if (readOnlyTools.has(name)) return false;
        if (readOnlyTools.size === 0 && QUERY_PREFIXES.some(p => name.startsWith(p))) return false;
        return true;
      })
      .map(([name]) => name),
  );

  return map;
}

// Build once at startup, refresh every 60s
let _deps = buildGlobalDependencies();
let _depsBuiltAt = Date.now();

// Log at startup
for (const [tool, dep] of _deps) {
  logger.info('sop-guard', 'dependency', { tool, requires: dep.requiredTools });
}
logger.info('sop-guard', 'operation_tools', { tools: [..._operationTools] });

function getDeps(): Map<string, ToolDependency> {
  if (Date.now() - _depsBuiltAt > 60_000) {
    const prevOps = new Set(_operationTools);
    _deps = buildGlobalDependencies();
    _depsBuiltAt = Date.now();

    // 记录新增的操作工具（有助于排查新创建技能的 SOP 是否生效）
    const newOps = [..._operationTools].filter(t => !prevOps.has(t));
    const removedOps = [...prevOps].filter(t => !_operationTools.has(t));
    if (newOps.length > 0 || removedOps.length > 0) {
      logger.info('sop-guard', 'deps_refreshed', {
        operation_tools: [..._operationTools],
        new_ops: newOps,
        removed_ops: removedOps,
      });
    }
  }
  return _deps;
}

/**
 * SOP Guard — 会话级状态追踪器
 *
 * 每个对话创建一个实例，追踪已调用的工具，
 * 在操作类工具执行前验证前置条件。
 */
export class SOPGuard {
  private calledTools = new Set<string>();
  private violations = 0;  // 连续违规次数

  // V2: plan-aware state tracking fields
  private activeSkill: string | null = null;
  private activePlan: WorkflowSpec | null = null;
  private currentStepId: string | null = null;
  private pendingConfirm: boolean = false;

  /** Activate a skill's execution plan */
  activatePlan(skillName: string, plan: WorkflowSpec): void {
    this.activeSkill = skillName;
    this.activePlan = plan;
    this.currentStepId = plan.startStepId;
    this.pendingConfirm = false;
    // Auto-advance through non-actionable start nodes
    this.autoAdvance();
  }

  /** Called when user message arrives */
  onUserMessage(text: string): void {
    if (!this.pendingConfirm || !this.activePlan || !this.currentStepId) return;
    const intent = classifyUserIntent(text);
    if (intent === 'other') return; // LLM will clarify
    const step = this.activePlan.steps[this.currentStepId];
    if (!step) return;
    for (const t of step.transitions) {
      if ((intent === 'confirm' && t.guard === 'user.confirm') ||
          (intent === 'cancel' && t.guard === 'user.cancel')) {
        this.currentStepId = t.target;
        this.pendingConfirm = false;
        this.autoAdvance();
        return;
      }
    }
  }

  /** Get prompt hint for LLM injection */
  getPromptHint(): string | null {
    if (!this.activePlan || !this.currentStepId) return null;
    const step = this.activePlan.steps[this.currentStepId];
    if (!step) return null;
    const nextLabels = step.transitions.map(t => {
      const target = this.activePlan!.steps[t.target];
      return target ? `[${target.label}]` : `[${t.target}]`;
    }).join(' / ');

    let hint = `⚡ SOP 进度：你在 [${step.label}] 状态。`;
    if (nextLabels) hint += `\n下一步是：${nextLabels}。`;
    if (this.pendingConfirm) hint += '\n在用户确认前，禁止调用任何操作类工具。';
    if (step.kind === 'tool' && step.tool) hint += `\n当前应调用工具：${step.tool}`;
    return hint;
  }

  /** 记录一个工具已被成功调用（用于后续 check 判断前置条件是否满足） */
  recordToolCall(toolName: string, result?: { success: boolean; hasData: boolean }): void {
    this.calledTools.add(toolName);

    if (!this.activePlan || !this.currentStepId) return;

    const step = this.activePlan.steps[this.currentStepId];
    if (!step || step.tool !== toolName) return;

    // Evaluate guards based on result
    const guardResult = result ?? { success: true, hasData: true };
    for (const t of step.transitions) {
      if (evaluateGuard(t.guard, guardResult)) {
        this.currentStepId = t.target;
        this.autoAdvance();
        return;
      }
    }
    // No guard matched — fallback to first transition
    if (step.transitions.length > 0) {
      this.currentStepId = step.transitions[0].target;
      this.autoAdvance();
    }
  }

  /**
   * 检查一个工具是否可以调用。
   * 返回 null 表示允许，返回 string 表示拒绝原因。
   */
  check(toolName: string): string | null {
    // Plan-aware check (V2)
    if (this.activePlan && this.currentStepId) {
      // Always allow transfer_to_human and skill tools
      if (toolName === 'transfer_to_human' || toolName === 'get_skill_instructions' || toolName === 'get_skill_reference') {
        return null; // allow
      }

      if (this.pendingConfirm) {
        this.violations++;
        return `当前在确认节点 [${this.activePlan.steps[this.currentStepId]?.label}]，请先等待用户确认后再调用工具。`;
      }

      const step = this.activePlan.steps[this.currentStepId];
      if (step?.kind === 'tool' && step.tool === toolName) {
        return null; // allow — matches current step
      }

      // Check if tool is in any reachable step (query tools may be called ahead)
      // For now: if it's a read-only tool hint, allow it
      // Otherwise block
      const isCurrentStepTool = step?.kind === 'tool';
      if (isCurrentStepTool && step?.tool !== toolName) {
        this.violations++;
        return `当前在 [${step?.label}] 状态，应该调用 ${step?.tool}，不能调用 ${toolName}。`;
      }

      // Fall through to existing check for non-tool steps
    }

    // 先刷新依赖图（如果超过 TTL），确保新创建的技能的工具约束能被及时加载
    const deps = getDeps();

    // 查询类工具不拦截（不在操作工具集中的就是查询类）
    if (!_operationTools.has(toolName)) return null;

    const dep = deps.get(toolName);
    if (!dep || dep.requiredTools.length === 0) return null;

    // 检查前置工具是否都已调用
    const missing = dep.requiredTools.filter(t => !this.calledTools.has(t));
    if (missing.length === 0) return null;

    this.violations++;
    // 从 DB 动态获取工具描述
    const allTools = getToolsOverview();
    const toolDescMap = new Map(allTools.map(t => [t.name, t.description]));
    const missingDesc = missing.map(t => {
      const desc = toolDescMap.get(t);
      return desc ? `${t}（${desc}）` : t;
    }).join('、');

    logger.warn('sop-guard', 'tool_blocked', {
      tool: toolName,
      missing,
      violations: this.violations,
      called: [...this.calledTools],
    });

    return `⚠️ SOP 违规：${toolName} 的前置条件未满足。请先调用 ${missingDesc}，完成信息查询和用户确认后再执行此操作。`;
  }

  /** 是否已达到最大违规次数（应转人工） */
  shouldEscalate(): boolean {
    return this.violations >= 2;
  }

  /** 重置违规计数（LLM 纠正后） */
  resetViolations(): void {
    this.violations = 0;
  }

  /** Auto-advance through non-actionable nodes (choice, end, human) */
  private autoAdvance(): void {
    if (!this.activePlan || !this.currentStepId) return;

    let safety = 20; // prevent infinite loops
    while (safety-- > 0) {
      const step = this.activePlan.steps[this.currentStepId];
      if (!step) break;

      if (step.kind === 'choice') {
        // Auto-evaluate: use last tool result context
        // For now, take the first transition (tool result already selected the right target)
        if (step.transitions.length > 0) {
          this.currentStepId = step.transitions[0].target;
          continue;
        }
        break;
      }

      if (step.kind === 'confirm') {
        this.pendingConfirm = true;
        break;
      }

      if (step.kind === 'end' || step.kind === 'human') {
        // Workflow complete or escalated
        this.activePlan = null;
        this.activeSkill = null;
        this.currentStepId = null;
        break;
      }

      // message, ref, tool — these are handled by LLM, don't auto-advance
      break;
    }
  }
}

function classifyUserIntent(text: string): 'confirm' | 'cancel' | 'other' {
  const CONFIRM = /确认|同意|好的|可以|办理|没问题|是的|对|嗯|行/;
  const CANCEL = /取消|不要|算了|放弃|不用|再说|不办/;
  if (CONFIRM.test(text)) return 'confirm';
  if (CANCEL.test(text)) return 'cancel';
  return 'other';
}

function evaluateGuard(guard: GuardType, result: { success: boolean; hasData: boolean }): boolean {
  switch (guard) {
    case 'tool.success': return result.success && result.hasData;
    case 'tool.error': return !result.success;
    case 'tool.no_data': return result.success && !result.hasData;
    case 'always': return true;
    default: return false;
  }
}
