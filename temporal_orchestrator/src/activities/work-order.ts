import { SERVICE_URLS } from '../config.js';

export async function createAppointment(input: {
  phone: string;
  handoffId: string;
  appointmentType: string;
  notes?: string;
}) {
  const resp = await fetch(
    `${SERVICE_URLS.workOrder}/api/work-orders/appointments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: input.phone,
        handoff_id: input.handoffId,
        appointment_type: input.appointmentType,
        notes: input.notes,
      }),
    },
  );
  if (!resp.ok) throw new Error(`createAppointment failed: ${resp.status}`);
  return await resp.json() as { ok: boolean; appointment_id: string };
}

export async function startWorkflowRun(input: {
  workItemId: string;
  templateId: string;
}) {
  const resp = await fetch(
    `${SERVICE_URLS.workOrder}/api/work-orders/workflow-runs`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        work_item_id: input.workItemId,
        template_id: input.templateId,
      }),
    },
  );
  if (!resp.ok) throw new Error(`startWorkflowRun failed: ${resp.status}`);
  return await resp.json() as { ok: boolean; run_id: string };
}
