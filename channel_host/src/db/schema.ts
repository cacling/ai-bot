import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// Plugin install records
// ---------------------------------------------------------------------------

export const plugins = sqliteTable('channel_host_plugins', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  version: text('version').notNull().default('0.0.0'),
  source: text('source').notNull(), // 'local:<path>' | 'npm:<package>'
  manifestJson: text('manifest_json').notNull(), // JSON stringified PluginManifest
  installStatus: text('install_status').notNull().default('installed'), // installed | failed | uninstalled
  installedAt: integer('installed_at', { mode: 'timestamp_ms' }).notNull(),
});

// ---------------------------------------------------------------------------
// Plugin enablement state
// ---------------------------------------------------------------------------

export const enablement = sqliteTable('channel_host_enablement', {
  pluginId: text('plugin_id').primaryKey().references(() => plugins.id),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

// ---------------------------------------------------------------------------
// Channel accounts (per-plugin, per-channel instance)
// ---------------------------------------------------------------------------

export const accounts = sqliteTable('channel_host_accounts', {
  id: text('id').primaryKey(), // ulid or uuid
  pluginId: text('plugin_id').notNull().references(() => plugins.id),
  channelId: text('channel_id').notNull(),
  configJson: text('config_json').notNull().default('{}'),
  secretRef: text('secret_ref'), // reference to secret store, not plaintext
  status: text('status').notNull().default('created'), // created | active | inactive | error
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
});

// ---------------------------------------------------------------------------
// Diagnostic events
// ---------------------------------------------------------------------------

export const diagnostics = sqliteTable('channel_host_diagnostics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pluginId: text('plugin_id').notNull(),
  level: text('level').notNull(), // info | warn | error
  category: text('category').notNull(), // install | manifest | compatibility | runtime | inbound | outbound
  message: text('message').notNull(),
  detailsJson: text('details_json'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

// ---------------------------------------------------------------------------
// Bridge traces (inbound/outbound events for observability)
// ---------------------------------------------------------------------------

export const bridgeTraces = sqliteTable('channel_host_bridge_traces', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  direction: text('direction').notNull(), // 'in' | 'out'
  pluginId: text('plugin_id').notNull(),
  channelAccountId: text('channel_account_id'),
  eventType: text('event_type').notNull(),
  payloadSummary: text('payload_summary'),
  result: text('result'), // 'ok' | 'error' | JSON detail
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
