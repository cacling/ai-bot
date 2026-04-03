/**
 * useSlaCountdown.ts — Real SLA countdown based on interaction deadlines.
 *
 * Uses first_response_due_at / next_response_due_at from the interaction model.
 * Returns a human-readable label, urgency level, and remaining milliseconds.
 * Ticks every 10 seconds to keep the display fresh.
 */
import { useState, useEffect } from 'react';
import { type Lang } from '../../i18n';

export type SlaUrgency = 'ok' | 'warning' | 'critical' | 'breached';

export interface SlaCountdown {
  /** Human-readable remaining time, e.g. "4m 30s" or "已超时 2m" */
  label: string;
  /** Urgency level for styling */
  urgency: SlaUrgency;
  /** Remaining milliseconds (negative if breached) */
  remainingMs: number;
}

const CRITICAL_THRESHOLD_MS = 2 * 60 * 1000;  // 2 minutes
const WARNING_THRESHOLD_MS = 5 * 60 * 1000;   // 5 minutes

function formatRemaining(ms: number, lang: Lang): string {
  const abs = Math.abs(ms);
  const seconds = Math.floor(abs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  if (minutes < 60) return remainSec > 0 ? `${minutes}m ${remainSec}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  return remainMin > 0 ? `${hours}h ${remainMin}m` : `${hours}h`;
}

function computeCountdown(
  firstResponseDue: string | null,
  nextResponseDue: string | null,
  lang: Lang,
): SlaCountdown | null {
  // Prefer next_response_due_at (ongoing), fallback to first_response_due_at
  const dueStr = nextResponseDue ?? firstResponseDue;
  if (!dueStr) return null;

  const dueMs = new Date(dueStr).getTime();
  if (isNaN(dueMs)) return null;

  const remainingMs = dueMs - Date.now();
  const formatted = formatRemaining(remainingMs, lang);

  if (remainingMs < 0) {
    const prefix = lang === 'zh' ? '已超时 ' : 'Overdue ';
    return { label: `${prefix}${formatted}`, urgency: 'breached', remainingMs };
  }
  if (remainingMs < CRITICAL_THRESHOLD_MS) {
    return { label: formatted, urgency: 'critical', remainingMs };
  }
  if (remainingMs < WARNING_THRESHOLD_MS) {
    return { label: formatted, urgency: 'warning', remainingMs };
  }
  return { label: formatted, urgency: 'ok', remainingMs };
}

/**
 * Hook: returns a live SLA countdown for an interaction.
 * Returns null if no SLA deadline is set.
 */
export function useSlaCountdown(
  firstResponseDueAt: string | null | undefined,
  nextResponseDueAt: string | null | undefined,
  lang: Lang,
): SlaCountdown | null {
  const [countdown, setCountdown] = useState<SlaCountdown | null>(() =>
    computeCountdown(firstResponseDueAt ?? null, nextResponseDueAt ?? null, lang),
  );

  useEffect(() => {
    const update = () => setCountdown(
      computeCountdown(firstResponseDueAt ?? null, nextResponseDueAt ?? null, lang),
    );
    update();
    const timer = setInterval(update, 10_000);
    return () => clearInterval(timer);
  }, [firstResponseDueAt, nextResponseDueAt, lang]);

  return countdown;
}

/**
 * Pure function version (no hook, for use in sorting/filtering).
 * Returns remaining milliseconds or Infinity if no SLA set.
 */
export function getSlaRemainingMs(
  firstResponseDueAt: string | null | undefined,
  nextResponseDueAt: string | null | undefined,
): number {
  const dueStr = nextResponseDueAt ?? firstResponseDueAt;
  if (!dueStr) return Infinity;
  const dueMs = new Date(dueStr).getTime();
  if (isNaN(dueMs)) return Infinity;
  return dueMs - Date.now();
}
