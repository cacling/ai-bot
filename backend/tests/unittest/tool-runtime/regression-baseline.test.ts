import { describe, test, expect } from 'bun:test';
import { executeTool, buildToolArgs } from '../../../src/engine/skill-tool-executor';
import { preprocessToolCall } from '../../../src/services/tool-call-middleware';
import { isErrorResult, isNoDataResult } from '../../../src/services/tool-result';
import { matchMockRule } from '../../../src/services/mock-engine';

describe('Regression Baseline: Tool Execution Contracts', () => {
  // ── ToolExecResult contract ──
  describe('ToolExecResult shape', () => {
    test('success tool returns { success: true, hasData: true, rawText, parsed }', async () => {
      const mock = { t: { execute: async () => ({ content: [{ type: 'text', text: '{"found":true}' }] }) } };
      const r = await executeTool('t', {}, mock as any);
      expect(r).toMatchObject({ success: true, hasData: true });
      expect(typeof r.rawText).toBe('string');
      expect(r.parsed).toEqual({ found: true });
    });

    test('error tool returns { success: false }', async () => {
      const mock = { t: { execute: async () => ({ content: [{ type: 'text', text: '{"success":false,"error":"fail"}' }] }) } };
      const r = await executeTool('t', {}, mock as any);
      expect(r.success).toBe(false);
    });

    test('no-data tool returns { success: true, hasData: false }', async () => {
      const mock = { t: { execute: async () => ({ content: [{ type: 'text', text: '无记录' }] }) } };
      const r = await executeTool('t', {}, mock as any);
      expect(r.success).toBe(true);
      expect(r.hasData).toBe(false);
    });

    test('missing tool returns { success: false }', async () => {
      const r = await executeTool('missing', {}, {});
      expect(r.success).toBe(false);
    });
  });

  // ── preprocessToolCall contract ──
  describe('preprocessToolCall contract', () => {
    test('normalizes month and infers skill', () => {
      const args = { phone: '13800000001', month: '2026-2' };
      const r = preprocessToolCall({
        channel: 'voice', toolName: 'query_bill', toolArgs: args,
        userPhone: '13800000001', lang: 'zh', activeSkillName: null,
      });
      expect(r.normalizedArgs.month).toBe('2026-02');
      expect(r.skillName === null || typeof r.skillName === 'string').toBe(true);
    });
  });

  // ── Result classification contract ──
  describe('Result classification', () => {
    test('isErrorResult detects JSON error', () => {
      expect(isErrorResult('{"success":false}')).toBe(true);
      expect(isErrorResult('Error: timeout')).toBe(true);
      expect(isErrorResult('{"found":true}')).toBe(false);
    });

    test('isNoDataResult detects empty results', () => {
      expect(isNoDataResult('未找到记录')).toBe(true);
      expect(isNoDataResult('not found')).toBe(true);
      expect(isNoDataResult('{"total": 100}')).toBe(false);
    });
  });

  // ── buildToolArgs contract ──
  describe('buildToolArgs contract', () => {
    test('injects phone from session context', () => {
      const args = buildToolArgs('t', { phone: '138', sessionId: 's1' }, { extra: 1 });
      expect(args).toEqual({ phone: '138', extra: 1 });
    });
  });
});
