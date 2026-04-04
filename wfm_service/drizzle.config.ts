import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: ['../packages/shared-db/src/schema/wfm.ts', '../packages/shared-db/src/schema/platform.ts'],
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.WFM_DB_PATH ?? 'data/wfm.db',
  },
});
