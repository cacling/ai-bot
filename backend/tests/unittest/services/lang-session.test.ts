/**
 * lang-session.test.ts — 语言状态管理测试
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { setCustomerLang, setAgentLang, getLangs } from '../../../src/services/lang-session';

describe('lang-session — 语言状态管理', () => {
  const phone = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  test('默认语言为 zh', () => {
    const uniquePhone = `default-${Date.now()}`;
    const langs = getLangs(uniquePhone);
    expect(langs.customer).toBe('zh');
    expect(langs.agent).toBe('zh');
  });

  test('setCustomerLang 设置客户语言', () => {
    const p = `cust-${Date.now()}`;
    setCustomerLang(p, 'en');
    const langs = getLangs(p);
    expect(langs.customer).toBe('en');
    expect(langs.agent).toBe('zh'); // agent 仍为默认值
  });

  test('setAgentLang 设置坐席语言', () => {
    const p = `agent-${Date.now()}`;
    setAgentLang(p, 'en');
    const langs = getLangs(p);
    expect(langs.agent).toBe('en');
    expect(langs.customer).toBe('zh'); // customer 仍为默认值
  });

  test('分别设置客户和坐席语言', () => {
    const p = `both-${Date.now()}`;
    setCustomerLang(p, 'en');
    setAgentLang(p, 'zh');
    const langs = getLangs(p);
    expect(langs.customer).toBe('en');
    expect(langs.agent).toBe('zh');
  });

  test('覆盖语言设置', () => {
    const p = `override-${Date.now()}`;
    setCustomerLang(p, 'en');
    expect(getLangs(p).customer).toBe('en');
    setCustomerLang(p, 'zh');
    expect(getLangs(p).customer).toBe('zh');
  });

  test('不同 phone 的语言设置互相隔离', () => {
    const p1 = `iso1-${Date.now()}`;
    const p2 = `iso2-${Date.now()}`;
    setCustomerLang(p1, 'en');
    setCustomerLang(p2, 'zh');
    expect(getLangs(p1).customer).toBe('en');
    expect(getLangs(p2).customer).toBe('zh');
  });
});
