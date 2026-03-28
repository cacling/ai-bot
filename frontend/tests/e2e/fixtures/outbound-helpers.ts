/**
 * outbound-helpers.ts — Helpers for text-mode outbound E2E tests
 *
 * Uses WebSocket directly (no browser UI needed) to test outbound flows.
 * Connects to /ws/outbound?mode=text with specified task parameters.
 */
import { expect, type Page } from '@playwright/test';
import WebSocket from 'ws';

const BASE_URL = process.env.E2E_BACKEND_URL ?? 'ws://localhost:18001';

export interface OutboundWsOptions {
  phone?: string;
  task?: 'collection' | 'marketing';
  lang?: 'zh' | 'en';
  id?: string;
}

export interface OutboundWsClient {
  /** All received messages */
  messages: any[];
  /** Send a chat message and wait for bot response */
  sendAndWait(text: string, timeoutMs?: number): Promise<string>;
  /** Wait for the next bot response */
  waitForResponse(timeoutMs?: number): Promise<string>;
  /** Get all bot responses so far */
  getBotResponses(): string[];
  /** Close the connection */
  close(): void;
}

/**
 * Connect to /ws/outbound?mode=text and wait for the bot opening message.
 */
export async function connectOutbound(opts: OutboundWsOptions = {}): Promise<OutboundWsClient> {
  const { phone = '13800000001', task = 'collection', lang = 'zh', id } = opts;

  const params = new URLSearchParams({ phone, task, lang, mode: 'text' });
  if (id) params.set('id', id);

  const wsUrl = `${BASE_URL}/ws/outbound?${params}`;

  return new Promise<OutboundWsClient>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const messages: any[] = [];
    let pendingResolve: ((text: string) => void) | null = null;
    let pendingReject: ((err: Error) => void) | null = null;

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        messages.push(msg);

        // Resolve pending waitForResponse
        if (pendingResolve && msg.source === 'bot' && msg.type === 'response') {
          const resolver = pendingResolve;
          pendingResolve = null;
          pendingReject = null;
          resolver(msg.text);
        }
      } catch { /* ignore non-JSON */ }
    });

    ws.on('error', (err) => {
      if (pendingReject) {
        pendingReject(err);
        pendingResolve = null;
        pendingReject = null;
      }
      reject(err);
    });

    const client: OutboundWsClient = {
      messages,

      waitForResponse(timeoutMs = 60_000): Promise<string> {
        // Check if we already have an unhandled response
        const existing = messages.find(m => m.source === 'bot' && m.type === 'response' && !m._consumed);
        if (existing) {
          existing._consumed = true;
          return Promise.resolve(existing.text);
        }

        return new Promise<string>((res, rej) => {
          pendingResolve = (text) => { res(text); };
          pendingReject = rej;
          setTimeout(() => {
            if (pendingResolve) {
              pendingResolve = null;
              pendingReject = null;
              rej(new Error(`Timeout waiting for bot response after ${timeoutMs}ms`));
            }
          }, timeoutMs);
        });
      },

      async sendAndWait(text: string, timeoutMs = 60_000): Promise<string> {
        ws.send(JSON.stringify({ type: 'chat_message', message: text }));
        return this.waitForResponse(timeoutMs);
      },

      getBotResponses(): string[] {
        return messages
          .filter(m => m.source === 'bot' && m.type === 'response')
          .map(m => m.text);
      },

      close() {
        ws.close();
      },
    };

    // Wait for opening message
    ws.on('open', () => {
      // First bot response is the opening
      const checkOpening = () => {
        const opening = messages.find(m => m.source === 'bot' && m.type === 'response');
        if (opening) {
          opening._consumed = true;
          resolve(client);
        } else {
          setTimeout(checkOpening, 100);
        }
      };

      // Timeout for opening
      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for outbound bot opening'));
      }, 30_000);

      ws.on('message', () => {
        const opening = messages.find(m => m.source === 'bot' && m.type === 'response');
        if (opening) {
          clearTimeout(timer);
          opening._consumed = true;
          resolve(client);
        }
      });
    });
  });
}
