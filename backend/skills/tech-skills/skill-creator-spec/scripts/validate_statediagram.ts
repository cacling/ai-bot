/**
 * validate_statediagram.ts
 * 解析 Mermaid stateDiagram-v2 并校验分支完备性
 */
import type { ValidationCheck, ParsedStateDiagram, StateNode, StateTransition, MermaidAnnotation, SkillMode } from './types';

// ── Mermaid 解析 ──

const RE_TRANSITION = /^\s*(.+?)\s*-->\s*(.+?)(?:\s*:\s*(.+))?$/;
const RE_CHOICE = /^\s*state\s+(.+?)\s+<<choice>>/;
const RE_NESTED_OPEN = /^\s*state\s+(.+?)\s*\{/;
const RE_ANNOTATION_TOOL = /%%\s*tool:(\w+)/g;
const RE_ANNOTATION_REF = /%%\s*ref:([^\s]+)/g;
const RE_ANNOTATION_BRANCH = /%%\s*branch:(\w+)/g;
const RE_ANNOTATION_STEP = /%%\s*step:([\w-]+)/g;
const RE_ANNOTATION_KIND = /%%\s*kind:(\w+)/g;
const RE_ANNOTATION_GUARD = /%%\s*guard:([\w.]+)/g;
const RE_ANNOTATION_OUTPUT = /%%\s*output:(\w+)/g;
import { extractPrimaryMermaidBlock as _extractPrimaryMermaidBlock } from '../../../../src/services/mermaid';

/** 清理状态名：去除引号和前后空格 */
function cleanStateName(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, '');
}

/** 从一行中提取所有注释 */
function extractAnnotations(line: string, lineNum: number, targetState?: string): MermaidAnnotation[] {
  const anns: MermaidAnnotation[] = [];
  let m: RegExpExecArray | null;

  RE_ANNOTATION_TOOL.lastIndex = 0;
  while ((m = RE_ANNOTATION_TOOL.exec(line))) {
    anns.push({ type: 'tool', value: m[1], line: lineNum, targetState });
  }
  RE_ANNOTATION_REF.lastIndex = 0;
  while ((m = RE_ANNOTATION_REF.exec(line))) {
    anns.push({ type: 'ref', value: m[1], line: lineNum, targetState });
  }
  RE_ANNOTATION_BRANCH.lastIndex = 0;
  while ((m = RE_ANNOTATION_BRANCH.exec(line))) {
    anns.push({ type: 'branch', value: m[1], line: lineNum, targetState });
  }
  RE_ANNOTATION_STEP.lastIndex = 0;
  while ((m = RE_ANNOTATION_STEP.exec(line))) {
    anns.push({ type: 'step', value: m[1], line: lineNum, targetState });
  }
  RE_ANNOTATION_KIND.lastIndex = 0;
  while ((m = RE_ANNOTATION_KIND.exec(line))) {
    anns.push({ type: 'kind', value: m[1], line: lineNum, targetState });
  }
  RE_ANNOTATION_GUARD.lastIndex = 0;
  while ((m = RE_ANNOTATION_GUARD.exec(line))) {
    anns.push({ type: 'guard', value: m[1], line: lineNum, targetState });
  }
  RE_ANNOTATION_OUTPUT.lastIndex = 0;
  while ((m = RE_ANNOTATION_OUTPUT.exec(line))) {
    anns.push({ type: 'output', value: m[1], line: lineNum, targetState });
  }
  return anns;
}

/** 提取 mermaid 代码块内容 */
export function extractMermaidBlock(skillMd: string): string | null {
  return _extractPrimaryMermaidBlock(skillMd);
}

/** 解析 stateDiagram-v2 为结构化数据 */
export function parseStateDiagram(mermaid: string): ParsedStateDiagram {
  const states = new Map<string, StateNode>();
  const transitions: StateTransition[] = [];
  const annotations: MermaidAnnotation[] = [];
  let hasStart = false;
  let hasEnd = false;

  const addState = (name: string, line: number, opts?: { isChoice?: boolean; isNested?: boolean }) => {
    if (name === '[*]') return;
    if (!states.has(name)) {
      states.set(name, { name, isChoice: false, isNested: false, line });
    }
    if (opts?.isChoice) states.get(name)!.isChoice = true;
    if (opts?.isNested) states.get(name)!.isNested = true;
  };

  const lines = mermaid.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // 跳过空行、注释行、stateDiagram-v2 声明
    if (!trimmed || trimmed === 'stateDiagram-v2' || (trimmed.startsWith('%%') && !trimmed.includes('-->'))) continue;

    // choice 声明
    const choiceMatch = trimmed.match(RE_CHOICE);
    if (choiceMatch) {
      addState(cleanStateName(choiceMatch[1]), lineNum, { isChoice: true });
      continue;
    }

    // 嵌套 state 开始
    const nestedMatch = trimmed.match(RE_NESTED_OPEN);
    if (nestedMatch) {
      addState(cleanStateName(nestedMatch[1]), lineNum, { isNested: true });
      continue;
    }

    // 转移
    const transMatch = trimmed.match(RE_TRANSITION);
    if (transMatch) {
      const from = cleanStateName(transMatch[1]);
      const to = cleanStateName(transMatch[2]);
      const label = (transMatch[3] ?? '').replace(/%%.*$/, '').trim();

      if (from === '[*]') hasStart = true;
      if (to === '[*]') hasEnd = true;

      addState(from, lineNum);
      addState(to, lineNum);

      const lineAnnotations = extractAnnotations(trimmed, lineNum, to);
      annotations.push(...lineAnnotations);

      transitions.push({
        from, to, label,
        annotations: lineAnnotations.map(a => `${a.type}:${a.value}`),
        line: lineNum,
      });
      continue;
    }

    // 独立注释行（不在转移上）
    const lineAnns = extractAnnotations(trimmed, lineNum);
    if (lineAnns.length) annotations.push(...lineAnns);
  }

  return {
    states: [...states.values()],
    transitions,
    annotations,
    hasStart,
    hasEnd,
  };
}

