/**
 * L2 聚合读工具 — 将多个底层查询工具合并为单次调用
 *
 * get_bill_context   = query_subscriber + query_bill + analyze_bill_anomaly
 * get_plan_context   = query_subscriber + query_plans
 * get_cancel_context = query_subscriber + query_plans + query_bill
 *
 * 通过 ScriptAdapter 的 callTool 回调调用 MCP pool 中的底层工具。
 */
import { registerScriptHandler } from '../adapters/script-adapter';
import { logger } from '../../services/logger';

registerScriptHandler('aggregated.get_bill_context', async (args, callTool) => {
  const phone = args.phone as string;
  const month = args.month as string | undefined;

  const results = await Promise.allSettled([
    callTool('query_subscriber', { phone }),
    callTool('query_bill', { phone, month }),
    month ? callTool('analyze_bill_anomaly', { phone, month }) : Promise.resolve(null),
  ]);

  const subscriber = results[0].status === 'fulfilled' ? results[0].value : null;
  const bill = results[1].status === 'fulfilled' ? results[1].value : null;
  const anomaly = results[2].status === 'fulfilled' ? results[2].value : null;

  if (results[0].status === 'rejected') logger.warn('aggregated', 'sub_tool_failed', { handler: 'get_bill_context', sub: 'query_subscriber', error: String(results[0].reason) });
  if (results[1].status === 'rejected') logger.warn('aggregated', 'sub_tool_failed', { handler: 'get_bill_context', sub: 'query_bill', error: String(results[1].reason) });

  return { subscriber, bill, anomaly, _cardType: 'bill_card' };
});

registerScriptHandler('aggregated.get_plan_context', async (args, callTool) => {
  const phone = args.phone as string;

  const results = await Promise.allSettled([
    callTool('query_subscriber', { phone }),
    callTool('query_plans', {}),
  ]);

  const subscriber = results[0].status === 'fulfilled' ? results[0].value : null;
  const plans = results[1].status === 'fulfilled' ? results[1].value : null;

  if (results[0].status === 'rejected') logger.warn('aggregated', 'sub_tool_failed', { handler: 'get_plan_context', sub: 'query_subscriber', error: String(results[0].reason) });
  if (results[1].status === 'rejected') logger.warn('aggregated', 'sub_tool_failed', { handler: 'get_plan_context', sub: 'query_plans', error: String(results[1].reason) });

  return { subscriber, plans, _cardType: 'plan_card' };
});

registerScriptHandler('aggregated.get_cancel_context', async (args, callTool) => {
  const phone = args.phone as string;

  const results = await Promise.allSettled([
    callTool('query_subscriber', { phone }),
    callTool('query_plans', {}),
    callTool('query_bill', { phone }),
  ]);

  const subscriber = results[0].status === 'fulfilled' ? results[0].value : null;
  const plans = results[1].status === 'fulfilled' ? results[1].value : null;
  const bill = results[2].status === 'fulfilled' ? results[2].value : null;

  if (results[0].status === 'rejected') logger.warn('aggregated', 'sub_tool_failed', { handler: 'get_cancel_context', sub: 'query_subscriber', error: String(results[0].reason) });

  return { subscriber, plans, bill, _cardType: 'bill_card' };
});
