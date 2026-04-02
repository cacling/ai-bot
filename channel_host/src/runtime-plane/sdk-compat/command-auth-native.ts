/**
 * openclaw/plugin-sdk/command-auth-native compatibility
 *
 * Native command parsing, authorization, and spec resolution.
 */

// --- Types ---
export interface CommandArgs {
  command: string;
  args: string[];
  raw: string;
}

export interface CommandAuthorization {
  authorized: boolean;
  reason?: string;
}

export interface NativeCommandSpec {
  name: string;
  description: string;
  args?: { name: string; required?: boolean }[];
}

// --- Functions ---
export function buildCommandTextFromArgs(command: string, args: string[]): string {
  return `/${command} ${args.join(' ')}`.trim();
}

export function findCommandByNativeName(name: string, specs?: NativeCommandSpec[]): NativeCommandSpec | undefined {
  return specs?.find(s => s.name === name);
}

export function listNativeCommandSpecs(): NativeCommandSpec[] {
  return [];
}

export function listNativeCommandSpecsForConfig(_config: unknown): NativeCommandSpec[] {
  return [];
}

export function parseCommandArgs(text: string): CommandArgs {
  const parts = text.trim().split(/\s+/);
  const command = (parts[0] ?? '').replace(/^\//, '');
  return { command, args: parts.slice(1), raw: text };
}

export function resolveCommandArgMenu(_spec: NativeCommandSpec): string[] {
  return [];
}

export function resolveCommandAuthorizedFromAuthorizers(
  _authorizers: unknown[],
  _command: string,
  _senderId: string,
): CommandAuthorization {
  return { authorized: true };
}

export function resolveControlCommandGate(_config: unknown) {
  return { check: (_cmd: string, _senderId: string) => ({ authorized: true }) };
}

export function resolveNativeCommandSessionTargets(_config: unknown): string[] {
  return [];
}

export function resolveCommandAuthorization(
  _command: string,
  _senderId: string,
  _config?: unknown,
): CommandAuthorization {
  return { authorized: true };
}
