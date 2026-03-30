/**
 * OperationsLayout.tsx — Layout for /agent/operations/* routes.
 * Renders <Outlet /> for knowledge and workorders sub-layouts.
 */
import { Outlet } from 'react-router-dom';

export function OperationsLayout() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <Outlet />
    </div>
  );
}
