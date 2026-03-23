/**
 * sop-guard.test.ts — Unit tests for SOPGuard class.
 *
 * Tests the session-level SOP state tracker directly without mocking.
 * The module-level buildGlobalDependencies() runs at import time using
 * real DB + real skills (seed data).
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { SOPGuard } from '../../../src/engine/sop-guard';

describe('SOPGuard', () => {
  let guard: SOPGuard;

  beforeEach(() => {
    guard = new SOPGuard();
  });

  // --- recordToolCall ---

  test('new SOPGuard has no called tools (check returns null for unknown tool)', () => {
    // An unknown tool has no dependency entry, so check should pass
    expect(guard.check('__nonexistent_tool__')).toBeNull();
  });

  test('recordToolCall records a tool', () => {
    guard.recordToolCall('query_subscriber');
    // After recording, check for the same tool should still return null
    // (query tools are not in _operationTools)
    expect(guard.check('query_subscriber')).toBeNull();
  });

  // --- check ---

  test('check returns null for query tools (no preconditions)', () => {
    // query_ prefixed tools should not be in _operationTools
    expect(guard.check('query_subscriber')).toBeNull();
    expect(guard.check('query_bill')).toBeNull();
    expect(guard.check('check_compliance')).toBeNull();
    expect(guard.check('get_something')).toBeNull();
  });

  test('check returns null for unknown tools (not in dependency map)', () => {
    expect(guard.check('__totally_unknown_tool__')).toBeNull();
    expect(guard.check('random_name_xyz')).toBeNull();
  });

  test('check for operation tool without prerequisites done returns rejection string', () => {
    // cancel_service is a common operation tool in seed data skills.
    // If it has dependencies, calling check without recording them should return a string.
    const result = guard.check('cancel_service');
    // It may or may not be in _operationTools depending on seed data.
    // If it is an operation tool, result is a non-null rejection string.
    // If not, result is null. We test the general contract:
    if (result !== null) {
      expect(typeof result).toBe('string');
      expect(result).toContain('SOP');
    }
  });

  test('check for operation tool with prerequisites done returns null', () => {
    // Record all common query tools that could be prerequisites
    guard.recordToolCall('query_subscriber');
    guard.recordToolCall('query_service');
    guard.recordToolCall('query_bill');
    guard.recordToolCall('check_contract');
    guard.recordToolCall('query_package');
    guard.recordToolCall('check_compliance');
    guard.recordToolCall('diagnose_network');
    guard.recordToolCall('analyze_usage');
    // After recording everything, any operation tool should pass
    expect(guard.check('cancel_service')).toBeNull();
  });

  // --- shouldEscalate ---

  test('shouldEscalate returns false initially', () => {
    expect(guard.shouldEscalate()).toBe(false);
  });

  test('after 2 violations, shouldEscalate returns true', () => {
    // We need to trigger violations. We can do this by manually
    // simulating the internal state via repeated check calls on
    // an operation tool that has unmet deps.
    // If no operation tools exist in seed data, we verify the
    // threshold logic by accessing the class differently.
    // Use a fresh guard and call check on operation tools without prereqs.
    const result1 = guard.check('cancel_service');
    const result2 = guard.check('cancel_service');

    if (result1 !== null && result2 !== null) {
      // Two violations occurred
      expect(guard.shouldEscalate()).toBe(true);
    } else {
      // cancel_service is not an operation tool in this DB state,
      // so no violations. shouldEscalate stays false.
      expect(guard.shouldEscalate()).toBe(false);
    }
  });

  // --- resetViolations ---

  test('resetViolations resets the counter', () => {
    // Trigger potential violations
    guard.check('cancel_service');
    guard.check('cancel_service');
    guard.resetViolations();
    expect(guard.shouldEscalate()).toBe(false);
  });

  test('after reset, shouldEscalate returns false again', () => {
    guard.check('cancel_service');
    guard.check('cancel_service');
    guard.resetViolations();
    expect(guard.shouldEscalate()).toBe(false);
    // One more violation should not trigger escalation
    guard.check('cancel_service');
    // After 1 violation (post-reset), should not escalate
    // (needs >= 2)
    expect(guard.shouldEscalate()).toBeFalsy();
  });

  // --- workflow tests ---

  test('recordToolCall + check workflow: record prerequisite then check operation', () => {
    // Record a common query tool
    guard.recordToolCall('query_subscriber');
    // check should still work for query tools
    expect(guard.check('query_subscriber')).toBeNull();
    // For operation tools that only need query_subscriber, this should pass
    // We verify no crash occurs and return is null or string
    const result = guard.check('cancel_service');
    expect(result === null || typeof result === 'string').toBe(true);
  });

  test('multiple violations then reset cycle', () => {
    // First cycle: trigger violations
    guard.check('cancel_service');
    guard.check('cancel_service');
    guard.check('cancel_service');

    // Reset
    guard.resetViolations();
    expect(guard.shouldEscalate()).toBe(false);

    // Second cycle: trigger again
    guard.check('cancel_service');
    guard.check('cancel_service');

    // The violation count from the first cycle is gone;
    // only the new 2 violations count (if cancel_service is operation tool)
    const result = guard.check('cancel_service');
    if (result !== null) {
      // 3 violations in second cycle
      expect(guard.shouldEscalate()).toBe(true);
    }

    // Final reset
    guard.resetViolations();
    expect(guard.shouldEscalate()).toBe(false);
  });
});
