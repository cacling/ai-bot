/**
 * tool-result.ts — 工具返回结果的通用判断逻辑
 *
 * 集中管理"工具是否返回空数据"的正则匹配，
 * 避免在 runner.ts、voice.ts、handoff-analyzer.ts 中重复定义。
 */

/**
 * 判断工具返回的文本是否表示"无数据"（区别于"工具失败"）。
 * 匹配常见的中英文空结果表述。
 */
export const NO_DATA_RE = /没找到|未找到|不存在|没有.*记录|无记录|null|not.?found/i;

/** 便捷函数：检查工具结果文本是否为空数据 */
export function isNoDataResult(text: string): boolean {
  return NO_DATA_RE.test(text);
}

/**
 * 判断工具返回结果是否表示"执行失败"。
 * 支持 string 和 MCP 格式 { content: [{ type: 'text', text: '...' }] }。
 */
export function isErrorResult(result: unknown): boolean {
  try {
    let text = '';
    if (typeof result === 'string') {
      text = result;
    } else if (result && typeof result === 'object' && 'content' in result) {
      text = (result as any).content?.[0]?.text ?? '';
    }
    if (text.startsWith('Error:')) return true;
    const parsed = JSON.parse(text);
    return parsed.success === false || parsed.error !== undefined;
  } catch {
    return false;
  }
}
