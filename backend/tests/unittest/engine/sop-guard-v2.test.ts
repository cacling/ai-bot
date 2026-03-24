/**
 * sop-guard-v2.test.ts — Unit tests for SOPGuard V2 plan-aware state tracking.
 *
 * Uses inline WorkflowSpec fixtures (no dependency on the compiler).
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { SOPGuard } from '../../../src/engine/sop-guard';
import { type WorkflowSpec } from '../../../src/engine/skill-workflow-types';

/**
 * Test workflow: a simple cancel-service flow
 *
 *  [query_sub] --success--> [confirm_cancel] --user.confirm--> [do_cancel] --success--> [done]
 *                                             --user.cancel-->  [cancelled]
 *              --no_data--> [not_found]
 */
function makeTestPlan(): WorkflowSpec {
  return {
    skillId: 'test-cancel',
    version: 1,
    startStepId: 'query_sub',
    steps: {
      query_sub: {
        id: 'query_sub',
        label: '查询用户',
        kind: 'tool',
        tool: 'query_subscriber',
        transitions: [
          { target: 'confirm_cancel', guard: 'tool.success' },
          { target: 'not_found', guard: 'tool.no_data' },
        ],
      },
      confirm_cancel: {
        id: 'confirm_cancel',
        label: '确认退订',
        kind: 'confirm',
        transitions: [
          { target: 'do_cancel', guard: 'user.confirm' },
          { target: 'cancelled', guard: 'user.cancel' },
        ],
      },
      do_cancel: {
        id: 'do_cancel',
        label: '执行退订',
        kind: 'tool',
        tool: 'cancel_service',
        transitions: [
          { target: 'done', guard: 'tool.success' },
          { target: 'error_end', guard: 'tool.error' },
        ],
      },
      done: {
        id: 'done',
        label: '完成',
        kind: 'end',
        transitions: [],
      },
      error_end: {
        id: 'error_end',
        label: '操作失败',
        kind: 'human',
        transitions: [],
      },
      not_found: {
        id: 'not_found',
        label: '用户不存在',
        kind: 'message',
        transitions: [],
      },
      cancelled: {
        id: 'cancelled',
        label: '用户取消',
        kind: 'end',
        transitions: [],
      },
    },
    terminalSteps: ['done', 'error_end', 'cancelled'],
  };
}

/**
 * Test workflow with a choice node:
 *  [query_bill] --success--> [check_choice] --always--> [show_result]
 *               --no_data--> [no_bill]
 *  [show_result] is a message node (end-like for test)
 */
function makePlanWithChoice(): WorkflowSpec {
  return {
    skillId: 'test-bill',
    version: 1,
    startStepId: 'query_bill',
    steps: {
      query_bill: {
        id: 'query_bill',
        label: '查询账单',
        kind: 'tool',
        tool: 'query_bill',
        transitions: [
          { target: 'check_choice', guard: 'tool.success' },
          { target: 'no_bill', guard: 'tool.no_data' },
        ],
      },
      check_choice: {
        id: 'check_choice',
        label: '判断账单类型',
        kind: 'choice',
        transitions: [
          { target: 'show_result', guard: 'always' },
        ],
      },
      show_result: {
        id: 'show_result',
        label: '展示结果',
        kind: 'message',
        transitions: [],
      },
      no_bill: {
        id: 'no_bill',
        label: '无账单',
        kind: 'end',
        transitions: [],
      },
    },
    terminalSteps: ['no_bill'],
  };
}

