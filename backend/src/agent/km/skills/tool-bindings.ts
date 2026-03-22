/**
 * skills/tool-bindings.ts — Skill ↔ Tool 绑定 CRUD
 *
 * 严格 MCP 对齐：显式化 Skill 的 Tool Call Plan。
 *
 * GET  /api/skills/:id/tool-bindings       — 获取绑定列表
 * PUT  /api/skills/:id/tool-bindings       — 批量更新绑定
 * POST /api/skills/:id/sync-bindings       — 从 SKILL.md 自动提取
 */
import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../../../db';
import { skillToolBindings } from '../../../db/schema';
import { logger } from '../../../services/logger';
import { BIZ_SKILLS_DIR } from '../../../services/paths';

const app = new Hono();
const now = () => new Date().toISOString();

/**
 * 从 SKILL.md 内容中提取 Tool Call Plan。
 * 解析 Mermaid 状态图中的 %% tool:xxx 注解，提取：
 * - tool_name
 * - call_order（按出现顺序）
 * - purpose（根据上下文推断 query/action）
 * - trigger_condition（从状态节点描述提取）
 */
export function extractToolBindingsFromSkillMd(content: string): Array<{
  tool_name: string;
  call_order: number;
  purpose: string;
  trigger_condition: string;
}> {
  const bindings: Array<{
    tool_name: string;
    call_order: number;
    purpose: string;
    trigger_condition: string;
  }> = [];

  const seen = new Set<string>();
  let order = 0;

  // 提取 mermaid 块
  const mermaidMatch = content.match(/```mermaid\r?\n([\s\S]*?)```/);
  if (!mermaidMatch) return bindings;
  const mermaid = mermaidMatch[1];

  for (const line of mermaid.split('\n')) {
    const toolMatch = line.match(/%% tool:(\w+)/);
    if (!toolMatch) continue;
    const toolName = toolMatch[1];
    if (seen.has(toolName)) continue;
    seen.add(toolName);

    // 从状态节点描述提取触发条件
    const stateMatch = line.match(/(\S+)\s*(?:-->|:)/);
    const stateName = stateMatch?.[1] ?? '';
    const descMatch = line.match(/:\s*(.+?)(?:\s*%%|$)/);
    const triggerCondition = descMatch?.[1]?.trim() ?? stateName;

    // 推断 purpose：包含 query/查询/诊断 → query，包含 cancel/创建/退订 → action
    const lineLC = (toolName + ' ' + triggerCondition).toLowerCase();
    let purpose = 'query';
    if (/cancel|create|update|delete|issue|退订|创建|修改|删除/.test(lineLC)) {
      purpose = 'action';
    } else if (/check|verify|diagnose|检查|诊断/.test(lineLC)) {
      purpose = 'check';
    }

    bindings.push({
      tool_name: toolName,
      call_order: order++,
      purpose,
      trigger_condition: triggerCondition,
    });
  }

  return bindings;
}

// ── GET /:id/tool-bindings ─────────────────────────────────────────────────
app.get('/:id/tool-bindings', async (c) => {
  const skillId = c.req.param('id');
  const rows = db.select().from(skillToolBindings)
    .where(eq(skillToolBindings.skill_id, skillId))
    .all()
    .sort((a, b) => (a.call_order ?? 0) - (b.call_order ?? 0));
  return c.json({ items: rows });
});

// ── PUT /:id/tool-bindings（批量更新）────────────────────────────────────
app.put('/:id/tool-bindings', async (c) => {
  const skillId = c.req.param('id');
  const body = await c.req.json() as {
    bindings: Array<{
      tool_name: string;
      call_order?: number;
      purpose?: string;
      trigger_condition?: string;
      arg_mapping?: string;
      result_mapping?: string;
    }>;
  };

  // 删除旧绑定，重新插入
  db.delete(skillToolBindings).where(eq(skillToolBindings.skill_id, skillId)).run();

  for (const b of body.bindings) {
    db.insert(skillToolBindings).values({
      skill_id: skillId,
      tool_name: b.tool_name,
      call_order: b.call_order ?? 0,
      purpose: b.purpose ?? 'query',
      trigger_condition: b.trigger_condition ?? null,
      arg_mapping: b.arg_mapping ?? null,
      result_mapping: b.result_mapping ?? null,
      created_at: now(),
    }).run();
  }

  logger.info('skills', 'tool_bindings_updated', { skill_id: skillId, count: body.bindings.length });
  return c.json({ ok: true, count: body.bindings.length });
});

// ── POST /:id/sync-bindings（从 SKILL.md 自动提取）──────────────────────
app.post('/:id/sync-bindings', async (c) => {
  const skillId = c.req.param('id');
  const mdPath = join(BIZ_SKILLS_DIR, skillId, 'SKILL.md');
  if (!existsSync(mdPath)) {
    return c.json({ error: `SKILL.md not found for ${skillId}` }, 404);
  }

  const content = readFileSync(mdPath, 'utf-8');
  const extracted = extractToolBindingsFromSkillMd(content);

  if (extracted.length === 0) {
    return c.json({ ok: true, count: 0, note: 'No %% tool:xxx annotations found in SKILL.md' });
  }

  // 删除旧绑定，插入新提取的
  db.delete(skillToolBindings).where(eq(skillToolBindings.skill_id, skillId)).run();

  for (const b of extracted) {
    db.insert(skillToolBindings).values({
      skill_id: skillId,
      tool_name: b.tool_name,
      call_order: b.call_order,
      purpose: b.purpose,
      trigger_condition: b.trigger_condition,
      created_at: now(),
    }).run();
  }

  logger.info('skills', 'tool_bindings_synced', { skill_id: skillId, count: extracted.length });
  return c.json({ ok: true, count: extracted.length, bindings: extracted });
});

export default app;
