/**
 * shadow-router.ts — Shadow routing for A/B comparison.
 *
 * Runs the production routing pipeline AND shadow plugins in parallel,
 * records both results for comparison without affecting the actual routing decision.
 *
 * Use cases:
 *   - Test a new candidate_scorer before enabling it
 *   - Compare two overflow policies side-by-side
 *   - Validate plugin changes against production baseline
 */
import {
  db,
  ixPluginExecutionLogs,
  ixInteractionEvents,
  eq,
  and,
  desc,
} from '../db';
import {
  type AgentCandidate,
  type InteractionSnapshot,
  type ScoredCandidate,
  executeCandidateScorers,
} from './plugin-runtime';
import { routeInteraction } from './router-kernel';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ShadowComparisonResult {
  interaction_id: string;
  primary: {
    assigned_agent_id?: string;
    scored: ScoredCandidate[];
  };
  shadow_results: Array<{
    plugin: string;
    scored: ScoredCandidate[];
    would_assign?: string;
  }>;
  divergence: boolean;
  divergence_details?: string;
}

// ── Shadow Execution ──────────────────────────────────────────────────────

/**
 * Run routing with shadow comparison.
 *
 * Executes the real routing pipeline (which uses primary plugins),
 * then collects shadow plugin results that were logged during execution.
 * Compares the results and records divergence.
 */
export async function routeWithShadow(
  interactionId: string,
  queueCode: string,
  candidates: AgentCandidate[],
  interaction: InteractionSnapshot,
): Promise<ShadowComparisonResult> {
  // Run primary + shadow scorers together (shadow runs in parallel internally)
  const { scored, shadow_results } = await executeCandidateScorers(
    queueCode,
    candidates,
    interaction,
  );

  // Run actual routing
  const routeResult = await routeInteraction(interactionId);

  // Determine shadow "would-assign" winners
  const shadowWithWinners = shadow_results.map((sr) => ({
    ...sr,
    would_assign: sr.scored[0]?.agent_id,
  }));

  // Check divergence
  const primaryWinner = routeResult.assigned_agent_id;
  const divergences = shadowWithWinners
    .filter((sr) => sr.would_assign && sr.would_assign !== primaryWinner)
    .map((sr) => `${sr.plugin}: would assign ${sr.would_assign}, primary assigned ${primaryWinner}`);

  const result: ShadowComparisonResult = {
    interaction_id: interactionId,
    primary: {
      assigned_agent_id: primaryWinner,
      scored,
    },
    shadow_results: shadowWithWinners,
    divergence: divergences.length > 0,
    divergence_details: divergences.length > 0 ? divergences.join('; ') : undefined,
  };

  // Record comparison event
  if (result.divergence) {
    await db.insert(ixInteractionEvents).values({
      interaction_id: interactionId,
      event_type: 'shadow_divergence',
      actor_type: 'system',
      payload_json: JSON.stringify({
        primary_agent: primaryWinner,
        shadow_results: shadowWithWinners.map((s) => ({
          plugin: s.plugin,
          would_assign: s.would_assign,
        })),
        details: result.divergence_details,
      }),
    });
  }

  return result;
}

/**
 * Get shadow comparison history for an interaction.
 */
export async function getShadowLogs(interactionId: string) {
  const logs = await db.select().from(ixPluginExecutionLogs)
    .where(
      and(
        eq(ixPluginExecutionLogs.interaction_id, interactionId),
        eq(ixPluginExecutionLogs.shadow, true),
      ),
    )
    .orderBy(desc(ixPluginExecutionLogs.created_at))
    .all();

  return logs;
}
