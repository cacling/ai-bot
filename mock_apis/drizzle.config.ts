import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: ['../packages/shared-db/src/schema/business.ts'],
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.BUSINESS_DB_PATH ?? 'data/business.db',
  },
});
