import { generateObject } from 'ai';
import { z } from 'zod';
import { siliconflow } from '../../engine/llm';
import { type NormalizedSlots } from './types';
import { logger } from '../../services/logger';

const NORMALIZER_MODEL = siliconflow(
  process.env.QUERY_NORMALIZER_MODEL ?? 'stepfun-ai/Step-3.5-Flash'
);

const LlmNormalizeSchema = z.object({
  rewritten_query: z.string().describe('标准化改写，中文，不扩大请求范围'),
  intent_hints: z.array(z.string()).describe('意图提示，如 bill_inquiry, service_cancel'),
  additional_slots: z.record(z.string()).describe('补充槽位，key 为字段名，value 为标准术语'),
  ambiguities: z.array(z.object({
    field: z.string(),
    candidates: z.array(z.string()),
  })).describe('无法确定的歧义'),
});

export type LlmFallbackResult = z.infer<typeof LlmNormalizeSchema>;

export function buildFallbackPrompt(original: string, rulesSlots: Partial<NormalizedSlots>): string {
  return `你是电信客服系统的输入标准化助手。用户原话如下：

"${original}"

规则引擎已识别的部分：
${JSON.stringify(rulesSlots, null, 2)}

请补全以下内容：
1. rewritten_query：将用户原话改写为标准化的客服工单描述（中文）
2. intent_hints：识别用户意图（如 bill_inquiry, service_cancel, fault_report 等）
3. additional_slots：补充规则引擎未识别的槽位（可选字段：service_category, service_subtype, issue_type, action_type, network_issue_type, account_state）
4. ambiguities：标记无法确定的歧义

要求：
- 不要扩大用户的请求范围
- 不要添加用户未提到的业务承诺
- 如果无法确定，放入 ambiguities 而不是猜测`;
}

export async function llmFallback(
  original: string,
  rulesSlots: Partial<NormalizedSlots>,
  timeout: number = 2000,
): Promise<LlmFallbackResult | null> {
  const prompt = buildFallbackPrompt(original, rulesSlots);

  try {
    const result = await Promise.race([
      generateObject({
        model: NORMALIZER_MODEL,
        schema: LlmNormalizeSchema,
        prompt,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('llm_fallback_timeout')), timeout)
      ),
    ]);

    logger.info('query-normalizer', 'llm_fallback_ok', {
      original,
      rewritten: result.object.rewritten_query,
      intent_hints: result.object.intent_hints,
    });

    return result.object;
  } catch (err) {
    logger.warn('query-normalizer', 'llm_fallback_failed', { original, error: String(err) });
    return null;
  }
}
