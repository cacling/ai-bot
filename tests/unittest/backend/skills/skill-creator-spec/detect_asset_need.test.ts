import { describe, test, expect } from 'bun:test';
import { detectAssetNeed } from '../../../../../backend/skills/tech-skills/skill-creator-spec/scripts/detect_asset_need.ts';

const MULTI_CANCEL = `
## 多业务退订规则

- **每次只调用一次** cancel_service

\`\`\`mermaid
stateDiagram-v2
    [*] --> A
    A --> B: cancel_service(phone, id1) %% tool:cancel_service
    B --> C: cancel_service(phone, id2) %% tool:cancel_service
    C --> [*]
\`\`\`
`;

const MULTI_CANCEL_NO_RULE = `
\`\`\`mermaid
stateDiagram-v2
    [*] --> A
    A --> B: cancel_service(phone, id1) %% tool:cancel_service
    B --> C: cancel_service(phone, id2) %% tool:cancel_service
    C --> [*]
\`\`\`
`;

const SINGLE_TOOL = `
\`\`\`mermaid
stateDiagram-v2
    [*] --> A
    A --> B: cancel_service(phone, id) %% tool:cancel_service
    B --> [*]
\`\`\`
`;

const MULTI_QUERY = `
\`\`\`mermaid
stateDiagram-v2
    [*] --> A
    A --> B: query_subscriber(phone) %% tool:query_subscriber
    B --> C: query_subscriber(phone) %% tool:query_subscriber
    C --> [*]
\`\`\`
`;

describe('detectAssetNeed', () => {
  test('操作工具多次调用且无 assets → 报 warning', () => {
    const checks = detectAssetNeed(MULTI_CANCEL_NO_RULE, []);
    expect(checks.some(c => c.rule === 'asset.need_missing')).toBe(true);
  });

  test('操作工具多次调用且有 assets → 不报 need_missing', () => {
    const checks = detectAssetNeed(MULTI_CANCEL, [{ filename: 'cancel-result.md' }]);
    expect(checks.some(c => c.rule === 'asset.need_missing')).toBe(false);
  });

  test('有单步约束规则 → 不报 no_single_step_rule', () => {
    const checks = detectAssetNeed(MULTI_CANCEL, [{ filename: 'cancel-result.md' }]);
    expect(checks.some(c => c.rule === 'asset.no_single_step_rule')).toBe(false);
  });

  test('无单步约束规则 → 报 warning', () => {
    const checks = detectAssetNeed(MULTI_CANCEL_NO_RULE, []);
    expect(checks.some(c => c.rule === 'asset.no_single_step_rule')).toBe(true);
  });

  test('操作工具只出现一次 → 不需要 assets', () => {
    const checks = detectAssetNeed(SINGLE_TOOL, []);
    expect(checks).toHaveLength(0);
  });

  test('查询工具多次调用 → 不需要 assets', () => {
    const checks = detectAssetNeed(MULTI_QUERY, []);
    expect(checks).toHaveLength(0);
  });
});
