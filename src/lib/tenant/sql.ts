import { and, eq, or, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { employee } from '@/db';
import type { Actor } from '@/lib/auth/can';
import { employeeScope } from '@/lib/tenant/scope';

/**
 * Tenant filter for any table with a company_id column. Use it as the first
 * predicate of every query on tenant data; `companyId` comes from the session
 * (see companyIdOf), never from the request body.
 */
export function inCompany(table: { companyId: AnyPgColumn }, companyId: string, ...extra: Array<SQL | undefined>): SQL {
  return and(eq(table.companyId, companyId), ...extra) as SQL;
}

/** SQL predicate limiting employee rows to what the actor may see (see employeeScope). */
export function employeeFilter(actor: Actor): SQL {
  const s = employeeScope(actor);
  const base = eq(employee.companyId, s.companyId);
  if (!s.OR) return base;
  const team = or(...s.OR.map((c) => ('id' in c ? eq(employee.id, c.id) : eq(employee.managerId, c.managerId)))) as SQL;
  return and(base, team) as SQL;
}
