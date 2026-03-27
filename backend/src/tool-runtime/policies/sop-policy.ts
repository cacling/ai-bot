import type { GovernPolicy, ToolRuntimeRequest, ResolvedTool } from '../types';
import type { SOPGuard } from '../../engine/sop-guard';

export class SopPolicy implements GovernPolicy {
  name = 'sop-guard';
  private guard: SOPGuard | null;

  constructor(guard?: SOPGuard) {
    this.guard = guard ?? null;
  }

  setGuard(guard: SOPGuard): void {
    this.guard = guard;
  }

  check(request: ToolRuntimeRequest, resolved: ResolvedTool): string | null {
    if (!this.guard) return null;
    return this.guard.check(request.toolName);
  }

  recordToolCall(toolName: string, result: { success: boolean; hasData: boolean }): void {
    this.guard?.recordToolCall(toolName, result);
  }
}
