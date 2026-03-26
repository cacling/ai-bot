/**
 * Tool Contract: send_followup_sms
 * Server: outbound-service (:18006)
 * Input:  { phone: string, sms_type: enum[payment_link|plan_detail|callback_reminder|product_detail], context?: enum[collection|marketing] }
 * Output: packages/shared-db/src/schemas/send_followup_sms.json
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { mockBackend, loadService, createTestClient, callTool, validateSchema } from './helpers';
import { type Client } from '@modelcontextprotocol/sdk/client/index.js';

let client: Client;

beforeAll(async () => {
  mockBackend({
    post: (path) => {
      if (path === '/api/outreach/sms/send') {
        return {
          success: true,
          event_id: 'SMS-20260326-001',
          status: 'sent',
        };
      }
      return { success: false };
    },
  });

  const createServer = await loadService('src/services/outbound_service.ts');
  client = await createTestClient(createServer);
});

describe('send_followup_sms — schema validation', () => {
  test('response passes JSON Schema validation', async () => {
    const result = await callTool(client, 'send_followup_sms', {
      phone: '13800003333',
      sms_type: 'payment_link',
    });
    const errors = validateSchema('send_followup_sms', result);
    expect(errors).toEqual([]);
  });
});

describe('send_followup_sms — enum fields', () => {
  test('sms_type is enum: payment_link|plan_detail|callback_reminder|product_detail', async () => {
    const validTypes = ['payment_link', 'plan_detail', 'callback_reminder', 'product_detail'];
    const result = await callTool(client, 'send_followup_sms', {
      phone: '13800003333',
      sms_type: 'plan_detail',
      context: 'marketing',
    });
    expect(validTypes).toContain(result.sms_type);
  });

  test('status is enum: sent', async () => {
    const result = await callTool(client, 'send_followup_sms', {
      phone: '13800003333',
      sms_type: 'payment_link',
    });
    expect(result.status).toBe('sent');
  });
});

describe('send_followup_sms — output fields', () => {
  test('phone is returned as string', async () => {
    const result = await callTool(client, 'send_followup_sms', {
      phone: '13800003333',
      sms_type: 'callback_reminder',
    });
    expect(typeof result.phone).toBe('string');
    expect(result.phone).toBe('13800003333');
  });

  test('context is string or null when not provided', async () => {
    const result = await callTool(client, 'send_followup_sms', {
      phone: '13800003333',
      sms_type: 'payment_link',
    });
    expect(result.context === null || typeof result.context === 'string').toBe(true);
  });
});
