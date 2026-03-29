/**
 * Workflow 状态机单元测试 — 纯函数，无 DB 依赖
 */
import { describe, test, expect } from 'bun:test';
import { validateWorkflowRunTransition } from '../../src/policies/workflow-policy';

describe('Workflow Run 状态流转', () => {
  test('running → wait_signal → waiting_signal', () => {
    const r = validateWorkflowRunTransition('running', 'wait_signal');
    expect(r.valid).toBe(true);
    expect(r.toStatus).toBe('waiting_signal');
  });

  test('running → wait_child → waiting_child', () => {
    const r = validateWorkflowRunTransition('running', 'wait_child');
    expect(r.valid).toBe(true);
    expect(r.toStatus).toBe('waiting_child');
  });

  test('waiting_signal → signal_received → running', () => {
    const r = validateWorkflowRunTransition('waiting_signal', 'signal_received');
    expect(r.valid).toBe(true);
    expect(r.toStatus).toBe('running');
  });

  test('waiting_child → child_done → running', () => {
    const r = validateWorkflowRunTransition('waiting_child', 'child_done');
    expect(r.valid).toBe(true);
    expect(r.toStatus).toBe('running');
  });

  test('running → complete → completed', () => {
    const r = validateWorkflowRunTransition('running', 'complete');
    expect(r.valid).toBe(true);
    expect(r.toStatus).toBe('completed');
  });

  test('any → fail → failed', () => {
    expect(validateWorkflowRunTransition('running', 'fail').valid).toBe(true);
    expect(validateWorkflowRunTransition('waiting_signal', 'fail').valid).toBe(true);
    expect(validateWorkflowRunTransition('waiting_child', 'fail').valid).toBe(true);
  });

  test('running → cancel → cancelled', () => {
    const r = validateWorkflowRunTransition('running', 'cancel');
    expect(r.valid).toBe(true);
    expect(r.toStatus).toBe('cancelled');
  });

  test('completed cannot be cancelled', () => {
    const r = validateWorkflowRunTransition('completed', 'cancel');
    expect(r.valid).toBe(false);
  });

  test('failed cannot be cancelled', () => {
    const r = validateWorkflowRunTransition('failed', 'cancel');
    expect(r.valid).toBe(false);
  });

  // 非法流转
  test('waiting_signal cannot advance', () => {
    const r = validateWorkflowRunTransition('waiting_signal', 'advance');
    expect(r.valid).toBe(false);
  });

  test('completed cannot receive signal', () => {
    const r = validateWorkflowRunTransition('completed', 'signal_received');
    expect(r.valid).toBe(false);
  });

  test('waiting_child cannot wait_signal', () => {
    const r = validateWorkflowRunTransition('waiting_child', 'wait_signal');
    expect(r.valid).toBe(false);
  });
});
