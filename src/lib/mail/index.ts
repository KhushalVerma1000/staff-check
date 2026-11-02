import { createTransport } from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export type MailResult = { ok: true; id?: string } | { ok: false; error: string };

/**
 * Provider-agnostic outgoing mail. MAIL_TRANSPORT picks the transport:
 *   console (default) — logs the message; for development, never sends
 *   smtp              — any SMTP provider; set SMTP_URL (e.g. smtps://user:pass@host:465) and MAIL_FROM
 * Swapping to an HTTP API provider later means adding one transport here;
 * callers only use sendMail. A failure is returned, never thrown, so a mail
 * outage cannot break the action that triggered it.
 */
export async function sendMail(mail: Mail): Promise<MailResult> {
  const kind = process.env.MAIL_TRANSPORT ?? 'console';
  try {
    if (kind === 'smtp') {
      const url = process.env.SMTP_URL;
      const from = process.env.MAIL_FROM;
      if (!url || !from) return { ok: false, error: 'SMTP_URL and MAIL_FROM must be set.' };
      const info = await createTransport(url).sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text });
      return { ok: true, id: info.messageId };
    }
    if (kind === 'console') {
      console.log(`[mail:console] to=${mail.to} subject=${JSON.stringify(mail.subject)}`);
      return { ok: true };
    }
    return { ok: false, error: `Unknown MAIL_TRANSPORT "${kind}".` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Mail failed.' };
  }
}
