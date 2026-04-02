/**
 * openclaw/plugin-sdk/acp-runtime compatibility
 *
 * Agent Compute Platform runtime — session management, backend registration.
 */

// --- Types ---
export type AcpRuntimeErrorCode = 'NOT_FOUND' | 'TIMEOUT' | 'INTERNAL' | string;
export type AcpRuntimeStatus = 'idle' | 'running' | 'error';
export type AcpSessionUpdateTag = string;

export interface AcpRuntime { backend: unknown; capabilities: AcpRuntimeCapabilities }
export interface AcpRuntimeCapabilities { streaming: boolean; tools: boolean }
export interface AcpRuntimeDoctorReport { ok: boolean; issues: string[] }
export interface AcpRuntimeEnsureInput { sessionId: string; agentId: string }
export interface AcpRuntimeEvent { type: string; data: unknown }
export interface AcpRuntimeHandle { sessionId: string; close: () => void }
export interface AcpRuntimeTurnInput { sessionId: string; message: string }
export interface AcpSessionStoreEntry { sessionId: string; agentId: string; status: AcpRuntimeStatus }

export class AcpRuntimeError extends Error {
  code: AcpRuntimeErrorCode;
  constructor(code: AcpRuntimeErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'AcpRuntimeError';
  }
}

export function isAcpRuntimeError(err: unknown): err is AcpRuntimeError {
  return err instanceof AcpRuntimeError;
}

let _backend: unknown = null;

export function getAcpRuntimeBackend() { return _backend; }
export function registerAcpRuntimeBackend(backend: unknown) { _backend = backend; }
export function requireAcpRuntimeBackend() {
  if (!_backend) throw new AcpRuntimeError('NOT_FOUND', 'ACP runtime backend not registered');
  return _backend;
}
export function unregisterAcpRuntimeBackend() { _backend = null; }
export function getAcpSessionManager() { return { get: () => null, set: () => {} }; }
export function readAcpSessionEntry(_sessionId: string): AcpSessionStoreEntry | null { return null; }

export const __testing = { reset: () => { _backend = null; } };
