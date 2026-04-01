/**
 * test-personas.ts — 测试 persona 列表
 *
 * ob_test_personas 只存 party_id 引用 + category。
 * 返回时通过 CDP API 拉取完整用户画像，外呼 persona 额外附加任务数据。
 */
import { Hono } from 'hono';
import { db, obTestPersonas, obTasks, eq, asc } from '../db';

const CDP_BASE = `http://localhost:${process.env.CDP_SERVICE_PORT ?? 18020}/api/cdp`;

const router = new Hono();

interface PartyContext {
  party: { display_name?: string; status?: string } | null;
  identities: Array<{ identity_type: string; identity_value: string }>;
  contact_points: Array<{ contact_type: string; contact_value: string }>;
  subscriptions: Array<{
    plan_code?: string; service_status?: string;
    billing_status?: string; account_status?: string;
  }>;
  profile: {
    basic_profile_json?: string;
    service_profile_json?: string;
    contact_profile_json?: string;
  } | null;
}

/** 从 CDP 拉取单个 party 的完整上下文 */
async function fetchPartyContext(partyId: string): Promise<PartyContext | null> {
  try {
    const res = await fetch(`${CDP_BASE}/party/${partyId}/context`);
    if (!res.ok) return null;
    return await res.json() as PartyContext;
  } catch {
    return null;
  }
}

/** 将 CDP party context 转换为前端需要的 persona context */
function buildPersonaContext(ctx: PartyContext): Record<string, unknown> {
  const phone = ctx.identities.find(i => i.identity_type === 'phone')?.identity_value ?? '';
  const email = ctx.contact_points?.find(i => i.contact_type === 'email')?.contact_value ?? '';
  const name = ctx.party?.display_name ?? '';
  const status = ctx.party?.status ?? 'active';

  // 从 subscription 提取套餐信息
  const sub = ctx.subscriptions?.[0];
  let plan = sub?.plan_code ?? '';
  let billingStatus = sub?.billing_status ?? 'normal';

  // 从 profile JSON 提取详细属性
  let region = '';
  let customerTier = 'standard';
  let gender = '';
  let planName = plan;
  let planType = '';
  try {
    const basic = JSON.parse(ctx.profile?.basic_profile_json ?? '{}');
    region = basic.region ?? '';
    customerTier = basic.customer_tier ?? 'standard';
    gender = basic.gender ?? '';
  } catch { /* ignore */ }
  try {
    const service = JSON.parse(ctx.profile?.service_profile_json ?? '{}');
    planName = service.plan_name ?? plan;
    planType = service.plan_type ?? '';
  } catch { /* ignore */ }

  return {
    phone, name, email, gender, status,
    plan: planName, plan_type: planType,
    billing_status: billingStatus,
    region, customer_tier: customerTier,
  };
}

// GET / — 列表（可选 ?category=inbound|outbound_collection|outbound_marketing）
router.get('/', async (c) => {
  const category = c.req.query('category');
  const lang = (c.req.query('lang') ?? 'zh') as 'zh' | 'en';

  const personas = category
    ? db.select().from(obTestPersonas).where(eq(obTestPersonas.category, category)).orderBy(asc(obTestPersonas.sort_order)).all()
    : db.select().from(obTestPersonas).orderBy(asc(obTestPersonas.sort_order)).all();

  // 批量拉取 CDP 上下文 + 外呼任务数据
  const results = await Promise.all(personas.map(async (p) => {
    const ctx = await fetchPartyContext(p.party_id);
    const personaContext = ctx ? buildPersonaContext(ctx) : { phone: '', name: p.id };

    // 外呼 persona：附加任务数据
    if (p.task_id) {
      const taskRows = db.select().from(obTasks).where(eq(obTasks.id, p.task_id)).all();
      if (taskRows.length > 0) {
        const task = taskRows[0];
        try {
          const taskData = JSON.parse(task.data);
          const langData = taskData[lang] ?? taskData.zh ?? taskData;
          Object.assign(personaContext, {
            task_type: task.task_type,
            outbound_task_id: task.id,
            ...langData,
          });
        } catch { /* ignore */ }
      }
    }

    const name = (personaContext as Record<string, string>).name ?? p.id;
    return {
      id: p.id,
      label: name,
      category: p.category,
      context: personaContext,
    };
  }));

  return c.json(results);
});

export default router;
