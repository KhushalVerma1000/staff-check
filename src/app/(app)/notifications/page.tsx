import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';
import { PageHeader } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { db, notification } from '@/db';
import { requireCompanyActor } from '@/lib/session';
import { markAllReadAction, markReadAction } from './actions';

export const metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const actor = await requireCompanyActor();
  const rows = await db
    .select()
    .from(notification)
    .where(and(eq(notification.userId, actor.id), eq(notification.companyId, actor.companyId)))
    .orderBy(desc(notification.createdAt))
    .limit(50);
  const unread = rows.filter((r) => !r.readAt).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : 'You are all caught up.'}
        actions={
          <div className="flex gap-2">
            {unread > 0 && (
              <form action={markAllReadAction}>
                <Button type="submit" variant="outline" size="sm">
                  Mark all as read
                </Button>
              </form>
            )}
            <Button asChild variant="ghost" size="sm">
              <Link href="/notifications/settings">Settings</Link>
            </Button>
          </div>
        }
      />
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Nothing yet. Leave requests and decisions will show up here.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((n) => (
                <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className={n.readAt ? 'text-sm text-gray-600' : 'text-sm font-medium text-gray-900'}>
                      {!n.readAt && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-blue-600" aria-label="Unread" />}
                      {n.href ? (
                        <Link href={n.href} className="hover:underline">
                          {n.title}
                        </Link>
                      ) : (
                        n.title
                      )}
                    </p>
                    {n.body && <p className="mt-0.5 text-sm text-gray-500">{n.body}</p>}
                    <p className="mt-1 text-xs text-gray-400">{n.createdAt.toLocaleString('en-GB')}</p>
                  </div>
                  {!n.readAt && (
                    <form action={markReadAction}>
                      <input type="hidden" name="id" value={n.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Mark read
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
