/**
 * SLA Overflow Guard — decides wait vs overflow based on wait time threshold.
 *
 * V1: supports wait / overflow actions only.
 * V2 (future): callback / abandon after kernel support.
 */
import type { OverflowPolicyFn } from '../types';

export const handler: OverflowPolicyFn = async (interaction, config) => {
  const maxWaitSeconds = (config.max_wait_seconds as number) ?? 90;
  const overflowQueue = config.overflow_queue as string | undefined;
  const allowOverflow = (config.allow_overflow as boolean) ?? true;
  const minRetryInterval = (config.min_candidate_retry_interval as number) ?? 15;
  const waitSeconds = interaction.wait_seconds ?? 0;

  // Guard: if still within SLA threshold, keep waiting
  if (waitSeconds < maxWaitSeconds) {
    return {
      action: 'wait',
      reason: `wait_seconds=${waitSeconds} < max_wait_seconds=${maxWaitSeconds}, continue waiting`,
    };
  }

  // Guard: if waited less than min retry interval, give candidates another chance
  if (waitSeconds < minRetryInterval) {
    return {
      action: 'wait',
      reason: `wait_seconds=${waitSeconds} < min_candidate_retry_interval=${minRetryInterval}, wait for retry`,
    };
  }

  // SLA breached — decide overflow or forced wait
  if (allowOverflow && overflowQueue) {
    return {
      action: 'overflow',
      overflow_queue: overflowQueue,
      reason: `wait_seconds=${waitSeconds} >= max_wait_seconds=${maxWaitSeconds}, overflow to ${overflowQueue}`,
    };
  }

  return {
    action: 'wait',
    reason: `wait_seconds=${waitSeconds} >= max_wait_seconds=${maxWaitSeconds}, but overflow not configured`,
  };
};
