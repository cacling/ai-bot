/**
 * workspace-ws.ts — Agent Workspace WebSocket
 *
 * GET /ws/workspace?agentId=xxx&token=xxx
 *
 * Server → Client:
 *   inbox_snapshot       — 连接时发送完整 inbox 状态
 *   interaction_assigned — 新 interaction 分配给坐席
 *   offer_created        — 新 offer 到达
 *   interaction_message  — 特定 interaction 的新消息
 *   interaction_state_changed — 状态变更
 *   unread_updated       — 未读计数更新
 *
 * Client → Server:
 *   focus_interaction    — { interaction_id }
 *   agent_message        — { interaction_id, text }
 *   accept_offer         — { offer_id }
 *   decline_offer        — { offer_id }
 *   transfer_interaction — { interaction_id, target_queue }
 *   wrap_up              — { interaction_id, code, note }
 *   set_presence         — { status }
 */
import { createBunWebSocket } from 'hono/bun';
import { Hono } from 'hono';
import { db, ixInteractions, ixOffers, ixAgentPresence, ixInteractionEvents, eq, and } from '../db';

// ── Types ──────────────────────────────────────────────────────────────────

interface AgentConnection {
  agentId: string;
  ws: { send(data: string): void };
  focusedInteractionId: string | null;
}

// ── In-memory connection registry ──────────────────────────────────────────

const agentConnections = new Map<string, Set<AgentConnection>>();

export function getAgentConnections(agentId: string): Set<AgentConnection> | undefined {
  return agentConnections.get(agentId);
}

/** Push a message to all WS connections for an agent. */
export function pushToAgent(agentId: string, message: Record<string, unknown>) {
  const conns = agentConnections.get(agentId);
  if (!conns) return;
  const data = JSON.stringify(message);
  for (const conn of conns) {
    try { conn.ws.send(data); } catch { /* ws closed */ }
  }
}

/** Push a message to agent connections that are focused on a specific interaction. */
export function pushToFocusedAgent(agentId: string, interactionId: string, message: Record<string, unknown>) {
  const conns = agentConnections.get(agentId);
  if (!conns) return;
  const data = JSON.stringify(message);
  for (const conn of conns) {
    if (conn.focusedInteractionId === interactionId) {
      try { conn.ws.send(data); } catch { /* ws closed */ }
    }
  }
}

// ── Inbox snapshot builder ─────────────────────────────────────────────────

async function buildInboxSnapshot(agentId: string) {
  const assigned = await db.select().from(ixInteractions)
    .where(eq(ixInteractions.assigned_agent_id, agentId))
    .all();

  const activeInteractions = assigned.filter(
    (i) => !['closed', 'abandoned'].includes(i.state),
  );

  const offers = await db.select().from(ixOffers)
    .where(
      and(
        eq(ixOffers.agent_id, agentId),
        eq(ixOffers.status, 'pending'),
      ),
    )
    .all();

  return { assigned: activeInteractions, offers };
}

// ── WebSocket setup ────────────────────────────────────────────────────────

export const { upgradeWebSocket, websocket: workspaceWebsocket } = createBunWebSocket();

const wsRouter = new Hono();

