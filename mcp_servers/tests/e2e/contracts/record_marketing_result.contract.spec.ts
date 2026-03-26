/**
 * Tool Contract: record_marketing_result
 * Server: outbound-service (:18006)
 * Input:  { campaign_id: string, phone: string, result: enum[converted|callback|not_interested|no_answer|busy|wrong_number|dnd], callback_time?: string }
 * Output: packages/shared-db/src/schemas/record_marketing_result.json
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { mockBackend, loadService, createTestClient, callTool, validateSchema } from './helpers';
import { type Client } from '@modelcontextprotocol/sdk/client/index.js';

let client: Client;

beforeAll(async () => {
  mockBackend({
    post: (path) => {
      if (path === '/api/outreach/marketing/result') {
        return {
          success: true,
          record_id: 'MR-20260326-001',
        };
      }
      return { success: false };
    },
  });

  const createServer = await loadService('src/services/outbound_service.ts');
  client = await createTestClient(createServer);
});

describe('record_marketing_result — schema validation', () => {
  test('response passes JSON Schema validation', async () => {
    const result = await callTool(client, 'record_marketing_result', {
      campaign_id: 'CAMP-001',
      phone: '13800007777',
      result: 'converted',
    });
    const errors = validateSchema('record_marketing_result', result);
    expect(errors).toEqual([]);
  });
});

describe('record_marketing_result — required output fields', () => {
  test('response has required: conversion_tag(string), is_dnd(bool), is_callback(bool)', async () => {
    const result = await callTool(client, 'record_marketing_result', {
      campaign_id: 'CAMP-001',
      phone: '13800007777',
      result: 'converted',
    });
    expect(typeof result.conversion_tag).toBe('string');
    expect(typeof result.is_dnd).toBe('boolean');
    expect(typeof result.is_callback).toBe('boolean');
  });
});

describe('record_marketing_result — tag mapping', () => {
  test('converted maps to conversion_tag: converted', async () => {
    const result = await callTool(client, 'record_marketing_result', {
      campaign_id: 'CAMP-001',
      phone: '13800007777',
      result: 'converted',
    });
    expect(result.conversion_tag).toBe('converted');
    expect(result.is_dnd).toBe(false);
    expect(result.is_callback).toBe(false);
  });

  test('callback maps to conversion_tag: warm_lead, is_callback: true', async () => {
    const result = await callTool(client, 'record_marketing_result', {
      campaign_id: 'CAMP-002',
      phone: '13800008888',
      result: 'callback',
      callback_time: '2026-03-28T15:00:00',
    });
    expect(result.conversion_tag).toBe('warm_lead');
    expect(result.is_callback).toBe(true);
    expect(result.is_dnd).toBe(false);
  });

  test('not_interested maps to conversion_tag: cold', async () => {
    const result = await callTool(client, 'record_marketing_result', {
      campaign_id: 'CAMP-003',
      phone: '13800009999',
      result: 'not_interested',
    });
    expect(result.conversion_tag).toBe('cold');
  });

  test('dnd maps to conversion_tag: dnd, is_dnd: true', async () => {
    const result = await callTool(client, 'record_marketing_result', {
      campaign_id: 'CAMP-004',
      phone: '13800001010',
      result: 'dnd',
    });
    expect(result.conversion_tag).toBe('dnd');
    expect(result.is_dnd).toBe(true);
    expect(result.is_callback).toBe(false);
  });
});

describe('record_marketing_result — enum fields', () => {
  test('conversion_tag is enum: converted|warm_lead|cold|lost|dnd', async () => {
    const validTags = ['converted', 'warm_lead', 'cold', 'lost', 'dnd'];
    const result = await callTool(client, 'record_marketing_result', {
      campaign_id: 'CAMP-001',
      phone: '13800007777',
      result: 'converted',
    });
    expect(validTags).toContain(result.conversion_tag);
  });

  test('result is enum: converted|callback|not_interested|no_answer|busy|wrong_number|dnd', async () => {
    const validResults = ['converted', 'callback', 'not_interested', 'no_answer', 'busy', 'wrong_number', 'dnd'];
    const result = await callTool(client, 'record_marketing_result', {
      campaign_id: 'CAMP-001',
      phone: '13800007777',
      result: 'no_answer',
    });
    expect(validResults).toContain(result.result);
  });
});

describe('record_marketing_result — boolean fields', () => {
  test('is_dnd is false when result is not dnd', async () => {
    const result = await callTool(client, 'record_marketing_result', {
      campaign_id: 'CAMP-001',
      phone: '13800007777',
      result: 'converted',
    });
    expect(result.is_dnd).toBe(false);
  });

  test('is_dnd is true when result is dnd', async () => {
    const result = await callTool(client, 'record_marketing_result', {
      campaign_id: 'CAMP-005',
      phone: '13800001111',
      result: 'dnd',
    });
    expect(result.is_dnd).toBe(true);
  });

  test('is_callback is true only when result is callback', async () => {
    const result = await callTool(client, 'record_marketing_result', {
      campaign_id: 'CAMP-006',
      phone: '13800002222',
      result: 'callback',
      callback_time: '2026-03-29T10:00:00',
    });
    expect(result.is_callback).toBe(true);
  });
});
