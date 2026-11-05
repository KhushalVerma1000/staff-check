import type { Mail } from './index';

/** Login details for a new or reset login. The one-time password must be changed at first sign-in. */
export function loginEmail(p: {
  to: string;
  name: string;
  companyName: string;
  appUrl: string;
  tempPassword: string;
  reset?: boolean;
}): Mail {
  const lines = [
    `Hi ${p.name},`,
    '',
    p.reset
      ? `Your Staff Check password for ${p.companyName} was reset.`
      : `You now have a Staff Check login for ${p.companyName}.`,
    '',
    `Sign in: ${p.appUrl}/login`,
    `Email: ${p.to}`,
    `One-time password: ${p.tempPassword}`,
    '',
    'You will be asked to choose your own password the first time you sign in. Do not share this email.',
  ];
  return {
    to: p.to,
    subject: p.reset ? `Your ${p.companyName} password was reset` : `Your ${p.companyName} Staff Check login`,
    text: lines.join('\n'),
  };
}

import { EMAIL_KINDS, renderTemplate, type EmailTemplate } from './custom';

const range = (from: string, to: string) => (from === to ? from : `${from} to ${to}`);

/** Sent to whoever must decide a new leave request. `tpl` is the company's own wording, if it set one. */
export function leaveRequestedEmail(
  p: {
    to: string;
    name: string;
    employeeName: string;
    type: string;
    from: string;
    until: string;
    days: number;
    reason?: string | null;
    appUrl: string;
  },
  tpl: EmailTemplate = EMAIL_KINDS['leave.requested'].default,
): Mail {
  const r = renderTemplate(tpl, {
    name: p.name,
    employee: p.employeeName,
    type: p.type,
    dates: range(p.from, p.until),
    days: `${p.days} ${p.days === 1 ? 'day' : 'days'}`,
    reasonLine: p.reason ? `Reason: ${p.reason}` : '',
    link: `${p.appUrl}/leave`,
  });
  return { to: p.to, subject: r.subject, text: r.body };
}

/** Sent to the employee when their leave is approved or rejected. */
export function leaveDecidedEmail(
  p: {
    to: string;
    name: string;
    approved: boolean;
    type: string;
    from: string;
    until: string;
    note?: string | null;
    appUrl: string;
  },
  tpl: EmailTemplate = EMAIL_KINDS['leave.decided'].default,
): Mail {
  const r = renderTemplate(tpl, {
    name: p.name,
    type: p.type,
    dates: range(p.from, p.until),
    decision: p.approved ? 'approved' : 'not approved',
    noteLine: p.note ? `Note: ${p.note}` : '',
    link: `${p.appUrl}/leave`,
  });
  return { to: p.to, subject: r.subject, text: r.body };
}
