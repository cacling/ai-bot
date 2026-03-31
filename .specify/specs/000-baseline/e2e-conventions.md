# E2E 测试规范

> 本项目 E2E 测试基于 [Playwright](https://playwright.dev/)，在真实浏览器中操作完整 UI。

## 1. 前置条件

```bash
# 启动全栈服务（后端 + MCP + 前端 + km_service）
./start.sh --reset

# 服务端口
# frontend(:5173)  backend(:18472)  km_service(:18010)  MCP(:18003-18007)
```

所有 E2E 测试假设服务已通过 `start.sh` 启动。全局 setup（`global-setup.ts`）会自动 seed 数据库，可通过 `PLAYWRIGHT_SKIP_GLOBAL_SEED=1` 跳过。

## 2. 目录结构

```
frontend/tests/e2e/
├── playwright.config.ts          # 主配置（projects: skills / platform）
├── global-setup.ts               # 全局：seed DB
├── fixtures/
│   ├── chat-helpers.ts           # waitForChatWs, sendMessage, waitForBotReply, getLastBotReply
│   └── outbound-helpers.ts       # WebSocket outbound 测试客户端
├── skills/                       # 业务技能 SOP 测试（跟随技能变更）
│   ├── inbound/                  # 入呼技能（bill-inquiry, fault-diagnosis, ...）
│   └── outbound/                 # 外呼技能（outbound-collection, ...）
└── platform/                     # 平台功能测试（跟随代码变更）
    ├── agent/                    # 坐席工作台（登录、流程图、卡片）
    ├── chat/                     # 文字/语音客服 UI
    ├── api/                      # REST API 契约
    ├── skill-mgmt/               # 技能管理（生命周期、版本、状态图工作台）
    ├── km/                       # 知识管理（文档、候选、审核、资产）
    └── mcp/                      # MCP Server/Tool/Connector 管理
```

## 3. 文件命名

```
<主题>.<测试类型>.spec.ts
```

| 测试类型 | 含义 | 示例 |
|---------|------|------|
| `sop` | SOP 多轮对话验证 | `bill-inquiry.sop.spec.ts` |
| `ui` | UI 交互与渲染 | `diagram-workbench.ui.spec.ts` |
| `crud` | 增删改查全流程 | `skill-lifecycle.crud.spec.ts` |
| `contract` | API 契约合规 | `endpoints.contract.spec.ts` |
| `validate` | 校验规则验证 | `sandbox-validation.validate.spec.ts` |
| `constraint` | 约束/守卫验证 | `sop-guard.constraint.spec.ts` |
| `audit` | 审计/治理验证 | `governance.audit.spec.ts` |
| `e2e` | 端到端全流程 | `staff-auth.e2e.spec.ts` |

## 4. 用例编号

每个 `test()` 的第一个参数以 `<前缀>-<编号>:` 开头，前缀取自文件主题的缩写。

```typescript
test('WB-01: 状态图工作台 tab 在编辑时可见', async ({ page }) => { ... });
test('WB-02: 切换到工作台后显示编辑器和预览', async ({ page }) => { ... });
```

## 5. 登录与认证

坐席端（`/staff/*`）和运营管理（`/staff/operations/*`）路由受认证保护。测试前必须先登录。

### Seed 账号

| 用户名 | 密码 | 角色 | 登录后跳转 |
|--------|------|------|-----------|
| `demo` | `123456` | agent + operations (admin) | `/staff/workbench` |
| `zhang.qi` | `123456` | agent | `/staff/workbench` |
| `li.na` | `123456` | agent | `/staff/workbench` |
| `wang.lei` | `123456` | agent | `/staff/workbench` |
| `chen.min` | `123456` | operations | `/staff/operations` |
| `zhao.ning` | `123456` | operations | `/staff/operations` |

### 登录 helper

```typescript
const BASE = 'http://localhost:5173';

async function login(page: Page, username: string, password: string) {
  await page.goto(`${BASE}/staff/login`);
  await page.getByLabel('账号').fill(username);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
}
```

### 角色要求

| 目标页面 | 所需角色 | 推荐账号 |
|---------|---------|---------|
| `/staff/workbench` | agent | `demo`, `zhang.qi` |
| `/staff/operations/knowledge/skills` | operations | `demo`, `chen.min` |
| `/staff/operations/knowledge/documents` | operations | `demo`, `chen.min` |
| `/staff/operations/knowledge/tools` | operations | `demo`, `chen.min` |

## 6. 导航约定

### 路由架构

- `/` — 客户聊天页（无需登录）
- `/staff/login` — 员工登录
- `/staff/workbench` — 坐席工作台（需 agent 角色）
- `/staff/operations/knowledge/documents` — 知识管理
- `/staff/operations/knowledge/skills` — 技能管理
- `/staff/operations/knowledge/tools` — 工具管理
- `/agent/*` — 旧路径，自动重定向到 `/staff/*`

### 导航到技能管理的标准模式

登录后直接 goto 目标路由（SPA 侧边栏展开/子菜单点击在 E2E 中不稳定）：

```typescript
await login(page, 'demo', '123456');
await page.waitForURL('**/staff/workbench', { timeout: 10_000 });
await page.goto(`${BASE}/staff/operations/knowledge/skills`);
```

## 7. 运行方式

```bash
cd frontend/tests/e2e

# 全部测试
npx playwright test

# 只跑平台功能
npx playwright test --project=platform

# 只跑业务技能
npx playwright test --project=skills

# 单个文件
npx playwright test platform/skill-mgmt/diagram-workbench.ui.spec.ts

# 有头模式（打开浏览器，适合调试）
npx playwright test --headed

# 跳过 DB seed
PLAYWRIGHT_SKIP_GLOBAL_SEED=1 npx playwright test --headed

# HTML 报告
npx playwright show-report
```

## 8. 编写规范

### 结构模板

```typescript
import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://localhost:5173';

async function login(page: Page, username: string, password: string) {
  await page.goto(`${BASE}/staff/login`);
  await page.getByLabel('账号').fill(username);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
}

test.describe.serial('功能名称', () => {
  test.setTimeout(60_000);

  test('XX-01: 用例描述', async ({ page }) => {
    await login(page, 'demo', '123456');
    await page.waitForURL('**/staff/workbench', { timeout: 10_000 });
    // ... 测试逻辑
  });
});
```

### 注意事项

- **串行执行**：使用 `test.describe.serial()` 保证用例按顺序执行（workers=1）。
- **等待策略**：优先用 `expect(locator).toBeVisible({ timeout })` 等 Playwright 自动等待，少用 `waitForTimeout`。必须用时控制在合理范围（1-3s 页面切换，3-5s 异步数据加载）。
- **定位器**：优先 `getByText`、`getByRole`、`getByLabel`；次选 `locator('.class')`；避免脆弱的 CSS 选择器。
- **截图和视频**：配置为 `only-on-failure`，失败时自动保存到 `test-results/`。
- **代理**：Playwright 配置中已删除 `ALL_PROXY`/`HTTP_PROXY`/`HTTPS_PROXY`，防止 localhost 连接被代理拦截。
- **共享 fixture**：聊天相关的 helper 放在 `fixtures/chat-helpers.ts`，新增通用 helper 也放在 `fixtures/` 下。
