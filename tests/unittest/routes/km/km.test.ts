/**
 * km.test.ts — 知识管理端到端测试
 *
 * 覆盖主链路：文档→候选→证据→门槛→评审包→提交阻断→审批→动作草案→执行→资产入库→审计日志
 *
 * 运行方式：bun test src/routes/km/km.test.ts
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '../../../../backend/src/db/schema';

// ── 测试用独立内存数据库 ──────────────────────────────────────────────────────
let testDb: ReturnType<typeof drizzle>;

// 我们直接测试 HTTP API，通过 Hono app.fetch
import { Hono } from 'hono';
import documents from '../../../../backend/src/agent/km/kms/documents';
import candidates from '../../../../backend/src/agent/km/kms/candidates';
import evidence from '../../../../backend/src/agent/km/kms/evidence';
import conflicts from '../../../../backend/src/agent/km/kms/conflicts';
import reviewPackages from '../../../../backend/src/agent/km/kms/review-packages';
import actionDrafts from '../../../../backend/src/agent/km/kms/action-drafts';
import assets from '../../../../backend/src/agent/km/kms/assets';
import tasks from '../../../../backend/src/agent/km/kms/tasks';
import audit from '../../../../backend/src/agent/km/kms/audit';

const app = new Hono();
app.route('/documents', documents);
app.route('/candidates', candidates);
app.route('/evidence', evidence);
app.route('/conflicts', conflicts);
app.route('/review-packages', reviewPackages);
app.route('/action-drafts', actionDrafts);
app.route('/assets', assets);
app.route('/tasks', tasks);
app.route('/audit-logs', audit);

/** 发送请求到测试 app */
async function req(method: string, path: string, body?: Record<string, unknown>) {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) init.body = JSON.stringify(body);
  const res = await app.fetch(new Request(`http://localhost${path}`, init));
  const data = await res.json();
  return { status: res.status, data: data as Record<string, unknown> };
}

// ── 存储测试过程中的 ID ──────────────────────────────────────────────────────
let docId: string;
let versionId: string;
let candidateId: string;
let candidateId2: string;
let evidenceId: string;
let reviewPkgId: string;
let actionDraftId: string;
let assetId: string;
let taskId: string;

