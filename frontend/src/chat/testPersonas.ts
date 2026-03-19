/**
 * testPersonas.ts — test persona types + API fetch helpers
 * Data is loaded from the backend DB via /api/test-personas
 */
import type { Lang } from '../i18n';

export interface TestPersona {
  id: string;
  label: string;         // 已按 lang 选好
  category: string;      // 'inbound' | 'outbound_collection' | 'outbound_marketing'
  tag: string;
  tagColor: string;
  context: Record<string, unknown>;  // 平台不解析，透传给 agent
}

export async function fetchTestPersonas(category?: string, lang: Lang = 'zh'): Promise<TestPersona[]> {
  const params = new URLSearchParams({ lang });
  if (category) params.set('category', category);
  const res = await fetch(`/api/test-personas?${params}`);
  if (!res.ok) throw new Error('Failed to fetch test personas');
  return res.json() as Promise<TestPersona[]>;
}
