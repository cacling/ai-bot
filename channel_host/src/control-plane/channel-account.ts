/**
 * Channel Account Control Plane
 *
 * Manages channel account lifecycle: create, login, logout, status.
 * Each channel account represents a configured instance of a channel plugin
 * (e.g. a specific WhatsApp phone number, a specific Feishu app).
 */

import { db } from '../db';
import { accounts } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { getChannel, getChannelSetup } from '../runtime-plane/runtime-registry';
import { emitDiagnostic } from './diagnostics';
import type { ChannelAccountStatus } from '../types';

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export interface CreateAccountInput {
  channelId: string;
  pluginId: string;
  config?: Record<string, unknown>;
  secretRef?: string;
}

export interface ChannelAccount {
  id: string;
  pluginId: string;
  channelId: string;
  config: Record<string, unknown>;
  secretRef: string | null;
  status: ChannelAccountStatus;
  createdAt: number;
  updatedAt: number | null;
}

function generateId(): string {
  return crypto.randomUUID();
}

export async function createAccount(input: CreateAccountInput): Promise<ChannelAccount> {
  const id = generateId();
  const now = Date.now();

  await db.insert(accounts).values({
    id,
    pluginId: input.pluginId,
    channelId: input.channelId,
    configJson: JSON.stringify(input.config ?? {}),
    secretRef: input.secretRef ?? null,
    status: 'created',
    createdAt: new Date(now),
    updatedAt: new Date(now),
  });

  emitDiagnostic({
    pluginId: input.pluginId,
    level: 'info',
    category: 'runtime',
    message: `Channel account '${id}' created for ${input.channelId}`,
  });

  return {
    id,
    pluginId: input.pluginId,
    channelId: input.channelId,
    config: input.config ?? {},
    secretRef: input.secretRef ?? null,
    status: 'created',
    createdAt: now,
    updatedAt: now,
  };
}

export async function getAccount(id: string): Promise<ChannelAccount | null> {
  const rows = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    pluginId: row.pluginId,
    channelId: row.channelId,
    config: JSON.parse(row.configJson),
    secretRef: row.secretRef,
    status: row.status as ChannelAccountStatus,
    createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : Number(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.getTime() : row.updatedAt ? Number(row.updatedAt) : null,
  };
}

export async function listAccountsByChannel(channelId: string): Promise<ChannelAccount[]> {
  const rows = await db.select().from(accounts).where(eq(accounts.channelId, channelId));
  return rows.map(row => ({
    id: row.id,
    pluginId: row.pluginId,
    channelId: row.channelId,
    config: JSON.parse(row.configJson),
    secretRef: row.secretRef,
    status: row.status as ChannelAccountStatus,
    createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : Number(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.getTime() : row.updatedAt ? Number(row.updatedAt) : null,
  }));
}

export async function updateAccountStatus(id: string, status: ChannelAccountStatus): Promise<void> {
  await db.update(accounts)
    .set({ status, updatedAt: new Date() })
    .where(eq(accounts.id, id));
}

export async function updateAccountConfig(id: string, config: Record<string, unknown>): Promise<void> {
  await db.update(accounts)
    .set({ configJson: JSON.stringify(config), updatedAt: new Date() })
    .where(eq(accounts.id, id));
}

export async function deleteAccount(id: string): Promise<void> {
  await db.delete(accounts).where(eq(accounts.id, id));
}

// ---------------------------------------------------------------------------
// Login / Logout (delegates to plugin's setup adapter)
// ---------------------------------------------------------------------------

export async function loginAccount(id: string): Promise<{ success: boolean; error?: string }> {
  const account = await getAccount(id);
  if (!account) return { success: false, error: 'Account not found' };

  const channel = getChannel(account.channelId) ?? getChannelSetup(account.channelId);
  if (!channel) return { success: false, error: `Channel '${account.channelId}' not loaded` };

  try {
    // Probe the plugin for a login method
    const plugin = channel.plugin as Record<string, unknown>;
    const setupAdapter = plugin?.setup as Record<string, unknown> | undefined;

    if (setupAdapter && typeof setupAdapter.login === 'function') {
      await setupAdapter.login(account.config, account.secretRef);
    }

    await updateAccountStatus(id, 'active');
    emitDiagnostic({
      pluginId: account.pluginId,
      level: 'info',
      category: 'runtime',
      message: `Channel account '${id}' logged in`,
    });
    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await updateAccountStatus(id, 'error');
    emitDiagnostic({
      pluginId: account.pluginId,
      level: 'error',
      category: 'runtime',
      message: `Channel account '${id}' login failed: ${errorMsg}`,
    });
    return { success: false, error: errorMsg };
  }
}

export async function logoutAccount(id: string): Promise<{ success: boolean; error?: string }> {
  const account = await getAccount(id);
  if (!account) return { success: false, error: 'Account not found' };

  const channel = getChannel(account.channelId) ?? getChannelSetup(account.channelId);
  if (!channel) return { success: false, error: `Channel '${account.channelId}' not loaded` };

  try {
    const plugin = channel.plugin as Record<string, unknown>;
    const setupAdapter = plugin?.setup as Record<string, unknown> | undefined;

    if (setupAdapter && typeof setupAdapter.logout === 'function') {
      await setupAdapter.logout(account.config);
    }

    await updateAccountStatus(id, 'inactive');
    emitDiagnostic({
      pluginId: account.pluginId,
      level: 'info',
      category: 'runtime',
      message: `Channel account '${id}' logged out`,
    });
    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    emitDiagnostic({
      pluginId: account.pluginId,
      level: 'error',
      category: 'runtime',
      message: `Channel account '${id}' logout failed: ${errorMsg}`,
    });
    return { success: false, error: errorMsg };
  }
}

export async function getAccountStatus(id: string): Promise<{
  status: ChannelAccountStatus;
  channelConnected: boolean;
} | null> {
  const account = await getAccount(id);
  if (!account) return null;

  // Try to probe the plugin for runtime status
  const channel = getChannel(account.channelId);
  let channelConnected = account.status === 'active';

  if (channel) {
    const plugin = channel.plugin as Record<string, unknown>;
    if (typeof plugin?.isConnected === 'function') {
      try {
        channelConnected = await (plugin.isConnected as Function)(account.id);
      } catch {
        channelConnected = false;
      }
    }
  }

  return { status: account.status, channelConnected };
}
