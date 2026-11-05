'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { db, notification } from '@/db';
import { text } from '@/lib/form';
import { getActor } from '@/lib/session';

/** Notifications belong to one login: every query is scoped to the signed-in user and their company. */
export async function markReadAction(formData: FormData): Promise<void> {
  const actor = await getActor();
  if (!actor?.companyId) return;
  const id = text(formData, 'id');
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.id, id), eq(notification.userId, actor.id), eq(notification.companyId, actor.companyId), isNull(notification.readAt)));
  revalidatePath('/notifications');
}

export async function markAllReadAction(): Promise<void> {
  const actor = await getActor();
  if (!actor?.companyId) return;
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.userId, actor.id), eq(notification.companyId, actor.companyId), isNull(notification.readAt)));
  revalidatePath('/notifications');
}
