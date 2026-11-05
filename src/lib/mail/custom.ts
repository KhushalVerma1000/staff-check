/**
 * Company-editable email wording. A template is a subject and a body with {{placeholders}};
 * each event offers a fixed set. Blank = use the default below.
 */
export const EMAIL_KINDS = {
  'leave.requested': {
    label: 'Leave request (to the approver)',
    placeholders: ['name', 'employee', 'type', 'dates', 'days', 'reasonLine', 'link'],
    default: {
      subject: 'Leave request from {{employee}}',
      body: 'Hi {{name}},\n\n{{employee}} has asked for {{type}} leave: {{dates}} ({{days}}).\n{{reasonLine}}\n\nReview it: {{link}}',
    },
  },
  'leave.decided': {
    label: 'Leave decision (to the employee)',
    placeholders: ['name', 'type', 'dates', 'decision', 'noteLine', 'link'],
    default: {
      subject: 'Your leave was {{decision}}',
      body: 'Hi {{name}},\n\nYour {{type}} leave for {{dates}} was {{decision}}.\n{{noteLine}}\n\nDetails: {{link}}',
    },
  },
} as const;

export type EmailKind = keyof typeof EMAIL_KINDS;
export interface EmailTemplate {
  subject: string;
  body: string;
}

export const SUBJECT_MAX = 150;
export const BODY_MAX = 3000;

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

/** Fills {{placeholders}}; unknown names are left as written so a typo is visible, not silently dropped. */
export function renderTemplate(t: EmailTemplate, vars: Record<string, string>): EmailTemplate {
  const fill = (s: string) => s.replace(PLACEHOLDER, (m, k: string) => (k in vars ? vars[k] : m));
  return {
    subject: fill(t.subject).replace(/\s+/g, ' ').trim(),
    // Empty optional lines (reason, note) must not leave gaps of blank lines.
    body: fill(t.body).replace(/\n{3,}/g, '\n\n').trim(),
  };
}

/** Problems with a template a person typed, as readable sentences (empty = fine). */
export function templateProblems(kind: EmailKind, t: EmailTemplate): string[] {
  const out: string[] = [];
  if (!t.subject.trim()) out.push('Add a subject.');
  if (!t.body.trim()) out.push('Add some text to the email.');
  if (t.subject.length > SUBJECT_MAX) out.push(`The subject can be at most ${SUBJECT_MAX} characters.`);
  if (t.body.length > BODY_MAX) out.push(`The email can be at most ${BODY_MAX} characters.`);
  const allowed: readonly string[] = EMAIL_KINDS[kind].placeholders;
  const unknown = new Set<string>();
  for (const m of (t.subject + '\n' + t.body).matchAll(PLACEHOLDER)) if (!allowed.includes(m[1])) unknown.add(m[1]);
  if (unknown.size) out.push(`Unknown placeholder${unknown.size > 1 ? 's' : ''}: ${[...unknown].map((u) => `{{${u}}}`).join(', ')}.`);
  return out;
}
