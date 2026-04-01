# 测试分层规范

**功能**: 000-baseline | **日期**: 2026-04-01

## 四层测试模型

| 层级 | 目录 | 依赖 | 运行时机 | 速度目标 |
|------|------|------|---------|---------|
| **Unit Test** | `tests/unittest/` | 零外部依赖（无 DB、无 HTTP、无服务） | 每次代码变更 | < 3s |
| **API Test** | `tests/apitest/` | 需要目标服务运行（单个服务） | 服务变更后 | < 10s |
| **Integration Test** | `tests/integration/` | 需要多个服务运行（跨服务调用） | 全栈启动后 | < 30s |
| **E2E Test** | `tests/e2e/` | 需要全栈运行（含前端） | 发布前 | < 5min |

## Unit Test 规范

**原则**：完全隔离，不依赖任何外部进程、数据库或网络。

**允许**：
- `mock.module()` mock 外部模块（km-client、cdp-client 等）
- `mock()` mock 函数
- 内存数据（构造测试对象）
- 文件系统读取（读取 fixture 文件）

**禁止**：
- 直接 `fetch()` 调用外部服务
- 直接读写数据库（SQLite / Drizzle query）
- 依赖 `start.sh` 或服务启动
- 依赖 seed 数据

**目录结构**：
```
tests/unittest/
├── preload.ts           # --preload：全局 mock km-client 等外部依赖
├── engine/              # 引擎层测试
├── services/            # 服务层测试
├── chat/                # 对话层测试
├── tool-runtime/        # 工具运行时测试
│   └── _mock-km-client.ts  # （已废弃，由 preload.ts 替代）
└── workflow/            # 工作流测试
```

**运行命令**：
```bash
bun test --preload tests/unittest/preload.ts tests/unittest/
```

## API Test 规范

**原则**：测试单个服务的 HTTP API 合约（输入/输出格式、状态码）。

**前置条件**：目标服务已启动。

**允许**：
- `fetch()` 调用目标服务 API
- 验证响应 JSON 结构和状态码

**禁止**：
- 直接读写目标服务的数据库
- 依赖其他服务（如 CDP API Test 不应依赖 km_service）

**目录结构**：
```
tests/apitest/
├── internal.test.ts     # 内部 API（km_service）
├── cdp.test.ts          # CDP Service API
└── ...
```

**运行命令**：
```bash
# 先启动目标服务，再跑测试
bun test tests/apitest/
```

## Integration Test 规范

**原则**：测试跨服务调用链路（如 backend → km_service、backend → CDP Service）。

**前置条件**：相关服务已启动。

**允许**：
- 通过 HTTP client 调用服务 API
- 验证跨服务数据一致性

**禁止**：
- 直接读写任何服务的数据库

**目录结构**：
```
tests/integration/
├── km-client.test.ts      # backend → km_service
├── km-proxy.test.ts       # backend proxy → km_service
├── seed-integrity.test.ts # seed 数据完整性
└── ...
```

**运行命令**：
```bash
# 需要 km_service + backend 运行
bun test tests/integration/
```

## E2E Test 规范

**原则**：模拟真实用户操作，验证全栈功能。

**前置条件**：通过 `./start.sh --reset` 启动全部服务（重置 DB + seed + 全栈启动）。

**工具**：Playwright

**目录结构**：
```
frontend/tests/e2e/
├── global-setup.ts     # 全局初始化（schema push + seed）
├── fixtures/           # 页面辅助函数
└── platform/           # 测试用例
```

**运行命令**：
```bash
# 1. 启动全栈（必须用 --reset 确保干净数据）
./start.sh --reset

# 2. 另开终端运行 E2E
cd frontend/tests/e2e && npx playwright test
```

## 命名约定

| 文件 | 格式 |
|------|------|
| Unit test | `<module>.test.ts` |
| API test | `<service>.test.ts` |
| Integration test | `<client>-<service>.test.ts` 或 `<feature>.test.ts` |
| E2E test | `<feature>.spec.ts` 或 `<feature>.ui.spec.ts` |

## 违反检查

如果 unit test 中出现以下模式，应移到更高层级：
- `fetch('http://localhost:...')` → 移到 apitest 或 integration
- `db.select()` / `db.insert()` → 移到 integration 或改为 mock
- `execSync('bun run db:seed')` → 移到 e2e global-setup
