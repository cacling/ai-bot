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
