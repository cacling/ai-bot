/**
 * agent-connection-manager.ts — 坐席 WebSocket 连接注册表
 *
 * 从 agent-ws.ts 抽取，供 internal/notify.ts 等内部 API 推送事件到坐席前端。
 * 每个坐席通过 phone 标识，一个 phone 可能有多个 WS 连接（多标签页）。
 */
import { logger } from './logger';

export interface AgentConnection {
  phone: string;
  send: (data: string) => void;
}

class AgentConnectionManager {
  private connections = new Map<string, Set<AgentConnection>>();

  /** 注册一个坐席 WS 连接 */
  register(conn: AgentConnection): () => void {
    if (!this.connections.has(conn.phone)) {
      this.connections.set(conn.phone, new Set());
    }
    this.connections.get(conn.phone)!.add(conn);
    logger.info('agent-conn-mgr', 'registered', { phone: conn.phone, count: this.connections.get(conn.phone)!.size });

    return () => {
      this.connections.get(conn.phone)?.delete(conn);
      if (this.connections.get(conn.phone)?.size === 0) {
        this.connections.delete(conn.phone);
      }
      logger.info('agent-conn-mgr', 'unregistered', { phone: conn.phone });
    };
  }

  /** 向指定 phone 的所有坐席连接推送事件 */
  sendToPhone(phone: string, event: Record<string, unknown>): boolean {
    const conns = this.connections.get(phone);
    if (!conns || conns.size === 0) return false;
    const data = JSON.stringify(event);
    let delivered = false;
    for (const conn of conns) {
      try {
        conn.send(data);
        delivered = true;
      } catch {
        /* ws already closed */
      }
    }
    return delivered;
  }

  /** 向所有在线坐席广播事件 */
  broadcast(event: Record<string, unknown>): number {
    const data = JSON.stringify(event);
    let count = 0;
    for (const conns of this.connections.values()) {
      for (const conn of conns) {
        try {
          conn.send(data);
          count++;
        } catch {
          /* ws already closed */
        }
      }
    }
    return count;
  }

  /** 获取所有在线坐席 phone 列表 */
  getOnlinePhones(): string[] {
    return Array.from(this.connections.keys());
  }

  /** 检查某 phone 是否有在线坐席 */
  isOnline(phone: string): boolean {
    const conns = this.connections.get(phone);
    return !!conns && conns.size > 0;
  }
}

export const agentConnectionManager = new AgentConnectionManager();
