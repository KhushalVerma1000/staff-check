'use server';

import { revalidatePath } from 'next/cache';
import { db, notificationPref } from '@/db';
import { done, type ActionResult } from '@/lib/action-result';
import { NOTIFY_KINDS } from '@/lib/notify/prefs';
import { getActor } from '@/lib/session';

/** Saves the signed-in person's own channel choices; never anyone else's. */
export async function saveNotificationPrefsAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  if (!actor?.companyId) return { ok: false, error: 'Sign in again to change your notifications.' };
  const companyId = actor.companyId;

  await db.transaction(async (tx) => {
    for (const { kind } of NOTIFY_KINDS) {
      const inApp = fd.get(`${kind}:inApp`) === 'on';
      const email = fd.get(`${kind}:email`) === 'on';
      await tx
        .insert(notificationPref)
        .values({ companyId, userId: actor.id, kind, inApp, email })
        .onConflictDoUpdate({ target: [notificationPref.userId, notificationPref.kind], set: { inApp, email } });
    }
  });
  revalidatePath('/notifications/settings');
  return done('Notification settings saved.');
}
