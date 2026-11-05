/** Events a person can tune. Adding an event kind to notify() means adding it here too. */
export const NOTIFY_KINDS = [
  { kind: 'leave.requested', label: 'A colleague asks for leave', hint: 'Sent to whoever decides it.' },
  { kind: 'leave.decided', label: 'My leave is approved or rejected', hint: 'Sent to the person who asked.' },
] as const;

export type NotifyKind = (typeof NOTIFY_KINDS)[number]['kind'];

export interface Channels {
  inApp: boolean;
  email: boolean;
}

/** A person's channels for an event; both on unless they turned one off. */
export function channelsFor(prefs: Array<{ kind: string; inApp: boolean; email: boolean }>, kind: string): Channels {
  const p = prefs.find((x) => x.kind === kind);
  return p ? { inApp: p.inApp, email: p.email } : { inApp: true, email: true };
}
