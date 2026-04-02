/**
 * Diagnostics & Observability
 *
 * First-class diagnostic capability for the channel plugin host.
 * Records install results, manifest validation, compatibility reports,
 * runtime load events, and bridge traces.
 */

import { db } from '../db';
import { diagnostics } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import type { DiagnosticLevel, DiagnosticCategory } from '../types';

// ---------------------------------------------------------------------------
// Emit diagnostic
// ---------------------------------------------------------------------------

interface DiagnosticInput {
  pluginId: string;
  level: DiagnosticLevel;
  category: DiagnosticCategory;
  message: string;
  details?: unknown;
}

export async function emitDiagnostic(
  pluginIdOrInput: string | DiagnosticInput,
  level?: DiagnosticLevel,
  category?: DiagnosticCategory,
  message?: string,
  detailsJson?: string,
): Promise<void> {
  let pluginId: string;
  if (typeof pluginIdOrInput === 'object') {
    pluginId = pluginIdOrInput.pluginId;
    level = pluginIdOrInput.level;
    category = pluginIdOrInput.category;
    message = pluginIdOrInput.message;
    detailsJson = pluginIdOrInput.details ? JSON.stringify(pluginIdOrInput.details) : undefined;
  } else {
    pluginId = pluginIdOrInput;
  }
  try {
    await db.insert(diagnostics).values({
      pluginId,
      level,
      category,
      message,
      detailsJson: detailsJson ?? null,
      createdAt: new Date(Date.now()),
    });
  } catch (err) {
    // Fallback to console if DB write fails
    console.error(`[diagnostic] ${level} [${category}] ${pluginId}: ${message}`, err);
  }

  // Also log to console for dev visibility
  const prefix = level === 'error' ? '!' : level === 'warn' ? '~' : '+';
  console.log(`[channel-host] ${prefix} [${category}] ${pluginId}: ${message}`);
}

// ---------------------------------------------------------------------------
// Query diagnostics
// ---------------------------------------------------------------------------

export async function getPluginDiagnostics(pluginId: string, limit = 50) {
  return db
    .select()
    .from(diagnostics)
    .where(eq(diagnostics.pluginId, pluginId))
    .orderBy(desc(diagnostics.createdAt))
    .limit(limit)
    .all();
}

export async function getRecentDiagnostics(limit = 100) {
  return db
    .select()
    .from(diagnostics)
    .orderBy(desc(diagnostics.createdAt))
    .limit(limit)
    .all();
}