wsRouter.get(
  '/ws/workspace',
  upgradeWebSocket((c) => {
    const agentId = c.req.query('agentId') ?? '';

    if (!agentId) {
      return {
        onOpen(_evt, ws) {
          ws.send(JSON.stringify({ type: 'error', message: 'agentId required' }));
          ws.close(4001, 'agentId required');
        },
      };
    }

    let conn: AgentConnection;

    return {
      async onOpen(_evt, ws) {
        conn = { agentId, ws: ws as unknown as { send(data: string): void }, focusedInteractionId: null };

        // Register connection
        if (!agentConnections.has(agentId)) {
          agentConnections.set(agentId, new Set());
        }
        agentConnections.get(agentId)!.add(conn);

        // Auto-set presence to online
        await db.update(ixAgentPresence)
          .set({ presence_status: 'online', last_heartbeat_at: new Date(), updated_at: new Date() })
          .where(eq(ixAgentPresence.agent_id, agentId))
          .catch(() => { /* agent might not have presence record yet */ });

        // Send inbox snapshot
        const snapshot = await buildInboxSnapshot(agentId);
        ws.send(JSON.stringify({ type: 'inbox_snapshot', ...snapshot }));
      },

      async onMessage(evt, ws) {
        let msg: { type: string; [key: string]: unknown };
        try {
          msg = JSON.parse(typeof evt.data === 'string' ? evt.data : evt.data.toString());
        } catch {
          return;
        }

        switch (msg.type) {
          case 'focus_interaction': {
            conn.focusedInteractionId = (msg.interaction_id as string) ?? null;
            break;
          }

          case 'agent_message': {
            const interactionId = msg.interaction_id as string;
            const text = msg.text as string;
            if (!interactionId || !text) break;

            // Record the message as an interaction event
            await db.insert(ixInteractionEvents).values({
              interaction_id: interactionId,
              event_type: 'agent_message',
              actor_type: 'agent',
              actor_id: agentId,
              payload_json: JSON.stringify({ text }),
            });

            // Forward to backend via HTTP (the backend's sessionBus handles delivery to customer)
            const interaction = await db.query.ixInteractions.findFirst({
              where: eq(ixInteractions.interaction_id, interactionId),
            });
            if (interaction) {
              const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:18001';
              fetch(`${backendUrl}/api/agent/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  interaction_id: interactionId,
                  agent_id: agentId,
                  text,
                  conversation_id: interaction.conversation_id,
                  customer_party_id: interaction.customer_party_id,
                }),
              }).catch(() => { /* fire-and-forget */ });
            }
            break;
          }

          case 'accept_offer': {
            const offerId = msg.offer_id as string;
            if (!offerId) break;

            // Update offer status
            await db.update(ixOffers)
              .set({ status: 'accepted', responded_at: new Date() })
              .where(eq(ixOffers.offer_id, offerId));

            // The state machine transition should be handled by the interaction route
            break;
          }

          case 'decline_offer': {
            const offerId = msg.offer_id as string;
            if (!offerId) break;

            await db.update(ixOffers)
              .set({ status: 'declined', responded_at: new Date() })
              .where(eq(ixOffers.offer_id, offerId));
            break;
          }

          case 'set_presence': {
            const status = msg.status as string;
            if (!['online', 'away', 'dnd', 'offline'].includes(status)) break;

            await db.update(ixAgentPresence)
              .set({ presence_status: status, updated_at: new Date() })
              .where(eq(ixAgentPresence.agent_id, agentId));
            break;
          }

          case 'wrap_up': {
            const interactionId = msg.interaction_id as string;
            if (!interactionId) break;

            await db.update(ixInteractions)
              .set({
                state: 'wrapping_up',
                wrap_up_code: (msg.code as string) ?? null,
                wrap_up_note: (msg.note as string) ?? null,
                updated_at: new Date(),
              })
              .where(
                and(
                  eq(ixInteractions.interaction_id, interactionId),
                  eq(ixInteractions.assigned_agent_id, agentId),
                ),
              );

            await db.insert(ixInteractionEvents).values({
              interaction_id: interactionId,
              event_type: 'wrapping_up',
              actor_type: 'agent',
              actor_id: agentId,
              from_state: 'active',
              to_state: 'wrapping_up',
              payload_json: JSON.stringify({ code: msg.code, note: msg.note }),
            });

            // Push state change to agent
            pushToAgent(agentId, {
              type: 'interaction_state_changed',
              interaction_id: interactionId,
              state: 'wrapping_up',
            });
            break;
          }

          case 'transfer_interaction': {
            const interactionId = msg.interaction_id as string;
            const targetQueue = msg.target_queue as string;
            if (!interactionId) break;

            await db.update(ixInteractions)
              .set({
                state: 'transferred',
                queue_code: targetQueue ?? null,
                updated_at: new Date(),
              })
              .where(
                and(
                  eq(ixInteractions.interaction_id, interactionId),
                  eq(ixInteractions.assigned_agent_id, agentId),
                ),
              );

            await db.insert(ixInteractionEvents).values({
              interaction_id: interactionId,
              event_type: 'transferred',
              actor_type: 'agent',
              actor_id: agentId,
              from_state: 'active',
              to_state: 'transferred',
              payload_json: JSON.stringify({ target_queue: targetQueue }),
            });

            // Refresh inbox for agent
            const snapshot = await buildInboxSnapshot(agentId);
            pushToAgent(agentId, { type: 'inbox_snapshot', ...snapshot });
            break;
          }
        }
      },

      onClose() {
        // Unregister connection
        const conns = agentConnections.get(agentId);
        if (conns) {
          conns.delete(conn);
          if (conns.size === 0) {
            agentConnections.delete(agentId);
            // Set offline when last connection drops
            db.update(ixAgentPresence)
              .set({ presence_status: 'offline', updated_at: new Date() })
              .where(eq(ixAgentPresence.agent_id, agentId))
              .catch(() => {});
          }
        }
      },
    };
  }),
);

export default wsRouter;
