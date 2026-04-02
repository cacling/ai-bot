/**
 * openclaw/plugin-sdk/error-runtime compatibility
 */
export function collectErrorGraphCandidates(err: unknown): Error[] {
  const errors: Error[] = [];
  if (err instanceof Error) {
    errors.push(err);
    if ('cause' in err && err.cause instanceof Error) {
      errors.push(...collectErrorGraphCandidates(err.cause));
    }
  }
  return errors;
}

export function extractErrorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) return String((err as any).code);
  return undefined;
}

export function formatErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function formatUncaughtError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return `Unknown error: ${String(err)}`;
}

export function readErrorName(err: unknown): string {
  if (err instanceof Error) return err.name;
  return 'Error';
}
