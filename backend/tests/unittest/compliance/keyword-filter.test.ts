/**
 * keyword-filter.test.ts — 合规用语拦截引擎测试
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  checkCompliance,
  maskPII,
  sanitizeText,
  getAllKeywords,
  addKeyword,
  removeKeyword,
  reloadKeywords,
  type ComplianceResult,
} from '../../../src/services/keyword-filter.ts';

describe('checkCompliance — AC 自动机关键词匹配', () => {
  test('检测 banned 关键词', () => {
    const result = checkCompliance('这不是我负责的，你自己去查吧');
    expect(result.hasBlock).toBe(true);
    expect(result.matches.length).toBeGreaterThanOrEqual(2);
    expect(result.matches.some(m => m.keyword === '这不是我负责的')).toBe(true);
    expect(result.matches.some(m => m.keyword === '你自己去查')).toBe(true);
  });

  test('检测 warning 关键词', () => {
    const result = checkCompliance('我保证能帮您解决这个问题');
    expect(result.hasWarning).toBe(true);
    expect(result.hasBlock).toBe(false);
    expect(result.matches.some(m => m.keyword === '保证能' && m.category === 'warning')).toBe(true);
  });

  test('正常文本无匹配', () => {
    const result = checkCompliance('您好，请问有什么可以帮您？');
    expect(result.hasBlock).toBe(false);
    expect(result.hasWarning).toBe(false);
    expect(result.matches.length).toBe(0);
  });

  test('空文本无匹配', () => {
    const result = checkCompliance('');
    expect(result.hasBlock).toBe(false);
    expect(result.matches.length).toBe(0);
  });

  test('催收违规用语检测', () => {
    const result = checkCompliance('你再不还钱就起诉你，然后通知你家人');
    expect(result.hasBlock).toBe(true);
    expect(result.matches.some(m => m.keyword === '不还钱就起诉你')).toBe(true);
    expect(result.matches.some(m => m.keyword === '通知你家人')).toBe(true);
  });

  test('同时包含 banned 和 warning', () => {
    const result = checkCompliance('我不知道，但我保证能帮你');
    expect(result.hasBlock).toBe(true);
    expect(result.hasWarning).toBe(true);
  });
});

describe('PII 检测', () => {
  test('检测身份证号', () => {
    const result = checkCompliance('您的身份证号是110101199001011234');
    expect(result.hasPII).toBe(true);
    expect(result.piiMatches.some(m => m.type === 'id_card')).toBe(true);
  });

  test('检测银行卡号（16位）', () => {
    const result = checkCompliance('卡号是6222021234567890123');
    expect(result.hasPII).toBe(true);
    expect(result.piiMatches.some(m => m.type === 'bank_card')).toBe(true);
  });

  test('正常手机号不误报', () => {
    const result = checkCompliance('您的手机号是13800000001');
    // 11 位手机号不应匹配身份证或银行卡正则
    expect(result.piiMatches.length).toBe(0);
  });
});

describe('maskPII — PII 脱敏', () => {
  test('身份证号脱敏', () => {
    const masked = maskPII('身份证110101199001011234已验证');
    expect(masked).toContain('1101');
    expect(masked).toContain('1234');
    expect(masked).toContain('*');
    expect(masked).not.toContain('110101199001011234');
  });

  test('无 PII 时原文返回', () => {
    const text = '您好，请问有什么问题？';
    expect(maskPII(text)).toBe(text);
  });
});

describe('sanitizeText — 违规词替换', () => {
  test('banned 词替换为 ***', () => {
    const result = sanitizeText('这不是我负责的，请找别人');
    expect(result).toContain('***');
    expect(result).not.toContain('这不是我负责的');
  });

  test('warning 词不被替换', () => {
    const text = '我保证能帮您处理';
    const result = sanitizeText(text);
    expect(result).toBe(text); // warning 不做替换
  });
});

describe('词库管理', () => {
  test('添加自定义关键词', () => {
    const before = getAllKeywords().length;
    const entry = addKeyword('测试违规词', 'banned', '测试用');
    expect(entry.id).toContain('custom_');
    expect(getAllKeywords().length).toBe(before + 1);

    // 验证新词可以被检测到
    const result = checkCompliance('这是一个测试违规词');
    expect(result.hasBlock).toBe(true);
    expect(result.matches.some(m => m.keyword === '测试违规词')).toBe(true);

    // 清理
    removeKeyword(entry.id);
  });

  test('删除关键词', () => {
    const entry = addKeyword('临时词', 'warning');
    expect(removeKeyword(entry.id)).toBe(true);
    expect(removeKeyword(entry.id)).toBe(false); // 重复删除返回 false

    // 验证已删除的词不再被检测
    const result = checkCompliance('包含临时词的文本');
    expect(result.matches.some(m => m.keyword === '临时词')).toBe(false);
  });

  test('删除不存在的 ID 返回 false', () => {
    expect(removeKeyword('nonexistent_id')).toBe(false);
  });

  test('热重载词库', () => {
    const before = getAllKeywords().length;
    reloadKeywords(); // 不传参数，用现有词库重建
    expect(getAllKeywords().length).toBe(before);
  });
});
