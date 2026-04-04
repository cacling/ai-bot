/**
 * staff-skills.test.ts — 技能定义 + 坐席技能分配 API 测试
 */
import { describe, it, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();
const BASE = '/api/wfm/staff-skills';

const json = (body: object) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('Skills CRUD', () => {
  it('GET /skills should list seed skills', async () => {
    const res = await app.request(`${BASE}/skills`);
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBeGreaterThanOrEqual(6);
  });

  it('POST /skills should create skill', async () => {
    const res = await app.request(`${BASE}/skills`, json({ code: 'TEST_SK', name: '测试技能' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.code).toBe('TEST_SK');
  });

  it('PUT /skills/:id should update skill', async () => {
    const createRes = await app.request(`${BASE}/skills`, json({ code: 'UPD_SK', name: '待更新' }));
    const { id } = await createRes.json();

    const res = await app.request(`${BASE}/skills/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '已更新技能' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('已更新技能');
  });

  it('DELETE /skills/:id should delete skill', async () => {
    const createRes = await app.request(`${BASE}/skills`, json({ code: 'DEL_SK', name: '待删除' }));
    const { id } = await createRes.json();
    const res = await app.request(`${BASE}/skills/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
  });
});

describe('Skill Agents', () => {
  it('GET /skills/:id/agents should list agents with skill', async () => {
    const listRes = await app.request(`${BASE}/skills`);
    const { items } = await listRes.json();
    const voiceCn = items.find((s: { code: string }) => s.code === 'VOICE_CN');

    const res = await app.request(`${BASE}/skills/${voiceCn.id}/agents`);
    expect(res.status).toBe(200);
    const body = await res.json();
    // All 7 staff have VOICE_CN
    expect(body.items.length).toBeGreaterThanOrEqual(7);
  });
});

describe('Staff Skill Assignments', () => {
  it('GET /staff/:staffId/skills should list skills for agent', async () => {
    const res = await app.request(`${BASE}/staff/agent_001/skills`);
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it('POST + DELETE /staff/:staffId/skills should manage assignments', async () => {
    const skillsRes = await app.request(`${BASE}/skills`);
    const { items: skills } = await skillsRes.json();
    const email = skills.find((s: { code: string }) => s.code === 'EMAIL');

    // Assign email skill to agent_001
    const addRes = await app.request(`${BASE}/staff/agent_001/skills`, json({
      skillId: email.id,
      proficiency: 80,
    }));
    expect(addRes.status).toBe(201);
    const binding = await addRes.json();

    // Remove assignment
    const delRes = await app.request(`${BASE}/staff/agent_001/skills/${binding.id}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);
  });
});
