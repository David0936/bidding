export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function errorStatus(err: unknown, fallback = 400): number {
  const status = (err as { status?: unknown })?.status;
  return typeof status === 'number' && status >= 400 && status <= 599 ? status : fallback;
}
