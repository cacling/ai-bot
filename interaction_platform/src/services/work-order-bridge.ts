/**
 * work-order-bridge.ts — Interaction → Work Order bridge
 *
 * When an interaction is closed with a follow-up request,
 * this service calls work_order_service to create the linked work item.
 */
import { db, ixInteractionEvents } from '../db';

const WORK_ORDER_SERVICE_URL = process.env.WORK_ORDER_SERVICE_URL ?? 'http://localhost:18009';

// ── Types ──────────────────────────────────────────────────────────────────

export interface FollowUpRequest {
  type: 'callback' | 'ticket' | 'appointment';
  title: string;
  description?: string;
  due_at?: string;
  priority?: string;
  customer_phone?: string;
  customer_name?: string;
}

export interface FollowUpResult {
  success: boolean;
  work_item_id?: string;
  error?: string;
}

// ── Bridge ─────────────────────────────────────────────────────────────────

/**
 * Create a follow-up work item in work_order_service linked to an interaction.
 */
export async function createFollowUp(
  interactionId: string,
  agentId: string,
  followUp: FollowUpRequest,
): Promise<FollowUpResult> {
  try {
    let endpoint: string;
    let body: Record<string, unknown>;

    switch (followUp.type) {
      case 'ticket':
        endpoint = `${WORK_ORDER_SERVICE_URL}/api/tickets`;
        body = {
          title: followUp.title,
          description: followUp.description,
          ticket_category: 'request',
          priority: followUp.priority ?? 'medium',
          customer_phone: followUp.customer_phone,
          customer_name: followUp.customer_name,
          channel: 'online',
          source_session_id: interactionId,
          created_by: agentId,
        };
        break;

      case 'callback':
      case 'appointment':
        // Use work-orders endpoint for callback/appointment types
        endpoint = `${WORK_ORDER_SERVICE_URL}/api/work-orders`;
        body = {
          title: followUp.title,
          description: followUp.description,
          type: followUp.type === 'callback' ? 'followup' : 'execution',
          subtype: followUp.type,
          work_type: 'followup',
          execution_mode: 'manual',
          priority: followUp.priority ?? 'medium',
          customer_phone: followUp.customer_phone,
          customer_name: followUp.customer_name,
          channel: 'online',
          source_session_id: interactionId,
          created_by: agentId,
          due_at: followUp.due_at,
        };
        break;

      default:
        return { success: false, error: `Unknown follow-up type: ${followUp.type}` };
    }

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'unknown');
      return { success: false, error: `Work order service returned ${resp.status}: ${errText}` };
    }

    const result = await resp.json() as { id?: string; success?: boolean };
    const workItemId = result.id;

    // Record follow-up creation event
    if (workItemId) {
      await db.insert(ixInteractionEvents).values({
        interaction_id: interactionId,
        event_type: 'follow_up_created',
        actor_type: 'agent',
        actor_id: agentId,
        payload_json: JSON.stringify({
          work_item_id: workItemId,
          follow_up_type: followUp.type,
          title: followUp.title,
        }),
      });
    }

    return { success: true, work_item_id: workItemId };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
