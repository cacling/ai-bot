/**
 * schema.test.ts — 数据库 schema 定义测试
 */

import { describe, test, expect } from 'bun:test';
import * as schema from '../../../../backend/src/db/schema';

describe('schema — 表定义完整性', () => {
  test('sessions 表已定义', () => {
    expect(schema.sessions).toBeDefined();
  });

  test('messages 表已定义', () => {
    expect(schema.messages).toBeDefined();
  });

  test('plans 表已定义', () => {
    expect(schema.plans).toBeDefined();
  });

  test('subscribers 表已定义', () => {
    expect(schema.subscribers).toBeDefined();
  });

  test('bills 表已定义', () => {
    expect(schema.bills).toBeDefined();
  });

  test('valueAddedServices 表已定义', () => {
    expect(schema.valueAddedServices).toBeDefined();
  });

  test('subscriberSubscriptions 表已定义', () => {
    expect(schema.subscriberSubscriptions).toBeDefined();
  });

  test('mockUsers 表已定义', () => {
    expect(schema.mockUsers).toBeDefined();
  });

  test('users 表已定义', () => {
    expect(schema.users).toBeDefined();
  });

  test('skillVersions 表已定义', () => {
    expect(schema.skillVersions).toBeDefined();
  });

  test('changeRequests 表已定义', () => {
    expect(schema.changeRequests).toBeDefined();
  });

  test('testCases 表已定义', () => {
    expect(schema.testCases).toBeDefined();
  });

  test('outboundTasks 表已定义', () => {
    expect(schema.outboundTasks).toBeDefined();
  });

  test('callbackTasks 表已定义', () => {
    expect(schema.callbackTasks).toBeDefined();
  });

  test('deviceContexts 表已定义', () => {
    expect(schema.deviceContexts).toBeDefined();
  });

  test('mcpServers 表已定义', () => {
    expect(schema.mcpServers).toBeDefined();
  });

  // KM 表
  test('kmDocuments 表已定义', () => {
    expect(schema.kmDocuments).toBeDefined();
  });

  test('kmCandidates 表已定义', () => {
    expect(schema.kmCandidates).toBeDefined();
  });

  test('kmReviewPackages 表已定义', () => {
    expect(schema.kmReviewPackages).toBeDefined();
  });

  test('kmAssets 表已定义', () => {
    expect(schema.kmAssets).toBeDefined();
  });

  test('kmAuditLogs 表已定义', () => {
    expect(schema.kmAuditLogs).toBeDefined();
  });
});