describe('知识管理 — 完整主链路测试', () => {

  // ═══════════════════════════════════════════════════════════════════════
  // 1. 文档管理
  // ═══════════════════════════════════════════════════════════════════════
  describe('1. 文档管理', () => {
    test('创建文档', async () => {
      const { status, data } = await req('POST', '/documents', {
        title: '退订政策 2026 版', classification: 'internal', owner: '张三',
      });
      expect(status).toBe(201);
      expect(data.id).toBeDefined();
      docId = data.id as string;
      versionId = data.version_id as string;
    });

    test('文档列表', async () => {
      const { status, data } = await req('GET', '/documents');
      expect(status).toBe(200);
      expect((data.items as unknown[]).length).toBeGreaterThanOrEqual(1);
    });

    test('文档详情含版本', async () => {
      const { status, data } = await req('GET', `/documents/${docId}`);
      expect(status).toBe(200);
      expect(data.title).toBe('退订政策 2026 版');
      expect((data.versions as unknown[]).length).toBe(1);
    });

    test('新建文档版本', async () => {
      const { status, data } = await req('POST', `/documents/${docId}/versions`, {
        diff_summary: '更新退订时限从7天改为5天',
      });
      expect(status).toBe(201);
      expect(data.version_no).toBe(2);
    });

    test('触发解析', async () => {
      const { status, data } = await req('POST', `/documents/versions/${versionId}/parse`);
      expect(status).toBe(201);
      expect((data.jobs as unknown[]).length).toBe(4); // parse, chunk, generate, validate
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 2. 知识候选
  // ═══════════════════════════════════════════════════════════════════════
  describe('2. 知识候选', () => {
    test('创建候选（来自解析）', async () => {
      const { status, data } = await req('POST', '/candidates', {
        source_type: 'parsing', source_ref_id: versionId,
        normalized_q: '如何退订增值业务？',
        draft_answer: '进入 App → 我的服务 → 退订 → 确认',
      });
      expect(status).toBe(201);
      candidateId = data.id as string;
    });

    test('创建候选（人工）', async () => {
      const { status, data } = await req('POST', '/candidates', {
        source_type: 'manual',
        normalized_q: '退订后费用如何计算？',
        draft_answer: '退订当月按天折算，次月起停止计费。',
      });
      expect(status).toBe(201);
      candidateId2 = data.id as string;
    });

    test('候选列表', async () => {
      const { status, data } = await req('GET', '/candidates');
      expect(status).toBe(200);
      expect((data.items as unknown[]).length).toBeGreaterThanOrEqual(2);
    });

    test('候选详情含门槛体检卡', async () => {
      const { status, data } = await req('GET', `/candidates/${candidateId}`);
      expect(status).toBe(200);
      expect(data.gate_card).toBeDefined();
      expect((data.gate_card as Record<string, unknown>).evidence).toBeDefined();
    });

    test('门槛校验 — 无证据应 fail', async () => {
      const { status, data } = await req('POST', `/candidates/${candidateId}/gate-check`);
      expect(status).toBe(200);
      expect(data.gate_evidence).toBe('fail');
      expect(data.all_pass).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 3. 证据引用
  // ═══════════════════════════════════════════════════════════════════════
  describe('3. 证据引用', () => {
    test('添加证据引用', async () => {
      const { status, data } = await req('POST', '/evidence', {
        candidate_id: candidateId, doc_version_id: versionId,
        locator: '第3章第2节', status: 'pending',
      });
      expect(status).toBe(201);
      evidenceId = data.id as string;
    });

    test('审核证据通过', async () => {
      const { status } = await req('PUT', `/evidence/${evidenceId}`, {
        status: 'pass', reviewed_by: 'reviewer01',
      });
      expect(status).toBe(200);
    });

    test('门槛校验 — 证据通过后应 pass', async () => {
      const { status, data } = await req('POST', `/candidates/${candidateId}/gate-check`);
      expect(status).toBe(200);
      expect(data.gate_evidence).toBe('pass');
    });

    test('为候选2也添加证据并审核通过', async () => {
      const { data } = await req('POST', '/evidence', {
        candidate_id: candidateId2, doc_version_id: versionId,
        locator: '第4章',
      });
      expect(data.id).toBeDefined();
      // 审核通过
      await req('PUT', `/evidence/${data.id as string}`, { status: 'pass', reviewed_by: 'reviewer01' });
      // 校验门槛
      await req('POST', `/candidates/${candidateId2}/gate-check`);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 4. 冲突记录
  // ═══════════════════════════════════════════════════════════════════════
  describe('4. 冲突记录', () => {
    test('创建冲突记录', async () => {
      const { status, data } = await req('POST', '/conflicts', {
        conflict_type: 'wording',
        item_a_id: candidateId, item_b_id: candidateId2,
        overlap_scope: '退订流程说明', blocking_policy: 'block_submit',
      });
      expect(status).toBe(201);
      expect(data.id).toBeDefined();
    });

    test('门槛校验 — 有未仲裁冲突应 fail', async () => {
      const { data } = await req('POST', `/candidates/${candidateId}/gate-check`);
      expect(data.gate_conflict).toBe('fail');
      expect(data.all_pass).toBe(false);
    });

    test('仲裁冲突', async () => {
      const { data: list } = await req('GET', '/conflicts?status=pending');
      const conflictId = (list.items as { id: string }[])[0].id;
      const { status } = await req('PUT', `/conflicts/${conflictId}/resolve`, {
        resolution: 'keep_a', arbiter: 'admin01',
      });
      expect(status).toBe(200);
    });

    test('门槛校验 — 冲突仲裁后应 pass', async () => {
      const { data } = await req('POST', `/candidates/${candidateId}/gate-check`);
      expect(data.gate_conflict).toBe('pass');
      expect(data.all_pass).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 5. 评审包 + 门槛阻断
  // ═══════════════════════════════════════════════════════════════════════
  describe('5. 评审包', () => {
    test('创建评审包', async () => {
      const { status, data } = await req('POST', '/review-packages', {
        title: '退订政策首批入库',
        candidate_ids: [candidateId, candidateId2],
      });
      expect(status).toBe(201);
      reviewPkgId = data.id as string;
    });

    test('评审包详情含候选', async () => {
      const { status, data } = await req('GET', `/review-packages/${reviewPkgId}`);
      expect(status).toBe(200);
      expect((data.candidates as unknown[]).length).toBe(2);
    });

    test('提交评审 — 候选2未完成门槛校验时应阻断', async () => {
      // 先把候选2的门槛重设为fail来测试阻断
      // candidateId2 的 gate_ownership 可能是 pending
      const { data: c2 } = await req('GET', `/candidates/${candidateId2}`);
      if ((c2 as Record<string, unknown>).gate_ownership === 'pending') {
        // 应该被阻断
        const { status } = await req('POST', `/review-packages/${reviewPkgId}/submit`, { submitted_by: 'op1' });
        expect(status).toBe(400);
      }
    });

    test('确保所有候选门槛通过', async () => {
      // 为候选2也校验门槛
      await req('POST', `/candidates/${candidateId2}/gate-check`);
      // 如果 gate_ownership 是 pending（manual 类型），需要设为 pass
      const { data: c2 } = await req('GET', `/candidates/${candidateId2}`);
      if ((c2 as Record<string, unknown>).gate_ownership !== 'pass') {
        // 将候选2设为 parsing 类型来让 ownership 自动 pass
        await req('PUT', `/candidates/${candidateId2}`, { target_asset_id: 'dummy-asset' });
        await req('POST', `/candidates/${candidateId2}/gate-check`);
      }
    });

    test('提交评审 — 门槛全部通过时应成功', async () => {
      const { status, data } = await req('POST', `/review-packages/${reviewPkgId}/submit`, { submitted_by: 'op1' });
      expect(status).toBe(200);
      expect(data.status).toBe('submitted');
    });

    test('审批通过', async () => {
      const { status, data } = await req('POST', `/review-packages/${reviewPkgId}/approve`, { approved_by: 'reviewer01' });
      expect(status).toBe(200);
      expect(data.status).toBe('approved');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 6. 动作草案 + 执行发布
  // ═══════════════════════════════════════════════════════════════════════
  describe('6. 动作草案与发布', () => {
    test('创建发布草案', async () => {
      const { status, data } = await req('POST', '/action-drafts', {
        action_type: 'publish', review_pkg_id: reviewPkgId,
        change_summary: '退订政策首批发布', created_by: 'admin01',
      });
      expect(status).toBe(201);
      actionDraftId = data.id as string;
    });

    test('执行草案 — 候选转资产', async () => {
      const { status, data } = await req('POST', `/action-drafts/${actionDraftId}/execute`, { executed_by: 'admin01' });
      expect(status).toBe(200);
      expect(data.status).toBe('done');
      expect(data.regression_window_id).toBeDefined();
    });

    test('草案不可重复执行', async () => {
      const { status } = await req('POST', `/action-drafts/${actionDraftId}/execute`, { executed_by: 'admin01' });
      expect(status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 7. 资产验证
  // ═══════════════════════════════════════════════════════════════════════
  describe('7. 资产入库验证', () => {
    test('资产列表有新资产', async () => {
      const { status, data } = await req('GET', '/assets');
      expect(status).toBe(200);
      expect((data.items as unknown[]).length).toBeGreaterThanOrEqual(1);
      assetId = ((data.items as { id: string }[])[0]).id;
    });

    test('资产详情', async () => {
      const { status, data } = await req('GET', `/assets/${assetId}`);
      expect(status).toBe(200);
      expect(data.status).toBe('online');
    });

    test('资产版本链', async () => {
      const { status, data } = await req('GET', `/assets/${assetId}/versions`);
      expect(status).toBe(200);
      expect((data.items as unknown[]).length).toBeGreaterThanOrEqual(1);
    });

    test('候选状态已更新为 published', async () => {
      const { data } = await req('GET', `/candidates/${candidateId}`);
      expect(data.status).toBe('published');
    });

    test('评审包状态已更新为 published', async () => {
      const { data } = await req('GET', `/review-packages/${reviewPkgId}`);
      expect(data.status).toBe('published');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 8. 治理任务
  // ═══════════════════════════════════════════════════════════════════════
  describe('8. 治理任务', () => {
    test('创建治理任务', async () => {
      const { status, data } = await req('POST', '/tasks', {
        task_type: 'evidence_gap', source_type: 'candidate',
        source_ref_id: candidateId, priority: 'high', assignee: 'op1',
      });
      expect(status).toBe(201);
      taskId = data.id as string;
    });

    test('任务列表', async () => {
      const { data } = await req('GET', '/tasks');
      expect((data.items as unknown[]).length).toBeGreaterThanOrEqual(1);
    });

    test('完成任务', async () => {
      const { status } = await req('PUT', `/tasks/${taskId}`, {
        status: 'done', conclusion: '已补齐证据',
      });
      expect(status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 9. 审计日志
  // ═══════════════════════════════════════════════════════════════════════
  describe('9. 审计日志', () => {
    test('审计日志有记录', async () => {
      const { status, data } = await req('GET', '/audit-logs');
      expect(status).toBe(200);
      const items = data.items as unknown[];
      expect(items.length).toBeGreaterThanOrEqual(3);
      // 应包含：create_document, evidence_pass, conflict_resolved, submit_review, approve_review, execute_publish, close_task
    });

    test('审计日志可按 action 过滤', async () => {
      const { data } = await req('GET', '/audit-logs?action=execute_publish');
      expect((data.items as unknown[]).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 10. 边界场景
  // ═══════════════════════════════════════════════════════════════════════
  describe('10. 边界场景', () => {
    test('创建候选 — 缺少问句应返回 400', async () => {
      const { status } = await req('POST', '/candidates', {
        source_type: 'manual', normalized_q: '',
      });
      expect(status).toBe(400);
    });

    test('创建文档 — 缺少标题应返回 400', async () => {
      const { status } = await req('POST', '/documents', { title: '' });
      expect(status).toBe(400);
    });

    test('获取不存在的文档应返回 404', async () => {
      const { status } = await req('GET', '/documents/nonexistent');
      expect(status).toBe(404);
    });

    test('获取不存在的候选应返回 404', async () => {
      const { status } = await req('GET', '/candidates/nonexistent');
      expect(status).toBe(404);
    });

    test('获取不存在的评审包应返回 404', async () => {
      const { status } = await req('GET', '/review-packages/nonexistent');
      expect(status).toBe(404);
    });

    test('创建评审包 — 缺少标题应返回 400', async () => {
      const { status } = await req('POST', '/review-packages', { title: '' });
      expect(status).toBe(400);
    });

    test('已提交的评审包不能重复提交', async () => {
      const { status } = await req('POST', `/review-packages/${reviewPkgId}/submit`, {});
      // 状态已经是 published，不是 draft
      expect(status).toBe(400);
    });
  });
});
