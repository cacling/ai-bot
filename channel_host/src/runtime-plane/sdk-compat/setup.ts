/**
 * openclaw/plugin-sdk/setup compatibility
 */

export type OpenClawConfig = Record<string, unknown>;
export type DmPolicy = 'allow' | 'block' | 'allowlist';
export type GroupPolicy = 'allow' | 'block' | 'allowlist';
export type SecretInput = { key: string; label: string; required?: boolean };
export type WizardPrompter = (prompt: string) => Promise<string>;
export type ChannelSetupAdapter = Record<string, unknown>;
export type ChannelSetupInput = Record<string, unknown>;
export type ChannelSetupDmPolicy = { mode: DmPolicy; allowFrom?: string[] };
export type ChannelSetupWizardAdapter = Record<string, unknown>;
export type ChannelSetupWizard = Record<string, unknown>;
export type ChannelSetupWizardAllowFromEntry = { id: string; label: string };
export type ChannelSetupWizardTextInput = { key: string; label: string; placeholder?: string };

export const DEFAULT_ACCOUNT_ID = 'default';

export class WizardCancelledError extends Error {
  constructor(message = 'Setup wizard cancelled') {
    super(message);
    this.name = 'WizardCancelledError';
  }
}

export function normalizeAccountId(id: string | undefined): string {
  return id?.trim() || DEFAULT_ACCOUNT_ID;
}

export function formatCliCommand(cmd: string): string { return cmd; }
export function formatDocsLink(path: string): string { return `https://docs.openclaw.ai${path}`; }
export function detectBinary(_name: string): boolean { return false; }
export function installSignalCli(): Promise<void> { return Promise.resolve(); }
export function hasConfiguredSecretInput(_config: unknown, _key: string): boolean { return false; }
export function normalizeSecretInputString(val: unknown): string { return String(val ?? ''); }
export function normalizeE164(phone: string): string { return phone.replace(/[^+\d]/g, ''); }
export function pathExists(p: string): boolean { try { require('fs').accessSync(p); return true; } catch { return false; } }

export function applyAccountNameToChannelSection(..._args: unknown[]) {}
export function applySetupAccountConfigPatch(..._args: unknown[]) {}
export function createEnvPatchedAccountSetupAdapter(..._args: unknown[]) { return {}; }
export function createSetupInputPresenceValidator(..._args: unknown[]) { return () => true; }
export function createPatchedAccountSetupAdapter(..._args: unknown[]) { return {}; }
export function createZodSetupInputValidator(..._args: unknown[]) { return () => true; }
export function migrateBaseNameToDefaultAccount(..._args: unknown[]) {}
export function patchScopedAccountConfig(..._args: unknown[]) {}
export function prepareScopedSetupConfig(..._args: unknown[]) { return {}; }

export function addWildcardAllowFrom(..._args: unknown[]) {}
export function buildSingleChannelSecretPromptState(..._args: unknown[]) { return {}; }
export function createAccountScopedAllowFromSection(..._args: unknown[]) { return {}; }
export function createAccountScopedGroupAccessSection(..._args: unknown[]) { return {}; }
export function createAllowFromSection(..._args: unknown[]) { return {}; }
export function createLegacyCompatChannelDmPolicy(..._args: unknown[]) { return {}; }
export function createNestedChannelParsedAllowFromPrompt(..._args: unknown[]) { return {}; }
export function createPromptParsedAllowFromForAccount(..._args: unknown[]) { return {}; }
export function createStandardChannelSetupStatus(..._args: unknown[]) { return {}; }
export function createNestedChannelAllowFromSetter(..._args: unknown[]) { return () => {}; }
export function createNestedChannelDmPolicy(..._args: unknown[]) { return {}; }
export function createNestedChannelDmPolicySetter(..._args: unknown[]) { return () => {}; }
export function createTopLevelChannelAllowFromSetter(..._args: unknown[]) { return () => {}; }
export function createTopLevelChannelDmPolicy(..._args: unknown[]) { return {}; }
export function createTopLevelChannelDmPolicySetter(..._args: unknown[]) { return () => {}; }
export function createTopLevelChannelGroupPolicySetter(..._args: unknown[]) { return () => {}; }
export function createTopLevelChannelParsedAllowFromPrompt(..._args: unknown[]) { return {}; }
export function mergeAllowFromEntries(..._args: unknown[]): string[] { return []; }
export function normalizeAllowFromEntries(..._args: unknown[]): string[] { return []; }
export function patchTopLevelChannelConfigSection(..._args: unknown[]) {}
export function patchNestedChannelConfigSection(..._args: unknown[]) {}
export function patchChannelConfigForAccount(..._args: unknown[]) {}
export function promptSingleChannelSecretInput(..._args: unknown[]) { return Promise.resolve(''); }
export function splitSetupEntries(entries: string | string[] | undefined): string[] {
  if (!entries) return [];
  if (Array.isArray(entries)) return entries;
  return entries.split(',').map(s => s.trim()).filter(Boolean);
}
export function setSetupChannelEnabled(..._args: unknown[]) {}

