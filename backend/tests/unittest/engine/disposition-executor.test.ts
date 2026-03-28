/**
 * DispositionExecutor 测试
 *
 * 验证 parseDisposition + executeDisposition 行为。
 */
import { describe, test, expect } from 'bun:test';
import { parseDisposition } from '../../../src/engine/disposition-executor';

describe('parseDisposition', () => {
  test('parses valid JSON disposition', () => {
    const text = JSON.stringify({
      action: 'cancel_service',
      params: { phone: '13800000001', service_id: 'video_pkg' },
      confirmed: true,
    });
    const d = parseDisposition(text);
    expect(d).not.toBeNull();
    expect(d!.action).toBe('cancel_service');
    expect(d!.params).toEqual({ phone: '13800000001', service_id: 'video_pkg' });
    expect(d!.confirmed).toBe(true);
  });

  test('parses JSON in markdown code block', () => {
    const text = '根据您的确认，我将为您退订视频包。\n\n```json\n{"action":"cancel_service","params":{"phone":"13800000001","service_id":"video_pkg"},"confirmed":true}\n```';
    const d = parseDisposition(text);
    expect(d).not.toBeNull();
    expect(d!.action).toBe('cancel_service');
    expect(d!.confirmed).toBe(true);
  });

  test('returns null for plain text', () => {
    expect(parseDisposition('您好，请问有什么可以帮您？')).toBeNull();
  });

  test('returns null for JSON without action field', () => {
    expect(parseDisposition('{"result":"ok"}')).toBeNull();
  });

  test('handles unconfirmed disposition', () => {
    const text = JSON.stringify({
      action: 'cancel_service',
      params: { phone: '13800000001', service_id: 'video_pkg' },
      confirmed: false,
    });
    const d = parseDisposition(text);
    expect(d).not.toBeNull();
    expect(d!.confirmed).toBe(false);
  });

  test('defaults confirmed to false when missing', () => {
    const text = JSON.stringify({
      action: 'record_call_result',
      params: { result: 'ptp', ptp_date: '2026-04-01' },
    });
    const d = parseDisposition(text);
    expect(d).not.toBeNull();
    expect(d!.confirmed).toBe(false);
  });

  test('user-facing text cleanup: strip json block', () => {
    const text = '好的，我将为您退订视频包。\n\n```json\n{"action":"cancel_service","params":{"phone":"138","service_id":"video_pkg"},"confirmed":true}\n```\n\n请稍候。';
    const d = parseDisposition(text);
    expect(d).not.toBeNull();
    // Simulate runner.ts cleanup logic
    const cleaned = text.replace(/```json\s*\n?[\s\S]*?\n?```/g, '').trim();
    expect(cleaned).toBe('好的，我将为您退订视频包。\n\n\n\n请稍候。');
    expect(cleaned).not.toContain('cancel_service');
  });

  test('parses outbound disposition (record_call_result)', () => {
    const text = JSON.stringify({
      action: 'record_call_result',
      params: { result: 'ptp', ptp_date: '2026-04-01', remark: '客户承诺周五还款' },
      confirmed: true,
    });
    const d = parseDisposition(text);
    expect(d).not.toBeNull();
    expect(d!.action).toBe('record_call_result');
    expect(d!.params.result).toBe('ptp');
    expect(d!.confirmed).toBe(true);
  });
});
