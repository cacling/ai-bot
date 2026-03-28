/**
 * queue-service.ts — 队列 CRUD
 */
import { db, workQueues, workItems, eq } from "../db.js";

/**
 * 列出所有活跃队列
 */
export async function listQueues() {
  return db.select().from(workQueues)
    .where(eq(workQueues.active, 1))
    .all();
}

/**
 * 获取单个队列
 */
export async function getQueue(code: string) {
  return db.select().from(workQueues)
    .where(eq(workQueues.code, code))
    .get();
}

/**
 * 分配工单到队列
 */
export async function assignToQueue(itemId: string, queueCode: string) {
  const queue = await getQueue(queueCode);
  if (!queue) return { success: false, error: `队列 ${queueCode} 不存在` };

  await db.update(workItems).set({
    queue_code: queueCode,
    updated_at: new Date().toISOString(),
  }).where(eq(workItems.id, itemId)).run();

  return { success: true };
}