export function createDelegatedSetupWizardProxy(..._args: unknown[]) { return {}; }
export function createAllowlistSetupWizardProxy(..._args: unknown[]) { return {}; }
export function createDelegatedFinalize(..._args: unknown[]) { return () => Promise.resolve(); }
export function createDelegatedPrepare(..._args: unknown[]) { return () => Promise.resolve(); }
export function createDelegatedResolveConfigured(..._args: unknown[]) { return () => ({}); }
export function createCliPathTextInput(..._args: unknown[]) { return {}; }
export function createDelegatedSetupWizardStatusResolvers(..._args: unknown[]) { return {}; }
export function createDelegatedTextInputShouldPrompt(..._args: unknown[]) { return () => true; }
export function createDetectedBinaryStatus(..._args: unknown[]) { return {}; }
export function formatResolvedUnresolvedNote(..._args: unknown[]) { return ''; }

// All remaining exports as no-ops
export function noteChannelLookupFailure(..._args: unknown[]) {}
export function noteChannelLookupSummary(..._args: unknown[]) {}
export function parseMentionOrPrefixedId(s: string) { return s; }
export function parseSetupEntriesAllowingWildcard(s: string) { return splitSetupEntries(s); }
export function parseSetupEntriesWithParser(s: string) { return splitSetupEntries(s); }
export function promptLegacyChannelAllowFrom(..._args: unknown[]) { return Promise.resolve([]); }
export function promptLegacyChannelAllowFromForAccount(..._args: unknown[]) { return Promise.resolve([]); }
export function promptParsedAllowFromForAccount(..._args: unknown[]) { return Promise.resolve([]); }
export function promptParsedAllowFromForScopedChannel(..._args: unknown[]) { return Promise.resolve([]); }
export function promptResolvedAllowFrom(..._args: unknown[]) { return Promise.resolve([]); }
export function resolveParsedAllowFromEntries(..._args: unknown[]) { return []; }
export function resolveEntriesWithOptionalToken(..._args: unknown[]) { return []; }
export function resolveSetupAccountId(..._args: unknown[]) { return DEFAULT_ACCOUNT_ID; }
export function resolveGroupAllowlistWithLookupNotes(..._args: unknown[]) { return { entries: [], notes: [] }; }
export function runSingleChannelSecretStep(..._args: unknown[]) { return Promise.resolve(); }
export function setAccountAllowFromForChannel(..._args: unknown[]) {}
export function setAccountDmAllowFromForChannel(..._args: unknown[]) {}
export function setAccountGroupPolicyForChannel(..._args: unknown[]) {}
export function setChannelDmPolicyWithAllowFrom(..._args: unknown[]) {}
export function setLegacyChannelDmPolicyWithAllowFrom(..._args: unknown[]) {}
export function setNestedChannelAllowFrom(..._args: unknown[]) {}
export function setNestedChannelDmPolicyWithAllowFrom(..._args: unknown[]) {}
export function setTopLevelChannelAllowFrom(..._args: unknown[]) {}
export function setTopLevelChannelDmPolicyWithAllowFrom(..._args: unknown[]) {}
export function setTopLevelChannelGroupPolicy(..._args: unknown[]) {}
