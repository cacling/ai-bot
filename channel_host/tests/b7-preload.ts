/**
 * Preload for b7 E2E tests — sets env vars BEFORE any module-level const evaluation.
 * Usage: bun test --preload ./tests/b7-preload.ts tests/b7-whatsapp-e2e.test.ts
 */
process.env.CHANNEL_HOST_DB_PATH = './data/test-b7.db';
process.env.BACKEND_URL = 'http://127.0.0.1:19472';
process.env.BAILEYS_GATEWAY_URL = 'http://127.0.0.1:19031';
process.env.BAILEYS_GATEWAY_PORT = '19031';
process.env.INTERACTION_PLATFORM_URL = 'http://127.0.0.1:19022';
process.env.CDP_URL = 'http://127.0.0.1:19020';
