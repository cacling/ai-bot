import type { WorkflowSpec, WorkflowStep } from './skill-workflow-types';
import * as store from './skill-instance-store';
import { executeTool, executeToolViaRuntime, buildToolArgs } from './skill-tool-executor';
import { renderStep } from './skill-step-renderer';
import { resolveBranch, classifyUserIntent } from './skill-branch-resolver';
import { logger } from '../services/logger';

export interface SkillTurnResult {
  text: string;
  currentStepId: string | null;
  instanceId: string;
  pendingConfirm: boolean;
  finished: boolean;
  toolRecords: Array<{ tool: string; result: string; success: boolean }>;
  transferRequested: boolean;
}

export async function runSkillTurn(
  sessionId: string,
  userMessage: string,
  spec: WorkflowSpec,
  mcpTools: Record<string, any>,
  context: {
    phone: string;
    subscriberName?: string;
    lang: 'zh' | 'en';
    history: Array<{ role: string; content: string }>;
  },
  runtime?: import('../tool-runtime').ToolRuntime,
): Promise<SkillTurnResult> {
  // 1. Load or create instance
  let instance = store.findActiveInstance(sessionId);
  if (!instance) {
    const created = store.createInstance(sessionId, spec.skillId, spec.version, spec.startStepId);
    store.appendEvent(created.id, { eventType: 'state_enter', stepId: spec.startStepId });
    // Auto-advance past initial non-actionable nodes
    const actionableStepId = advanceToActionable(created.id, spec, spec.startStepId, null);
    if (actionableStepId !== spec.startStepId) {
      store.advanceStep(created.id, actionableStepId, 1);
    }
    instance = store.findActiveInstance(sessionId)!;
  }

  const instanceId = instance.id;
  let currentStepId = instance.current_step_id!;
  let revision = instance.revision ?? 1;
  const toolRecords: SkillTurnResult['toolRecords'] = [];
  const replyParts: string[] = [];
  let finished = false;
  let transferRequested = false;
  let lastToolResult: { success: boolean; hasData: boolean; payload?: unknown } | null =
    instance.last_tool_result ? JSON.parse(instance.last_tool_result) : null;

  // 2. Handle pending confirm from previous turn
  if (instance.pending_confirm) {
    const intent = classifyUserIntent(userMessage);
    if (intent !== 'other') {
      const step = spec.steps[currentStepId];
      const target = step ? resolveBranch(step.transitions, { userIntent: intent }) : null;
      if (target) {
        store.appendEvent(instanceId, {
          eventType: intent === 'confirm' ? 'user_confirm' : 'user_cancel',
          stepId: currentStepId,
        });
        store.advanceStep(instanceId, target, revision);
        revision++;
        store.setPendingConfirm(instanceId, false);
        currentStepId = advanceToActionable(instanceId, spec, target, lastToolResult);
      }
    } else {
      // Ambiguous — render clarification, stay at confirm
      const step = spec.steps[currentStepId];
      if (step) {
        const text = await renderStep(step, {
          userMessage, history: context.history, skillName: spec.skillId,
          phone: context.phone, subscriberName: context.subscriberName, lang: context.lang,
          sessionState: { skillName: spec.skillId, versionNo: spec.version, currentStepId, pendingConfirm: true, startedAt: instance.started_at! },
        });
        replyParts.push(text);
      }
      return {
        text: replyParts.join('\n\n'), currentStepId, instanceId,
        pendingConfirm: true, finished: false, toolRecords, transferRequested,
      };
    }
  }

  // 3. Main step loop
  let safety = 15;
  while (safety-- > 0) {
    const step = spec.steps[currentStepId];
    if (!step) { finished = true; break; }

    switch (step.kind) {
      case 'tool': {
        const args = buildToolArgs(step.tool!, { phone: context.phone, sessionId });
        store.appendEvent(instanceId, { eventType: 'tool_call', stepId: currentStepId, toolName: step.tool, payload: args });

        const result = runtime
          ? await executeToolViaRuntime(step.tool!, args, runtime, {
              sessionId, phone: context.phone, channel: 'online',
              activeSkillName: spec.name,
            })
          : await executeTool(step.tool!, args, mcpTools);
        lastToolResult = { success: result.success, hasData: result.hasData, payload: result.parsed };
        store.updateLastToolResult(instanceId, lastToolResult);
        store.appendEvent(instanceId, {
          eventType: 'tool_result', stepId: currentStepId, toolName: step.tool,
          payload: { success: result.success, hasData: result.hasData, preview: result.rawText.slice(0, 300) },
        });
        toolRecords.push({ tool: step.tool!, result: result.rawText.slice(0, 200), success: result.success });

        // Resolve branch
        const target = resolveBranch(step.transitions, { toolResult: result });
        if (target) {
          store.appendEvent(instanceId, { eventType: 'branch_taken', stepId: currentStepId, payload: { target } });
          store.advanceStep(instanceId, target, revision);
          revision++;
          currentStepId = advanceToActionable(instanceId, spec, target, lastToolResult);
        } else {
          logger.warn('skill-runtime', 'tool_branch_unresolved', { step: currentStepId, tool: step.tool });
          break;
        }
        continue; // don't pause, keep going
      }

      case 'message':
      case 'ref':
      case 'llm': {
        store.appendEvent(instanceId, { eventType: 'state_enter', stepId: currentStepId });
        const refContent = step.ref ? loadReference(spec.skillId, step.ref) : undefined;
        const toolFacts = lastToolResult ? summarizeToolResult(lastToolResult) : undefined;
        const text = await renderStep(step, {
          userMessage, history: context.history, skillName: spec.skillId,
          phone: context.phone, subscriberName: context.subscriberName, lang: context.lang,
          toolFacts, refContent,
          sessionState: { skillName: spec.skillId, versionNo: spec.version, currentStepId, pendingConfirm: false, startedAt: instance.started_at! },
        });
        replyParts.push(text);

        // Advance
        const target = resolveBranch(step.transitions, {});
        if (target) {
          store.advanceStep(instanceId, target, revision);
          revision++;
          currentStepId = advanceToActionable(instanceId, spec, target, lastToolResult);
        }

        // Pause if next step needs user input or is another message
        const nextStep = spec.steps[currentStepId];
        if (!nextStep || nextStep.kind === 'confirm' || nextStep.kind === 'human' || nextStep.kind === 'message' || nextStep.kind === 'ref' || nextStep.kind === 'llm') break;
        continue; // next is tool/choice -> keep going
      }

      case 'confirm': {
        store.appendEvent(instanceId, { eventType: 'state_enter', stepId: currentStepId });
        const toolFacts = lastToolResult ? summarizeToolResult(lastToolResult) : undefined;
        const text = await renderStep(step, {
          userMessage, history: context.history, skillName: spec.skillId,
          phone: context.phone, subscriberName: context.subscriberName, lang: context.lang, toolFacts,
          sessionState: { skillName: spec.skillId, versionNo: spec.version, currentStepId, pendingConfirm: true, startedAt: instance.started_at! },
        });
        replyParts.push(text);
        store.setPendingConfirm(instanceId, true);
        store.advanceStep(instanceId, currentStepId, revision); // update revision
        revision++;
        break; // pause
      }

      case 'end': {
        store.appendEvent(instanceId, { eventType: 'completed', stepId: currentStepId });
        store.finishInstance(instanceId, 'completed');
        finished = true;
        break;
      }

      case 'human': {
        store.appendEvent(instanceId, { eventType: 'handoff', stepId: currentStepId });
        store.finishInstance(instanceId, 'escalated');
        transferRequested = true;
        finished = true;
        break;
      }

      case 'choice':
      case 'switch': {
        // Should have been handled by advanceToActionable, but handle edge case
        const target = resolveBranch(step.transitions, { toolResult: lastToolResult ?? undefined });
        if (target) {
          store.appendEvent(instanceId, { eventType: 'branch_taken', stepId: currentStepId, payload: { target } });
          store.advanceStep(instanceId, target, revision);
          revision++;
          currentStepId = target;
          continue;
        }
        logger.warn('skill-runtime', 'choice_unresolved', { step: currentStepId });
        break;
      }

      default: break;
    }
    break; // if we didn't continue, we're pausing
  }

  // 4. Final state update
  if (!finished) {
    store.advanceStep(instanceId, currentStepId, revision); // ensure latest step is saved
  }

  return {
    text: replyParts.join('\n\n'),
    currentStepId: finished ? null : currentStepId,
    instanceId,
    pendingConfirm: !finished && (spec.steps[currentStepId]?.kind === 'confirm' || spec.steps[currentStepId]?.kind === 'human'),
    finished,
    toolRecords,
    transferRequested,
  };
}

