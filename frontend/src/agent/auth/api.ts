/**
 * api.ts — Staff Auth API 辅助函数
 */

export type StaffRole = 'agent' | 'operations';

export interface StaffUser {
  id: string;
  username: string;
  display_name: string;
  primary_staff_role: StaffRole;
  staff_roles: StaffRole[];
  platform_role: string;
  team_code: string | null;
  seat_code: string | null;
  lang: string;
  is_demo: boolean;
}

export async function login(username: string, password: string): Promise<StaffUser> {
  const res = await fetch('/api/staff-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? '登录失败');
  }
  const data = await res.json();
  return data.staff;
}

export async function logout(): Promise<void> {
  await fetch('/api/staff-auth/logout', { method: 'POST' });
}

export async function fetchMe(): Promise<StaffUser | null> {
  const res = await fetch('/api/staff-auth/me');
  if (!res.ok) return null;
  const data = await res.json();
  return data.staff;
}
