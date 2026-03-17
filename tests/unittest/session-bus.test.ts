/**
 * session-bus.test.ts — Session Bus 发布/订阅测试
 */

import { describe, test, expect, beforeEach } from 'bun:test';

// 直接引入 SessionBus 类逻辑重新构造（避免依赖全局单例）
// 复制核心逻辑以隔离测试

type BusEvent = Record<string, unknown> & { type: string; msg_id: string; source: string };

class TestSessionBus {
  private subs = new Map<string, Set<(event: BusEvent) => void>>();
  private history = new Map<string, BusEvent[]>();
  private sessions = new Map<string, string>();
  private HISTORY_TYPES = new Set(['user_message', 'response', 'agent_message']);
  private HISTORY_MAX = 100;

  subscribe(phone: string, cb: (event: BusEvent) => void): () => void {
    if (!this.subs.has(phone)) this.subs.set(phone, new Set());
    this.subs.get(phone)!.add(cb);
    return () => { this.subs.get(phone)?.delete(cb); };
  }

  subscribeWithHistory(phone: string, cb: (event: BusEvent) => void): () => void {
    const past = this.history.get(phone) ?? [];
    for (const event of past) { cb(event); }
    return this.subscribe(phone, cb);
  }

  publish(phone: string, event: BusEvent): void {
    if (this.HISTORY_TYPES.has(event.type)) {
      const buf = this.history.get(phone) ?? [];
      buf.push(event);
      if (buf.length > this.HISTORY_MAX) buf.shift();
      this.history.set(phone, buf);
    }
    this.subs.get(phone)?.forEach(cb => { try { cb(event); } catch {} });
  }

  clearHistory(phone: string): void { this.history.delete(phone); }
  setSession(phone: string, id: string): void { this.sessions.set(phone, id); }
  getSession(phone: string): string | undefined { return this.sessions.get(phone); }
  getHistory(phone: string): BusEvent[] { return this.history.get(phone) ?? []; }
}

describe('SessionBus — 发布/订阅', () => {
  let bus: TestSessionBus;

  beforeEach(() => { bus = new TestSessionBus(); });

  test('订阅后能收到发布的事件', () => {
    const received: BusEvent[] = [];
    bus.subscribe('13800000001', (e) => received.push(e));
    bus.publish('13800000001', { source: 'user', type: 'user_message', text: '你好', msg_id: '1' } as any);
    expect(received).toHaveLength(1);
    expect((received[0] as any).text).toBe('你好');
  });

  test('不同 phone 的事件互相隔离', () => {
    const r1: BusEvent[] = [];
    const r2: BusEvent[] = [];
    bus.subscribe('phone1', (e) => r1.push(e));
    bus.subscribe('phone2', (e) => r2.push(e));
    bus.publish('phone1', { source: 'user', type: 'user_message', text: 'a', msg_id: '1' } as any);
    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(0);
  });

  test('取消订阅后不再收到事件', () => {
    const received: BusEvent[] = [];
    const unsub = bus.subscribe('13800000001', (e) => received.push(e));
    bus.publish('13800000001', { source: 'user', type: 'user_message', text: 'a', msg_id: '1' } as any);
    unsub();
    bus.publish('13800000001', { source: 'user', type: 'user_message', text: 'b', msg_id: '2' } as any);
    expect(received).toHaveLength(1);
  });

  test('多个订阅者都能收到事件', () => {
    let c1 = 0, c2 = 0;
    bus.subscribe('p', () => c1++);
    bus.subscribe('p', () => c2++);
    bus.publish('p', { source: 'user', type: 'user_message', text: 'x', msg_id: '1' } as any);
    expect(c1).toBe(1);
    expect(c2).toBe(1);
  });
});

describe('SessionBus — 历史回放', () => {
  let bus: TestSessionBus;

  beforeEach(() => { bus = new TestSessionBus(); });

  test('会话历史类型事件被记录', () => {
    bus.publish('p', { source: 'user', type: 'user_message', text: 'a', msg_id: '1' } as any);
    bus.publish('p', { source: 'user', type: 'response', text: 'b', msg_id: '2' } as any);
    expect(bus.getHistory('p')).toHaveLength(2);
  });

  test('非历史类型事件不被记录', () => {
    bus.publish('p', { source: 'user', type: 'text_delta', delta: 'x', msg_id: '1' } as any);
    bus.publish('p', { source: 'user', type: 'skill_diagram_update', mermaid: 'y', msg_id: '2' } as any);
    expect(bus.getHistory('p')).toHaveLength(0);
  });

  test('subscribeWithHistory 回放已有历史', () => {
    bus.publish('p', { source: 'user', type: 'user_message', text: 'old', msg_id: '1' } as any);
    const received: BusEvent[] = [];
    bus.subscribeWithHistory('p', (e) => received.push(e));
    // 应该收到历史消息
    expect(received).toHaveLength(1);
    expect((received[0] as any).text).toBe('old');
  });

  test('clearHistory 清除历史', () => {
    bus.publish('p', { source: 'user', type: 'user_message', text: 'a', msg_id: '1' } as any);
    bus.clearHistory('p');
    expect(bus.getHistory('p')).toHaveLength(0);
  });

  test('历史上限 100 条，超出后淘汰最早的', () => {
    for (let i = 0; i < 110; i++) {
      bus.publish('p', { source: 'user', type: 'user_message', text: `msg${i}`, msg_id: `${i}` } as any);
    }
    const h = bus.getHistory('p');
    expect(h).toHaveLength(100);
    expect((h[0] as any).text).toBe('msg10'); // 最早的 10 条被淘汰
  });
});

describe('SessionBus — Session 管理', () => {
  let bus: TestSessionBus;

  beforeEach(() => { bus = new TestSessionBus(); });

  test('setSession / getSession', () => {
    expect(bus.getSession('p')).toBeUndefined();
    bus.setSession('p', 'session-123');
    expect(bus.getSession('p')).toBe('session-123');
  });

  test('覆盖 session', () => {
    bus.setSession('p', 'old');
    bus.setSession('p', 'new');
    expect(bus.getSession('p')).toBe('new');
  });
});
