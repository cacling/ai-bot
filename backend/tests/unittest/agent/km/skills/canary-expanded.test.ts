/**
 * canary-expanded.test.ts — Expanded tests for canary deployment routes and resolveSkillsDir
 *
 * Covers: deploy with valid file, status after deploy, percentage routing,
 *         promote flow, delete/cancel flow, edge cases.
 */
import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { rm, mkdir, writeFile } from 'node:fs/promises';
import canary, { resolveSkillsDir } from '../../../../../src/agent/km/skills/canary';
import { REPO_ROOT } from '../../../../../src/services/paths';

const app = new Hono();
app.route('/canary', canary);

async function req(method: string, path: string, body?: Record<string, unknown>) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const res = await app.fetch(new Request(`http://localhost${path}`, init));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

// Create a temporary skill for testing deploy/promote/delete
const TEST_SKILL_DIR = resolve(REPO_ROOT, 'backend/skills/biz-skills/_canary_test_skill');
const TEST_SKILL_PATH = 'backend/skills/biz-skills/_canary_test_skill/SKILL.md';
const CANARY_ROOT = resolve(REPO_ROOT, 'backend/skills/.canary');

beforeEach(async () => {
  // Reset canary state by cancelling if active
  await app.fetch(new Request('http://localhost/canary', { method: 'DELETE' }));
  // Ensure test skill dir exists
  await mkdir(TEST_SKILL_DIR, { recursive: true });
  await writeFile(resolve(TEST_SKILL_DIR, 'SKILL.md'), '# Canary Test Skill\nOriginal content', 'utf-8');
});

afterAll(async () => {
  // Clean up
  await rm(TEST_SKILL_DIR, { recursive: true, force: true });
  await rm(CANARY_ROOT, { recursive: true, force: true });
});

describe('canary — deploy with valid file', () => {
  test('POST /canary/deploy — valid skill deploys successfully', async () => {
    const { status, data } = await req('POST', '/canary/deploy', {
      skill_path: TEST_SKILL_PATH,
      percentage: 20,
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.canary).toBeDefined();
    const canaryData = data.canary as Record<string, unknown>;
    expect(canaryData.skill_path).toBe(TEST_SKILL_PATH);
    expect(canaryData.percentage).toBe(20);
    expect(canaryData.createdAt).toBeTruthy();
  });

  test('POST /canary/deploy — default percentage is 10', async () => {
    const { status, data } = await req('POST', '/canary/deploy', {
      skill_path: TEST_SKILL_PATH,
    });
    expect(status).toBe(200);
    const canaryData = data.canary as Record<string, unknown>;
    expect(canaryData.percentage).toBe(10);
  });

  test('POST /canary/deploy — percentage 101 returns 400', async () => {
    const { status, data } = await req('POST', '/canary/deploy', {
      skill_path: TEST_SKILL_PATH,
      percentage: 101,
    });
    expect(status).toBe(400);
    expect((data.error as string)).toContain('percentage');
  });

  test('POST /canary/deploy — percentage 0 returns 400', async () => {
    const { status, data } = await req('POST', '/canary/deploy', {
      skill_path: TEST_SKILL_PATH,
      percentage: 0,
    });
    expect(status).toBe(400);
    expect((data.error as string)).toContain('percentage');
  });

  test('POST /canary/deploy — copies files to .canary/', async () => {
    await req('POST', '/canary/deploy', {
      skill_path: TEST_SKILL_PATH,
      percentage: 10,
    });
    const canarySkillDir = resolve(CANARY_ROOT, '_canary_test_skill');
    expect(existsSync(resolve(canarySkillDir, 'SKILL.md'))).toBe(true);
  });
});

describe('canary — status after deploy', () => {
  test('GET /canary/status — active after deploy', async () => {
    await req('POST', '/canary/deploy', { skill_path: TEST_SKILL_PATH, percentage: 30 });
    const { status, data } = await req('GET', '/canary/status');
    expect(status).toBe(200);
    expect(data.active).toBe(true);
    expect(data.skill_path).toBe(TEST_SKILL_PATH);
    expect(data.percentage).toBe(30);
  });
});

describe('canary — resolveSkillsDir with active canary', () => {
  test('routes low-digit phones to canary dir (percentage=100)', async () => {
    await req('POST', '/canary/deploy', { skill_path: TEST_SKILL_PATH, percentage: 100 });
    // 100% → threshold = 10, all digits 0-9 < 10, so all go to canary
    const result = resolveSkillsDir('13800000005', '/default/skills');
    expect(result).toContain('.canary');
  });

  test('routes high-digit phones to default dir (percentage=10)', async () => {
    await req('POST', '/canary/deploy', { skill_path: TEST_SKILL_PATH, percentage: 10 });
    // 10% → threshold = 1, only digit 0 goes to canary
    // Phone ending in 5 should go to default
    const result = resolveSkillsDir('13800000005', '/default/skills');
    expect(result).toBe('/default/skills');
  });

  test('phone ending in 0 routes to canary with percentage=10', async () => {
    await req('POST', '/canary/deploy', { skill_path: TEST_SKILL_PATH, percentage: 10 });
    // threshold = 1, digit 0 < 1 → canary
    const result = resolveSkillsDir('13800000000', '/default/skills');
    expect(result).toContain('.canary');
  });

  test('percentage=50 routes digits 0-4 to canary', async () => {
    await req('POST', '/canary/deploy', { skill_path: TEST_SKILL_PATH, percentage: 50 });
    // threshold = 5
    expect(resolveSkillsDir('13800000004', '/default')).toContain('.canary');
    expect(resolveSkillsDir('13800000005', '/default')).toBe('/default');
  });
});

describe('canary — promote', () => {
  test('POST /canary/promote — promotes canary to main', async () => {
    // Deploy first
    await req('POST', '/canary/deploy', { skill_path: TEST_SKILL_PATH, percentage: 20 });

    // Modify the canary copy to verify promote overwrites main
    const canaryMdPath = resolve(CANARY_ROOT, '_canary_test_skill', 'SKILL.md');
    await writeFile(canaryMdPath, '# Canary Test Skill\nPromoted content', 'utf-8');

    const { status, data } = await req('POST', '/canary/promote');
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.versionId).toBeDefined();

    // Canary dir should be cleaned up
    expect(existsSync(CANARY_ROOT)).toBe(false);

    // Main skill file should have promoted content
    const { readFileSync } = require('fs');
    const mainContent = readFileSync(resolve(TEST_SKILL_DIR, 'SKILL.md'), 'utf-8');
    expect(mainContent).toContain('Promoted content');

    // Status should be inactive
    const statusRes = await req('GET', '/canary/status');
    expect(statusRes.data.active).toBe(false);
  });
});

describe('canary — cancel (DELETE)', () => {
  test('DELETE /canary — cancels active canary', async () => {
    await req('POST', '/canary/deploy', { skill_path: TEST_SKILL_PATH, percentage: 10 });

    const { status, data } = await req('DELETE', '/canary');
    expect(status).toBe(200);
    expect(data.ok).toBe(true);

    // Canary dir should be cleaned
    expect(existsSync(CANARY_ROOT)).toBe(false);

    // Status should be inactive
    const statusRes = await req('GET', '/canary/status');
    expect(statusRes.data.active).toBe(false);
  });
});
