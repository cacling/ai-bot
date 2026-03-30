/**
 * ProtectedRoute.tsx — 路由守卫
 *
 * ProtectedRoute: 未登录 → /staff/login
 * RoleRoute: 检查 staff_roles 集合，不满足 → 按 primary_staff_role 跳默认首页
 */
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { type StaffRole } from './api';

export function ProtectedRoute() {
  const { staff, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground text-sm">
        loading...
      </div>
    );
  }

  if (!staff) {
    return <Navigate to="/staff/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

export function RoleRoute({ required }: { required: StaffRole }) {
  const { staff } = useAuth();

  if (!staff) {
    return <Navigate to="/staff/login" replace />;
  }

  if (!staff.staff_roles.includes(required)) {
    // 跳到该员工的默认首页
    const fallback = staff.primary_staff_role === 'operations'
      ? '/staff/operations'
      : '/staff/workbench';
    return <Navigate to={fallback} replace />;
  }

  return <Outlet />;
}
