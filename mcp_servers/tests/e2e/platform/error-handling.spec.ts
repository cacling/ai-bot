/**
 * MCP Server 异常处理 E2E 测试
 *
 * 验证后端依赖不可达时的优雅降级和错误响应格式。
 * 需要启动: MCP servers (mock_apis 可选——测试不可达场景时故意不启动)
 */
import { describe, test, expect } from 'bun:test';

describe('后端不可达', () => {
  test.skip('mock_apis 未启动时 tool 调用返回结构化错误', async () => {});
  test.skip('错误响应包含 success:false 和 message 字段', async () => {});
  test.skip('不会抛出未捕获异常导致 server crash', async () => {});
});

describe('超时处理', () => {
  test.skip('后端响应超慢时 tool 在合理时间内返回超时错误', async () => {});
});

describe('畸形输入', () => {
  test.skip('tool 参数类型错误时返回 Zod 校验错误', async () => {});
  test.skip('缺少必填参数时返回明确错误信息', async () => {});
  test.skip('额外未知参数被忽略不报错', async () => {});
});
