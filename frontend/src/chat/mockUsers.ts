/**
 * mockUsers.ts — user profile types + API fetch helpers
 * Data is loaded from the backend DB via /api/mock-users
 */
import type { Lang } from '../i18n';

export interface MockUser {
  id: string;
  phone: string;
  name: string;
  plan: Record<Lang, string>;
  status: 'active' | 'suspended';
  tag: Record<Lang, string>;
  tagColor: string;
  type: 'inbound' | 'outbound';
}

export async function fetchMockUsers(): Promise<MockUser[]> {
  const res = await fetch('/api/mock-users');
  if (!res.ok) throw new Error('Failed to fetch mock users');
  return res.json() as Promise<MockUser[]>;
}

export async function fetchInboundUsers(): Promise<MockUser[]> {
  const res = await fetch('/api/mock-users?type=inbound');
  if (!res.ok) throw new Error('Failed to fetch inbound users');
  return res.json() as Promise<MockUser[]>;
}
