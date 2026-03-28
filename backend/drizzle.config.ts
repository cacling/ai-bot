import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: ['./src/db/schema/platform.ts', '../packages/shared-db/src/schema/business.ts', '../packages/shared-db/src/schema/workorder.ts'],
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.SQLITE_PATH ?? '../data/telecom.db',
  },
});
