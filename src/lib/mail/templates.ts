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
