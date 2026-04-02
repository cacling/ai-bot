/**
 * openclaw/plugin-sdk/plugin-runtime compatibility
 *
 * Plugin runtime services: commands, hook runner, HTTP path/registry,
 * interactive handler dispatch, lazy service modules.
 */

// --- Types ---
export type RuntimeLogger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
};

export interface PluginCommand {
  name: string;
  description: string;
  handler: (args: unknown) => Promise<unknown>;
}

// --- Commands ---
export function registerPluginCommand(_cmd: PluginCommand): void {}
export function listPluginCommands(): PluginCommand[] { return []; }

// --- Hook Runner Global ---
export function getGlobalHookRunner() {
  return {
    register: (_event: string, _handler: Function) => {},
    fire: async (_event: string, ..._args: unknown[]) => {},
  };
}

// --- HTTP Path ---
export function resolvePluginHttpPath(pluginId: string, path: string): string {
  return `/plugins/${pluginId}${path.startsWith('/') ? path : '/' + path}`;
}

// --- HTTP Registry ---
const httpHandlers = new Map<string, Function>();

export function registerPluginHttpHandler(path: string, handler: Function): void {
  httpHandlers.set(path, handler);
}

export function getPluginHttpHandler(path: string): Function | undefined {
  return httpHandlers.get(path);
}

// --- Interactive ---
export function dispatchPluginInteractiveHandler(
  _pluginId: string,
  _action: string,
  _payload: unknown,
): Promise<unknown> {
  return Promise.resolve(null);
}

// --- Lazy Service Module ---
export function createLazyServiceModule<T>(factory: () => T): () => T {
  let cached: T | undefined;
  return () => {
    if (cached === undefined) cached = factory();
    return cached;
  };
}
