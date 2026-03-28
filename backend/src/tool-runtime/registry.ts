import { db } from '../db';
import { mcpTools, mcpServers, toolImplementations, connectors } from '../db/schema';
import { logger } from '../services/logger';
import type { ToolContract, ToolBinding, ConnectorConfig, ResolvedTool, AdapterType } from './types';

export class ToolRegistry {
  private contracts = new Map<string, ToolContract>();
  private contractIdToName = new Map<string, string>();
  private bindings = new Map<string, ToolBinding>();
  private connectorMap = new Map<string, ConnectorConfig>();
  private serverUrls = new Map<string, string>();

  constructor() {
    this.refresh();
  }

  refresh(): void {
    this.contracts.clear();
    this.contractIdToName.clear();
    this.bindings.clear();
    this.connectorMap.clear();
    this.serverUrls.clear();

    this.loadServers();
    this.loadContracts();
    this.loadBindings();
    this.loadConnectors();

    logger.info('tool-registry', 'refreshed', {
      contracts: this.contracts.size,
      bindings: this.bindings.size,
      connectors: this.connectorMap.size,
    });
  }

  resolve(toolName: string): ResolvedTool | null {
    const contract = this.contracts.get(toolName);
    if (!contract) return null;

    const binding = this.bindings.get(toolName) ?? null;
    let connector: ConnectorConfig | null = null;
    if (binding?.connectorId) {
      connector = this.connectorMap.get(binding.connectorId) ?? null;
    }

    return { contract, binding, connector };
  }

  listContracts(): ToolContract[] {
    return Array.from(this.contracts.values());
  }

  getToolSurface(): ToolContract[] {
    return this.listContracts().filter(c => !c.disabled);
  }

  getServerUrl(serverId: string): string | undefined {
    return this.serverUrls.get(serverId);
  }

  getActiveServers(): Array<{ id: string; name: string; url: string }> {
    const result: Array<{ id: string; name: string; url: string }> = [];
    try {
      for (const s of db.select().from(mcpServers).all()) {
        if (s.enabled && s.status === 'active' && s.url) {
          result.push({ id: s.id, name: s.name, url: s.url });
        }
      }
    } catch { /* DB not ready */ }
    return result;
  }

  // ── Private loaders ──

  private loadServers(): void {
    try {
      for (const s of db.select().from(mcpServers).all()) {
        if (s.url) this.serverUrls.set(s.id, s.url);
      }
    } catch { /* DB not ready */ }
  }

  private safeJsonParse(text: string | null | undefined): Record<string, unknown> | undefined {
    if (!text) return undefined;
    try { return JSON.parse(text); } catch { return undefined; }
  }

  private loadContracts(): void {
    try {
      for (const row of db.select().from(mcpTools).all()) {
        const contract: ToolContract = {
          id: row.id,
          name: row.name,
          description: row.description,
          inputSchema: this.safeJsonParse(row.input_schema),
          outputSchema: this.safeJsonParse(row.output_schema),
          errorSchema: undefined,
          resultSemantics: undefined,
          mocked: row.mocked,
          disabled: row.disabled,
          mockRules: row.mock_rules ?? undefined,
          serverId: row.server_id ?? undefined,
          annotations: this.safeJsonParse(row.annotations),
        };
        this.contracts.set(row.name, contract);
        this.contractIdToName.set(row.id, row.name);
      }
    } catch { /* table may not exist yet */ }

    // Fallback: load from mcp_servers.tools_json if mcp_tools is empty
    if (this.contracts.size === 0) {
      try {
        for (const s of db.select().from(mcpServers).all()) {
          if (!s.tools_json) continue;
          const tools = JSON.parse(s.tools_json) as Array<{ name: string; description?: string; inputSchema?: unknown }>;
          for (const t of tools) {
            if (this.contracts.has(t.name)) continue;
            this.contracts.set(t.name, {
              id: `fallback_${t.name}`,
              name: t.name,
              description: t.description ?? '',
              inputSchema: t.inputSchema as Record<string, unknown> | undefined,
              mocked: false,
              disabled: false,
              serverId: s.id,
            });
          }
        }
      } catch { /* ignore */ }
    }
  }

  private loadBindings(): void {
    try {
      for (const row of db.select().from(toolImplementations).all()) {
        const toolName = this.contractIdToName.get(row.tool_id);
        if (!toolName) continue;

        let executionPolicy;
        if (row.config) {
          try {
            const cfg = JSON.parse(row.config);
            executionPolicy = cfg.executionPolicy;
          } catch { /* ignore */ }
        }

        this.bindings.set(toolName, {
          toolId: row.tool_id,
          adapterType: row.adapter_type as AdapterType,
          connectorId: row.connector_id ?? undefined,
          handlerKey: row.handler_key ?? undefined,
          config: row.config ? JSON.parse(row.config) : undefined,
          executionPolicy,
          status: row.status,
        });
      }
    } catch { /* table may not exist */ }
  }

  private loadConnectors(): void {
    try {
      for (const row of db.select().from(connectors).all()) {
        this.connectorMap.set(row.id, {
          id: row.id,
          name: row.name,
          type: row.type as 'db' | 'api',
          config: row.config ? JSON.parse(row.config) : undefined,
          status: row.status,
        });
      }
    } catch { /* table may not exist */ }
  }
}
