/**
 * openclaw/plugin-sdk/provider-auth compatibility
 *
 * Provider authentication: API key management, OAuth profiles, secret input.
 */

// --- Types ---
export type OpenClawConfig = Record<string, unknown>;
export type SecretInput = { key: string; value: string };
export type ProviderAuthResult = { success: boolean; error?: string };
export type ProviderAuthContext = { providerId: string; config: Record<string, unknown> };
export type AuthProfileStore = Map<string, unknown>;
export type OAuthCredential = { accessToken: string; refreshToken?: string; expiresAt?: number };

// --- Constants ---
export const CLAUDE_CLI_PROFILE_ID = 'claude-cli';
export const CODEX_CLI_PROFILE_ID = 'codex-cli';
export const MINIMAX_OAUTH_MARKER = '__minimax_oauth__';

// --- Profile Store ---
export function ensureAuthProfileStore(): AuthProfileStore { return new Map(); }
export function listProfilesForProvider(_providerId: string): unknown[] { return []; }
export function upsertAuthProfile(_store: AuthProfileStore, _profile: unknown): void {}
export function upsertAuthProfileWithLock(_store: AuthProfileStore, _profile: unknown): Promise<void> {
  return Promise.resolve();
}

// --- Credentials ---
export function readClaudeCliCredentialsCached(): unknown { return null; }
export function suggestOAuthProfileIdForLegacyDefault(_providerId: string): string { return 'default'; }

// --- API Key ---
export function isNonSecretApiKeyMarker(key: string): boolean { return key.startsWith('__'); }
export function resolveOAuthApiKeyMarker(_providerId: string): string { return '__oauth__'; }
export function resolveNonEnvSecretRefApiKeyMarker(_ref: string): string { return '__secret_ref__'; }
export function formatApiKeyPreview(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
export function normalizeApiKeyInput(key: string): string { return key.trim(); }
export function validateApiKeyInput(key: string): boolean { return key.trim().length > 0; }
export function ensureApiKeyFromOptionEnvOrPrompt(_opts: unknown): Promise<string> {
  return Promise.resolve('');
}

// --- Secret Input ---
export function normalizeSecretInputModeInput(_input: unknown): string { return 'prompt'; }
export function promptSecretRefForSetup(_prompter: unknown): Promise<string> { return Promise.resolve(''); }
export function resolveSecretInputModeForEnvSelection(_config: unknown): string { return 'env'; }

// --- Token / Profile ---
export function buildTokenProfileId(_token: string): string { return `token-${Date.now()}`; }
export function validateAnthropicSetupToken(_token: string): boolean { return true; }
export function applyAuthProfileConfig(_config: unknown, _profile: unknown): void {}
export function buildApiKeyCredential(apiKey: string): { type: 'api_key'; value: string } {
  return { type: 'api_key', value: apiKey };
}
export function createProviderApiKeyAuthMethod(_providerId: string) {
  return { authenticate: async () => ({ success: true }) };
}

// --- Secret Ref ---
export function coerceSecretRef(ref: unknown): string { return String(ref ?? ''); }
export function resolveDefaultSecretProviderAlias(): string { return 'env'; }
export function resolveRequiredHomeDir(): string { return require('os').homedir(); }
export function normalizeOptionalSecretInput(input: unknown): string | null {
  return typeof input === 'string' && input.trim() ? input.trim() : null;
}
export function normalizeSecretInput(input: unknown): string { return String(input ?? '').trim(); }

// --- Env Var ---
export function listKnownProviderAuthEnvVarNames(): string[] {
  return ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY'];
}
export function omitEnvKeysCaseInsensitive(env: Record<string, string>, keys: string[]): Record<string, string> {
  const lower = new Set(keys.map(k => k.toLowerCase()));
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (!lower.has(k.toLowerCase())) result[k] = v;
  }
  return result;
}

// --- OAuth ---
export function buildOauthProviderAuthResult(_credential: OAuthCredential): ProviderAuthResult {
  return { success: true };
}
export function generatePkceVerifierChallenge(): { verifier: string; challenge: string } {
  return { verifier: crypto.randomUUID(), challenge: crypto.randomUUID() };
}
export function toFormUrlEncoded(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}
