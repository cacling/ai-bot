import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: ['../packages/shared-db/src/schema/cdp.ts'],
  out: '../cdp_service/drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.CDP_DB_PATH ?? '../cdp_service/data/cdp.db',
  },
});
