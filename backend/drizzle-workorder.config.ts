import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: ['../packages/shared-db/src/schema/workorder.ts'],
  out: '../work_order_service/drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.WORKORDER_DB_PATH ?? '../work_order_service/data/workorder.db',
  },
});
