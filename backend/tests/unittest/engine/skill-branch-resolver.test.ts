import { describe, test, expect } from 'bun:test';
import { resolveBranch, classifyUserIntent } from '../../../src/engine/skill-branch-resolver';
import type { WorkflowTransition } from '../../../src/engine/skill-workflow-types';

describe('BranchResolver', () => {
  const transitions: WorkflowTransition[] = [
    { target: 'success', guard: 'tool.success' },
    { target: 'error', guard: 'tool.error' },
  ];

  test('resolves tool.success', () => {
    expect(resolveBranch(transitions, { toolResult: { success: true, hasData: true } })).toBe('success');
  });

  test('resolves tool.error', () => {
    expect(resolveBranch(transitions, { toolResult: { success: false, hasData: false } })).toBe('error');
  });

  test('resolves tool.no_data', () => {
    const tr: WorkflowTransition[] = [
      { target: 'ok', guard: 'tool.success' },
      { target: 'empty', guard: 'tool.no_data' },
    ];
    expect(resolveBranch(tr, { toolResult: { success: true, hasData: false } })).toBe('empty');
  });

  test('resolves user.confirm', () => {
    const tr: WorkflowTransition[] = [
      { target: 'yes', guard: 'user.confirm' },
      { target: 'no', guard: 'user.cancel' },
    ];
    expect(resolveBranch(tr, { userIntent: 'confirm' })).toBe('yes');
  });

  test('resolves user.cancel', () => {
    const tr: WorkflowTransition[] = [
      { target: 'yes', guard: 'user.confirm' },
      { target: 'no', guard: 'user.cancel' },
    ];
    expect(resolveBranch(tr, { userIntent: 'cancel' })).toBe('no');
  });

  test('returns null for unresolved', () => {
    expect(resolveBranch(transitions, { userIntent: 'other' })).toBeNull();
  });

  test('single always resolves unconditionally', () => {
    const tr: WorkflowTransition[] = [{ target: 'next', guard: 'always' }];
    expect(resolveBranch(tr, {})).toBe('next');
  });
});

describe('classifyUserIntent', () => {
  test('confirm keywords', () => {
    expect(classifyUserIntent('好的')).toBe('confirm');
    expect(classifyUserIntent('确认办理')).toBe('confirm');
  });
  test('cancel keywords', () => {
    expect(classifyUserIntent('算了不要了')).toBe('cancel');
    expect(classifyUserIntent('取消')).toBe('cancel');
  });
  test('ambiguous', () => {
    expect(classifyUserIntent('我再想想')).toBe('other');
  });
});