describe('SOPGuard V2', () => {
  let guard: SOPGuard;

  beforeEach(() => {
    guard = new SOPGuard();
  });

  describe('backward compat (no plan)', () => {
    test('existing behavior preserved — query tools allowed', () => {
      expect(guard.check('query_subscriber')).toBeNull();
      expect(guard.check('query_bill')).toBeNull();
    });

    test('existing behavior preserved — unknown tools allowed', () => {
      expect(guard.check('__nonexistent__')).toBeNull();
    });

    test('recordToolCall still works without plan', () => {
      guard.recordToolCall('query_subscriber');
      expect(guard.check('query_subscriber')).toBeNull();
    });

    test('shouldEscalate and resetViolations work without plan', () => {
      expect(guard.shouldEscalate()).toBe(false);
      guard.resetViolations();
      expect(guard.shouldEscalate()).toBe(false);
    });

    test('getPromptHint returns null without plan', () => {
      expect(guard.getPromptHint()).toBeNull();
    });

    test('onUserMessage is no-op without plan', () => {
      // Should not throw
      guard.onUserMessage('好的');
      expect(guard.getPromptHint()).toBeNull();
    });
  });

  describe('with plan', () => {
    test('allows tool matching current step', () => {
      guard.activatePlan('test-cancel', makeTestPlan());
      // Current step is query_sub, tool is query_subscriber
      expect(guard.check('query_subscriber')).toBeNull();
    });

    test('blocks tool not matching current step', () => {
      guard.activatePlan('test-cancel', makeTestPlan());
      // Current step is query_sub (tool: query_subscriber), cancel_service should be blocked
      const result = guard.check('cancel_service');
      expect(result).not.toBeNull();
      expect(result).toContain('query_subscriber');
      expect(result).toContain('cancel_service');
    });

    test('advances state on recordToolCall', () => {
      guard.activatePlan('test-cancel', makeTestPlan());
      // Record query_subscriber with success => should advance to confirm_cancel
      guard.recordToolCall('query_subscriber', { success: true, hasData: true });
      // Now at confirm_cancel (a confirm node), pendingConfirm should be true
      const hint = guard.getPromptHint();
      expect(hint).not.toBeNull();
      expect(hint).toContain('确认退订');
    });

    test('blocks all tools when pendingConfirm', () => {
      guard.activatePlan('test-cancel', makeTestPlan());
      guard.recordToolCall('query_subscriber', { success: true, hasData: true });
      // Now at confirm_cancel with pendingConfirm=true
      const result = guard.check('cancel_service');
      expect(result).not.toBeNull();
      expect(result).toContain('确认');

      // Even query tools should be blocked
      const result2 = guard.check('query_bill');
      expect(result2).not.toBeNull();
      expect(result2).toContain('确认');
    });

    test('always allows transfer_to_human even when pendingConfirm', () => {
      guard.activatePlan('test-cancel', makeTestPlan());
      guard.recordToolCall('query_subscriber', { success: true, hasData: true });
      expect(guard.check('transfer_to_human')).toBeNull();
    });

    test('always allows skill tools (get_skill_instructions, get_skill_reference)', () => {
      guard.activatePlan('test-cancel', makeTestPlan());
      expect(guard.check('get_skill_instructions')).toBeNull();
      expect(guard.check('get_skill_reference')).toBeNull();
    });

    test('clears pendingConfirm on user confirm', () => {
      guard.activatePlan('test-cancel', makeTestPlan());
      guard.recordToolCall('query_subscriber', { success: true, hasData: true });
      // pendingConfirm is true, user says "好的"
      guard.onUserMessage('好的');
      // Should advance to do_cancel
      const hint = guard.getPromptHint();
      expect(hint).not.toBeNull();
      expect(hint).toContain('执行退订');
      // cancel_service should now be allowed
      expect(guard.check('cancel_service')).toBeNull();
    });

    test('clears pendingConfirm on user cancel', () => {
      guard.activatePlan('test-cancel', makeTestPlan());
      guard.recordToolCall('query_subscriber', { success: true, hasData: true });
      guard.onUserMessage('取消');
      // Should advance to cancelled (end node) => plan cleared
      expect(guard.getPromptHint()).toBeNull();
    });

    test('keeps pendingConfirm on ambiguous input', () => {
      guard.activatePlan('test-cancel', makeTestPlan());
      guard.recordToolCall('query_subscriber', { success: true, hasData: true });
      guard.onUserMessage('我想了解一下');
      // Still at confirm_cancel
      const hint = guard.getPromptHint();
      expect(hint).not.toBeNull();
      expect(hint).toContain('确认退订');
      expect(hint).toContain('禁止调用');
    });

    test('clears plan on end step', () => {
      guard.activatePlan('test-cancel', makeTestPlan());
      guard.recordToolCall('query_subscriber', { success: true, hasData: true });
      guard.onUserMessage('确认');
      guard.recordToolCall('cancel_service', { success: true, hasData: true });
      // Should advance to done (end node) => plan cleared
      expect(guard.getPromptHint()).toBeNull();
    });

    test('generates correct promptHint', () => {
      guard.activatePlan('test-cancel', makeTestPlan());
      const hint = guard.getPromptHint();
      expect(hint).not.toBeNull();
      expect(hint).toContain('SOP 进度');
      expect(hint).toContain('查询用户');
      expect(hint).toContain('query_subscriber');
      expect(hint).toContain('下一步');
    });

    test('advances through choice nodes automatically', () => {
      guard.activatePlan('test-bill', makePlanWithChoice());
      guard.recordToolCall('query_bill', { success: true, hasData: true });
      // Should auto-advance through check_choice to show_result
      const hint = guard.getPromptHint();
      expect(hint).not.toBeNull();
      expect(hint).toContain('展示结果');
    });

    test('tool.no_data guard routes correctly', () => {
      guard.activatePlan('test-cancel', makeTestPlan());
      guard.recordToolCall('query_subscriber', { success: true, hasData: false });
      // Should advance to not_found (message node)
      const hint = guard.getPromptHint();
      expect(hint).not.toBeNull();
      expect(hint).toContain('用户不存在');
    });

    test('tool.error guard routes to human node and clears plan', () => {
      guard.activatePlan('test-cancel', makeTestPlan());
      guard.recordToolCall('query_subscriber', { success: true, hasData: true });
      guard.onUserMessage('确认');
      guard.recordToolCall('cancel_service', { success: false, hasData: false });
      // Should advance to error_end (human node) => plan cleared
      expect(guard.getPromptHint()).toBeNull();
    });
  });

  describe('multi-turn recovery', () => {
    test('replaying recordToolCall rebuilds state', () => {
      // Simulate a scenario where we replay tool calls to rebuild state
      const plan = makeTestPlan();
      guard.activatePlan('test-cancel', plan);

      // Replay: query_subscriber was already called
      guard.recordToolCall('query_subscriber', { success: true, hasData: true });
      // Now at confirm_cancel
      const hint = guard.getPromptHint();
      expect(hint).not.toBeNull();
      expect(hint).toContain('确认退订');

      // User confirmed
      guard.onUserMessage('没问题');
      // Now at do_cancel
      expect(guard.check('cancel_service')).toBeNull();

      // Execute cancel
      guard.recordToolCall('cancel_service', { success: true, hasData: true });
      // Plan should be cleared (reached end)
      expect(guard.getPromptHint()).toBeNull();
    });
  });
});
