import type { ToolRuntimeRequest, ToolRuntimeResult, Adapter, AdapterType, GovernPolicy, ToolContract } from './types';
import { ToolRegistry } from './registry';
import { Pipeline } from './pipeline';
import { RemoteMcpAdapter } from './adapters/remote-mcp-adapter';
import { MockAdapter } from './adapters/mock-adapter';
import { ApiAdapter } from './adapters/api-adapter';
import { DbAdapter } from './adapters/db-adapter';
import { ScriptAdapter } from './adapters/script-adapter';

export class ToolRuntime {
  private registry: ToolRegistry;
  private pipeline: Pipeline;
  private policies: GovernPolicy[] = [];
  private adapters: Partial<Record<AdapterType, Adapter>>;
  private remoteMcpAdapter: RemoteMcpAdapter;
  private scriptAdapter: ScriptAdapter;

  constructor() {
    this.registry = new ToolRegistry();
    this.remoteMcpAdapter = new RemoteMcpAdapter();
    this.remoteMcpAdapter.setRegistry(this.registry);
    this.scriptAdapter = new ScriptAdapter();
    this.scriptAdapter.setRegistry(this.registry);
    this.adapters = {
      remote_mcp: this.remoteMcpAdapter,
      mock: new MockAdapter(),
      api: new ApiAdapter(),
      db: new DbAdapter(),
      script: this.scriptAdapter,
    };
    this.pipeline = new Pipeline(this.registry, this.adapters, this.policies);
  }

  async call(request: ToolRuntimeRequest): Promise<ToolRuntimeResult> {
    return this.pipeline.execute(request);
  }

  getToolSurface(): ToolContract[] {
    return this.registry.getToolSurface();
  }

  refresh(): void {
    this.registry.refresh();
  }

  setPolicies(policies: GovernPolicy[]): void {
    this.policies = policies;
    this.pipeline = new Pipeline(this.registry, this.adapters, this.policies);
  }

  async callWithPolicies(request: ToolRuntimeRequest, policies: GovernPolicy[]): Promise<ToolRuntimeResult> {
    const scopedPipeline = new Pipeline(this.registry, this.adapters, policies);
    return scopedPipeline.execute(request);
  }

  setMcpTools(tools: Record<string, { execute: (...args: any[]) => Promise<any> }>): void {
    this.remoteMcpAdapter.setMcpTools(tools);
    this.scriptAdapter.setMcpTools(tools);
  }

  getRegistry(): ToolRegistry {
    return this.registry;
  }
}

