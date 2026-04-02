/**
 * StaffRouter.tsx — Staff 路由（含登录 + 权限守卫）
 *
 * /staff/login      → 登录页（无需 auth）
 * /staff/*          → ProtectedRoute → 工作台 / 运营管理
 * /agent/*          → 兼容跳转 → /staff/*
 */
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { LoginPage } from '../auth/LoginPage';
import { ProtectedRoute, RoleRoute } from '../auth/ProtectedRoute';
import { AgentWorkstationPage } from '../AgentWorkstationPage';
import { WorkbenchPage } from '../pages/WorkbenchPage';
import { OperationsLayout } from '../pages/OperationsLayout';
import { KnowledgeLayout } from '../knowledge/KnowledgeLayout';
import { WorkOrdersLayout } from '../workorders/WorkOrdersLayout';
import { RoutingLayout } from '../routing/RoutingLayout';
import { CustomerLayout } from '../customers/CustomerLayout';

/** 已登录访问 /staff/login → 按角色跳默认首页 */
function LoginGuard() {
  const { staff, loading } = useAuth();
  if (loading) return null;
  if (staff) {
    const target = staff.primary_staff_role === 'operations'
      ? '/staff/operations'
      : '/staff/workbench';
    return <Navigate to={target} replace />;
  }
  return <LoginPage />;
}

/** /staff index → 按角色跳默认首页 */
function StaffIndex() {
  const { staff } = useAuth();
  if (!staff) return <Navigate to="/staff/login" replace />;
  const target = staff.primary_staff_role === 'operations'
    ? '/staff/operations'
    : '/staff/workbench';
  return <Navigate to={target} replace />;
}

/** /agent/* → /staff/* 兼容跳转 */
function AgentRedirect() {
  const location = useLocation();
  const newPath = location.pathname.replace(/^\/agent/, '/staff');
  return <Navigate to={newPath + location.search} replace />;
}

export function StaffRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* 登录页（无需 auth） */}
          <Route path="/staff/login" element={<LoginGuard />} />

          {/* 受保护路由 */}
          <Route path="/staff" element={<ProtectedRoute />}>
            <Route element={<AgentWorkstationPage />}>
              <Route index element={<StaffIndex />} />
              <Route path="workbench" element={<WorkbenchPage />} />

              {/* 运营管理：需要 operations 角色 */}
              <Route path="operations" element={<RoleRoute required="operations" />}>
                <Route element={<OperationsLayout />}>
                  <Route index element={<Navigate to="knowledge" replace />} />
                  <Route path="knowledge" element={<KnowledgeLayout />}>
                    <Route index element={<Navigate to="documents" replace />} />
                    <Route path="documents" element={null} />
                    <Route path="skills" element={null} />
                    <Route path="tools" element={null} />
                  </Route>
                  <Route path="workorders" element={<WorkOrdersLayout />}>
                    <Route index element={<Navigate to="items" replace />} />
                    <Route path="items" element={null} />
                    <Route path="intakes" element={null} />
                    <Route path="threads" element={null} />
                  </Route>
                  <Route path="routing" element={<RoutingLayout />}>
                    <Route index element={<Navigate to="overview" replace />} />
                    <Route path="overview" element={null} />
                    <Route path="rules" element={null} />
                    <Route path="scoring" element={null} />
                    <Route path="overflow" element={null} />
                    <Route path="monitor" element={null} />
                    <Route path="logs" element={null} />
                  </Route>
                  <Route path="customers" element={<CustomerLayout />}>
                    <Route index element={<Navigate to="list" replace />} />
                    <Route path="list" element={null} />
                    <Route path="detail/:partyId" element={null} />
                    <Route path="tags" element={null} />
                    <Route path="segments" element={null} />
                    <Route path="lifecycle" element={null} />
                    <Route path="identity-merge" element={null} />
                    <Route path="import-export" element={null} />
                    <Route path="blacklist-consent" element={null} />
                    <Route path="audit-log" element={null} />
                  </Route>
                </Route>
              </Route>
            </Route>
          </Route>

          {/* /agent/* 兼容跳转 */}
          <Route path="/agent/*" element={<AgentRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
