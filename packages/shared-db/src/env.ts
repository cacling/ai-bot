/**
 * 统一数据库路径解析
 *
 * 所有消费方（backend / mcp_servers）都通过此函数获取 DB 文件路径，
 * 不再各自硬编码默认路径。
 *
 * 优先级：
 * 1. SQLITE_PATH 环境变量（绝对路径）
 * 2. fallbackPath 参数（调用方提供的默认值）
 */
export function resolveSqlitePath(fallbackPath?: string): string {
  const envPath = process.env.SQLITE_PATH;
  if (envPath) return envPath;
  if (fallbackPath) return fallbackPath;
  throw new Error('SQLITE_PATH environment variable is not set and no fallback path provided');
}
