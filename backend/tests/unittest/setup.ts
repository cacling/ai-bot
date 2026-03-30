/**
 * 全局测试 setup — 由 bunfig.toml [test].preload 自动加载
 *
 * 核心职责：确保每个测试文件运行后清理 mock，防止模块缓存污染。
 *
 * bun:test 的隔离模型：
 * - 每个测试文件有独立的模块缓存（理论上）
 * - 但 mock.module() 可能污染后续文件的模块解析
 * - mock.restore() 清除所有 mock，恢复原始模块
 *
 * 规则：
 * 1. mock.module() 必须在 describe/test 块内调用，不要在文件顶层
 * 2. 如果必须在文件顶层 mock，对应文件必须在 afterAll 中调用 mock.restore()
 * 3. 优先用 spyOn() 替代 mock.module()（更细粒度，更易清理）
 */
import { afterAll, mock } from 'bun:test';

// 每个测试文件结束后自动清理所有 mock
afterAll(() => {
  mock.restore();
});
