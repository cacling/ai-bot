/**
 * session-bus.test.ts — Tests for the REAL sessionBus singleton export.
 *
 * Uses unique phone numbers per test to avoid cross-test pollution.
 * Cleans up subscriptions and history between tests.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { sessionBus, type BusEvent } from '../../../src/services/session-bus';

let phoneCounter = 0;
function uniquePhone(): string {
  return `test-phone-${Date.now()}-${++phoneCounter}`;
}

function makeEvent(overrides: Partial<BusEvent> & { type: string; msg_id: string; source: string }): BusEvent {
  return overrides as BusEvent;
}

describe('sessionBus singleton — subscribe / publish', () => {
  test('subscriber receives published events', () => {
    const phone = uniquePhone();
    const received: BusEvent[] = [];
    const unsub = sessionBus.subscribe(phone, (e) => received.push(e));

    sessionBus.publish(phone, makeEvent({ source: 'user', type: 'user_message', text: 'hello', msg_id: 's1' }));

    expect(received).toHaveLength(1);
    expect((received[0] as any).text).toBe('hello');
    unsub();
  });

  test('unsubscribe stops delivery', () => {
    const phone = uniquePhone();
    const received: BusEvent[] = [];
    const unsub = sessionBus.subscribe(phone, (e) => received.push(e));

    sessionBus.publish(phone, makeEvent({ source: 'user', type: 'user_message', text: 'a', msg_id: 'u1' }));
    unsub();
    sessionBus.publish(phone, makeEvent({ source: 'user', type: 'user_message', text: 'b', msg_id: 'u2' }));

    expect(received).toHaveLength(1);
    sessionBus.clearHistory(phone);
  });

  test('publish to phone with no subscribers does not throw', () => {
    const phone = uniquePhone();
    expect(() => {
      sessionBus.publish(phone, makeEvent({ source: 'user', type: 'user_message', text: 'nobody listening', msg_id: 'n1' }));
    }).not.toThrow();
    sessionBus.clearHistory(phone);
  });

  test('subscriber that throws does not break other subscribers', () => {
    const phone = uniquePhone();
    const received: BusEvent[] = [];

    const unsub1 = sessionBus.subscribe(phone, () => {
      throw new Error('subscriber crash');
    });
    const unsub2 = sessionBus.subscribe(phone, (e) => received.push(e));

    sessionBus.publish(phone, makeEvent({ source: 'user', type: 'user_message', text: 'test', msg_id: 'e1' }));

    expect(received).toHaveLength(1);
    expect((received[0] as any).text).toBe('test');

    unsub1();
    unsub2();
    sessionBus.clearHistory(phone);
  });
});

describe('sessionBus singleton — subscribeWithHistory', () => {
  test('replays history events then subscribes for new ones', () => {
    const phone = uniquePhone();
    // Publish some history first (no subscriber yet)
    sessionBus.publish(phone, makeEvent({ source: 'user', type: 'user_message', text: 'old1', msg_id: 'h1' }));
    sessionBus.publish(phone, makeEvent({ source: 'user', type: 'response', text: 'old2', msg_id: 'h2' }));

    const received: BusEvent[] = [];
    const unsub = sessionBus.subscribeWithHistory(phone, (e) => received.push(e));

    // Should have received 2 replayed events
    expect(received).toHaveLength(2);
    expect((received[0] as any).text).toBe('old1');
    expect((received[1] as any).text).toBe('old2');

    // Now publish a new event — should also arrive
    sessionBus.publish(phone, makeEvent({ source: 'agent', type: 'agent_message', text: 'new', msg_id: 'h3' }));
    expect(received).toHaveLength(3);
    expect((received[2] as any).text).toBe('new');

    unsub();
    sessionBus.clearHistory(phone);
  });

  test('replays empty history without error', () => {
    const phone = uniquePhone();
    const received: BusEvent[] = [];
    const unsub = sessionBus.subscribeWithHistory(phone, (e) => received.push(e));

    expect(received).toHaveLength(0);

    unsub();
  });

  test('history replay callback that throws does not prevent subscription', () => {
    const phone = uniquePhone();
    // Publish a history event
    sessionBus.publish(phone, makeEvent({ source: 'user', type: 'user_message', text: 'crash-me', msg_id: 'hc1' }));

    let callCount = 0;
    const unsub = sessionBus.subscribeWithHistory(phone, (e) => {
      callCount++;
      if ((e as any).text === 'crash-me') throw new Error('replay crash');
    });

    // Despite throwing during replay, should still be subscribed
    sessionBus.publish(phone, makeEvent({ source: 'user', type: 'user_message', text: 'after', msg_id: 'hc2' }));
    expect(callCount).toBe(2); // 1 from replay (threw) + 1 from new publish

    unsub();
    sessionBus.clearHistory(phone);
  });
});

describe('sessionBus singleton — clearHistory', () => {
  test('clearHistory removes stored events', () => {
    const phone = uniquePhone();
    sessionBus.publish(phone, makeEvent({ source: 'user', type: 'user_message', text: 'will-clear', msg_id: 'cl1' }));

    sessionBus.clearHistory(phone);

    // subscribeWithHistory should replay nothing
    const received: BusEvent[] = [];
    const unsub = sessionBus.subscribeWithHistory(phone, (e) => received.push(e));
    expect(received).toHaveLength(0);
    unsub();
  });

  test('clearHistory on non-existent phone does not throw', () => {
    expect(() => sessionBus.clearHistory('never-existed-phone')).not.toThrow();
  });
});

describe('sessionBus singleton — setSession / getSession', () => {
  test('getSession returns undefined for unknown phone', () => {
    expect(sessionBus.getSession('unknown-phone-xyz')).toBeUndefined();
  });

  test('setSession then getSession returns the value', () => {
    const phone = uniquePhone();
    sessionBus.setSession(phone, 'sess-abc');
    expect(sessionBus.getSession(phone)).toBe('sess-abc');
  });

  test('setSession overwrites previous value', () => {
    const phone = uniquePhone();
    sessionBus.setSession(phone, 'old-sess');
    sessionBus.setSession(phone, 'new-sess');
    expect(sessionBus.getSession(phone)).toBe('new-sess');
  });
});

describe('sessionBus singleton — history ring buffer', () => {
  test('non-history event types are not stored', () => {
    const phone = uniquePhone();
    sessionBus.publish(phone, makeEvent({ source: 'user', type: 'text_delta', delta: 'x', msg_id: 'nd1' }));

    const received: BusEvent[] = [];
    const unsub = sessionBus.subscribeWithHistory(phone, (e) => received.push(e));
    expect(received).toHaveLength(0);
    unsub();
  });

  test('history caps at 100 entries', () => {
    const phone = uniquePhone();
    for (let i = 0; i < 110; i++) {
      sessionBus.publish(phone, makeEvent({ source: 'user', type: 'user_message', text: `msg-${i}`, msg_id: `rb-${i}` }));
    }

    const received: BusEvent[] = [];
    const unsub = sessionBus.subscribeWithHistory(phone, (e) => received.push(e));
    expect(received).toHaveLength(100);
    // First 10 should have been evicted
    expect((received[0] as any).text).toBe('msg-10');
    expect((received[99] as any).text).toBe('msg-109');

    unsub();
    sessionBus.clearHistory(phone);
  });
});
