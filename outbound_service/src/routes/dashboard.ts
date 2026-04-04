/**
 * dashboard.ts — 外呼效果看板聚合端点
 */
import { Hono } from 'hono';
import { db, obCampaigns, obTasks, obCallResults, obMarketingResults, sql } from '../db';

const app = new Hono();

// GET / — 聚合统计
app.get('/', async (c) => {
  // 1. 总任务统计
  const [taskStats] = await db.select({
    total: sql<number>`count(*)`,
    completed: sql<number>`sum(case when ${obTasks.status} = 'completed' then 1 else 0 end)`,
    in_progress: sql<number>`sum(case when ${obTasks.status} = 'in_progress' then 1 else 0 end)`,
    pending: sql<number>`sum(case when ${obTasks.status} = 'pending' then 1 else 0 end)`,
  }).from(obTasks);

  // 2. 催收通话结果分布
  const callResultDist = await db.select({
    result: obCallResults.result,
    count: sql<number>`count(*)`,
  }).from(obCallResults).groupBy(obCallResults.result);

  // 3. 营销结果分布
  const mktResultDist = await db.select({
    result: obMarketingResults.result,
    count: sql<number>`count(*)`,
  }).from(obMarketingResults).groupBy(obMarketingResults.result);

  // 合并结果分布
  const resultDistribution: Record<string, number> = {};
  for (const r of callResultDist) {
    resultDistribution[r.result] = (resultDistribution[r.result] ?? 0) + (r.count ?? 0);
  }
  for (const r of mktResultDist) {
    resultDistribution[r.result] = (resultDistribution[r.result] ?? 0) + (r.count ?? 0);
  }

  // 4. 按活动聚合
  const campaigns = await db.select().from(obCampaigns);
  const byCampaign = [];

  for (const camp of campaigns) {
    // 该活动的任务数
    const [ts] = await db.select({
      total: sql<number>`count(*)`,
      completed: sql<number>`sum(case when ${obTasks.status} = 'completed' then 1 else 0 end)`,
    }).from(obTasks).where(sql`${obTasks.campaign_id} = ${camp.campaign_id}`);

    // 该活动的营销结果
    const [mr] = await db.select({
      total: sql<number>`count(*)`,
      converted: sql<number>`sum(case when ${obMarketingResults.result} = 'converted' then 1 else 0 end)`,
      no_answer: sql<number>`sum(case when ${obMarketingResults.result} in ('no_answer', 'busy') then 1 else 0 end)`,
    }).from(obMarketingResults).where(sql`${obMarketingResults.campaign_id} = ${camp.campaign_id}`);

    const total = ts?.total ?? 0;
    const mktTotal = mr?.total ?? 0;
    const connected = mktTotal - (mr?.no_answer ?? 0);
    const converted = mr?.converted ?? 0;

    byCampaign.push({
      campaign_id: camp.campaign_id,
      campaign_name: camp.campaign_name,
      status: camp.status,
      total_tasks: total,
      completed_tasks: ts?.completed ?? 0,
      total_results: mktTotal,
      connected,
      converted,
      connect_rate: mktTotal > 0 ? Math.round((connected / mktTotal) * 100) : 0,
      conversion_rate: connected > 0 ? Math.round((converted / connected) * 100) : 0,
    });
  }

  // 5. 催收整体统计
  const totalResults = Object.values(resultDistribution).reduce((a, b) => a + b, 0);
  const noAnswerBusy = (resultDistribution['no_answer'] ?? 0) + (resultDistribution['busy'] ?? 0);
  const connectedTotal = totalResults - noAnswerBusy;
  const convertedPtp = (resultDistribution['converted'] ?? 0) + (resultDistribution['ptp'] ?? 0);

  const overall = {
    total_tasks: taskStats?.total ?? 0,
    completed: taskStats?.completed ?? 0,
    in_progress: taskStats?.in_progress ?? 0,
    pending: taskStats?.pending ?? 0,
    total_results: totalResults,
    connect_rate: totalResults > 0 ? Math.round((connectedTotal / totalResults) * 100) : 0,
    conversion_rate: connectedTotal > 0 ? Math.round((convertedPtp / connectedTotal) * 100) : 0,
    ptp_rate: connectedTotal > 0 ? Math.round(((resultDistribution['ptp'] ?? 0) / connectedTotal) * 100) : 0,
  };

  return c.json({ overall, by_campaign: byCampaign, result_distribution: resultDistribution });
});

export default app;
