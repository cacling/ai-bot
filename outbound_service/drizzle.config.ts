import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: ['../packages/shared-db/src/schema/outbound.ts'],
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.OUTBOUND_DB_PATH ?? 'data/outbound.db',
  },
});
