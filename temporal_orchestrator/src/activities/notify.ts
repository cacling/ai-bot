import { SERVICE_URLS } from '../config.js';

export async function notifyWorkbench(payload: {
  handoff_id?: string;
  callback_task_id?: string;
  phone?: string;
  event_type: string;
  payload?: Record<string, unknown>;
}) {
  const resp = await fetch(
    `${SERVICE_URLS.backend}/api/internal/notify/workbench`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!resp.ok) throw new Error(`notifyWorkbench failed: ${resp.status}`);
  return await resp.json() as { delivered: boolean };
}

export async function notifySmsReminder(phone: string, smsType: string) {
  const resp = await fetch(
    `${SERVICE_URLS.backend}/api/internal/notify/sms`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, sms_type: smsType, content: '' }),
    },
  );
  // SMS is best-effort, don't throw on failure
  if (!resp.ok) {
    console.warn(`notifySmsReminder failed: ${resp.status} (non-fatal)`);
    return { sent: false };
  }
  return await resp.json() as { sent: boolean };
}
