import { ActionForm, Field } from '@/components/action-form';
import { PageHeader } from '@/components/shell/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { EMAIL_KINDS, type EmailKind } from '@/lib/mail/custom';
import { templateFor } from '@/lib/mail/store';
import { requireCompanyActor } from '@/lib/session';
import { saveEmailTemplateAction } from './actions';

export const metadata = { title: 'Leave emails' };

export default async function LeaveEmailsPage() {
  const actor = await requireCompanyActor('leavePolicy:manage');
  const kinds = Object.keys(EMAIL_KINDS) as EmailKind[];
  const current = await Promise.all(kinds.map((k) => templateFor(actor.companyId, k)));

  return (
    <>
      <PageHeader
        title="Leave emails"
        description="Change the wording of the emails people get about leave. Clear both boxes to go back to the standard text."
      />
      <div className="grid max-w-3xl gap-6">
        {kinds.map((k, i) => (
          <Card key={k}>
            <CardHeader>
              <CardTitle className="text-base">{EMAIL_KINDS[k].label}</CardTitle>
              <p className="text-xs text-gray-500">
                Placeholders: {EMAIL_KINDS[k].placeholders.map((p) => `{{${p}}}`).join('  ')}
              </p>
            </CardHeader>
            <CardContent>
              <ActionForm action={saveEmailTemplateAction} submitLabel="Save wording">
                <input type="hidden" name="kind" value={k} />
                <Field label="Subject" htmlFor={`${k}-subject`}>
                  <Input id={`${k}-subject`} name="subject" defaultValue={current[i].subject} maxLength={150} />
                </Field>
                <Field label="Email text" htmlFor={`${k}-body`}>
                  <Textarea id={`${k}-body`} name="body" defaultValue={current[i].body} rows={8} maxLength={3000} />
                </Field>
              </ActionForm>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
