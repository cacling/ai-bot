/**
 * AuthProvider.tsx — Staff 登录态 Context
 *
 * 挂载时调 /api/staff-auth/me 检查 cookie session。
 * 提供 staff / loading / login / logout 给子组件。
 */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { type StaffUser, login as apiLogin, logout as apiLogout, fetchMe } from './api';

interface AuthContextValue {
  staff: StaffUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<StaffUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMe()
      .then((s) => setStaff(s))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const s = await apiLogin(username, password);
    setStaff(s);
    return s;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setStaff(null);
  }, []);

  return (
    <AuthContext.Provider value={{ staff, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