// ── 校验 ──

export function validateStatediagram(skillMd: string, mode: SkillMode = 'inbound'): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  const mermaid = extractMermaidBlock(skillMd);
  if (!mermaid) {
    checks.push({ rule: 'sd.missing', severity: 'error', message: '未找到 mermaid stateDiagram-v2 代码块' });
    return checks;
  }

  const diagram = parseStateDiagram(mermaid);

  // 起止状态
  if (!diagram.hasStart) {
    checks.push({ rule: 'sd.no_start', severity: 'error', message: '状态图缺少起始状态 [*] --> ...' });
  }
  if (!diagram.hasEnd) {
    checks.push({ rule: 'sd.no_end', severity: 'error', message: '状态图缺少终止状态 ... --> [*]' });
  }

  // tool 节点后必须有 choice（排除终结动作和查询链）
  const TERMINAL_TOOLS = ['transfer_to_human', 'record_call_result', 'send_followup_sms'];
  const QUERY_PREFIXES = ['query_', 'check_', 'get_', 'list_', 'search_', 'verify_', 'diagnose_'];
  const toolAnnotations = diagram.annotations.filter(a => a.type === 'tool');

  for (const toolAnn of toolAnnotations) {
    if (!toolAnn.targetState) continue;

    // 终结动作（如转人工）不需要 choice
    if (TERMINAL_TOOLS.includes(toolAnn.value)) continue;

    const target = toolAnn.targetState;
    // 终止状态 [*] 不需要 choice
    if (target === '[*]') continue;

    const outgoing = diagram.transitions.filter(t => t.from === target);
    // 无出路（终态或嵌套内部）跳过
    if (outgoing.length === 0) continue;

    // 检查是否在 2 跳内能到达 <<choice>>
    const hasChoiceWithin2 = outgoing.some(t => {
      const hop1 = diagram.states.find(s => s.name === t.to);
      if (hop1?.isChoice) return true;
      // 再看第 2 跳
      const hop2Transitions = diagram.transitions.filter(t2 => t2.from === t.to);
      return hop2Transitions.some(t2 => {
        const hop2 = diagram.states.find(s => s.name === t2.to);
        return hop2?.isChoice;
      });
    });

    if (!hasChoiceWithin2) {
      // tool_no_choice 统一为 warning：LLM 生成的 draft 允许保存后再完善
      // 查询类工具在连续链中更常见缺 choice，提示语做区分
      const isQuery = QUERY_PREFIXES.some(p => toolAnn.value.startsWith(p));
      checks.push({
        rule: 'sd.tool_no_choice',
        severity: 'warning',
        message: isQuery
          ? `查询工具 ${toolAnn.value} 的结果节点 "${target}" 后建议添加 <<choice>> 分支（区分成功/失败）`
          : `操作工具 ${toolAnn.value} 的结果节点 "${target}" 后建议添加 <<choice>> 分支（区分成功/失败）`,
        location: `statediagram:line:${toolAnn.line}`,
      });
    }
  }

  // choice 节点出路数
  const choiceNodes = diagram.states.filter(s => s.isChoice);
  for (const choice of choiceNodes) {
    const exits = diagram.transitions.filter(t => t.from === choice.name);
    if (exits.length < 2) {
      checks.push({
        rule: 'sd.choice_single_exit',
        severity: 'warning',
        message: `<<choice>> 节点 "${choice.name}" 只有 ${exits.length} 条出路，建议至少 2 条`,
        location: `statediagram:line:${choice.line}`,
      });
    }
  }

  // 全局转人工出口
  const escalationKeywords = ['转人工', '转接', '10086', 'transfer', '人工客服'];
  const hasEscalation = diagram.states.some(s =>
    escalationKeywords.some(kw => s.name.includes(kw))
  ) || diagram.transitions.some(t =>
    escalationKeywords.some(kw => t.label.includes(kw) || t.from.includes(kw) || t.to.includes(kw))
  );
  if (!hasEscalation) {
    checks.push({ rule: 'sd.no_escalation', severity: 'warning', message: '状态图缺少全局转人工出口（建议添加"用户要求转人工"独立状态节点）' });
  }

  // outbound 专属检查
  if (mode === 'outbound') {
    const gateKeywords = ['合规检查', '合规', '门控', '时段', 'compliance'];
    const hasGate = diagram.states.some(s => gateKeywords.some(kw => s.name.includes(kw)));
    if (!hasGate) {
      checks.push({ rule: 'sd.outbound_no_gate', severity: 'error', message: 'outbound 模式状态图缺少接通前合规门控节点' });
    }

    const callResultKeywords = ['未接通', '忙线', '关机', '停机', '未接', 'no_answer', 'busy'];
    const hasCallResult = diagram.states.some(s => callResultKeywords.some(kw => s.name.includes(kw)))
      || diagram.transitions.some(t => callResultKeywords.some(kw => t.label.includes(kw)));
    if (!hasCallResult) {
      checks.push({ rule: 'sd.outbound_no_call_result', severity: 'warning', message: 'outbound 模式状态图缺少呼叫结果多路分支（未接通/忙线/关机）' });
    }
  }

  return checks;
}
