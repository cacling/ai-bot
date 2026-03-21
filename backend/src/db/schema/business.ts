/**
 * 业务表 — re-export from @ai-bot/shared-db
 *
 * backend 不直接定义业务表，统一从共享包获取。
 * 运行时 backend 不应直接读写这些表（应通过 MCP tool），
 * 但 seed.ts 和 drizzle push 仍需要 schema 定义。
 */
export {
  plans,
  valueAddedServices,
  subscribers,
  subscriberSubscriptions,
  bills,
  callbackTasks,
  contracts,
  deviceContexts,
} from '../../../../packages/shared-db/src/schema/business';

// 以下表从 business 迁移到 platform（运营/测试辅助数据）
// testPersonas 和 outboundTasks 现在从 platform.ts 导出
