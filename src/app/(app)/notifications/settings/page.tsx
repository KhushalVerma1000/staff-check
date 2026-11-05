import { eq } from 'drizzle-orm';
import { ActionForm } from '@/components/action-form';
import { PageHeader } from '@/components/shell/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { db, notificationPref } from '@/db';
import { channelsFor, NOTIFY_KINDS } from '@/lib/notify/prefs';
import { requireCompanyActor } from '@/lib/session';
import { saveNotificationPrefsAction } from './actions';

export const metadata = { title: 'Notification settings' };

export default async function NotificationSettingsPage() {
  const actor = await requireCompanyActor();
  const prefs = await db.select().from(notificationPref).where(eq(notificationPref.userId, actor.id));

  return (
    <>
      <PageHeader title="Notification settings" description="Choose how you hear about each event." />
      <Card className="max-w-2xl">
        <CardContent className="p-4">
          <ActionForm action={saveNotificationPrefsAction} submitLabel="Save settings">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 font-medium">Event</th>
                  <th className="w-20 py-2 text-center font-medium">In app</th>
                  <th className="w-20 py-2 text-center font-medium">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {NOTIFY_KINDS.map((k) => {
                  const ch = channelsFor(prefs, k.kind);
                  return (
                    <tr key={k.kind}>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-gray-900">{k.label}</p>
                        <p className="text-xs text-gray-500">{k.hint}</p>
                      </td>
                      <td className="text-center">
                        <input type="checkbox" name={`${k.kind}:inApp`} defaultChecked={ch.inApp} aria-label={`${k.label}: in app`} className="h-5 w-5" />
                      </td>
                      <td className="text-center">
                        <input type="checkbox" name={`${k.kind}:email`} defaultChecked={ch.email} aria-label={`${k.label}: email`} className="h-5 w-5" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
