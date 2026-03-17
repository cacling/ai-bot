/**
 * lang-session.ts — 按 phone 存储客户侧与坐席侧的语言状态
 *
 * 默认双方均为 'zh'。
 * WebSocket 连接时由各自 handler 调用 setCustomerLang / setAgentLang 更新。
 * 语言切换时 WebSocket 重建，新连接自动更新语言状态。
 */

type Lang = 'zh' | 'en';

interface LangState {
  customer: Lang;
  agent: Lang;
}

const store = new Map<string, LangState>();

function get(phone: string): LangState {
  return store.get(phone) ?? { customer: 'zh', agent: 'zh' };
}

export function setCustomerLang(phone: string, lang: Lang): void {
  store.set(phone, { ...get(phone), customer: lang });
}

export function setAgentLang(phone: string, lang: Lang): void {
  store.set(phone, { ...get(phone), agent: lang });
}

export function getLangs(phone: string): LangState {
  return get(phone);
}
