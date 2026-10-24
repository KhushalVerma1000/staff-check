/** Shape returned by server actions used with useActionState. */
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string };

export const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
export const done = <T = undefined>(message?: string, data?: T): { ok: true; message?: string; data?: T } => ({
  ok: true,
  message,
  data,
});