function advanceToActionable(instanceId: string, spec: WorkflowSpec, stepId: string, lastToolResult: any): string {
  let current = stepId;
  let safety = 20;
  while (safety-- > 0) {
    const step = spec.steps[current];
    if (!step) break;
    if (step.kind === 'choice' || step.kind === 'switch') {
      const target = resolveBranch(step.transitions, { toolResult: lastToolResult ?? undefined });
      if (target) {
        store.appendEvent(instanceId, { eventType: 'branch_taken', stepId: current, payload: { target } });
        current = target;
        continue;
      }
      break;
    }
    if ((step.kind === 'message' || step.kind === 'ref' || step.kind === 'llm') &&
        step.transitions.length === 1 && step.transitions[0].guard === 'always') {
      current = step.transitions[0].target;
      continue;
    }
    break;
  }
  return current;
}

function loadReference(skillName: string, refPath: string): string | undefined {
  try {
    const { readFileSync } = require('fs');
    const { join, resolve } = require('path');
    const skillsDir = resolve(__dirname, '../../skills/biz-skills');
    return readFileSync(join(skillsDir, skillName, 'references', refPath), 'utf-8');
  } catch { return undefined; }
}

function summarizeToolResult(result: { success: boolean; hasData: boolean; payload?: unknown }): string {
  const status = result.success ? (result.hasData ? '查询成功' : '查询成功但无数据') : '查询失败';
  return `${status}：\n${JSON.stringify(result.payload ?? {}).slice(0, 500)}`;
}
