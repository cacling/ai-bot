import { describe, test, expect } from 'bun:test';
import { validateFrontmatter, parseFrontmatter, extractFrontmatterRaw } from '../../../../../backend/skills/tech-skills/skill-creator-spec/scripts/validate_frontmatter.ts';

// ── 正例 fixture ──

const VALID_FM = `---
name: service-cancel
description: 增值业务退订与误订退款技能
metadata:
  version: "3.0.0"
  tags: ["cancel", "unsubscribe", "value-added", "service", "refund"]
  mode: inbound
  trigger: user_intent
  channels: ["online", "voice"]
---
# 退订业务`;

const VALID_FM_LIST_STYLE = `---
name: outbound-collection
description: 外呼催收技能
metadata:
  version: "1.0.0"
  tags:
    - collection
    - outbound
    - overdue
  mode: outbound
  trigger: task_dispatch
  channels:
    - outbound-collection
---
# 催收技能`;

// ── 反例 fixture ──

const NO_FM = `# 退订业务\n\n没有 frontmatter`;

const MISSING_NAME = `---
description: 测试
metadata:
  version: "1.0.0"
  tags: ["a", "b", "c"]
  mode: inbound
  trigger: user_intent
  channels: ["online"]
---`;

const BAD_NAME = `---
name: ServiceCancel
description: 测试
metadata:
  version: "1.0.0"
  tags: ["a", "b", "c"]
  mode: inbound
  trigger: user_intent
  channels: ["online"]
---`;

const BAD_VERSION = `---
name: test-skill
description: 测试
metadata:
  version: "1.0"
  tags: ["a", "b", "c"]
  mode: inbound
  trigger: user_intent
  channels: ["online"]
---`;

const BAD_MODE = `---
name: test-skill
description: 测试
metadata:
  version: "1.0.0"
  tags: ["a", "b", "c"]
  mode: hybrid
  trigger: user_intent
  channels: ["online"]
---`;

const OUTBOUND_WITH_ONLINE = `---
name: test-skill
description: 测试
metadata:
  version: "1.0.0"
  tags: ["a", "b", "c"]
  mode: outbound
  trigger: task_dispatch
  channels: ["online", "outbound-collection"]
---`;

const TOO_FEW_TAGS = `---
name: test-skill
description: 测试
metadata:
  version: "1.0.0"
  tags: ["a", "b"]
  mode: inbound
  trigger: user_intent
  channels: ["online"]
---`;

const EMPTY_CHANNELS = `---
name: test-skill
description: 测试
metadata:
  version: "1.0.0"
  tags: ["a", "b", "c"]
  mode: inbound
  trigger: user_intent
  channels: []
---`;

// ── 测试 ──

describe('extractFrontmatterRaw', () => {
  test('提取正常 frontmatter', () => {
    const raw = extractFrontmatterRaw(VALID_FM);
    expect(raw).toBeTruthy();
    expect(raw).toContain('name: service-cancel');
  });

  test('无 frontmatter 返回 null', () => {
    expect(extractFrontmatterRaw(NO_FM)).toBeNull();
  });
});

describe('parseFrontmatter', () => {
  test('解析 inline 数组', () => {
    const raw = extractFrontmatterRaw(VALID_FM)!;
    const fm = parseFrontmatter(raw);
    expect(fm.name).toBe('service-cancel');
    expect(fm.description).toBe('增值业务退订与误订退款技能');
    expect(fm.metadata?.version).toBe('3.0.0');
    expect(fm.metadata?.tags).toEqual(['cancel', 'unsubscribe', 'value-added', 'service', 'refund']);
    expect(fm.metadata?.mode).toBe('inbound');
    expect(fm.metadata?.channels).toEqual(['online', 'voice']);
  });

  test('解析 YAML 列表语法', () => {
    const raw = extractFrontmatterRaw(VALID_FM_LIST_STYLE)!;
    const fm = parseFrontmatter(raw);
    expect(fm.name).toBe('outbound-collection');
    expect(fm.metadata?.tags).toEqual(['collection', 'outbound', 'overdue']);
    expect(fm.metadata?.channels).toEqual(['outbound-collection']);
  });
});

describe('validateFrontmatter', () => {
  test('正确的 frontmatter 无 error', () => {
    const checks = validateFrontmatter(VALID_FM);
    const errors = checks.filter(c => c.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('缺少 frontmatter', () => {
    const checks = validateFrontmatter(NO_FM);
    expect(checks.some(c => c.rule === 'fm.missing')).toBe(true);
  });

  test('缺少 name', () => {
    const checks = validateFrontmatter(MISSING_NAME);
    expect(checks.some(c => c.rule === 'fm.name_missing')).toBe(true);
  });

  test('name 格式错误', () => {
    const checks = validateFrontmatter(BAD_NAME);
    expect(checks.some(c => c.rule === 'fm.name_format')).toBe(true);
  });

  test('version 格式错误', () => {
    const checks = validateFrontmatter(BAD_VERSION);
    expect(checks.some(c => c.rule === 'fm.version_format')).toBe(true);
  });

  test('mode 无效', () => {
    const checks = validateFrontmatter(BAD_MODE);
    expect(checks.some(c => c.rule === 'fm.mode_invalid')).toBe(true);
  });

  test('outbound 绑定 online 渠道', () => {
    const checks = validateFrontmatter(OUTBOUND_WITH_ONLINE);
    expect(checks.some(c => c.rule === 'fm.mode_channel_mismatch')).toBe(true);
  });

  test('tags 过少', () => {
    const checks = validateFrontmatter(TOO_FEW_TAGS);
    expect(checks.some(c => c.rule === 'fm.tags_too_few')).toBe(true);
  });

  test('channels 为空', () => {
    const checks = validateFrontmatter(EMPTY_CHANNELS);
    expect(checks.some(c => c.rule === 'fm.channels_missing')).toBe(true);
  });
});
