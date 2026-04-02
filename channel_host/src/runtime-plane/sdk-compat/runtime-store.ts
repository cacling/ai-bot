/**
 * openclaw/plugin-sdk/runtime-store compatibility
 */

export type PluginRuntime = { dataDir: string; tmpDir: string };

export function createPluginRuntimeStore() {
  let runtime: PluginRuntime | null = null;
  return {
    setRuntime(r: PluginRuntime) { runtime = r; },
    clearRuntime() { runtime = null; },
    tryGetRuntime(): PluginRuntime | null { return runtime; },
    getRuntime(): PluginRuntime {
      if (!runtime) throw new Error('Plugin runtime not set');
      return runtime;
    },
  };
}
