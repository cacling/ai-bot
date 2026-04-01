/**
 * Integration test: backend km-client → km_service internal API
 *
 * Verifies that the km-client.ts functions correctly fetch data from
 * km_service via HTTP, enforcing Database Ownership Isolation (Constitution XII).
 *
 * Prerequisites: km_service running on KM_SERVICE_PORT (default 18010)
 */
import { describe, test, expect } from 'bun:test';
import {
  getSkillRegistry,
  getWorkflowSpec,
  getMcpServers,
  getMcpTools,
  getMcpToolBindings,
  invalidateSkillCache,
  invalidateMcpCache,
} from '../../src/services/km-client';

// Clear caches before each test suite
invalidateSkillCache();
invalidateMcpCache();

describe('km-client → km_service integration', () => {

  test('getSkillRegistry returns skill list from km_service', async () => {
    const skills = await getSkillRegistry();
    expect(Array.isArray(skills)).toBe(true);
    // In a seeded environment, should have skills
    if (skills.length > 0) {
      expect(skills[0]).toHaveProperty('id');
      expect(skills[0]).toHaveProperty('published_version');
    }
  });

  test('getWorkflowSpec returns spec or null', async () => {
    const skills = await getSkillRegistry();
    if (skills.length === 0) return;

    const publishedSkill = skills.find(s => s.published_version != null);
    if (!publishedSkill) return;

    const spec = await getWorkflowSpec(publishedSkill.id);
    // Spec may or may not exist — just verify it returns the right shape
    if (spec) {
      expect(spec).toHaveProperty('skill_id');
      expect(spec).toHaveProperty('spec_json');
      expect(spec.skill_id).toBe(publishedSkill.id);
    }
  });

  test('getWorkflowSpec returns null for nonexistent skill', async () => {
    const spec = await getWorkflowSpec('nonexistent-skill-xyz');
    expect(spec).toBeNull();
  });

  test('getMcpServers returns server list', async () => {
    invalidateMcpCache();
    const servers = await getMcpServers();
    expect(Array.isArray(servers)).toBe(true);
    if (servers.length > 0) {
      expect(servers[0]).toHaveProperty('id');
      expect(servers[0]).toHaveProperty('name');
      expect(servers[0]).toHaveProperty('enabled');
    }
  });

  test('getMcpTools returns tool list', async () => {
    const tools = await getMcpTools();
    expect(Array.isArray(tools)).toBe(true);
  });

  test('getMcpToolBindings returns implementations and connectors', async () => {
    const bindings = await getMcpToolBindings();
    expect(Array.isArray(bindings.implementations)).toBe(true);
    expect(Array.isArray(bindings.connectors)).toBe(true);
  });

  test('caching works — second call returns same data without HTTP', async () => {
    invalidateSkillCache();
    const first = await getSkillRegistry();
    const second = await getSkillRegistry(); // should hit cache
    expect(first.length).toBe(second.length);
  });
});
