/**
 * sop-guard.ts — SOP 状态机拦截层
 *
 * 从 SKILL.md 的 mermaid 状态图中提取工具调用顺序约束，
 * 在操作类工具执行前验证前置工具是否已调用。
 *
 * 只拦截操作类工具（有副作用），查询类工具不限制。
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../services/logger';
import { BIZ_SKILLS_DIR as SKILLS_DIR } from '../services/paths';

// 操作类工具 — 需要 SOP 前置条件验证
const OPERATION_TOOLS = new Set([
  'cancel_service',
  'issue_invoice',
  'apply_service_suspension',
]);

// 查询类工具 — 不需要拦截
const QUERY_TOOLS = new Set([
  'query_subscriber',
  'query_bill',
  'query_plans',
  'diagnose_network',
  'diagnose_app',
  'verify_identity',
  'check_account_balance',
  'check_contracts',
]);

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

  // Extract all transitions with tool markers: A --> B: label %% tool:xxx
  const transitions: Array<{ from: string; to: string; tool: string }> = [];
  for (const line of lines) {
    const toolMatch = line.match(/%% tool:(\w+)/);
    if (!toolMatch) continue;
    const transMatch = line.match(/^\s*(\S+)\s*-->\s*([^:\s]+)/);
    if (!transMatch) continue;
    transitions.push({
      from: transMatch[1],
      to: transMatch[2],
      tool: toolMatch[1],
    });
  }

  // For each operation tool, trace back to find all query tools that must precede it
  for (const t of transitions) {
    if (!OPERATION_TOOLS.has(t.tool)) continue;

    // BFS backwards from this state to find all predecessor query tools
    const required = new Set<string>();
    const visited = new Set<string>();
    const queue = [t.from];
    visited.add(t.from);

    while (queue.length > 0) {
      const current = queue.shift()!;
      // Find all transitions that lead TO this state
      for (const prev of transitions) {
        if (prev.to === current && !visited.has(prev.from)) {
          visited.add(prev.from);
          if (QUERY_TOOLS.has(prev.tool)) {
            required.add(prev.tool);
          }
          queue.push(prev.from);
        }
      }
    }

    deps.push({
      tool: t.tool,
      requiredTools: [...required],
      description: `${t.tool} 需要先完成: ${[...required].join(', ') || '(无前置工具)'}`,
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
    const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'));

    for (const dir of dirs) {
      const mdPath = join(SKILLS_DIR, dir.name, 'SKILL.md');
      if (!existsSync(mdPath)) continue;

      const content = readFileSync(mdPath, 'utf-8');
      const mermaidMatch = content.match(/```mermaid\r?\n([\s\S]*?)```/);
      if (!mermaidMatch) continue;

      const deps = extractToolDependencies(mermaidMatch[1]);
      for (const dep of deps) {
        // If tool already has deps from another skill, merge (take the most restrictive)
        const existing = map.get(dep.tool);
        if (existing) {
          const merged = new Set([...existing.requiredTools, ...dep.requiredTools]);
          existing.requiredTools = [...merged];
          existing.description = `${dep.tool} 需要先完成: ${existing.requiredTools.join(', ')}`;
        } else {
          map.set(dep.tool, dep);
        }
      }
    }
  } catch (e) {
    logger.warn('sop-guard', 'build_deps_error', { error: String(e) });
  }

  return map;
}

// Build once at startup, refresh every 60s
let _deps = buildGlobalDependencies();
let _depsBuiltAt = Date.now();

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
    // 查询类工具不拦截
    if (!OPERATION_TOOLS.has(toolName)) return null;

    const deps = getDeps();
    const dep = deps.get(toolName);
    if (!dep || dep.requiredTools.length === 0) return null;

    // 检查前置工具是否都已调用
    const missing = dep.requiredTools.filter(t => !this.calledTools.has(t));
    if (missing.length === 0) return null;

    this.violations++;
    const missingDesc = missing.map(t => {
      if (t === 'query_subscriber') return 'query_subscriber（查询用户信息）';
      if (t === 'query_bill') return 'query_bill（查询账单）';
      if (t === 'verify_identity') return 'verify_identity（身份验证）';
      if (t === 'check_account_balance') return 'check_account_balance（查询余额）';
      if (t === 'check_contracts') return 'check_contracts（查询合约）';
      return t;
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
