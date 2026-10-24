import type { Role } from '@/generated/prisma/client';

/** Minimal shape of the signed-in user that permission checks need. */
export interface Actor {
  id: string;
  role: Role;
  companyId: string | null;
  employeeId: string | null;
}

export type Action =
  // Platform (super admin only)
  | 'platform:manage'
  // Company-level data
  | 'employee:view'
  | 'employee:create'
  | 'employee:edit'
  | 'employee:deactivate'
  | 'branch:manage'
  | 'department:manage'
  | 'attendance:view'
  | 'attendance:mark'
  | 'attendance:selfCheckIn'
  | 'leave:request'
  | 'leave:view'
  | 'leave:decide'
  | 'reports:view'
  | 'user:manage'
  | 'auditLog:view'
  | 'company:settings';

const ALL_COMPANY_ACTIONS: readonly Action[] = [
  'employee:view',
  'employee:create',
  'employee:edit',
  'employee:deactivate',
  'branch:manage',
  'department:manage',
  'attendance:view',
  'attendance:mark',
  'attendance:selfCheckIn',
  'leave:request',
  'leave:view',
  'leave:decide',
  'reports:view',
  'user:manage',
  'auditLog:view',
  'company:settings',
];

/**
 * The permission matrix. MANAGER rows are further narrowed to the manager's own
 * team by `employeeScope()` in src/lib/tenant/scope.ts — can() answers "may this
 * role do this kind of thing", scope answers "to which rows".
 */
const MATRIX: Record<Role, readonly Action[]> = {
  SUPER_ADMIN: ['platform:manage'],
  ADMIN: ALL_COMPANY_ACTIONS,
  HR: [
    'employee:view',
    'employee:create',
    'employee:edit',
    'employee:deactivate',
    'branch:manage',
    'department:manage',
    'attendance:view',
    'attendance:mark',
    'attendance:selfCheckIn',
    'leave:request',
    'leave:view',
    'leave:decide',
    'reports:view',
  ],
  ACCOUNTANT: ['employee:view', 'attendance:view', 'attendance:selfCheckIn', 'leave:request', 'leave:view', 'reports:view'],
  MANAGER: [
    'employee:view',
    'attendance:view',
    'attendance:mark',
    'attendance:selfCheckIn',
    'leave:request',
    'leave:view',
    'leave:decide',
    'reports:view',
  ],
};

export interface PermissionContext {
  /** Company that owns the resource being acted on. When given, it must match the actor's company. */
  companyId?: string | null;
}

/**
 * The single authorisation gate. Call at the top of every server action and
 * privileged route handler — hiding a button is never enough.
 *
 * Tenant isolation lives here too: a company user can never act on another
 * company's resource, and the super admin has no access to company data at all
 * (they manage companies, not their staff).
 */
export function can(actor: Actor | null | undefined, action: Action, ctx: PermissionContext = {}): boolean {
  if (!actor) return false;
  if (!MATRIX[actor.role].includes(action)) return false;
  if (actor.role === 'SUPER_ADMIN') return action === 'platform:manage';
  // Every company role must belong to a company…
  if (!actor.companyId) return false;
  // …and may only touch their own.
  if (ctx.companyId !== undefined && ctx.companyId !== actor.companyId) return false;
  return true;
}

export class AuthorizationError extends Error {
  constructor(message = 'You do not have permission to do that.') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export function assertCan(actor: Actor | null | undefined, action: Action, ctx: PermissionContext = {}): asserts actor is Actor {
  if (!can(actor, action, ctx)) throw new AuthorizationError();
}

/** Roles a company ADMIN may create logins for (never SUPER_ADMIN). */
export const COMPANY_ROLES = ['ADMIN', 'HR', 'ACCOUNTANT', 'MANAGER'] as const satisfies readonly Role[];
