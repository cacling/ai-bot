/**
 * Preload for b8 Feishu E2E tests — sets env vars BEFORE any module-level const evaluation.
 * Usage: bun test --preload ./tests/b8-preload.ts tests/b8-feishu-e2e.test.ts
 */
process.env.CHANNEL_HOST_DB_PATH = './data/test-b8.db';
process.env.BACKEND_URL = 'http://127.0.0.1:19472';
process.env.FEISHU_GATEWAY_URL = 'http://127.0.0.1:19032';
process.env.BAILEYS_GATEWAY_URL = 'http://127.0.0.1:19031';
process.env.INTERACTION_PLATFORM_URL = 'http://127.0.0.1:19022';
process.env.CDP_URL = 'http://127.0.0.1:19020';
process.env.FEISHU_APP_ID = 'test-app-id';
process.env.FEISHU_APP_SECRET = 'test-app-secret';
process.env.FEISHU_VERIFICATION_TOKEN = 'test-verify-token';
