/** Trimmed string field, '' when absent. */
export function text(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

/** Trimmed string field, undefined when absent or blank. */
export function optional(fd: FormData, key: string): string | undefined {
  const v = text(fd, key);
  return v === '' ? undefined : v;
}

/** First zod issue as a readable sentence. */
export function firstIssue(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  const i = error.issues[0];
  if (!i) return 'Check the form and try again.';
  const field = i.path.length ? `${String(i.path[0])}: ` : '';
  return `${field}${i.message}`;
}
