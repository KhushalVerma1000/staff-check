import { prisma } from '@/lib/prisma';

export interface AuditEntry {
  companyId: string | null;
  userId: string;
  userName?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: string | null;
}

/** Best-effort audit trail: a logging failure must never block the action itself. */
export async function audit(e: AuditEntry): Promise<void> {
  try {
    const userName =
      e.userName ?? (await prisma.user.findUnique({ where: { id: e.userId }, select: { name: true } }))?.name ?? null;
    await prisma.auditLog.create({
      data: {
        companyId: e.companyId,
        userId: e.userId,
        userName,
        action: e.action,
        entity: e.entity,
        entityId: e.entityId ?? null,
        detail: e.detail ?? null,
      },
    });
  } catch (err) {
    console.error('audit log write failed', err);
  }
}
