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
      // Find ALL transitions that lead TO this state (not just tool-marked)
      for (const t of allTransitions) {
        if (t.to === current && !visited.has(t.from)) {
          visited.add(t.from);
          // If this predecessor state has a tool marker, record it as required
          const predTool = toolAtState.get(t.from);
          if (predTool) {
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

        // Across skills: merge (union) with existing
        const existing = map.get(toolName);
        if (existing) {
          const merged = new Set([...existing.requiredTools, ...required]);
          existing.requiredTools = [...merged];
          existing.description = `${toolName} 需要先完成: ${existing.requiredTools.join(', ')}`;
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

  // 操作类工具 = 有前置依赖的工具（自动从状态图推断）
  _operationTools = new Set(map.keys());

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
    _deps = buildGlobalDependencies();
    _depsBuiltAt = Date.now();
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

  /** 记录一个工具已被成功调用 */
  recordToolCall(toolName: string): void {
    this.calledTools.add(toolName);
  }

  /**
   * 检查一个工具是否可以调用。
   * 返回 null 表示允许，返回 string 表示拒绝原因。
   */
  check(toolName: string): string | null {
    // 查询类工具不拦截（不在操作工具集中的就是查询类）
    if (!_operationTools.has(toolName)) return null;

    const deps = getDeps();
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
}
