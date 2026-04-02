import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: ['./src/db/schema/platform.ts'],
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.SQLITE_PATH ?? '../km_service/data/km.db',
  },
});
