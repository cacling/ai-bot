import { describe, it, expect, beforeEach } from 'vitest';

// We need to test the registry module. Since it uses module-level state,
// we use dynamic imports to get fresh state per test group.

describe('cards/registry', () => {
  // Import fresh registry for each test by using resetModules
  let registerCard: any;
  let getCardDef: any;
  let findCardByEvent: any;
  let getAllCardDefs: any;
  let buildInitialCardStates: any;

  beforeEach(async () => {
    // Use dynamic import with cache busting - we need to reset module state
    // Since vitest caches modules, we test with the shared state
    const mod = await import('@/agent/cards/registry');
    registerCard = mod.registerCard;
    getCardDef = mod.getCardDef;
    findCardByEvent = mod.findCardByEvent;
    getAllCardDefs = mod.getAllCardDefs;
    buildInitialCardStates = mod.buildInitialCardStates;
  });

  describe('registerCard + getCardDef', () => {
    it('registers and retrieves a card definition', () => {
      const mockDef = {
        id: 'test-card-unique-1',
        title: { zh: '测试', en: 'Test' },
        Icon: (() => null) as any,
        headerClass: 'bg-blue-500',
        colSpan: 1 as const,
        defaultOpen: true,
        defaultCollapsed: false,
        wsEvents: ['test_event_1'],
        dataExtractor: (msg: any) => msg.data,
        component: (() => null) as any,
      };

      registerCard(mockDef);
      const retrieved = getCardDef('test-card-unique-1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('test-card-unique-1');
      expect(retrieved!.title.zh).toBe('测试');
      expect(retrieved!.title.en).toBe('Test');
    });

    it('returns undefined for unregistered card', () => {
      expect(getCardDef('non-existent-card')).toBeUndefined();
    });
  });

  describe('findCardByEvent', () => {
    it('finds card by WS event type', () => {
      const mockDef = {
        id: 'test-card-unique-2',
        title: { zh: '测试2', en: 'Test2' },
        Icon: (() => null) as any,
        headerClass: 'bg-red-500',
        colSpan: 1 as const,
        defaultOpen: true,
        defaultCollapsed: false,
        wsEvents: ['special_event_type_2'],
        dataExtractor: (msg: any) => msg,
        component: (() => null) as any,
      };
      registerCard(mockDef);

      const found = findCardByEvent('special_event_type_2');
      expect(found).toBeDefined();
      expect(found!.id).toBe('test-card-unique-2');
    });

    it('returns undefined for unknown event type', () => {
      expect(findCardByEvent('completely_unknown_event')).toBeUndefined();
    });
  });

  describe('getAllCardDefs', () => {
    it('returns an array of all registered cards', () => {
      const defs = getAllCardDefs();
      expect(Array.isArray(defs)).toBe(true);
      // At minimum our test cards + any from index.ts side-effect imports
      expect(defs.length).toBeGreaterThan(0);
    });
  });

  describe('buildInitialCardStates', () => {
    it('returns an array of CardState objects', () => {
      const states = buildInitialCardStates();
      expect(Array.isArray(states)).toBe(true);

      for (const state of states) {
        expect(state).toHaveProperty('id');
        expect(state).toHaveProperty('order');
        expect(state).toHaveProperty('isOpen');
        expect(state).toHaveProperty('isCollapsed');
        expect(state).toHaveProperty('data');
        expect(state.data).toBeNull();
        expect(typeof state.order).toBe('number');
      }
    });

    it('order values are sequential starting from 0', () => {
      const states = buildInitialCardStates();
      states.forEach((state: any, idx: number) => {
        expect(state.order).toBe(idx);
      });
    });
  });
});
