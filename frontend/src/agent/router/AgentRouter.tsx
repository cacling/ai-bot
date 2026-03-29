/**
 * AgentRouter.tsx — Route definitions for /agent/* paths.
 *
 * Uses react-router-dom nested routes. AgentWorkstationPage (AgentLayout)
 * is the root layout that owns WS connection, chat state, and card state.
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AgentWorkstationPage } from '../AgentWorkstationPage';
import { WorkbenchPage } from '../pages/WorkbenchPage';
import { OperationsLayout } from '../pages/OperationsLayout';
import { KnowledgeLayout } from '../knowledge/KnowledgeLayout';
import { WorkOrdersLayout } from '../workorders/WorkOrdersLayout';

export function AgentRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/agent" element={<AgentWorkstationPage />}>
          <Route index element={<Navigate to="workbench" replace />} />
          <Route path="workbench" element={<WorkbenchPage />} />
          <Route path="operations" element={<OperationsLayout />}>
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
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
