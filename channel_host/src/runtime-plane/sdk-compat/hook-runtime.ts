/**
 * openclaw/plugin-sdk/hook-runtime compatibility
 *
 * Plugin hook system — fire-and-forget dispatchers, message hook mappers.
 */
export type HookHandler = (...args: unknown[]) => void | Promise<void>;

export function fireAndForget(fn: () => void | Promise<void>): void {
  Promise.resolve().then(fn).catch(() => {});
}

export function createHookRunner() {
  const hooks = new Map<string, HookHandler[]>();
  return {
    register: (event: string, handler: HookHandler) => {
      if (!hooks.has(event)) hooks.set(event, []);
      hooks.get(event)!.push(handler);
    },
    fire: async (event: string, ...args: unknown[]) => {
      for (const handler of hooks.get(event) ?? []) {
        try { await handler(...args); } catch { /* fire-and-forget */ }
      }
    },
    clear: () => hooks.clear(),
  };
}

export function mapMessageHook(_message: unknown, _hookType: string): unknown {
  return null;
}

export function createInternalHookRunner() {
  return createHookRunner();
}
