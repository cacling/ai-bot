import { describe, it, expect } from 'vitest';
import '@/agent/cards/index';
import { getAllCardDefs } from '@/agent/cards/registry';

describe('agent/cards/index (registration)', () => {
  it('registers all expected card definitions', () => {
    const defs = getAllCardDefs();
    expect(defs.length).toBeGreaterThanOrEqual(6);
  });

  it('includes user_detail card', () => {
    const defs = getAllCardDefs();
    const userDetail = defs.find(d => d.id === 'user_detail');
    expect(userDetail).toBeDefined();
    expect(userDetail!.title.zh).toBe('用户详情');
    expect(userDetail!.colSpan).toBe(1);
  });

  it('includes outbound_task card', () => {
    const defs = getAllCardDefs();
    const outbound = defs.find(d => d.id === 'outbound_task');
    expect(outbound).toBeDefined();
    expect(outbound!.title.zh).toBe('外呼任务详情');
  });

  it('includes emotion card', () => {
    const defs = getAllCardDefs();
    const emotion = defs.find(d => d.id === 'emotion');
    expect(emotion).toBeDefined();
    expect(emotion!.wsEvents).toContain('emotion_update');
  });

  it('includes compliance card', () => {
    const defs = getAllCardDefs();
    const compliance = defs.find(d => d.id === 'compliance');
    expect(compliance).toBeDefined();
    expect(compliance!.wsEvents).toContain('compliance_alert');
  });

  it('includes handoff card', () => {
    const defs = getAllCardDefs();
    const handoff = defs.find(d => d.id === 'handoff');
    expect(handoff).toBeDefined();
  });

  it('includes diagram card with colSpan 2', () => {
    const defs = getAllCardDefs();
    const diagram = defs.find(d => d.id === 'diagram');
    expect(diagram).toBeDefined();
    expect(diagram!.colSpan).toBe(2);
  });

  it('each card has a valid dataExtractor', () => {
    const defs = getAllCardDefs();
    for (const def of defs) {
      expect(typeof def.dataExtractor).toBe('function');
    }
  });
});
