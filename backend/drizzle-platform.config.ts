/**
 * drizzle config for platform.db — backend-exclusive runtime tables
 * (sessions, messages, outbound_tasks, skill_instances, staff_accounts, etc.)
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: ['../packages/shared-db/src/schema/platform.ts'],
  out: './drizzle-platform',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.PLATFORM_DB_PATH ?? 'data/platform.db',
  },
  tablesFilter: [
    'sessions', 'messages', 'outbound_tasks', 'users',
    'skill_instances', 'skill_instance_events',
    'staff_accounts', 'staff_sessions',
  ],
});
