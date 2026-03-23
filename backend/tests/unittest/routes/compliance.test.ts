/**
 * compliance.test.ts — 合规拦截集成测试
 *
 * 测试坐席/Bot 消息的端到端合规处理流程。
 * 基础 checkCompliance 单元测试在 keyword-filter.test.ts 中覆盖。
 */

import { describe, test, expect } from 'bun:test';
import {
  checkCompliance,
  sanitizeText,
  maskPII,
} from '../../../src/services/keyword-filter.ts';

describe('合规拦截集成 — Bot 回复处理流程', () => {
  test('banned 回复经过 sanitizeText 后违规词被替换', () => {
    const botReply = '这不是我负责的，你自己去查吧';
    const compliance = checkCompliance(botReply);
    const sanitized = sanitizeText(botReply, compliance.matches);
    expect(sanitized).not.toContain('这不是我负责的');
    expect(sanitized).not.toContain('你自己去查');
    expect(sanitized).toContain('***');
  });

  test('PII 回复经过 maskPII 后敏感信息被脱敏', () => {
    const botReply = '您的身份证号是110101199001011234，已核实';
    const compliance = checkCompliance(botReply);
    const masked = maskPII(botReply, compliance.piiMatches);
    expect(masked).not.toContain('110101199001011234');
    expect(masked).toContain('****');
  });
});

describe('合规拦截集成 — 坐席特定场景', () => {
  test('催收违规用语被拦截', () => {
    const msgs = ['不还钱就起诉你', '通知你家人', '催什么催'];
    for (const msg of msgs) {
      expect(checkCompliance(msg).hasBlock).toBe(true);
    }
  });

  test('态度恶劣用语被拦截', () => {
    const msgs = ['你怎么这么烦', '你听不懂吗', '爱办不办'];
    for (const msg of msgs) {
      expect(checkCompliance(msg).hasBlock).toBe(true);
    }
  });

  test('过度承诺用语触发告警但不阻止', () => {
    const msgs = ['绝对不会出问题', '百分之百能解决', '永远不会再发生'];
    for (const msg of msgs) {
      const r = checkCompliance(msg);
      expect(r.hasWarning).toBe(true);
      expect(r.hasBlock).toBe(false);
    }
  });
});
