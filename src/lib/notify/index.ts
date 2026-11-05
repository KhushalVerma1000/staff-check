import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, notification, notificationPref, user } from '@/db';
import { channelsFor } from './prefs';
import { sendMail, type Mail } from '@/lib/mail';

export interface NotifyInput {
  companyId: string;
  /** Logins to notify. Unknown, removed or other-company ids are skipped. */
  userIds: string[];
  /** Event key, e.g. "leave.requested". */
  kind: string;
  title: string;
  body?: string;
  /** In-app link the notification opens. */
  href?: string;
  /** Builds the email for one recipient. Omit for in-app only. */
  email?: (to: { name: string; email: string }) => Mail;
}

/**
 * The one way the app tells people things: an in-app notification, plus an email
 * when `email` is given. Best-effort by design: a notification or mail outage must
 * never undo or block the action that caused it, so failures are logged, not thrown.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    if (input.userIds.length === 0) return;
    const people = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(and(inArray(user.id, [...new Set(input.userIds)]), eq(user.companyId, input.companyId), isNull(user.deletedAt)));
    if (people.length === 0) return;

    const prefs = await db
      .select({ userId: notificationPref.userId, kind: notificationPref.kind, inApp: notificationPref.inApp, email: notificationPref.email })
      .from(notificationPref)
      .where(and(inArray(notificationPref.userId, people.map((p) => p.id)), eq(notificationPref.kind, input.kind)));
    const chosen = people.map((p) => ({ p, ch: channelsFor(prefs.filter((x) => x.userId === p.id), input.kind) }));

    const inApp = chosen.filter((c) => c.ch.inApp).map((c) => c.p);
    if (inApp.length > 0) {
      await db.insert(notification).values(
        inApp.map((p) => ({
          companyId: input.companyId,
          userId: p.id,
          kind: input.kind,
          title: input.title,
          body: input.body ?? null,
          href: input.href ?? null,
        })),
      );
    }

    if (input.email) {
      const build = input.email;
      await Promise.all(
        chosen
          .filter((c) => c.ch.email)
          .map(async ({ p }) => {
            const res = await sendMail(build({ name: p.name, email: p.email }));
            if (!res.ok) console.error(`notify email to ${p.id} failed: ${res.error}`);
          }),
      );
    }
  } catch (err) {
    console.error('notify failed', err);
  }
}

/**
 * Who should be asked to decide a request from `employeeId`: the employee's manager
 * (their login), or, when there is no manager login, every HR and admin login.
 * The requester themselves is never included.
 */
export async function approverUserIds(companyId: string, requester: { employeeId: string; managerId: string | null; userId: string }): Promise<string[]> {
  if (requester.managerId) {
    const [m] = await db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.companyId, companyId), eq(user.employeeId, requester.managerId), isNull(user.deletedAt)))
      .limit(1);
    if (m && m.id !== requester.userId) return [m.id];
  }
  const staff = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.companyId, companyId), inArray(user.role, ['HR', 'ADMIN']), isNull(user.deletedAt)));
  return staff.map((s) => s.id).filter((id) => id !== requester.userId);
}

/** Login of a staff record, if it has one. */
export async function userIdOfEmployee(companyId: string, employeeId: string): Promise<string | null> {
  const [u] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.companyId, companyId), eq(user.employeeId, employeeId), isNull(user.deletedAt)))
    .limit(1);
  return u?.id ?? null;
}
