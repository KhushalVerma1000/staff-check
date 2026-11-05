import { and, eq } from 'drizzle-orm';
import { db, emailTemplate } from '@/db';
import { EMAIL_KINDS, type EmailKind, type EmailTemplate } from './custom';

/** The company's saved wording for an email, or the built-in default. */
export async function templateFor(companyId: string, kind: EmailKind): Promise<EmailTemplate> {
  const [row] = await db
    .select({ subject: emailTemplate.subject, body: emailTemplate.body })
    .from(emailTemplate)
    .where(and(eq(emailTemplate.companyId, companyId), eq(emailTemplate.kind, kind)))
    .limit(1);
  return row ?? EMAIL_KINDS[kind].default;
}
