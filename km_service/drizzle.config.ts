import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: ['../packages/shared-db/src/schema/km.ts', '../packages/shared-db/src/schema/platform.ts'],
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.SQLITE_PATH ?? 'data/km.db',
  },
});
