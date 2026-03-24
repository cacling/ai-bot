import type { WorkflowTransition, GuardType } from './skill-workflow-types';

export interface ToolResult {
  success: boolean;
  hasData: boolean;
  payload?: unknown;
}

export function resolveBranch(
  transitions: WorkflowTransition[],
  context: {
    toolResult?: ToolResult;
    userIntent?: 'confirm' | 'cancel' | 'other';
  },
): string | null {
  if (transitions.length === 1 && transitions[0].guard === 'always') {
    return transitions[0].target;
  }
  for (const t of transitions) {
    if (matchGuard(t.guard, context)) return t.target;
  }
  return null;
}

export function classifyUserIntent(text: string): 'confirm' | 'cancel' | 'other' {
  if (/确认|同意|好的|可以|办理|没问题|是的|对|嗯|行/.test(text)) return 'confirm';
  if (/取消|不要|算了|放弃|不用|再说|不办/.test(text)) return 'cancel';
  return 'other';
}

function matchGuard(guard: GuardType, ctx: { toolResult?: ToolResult; userIntent?: string }): boolean {
  switch (guard) {
    case 'tool.success': return !!ctx.toolResult?.success && !!ctx.toolResult?.hasData;
    case 'tool.error': return ctx.toolResult?.success === false;
    case 'tool.no_data': return !!ctx.toolResult?.success && !ctx.toolResult?.hasData;
    case 'user.confirm': return ctx.userIntent === 'confirm';
    case 'user.cancel': return ctx.userIntent === 'cancel';
    case 'always': return true;
    default: return false;
  }
}
