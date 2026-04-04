export const TEMPORAL = {
  address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
} as const;

export const SERVICE_URLS = {
  backend: process.env.BACKEND_URL ?? 'http://127.0.0.1:18001',
  outbound: process.env.OUTBOUND_SERVICE_URL ?? 'http://127.0.0.1:18008',
  workOrder: process.env.WORK_ORDER_SERVICE_URL ?? 'http://127.0.0.1:18009',
  km: process.env.KM_SERVICE_URL ?? 'http://127.0.0.1:18006',
  wfm: process.env.WFM_SERVICE_URL ?? 'http://127.0.0.1:18023',
} as const;

export const TASK_QUEUES = {
  outbound: 'outbound',
  km: 'km',
  wfm: 'wfm',
  analytics: 'analytics',
} as const;

export const API_PORT = parseInt(process.env.TEMPORAL_ORCHESTRATOR_PORT ?? '18040', 10);
