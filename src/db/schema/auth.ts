import { boolean, index, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { company, employee } from './app';
import { newId } from './ids';

/**
 * Better Auth core tables (user, session, account, verification) plus the
 * Staff Check fields on `user`. Table and column names follow Better Auth's
 * drizzle adapter conventions, so don't rename them.
 *
 * Roles:
 *   SUPER_ADMIN — platform owner. No company; manages client companies only.
 *   ADMIN       — company owner/admin. Everything inside their own company.
 *   HR          — staff records, branches, departments, attendance, leave decisions.
 *   ACCOUNTANT  — read-only view of staff and attendance summaries (payroll inputs).
 *   MANAGER     — their own team (direct reports): attendance and leave decisions.
 */
export const roleEnum = pgEnum('role', ['SUPER_ADMIN', 'ADMIN', 'HR', 'ACCOUNTANT', 'MANAGER']);
export type Role = (typeof roleEnum.enumValues)[number];

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
    // ── Staff Check fields ──
    role: roleEnum('role').notNull(),
    /** Null only for SUPER_ADMIN. */
    companyId: text('company_id').references(() => company.id, { onDelete: 'cascade' }),
    /** The staff record this login belongs to (lets a MANAGER see their team). */
    employeeId: text('employee_id').unique().references(() => employee.id, { onDelete: 'set null' }),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => [index('user_company_role_idx').on(t.companyId, t.role)],
);

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_idx').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    /** Password hash for the "credential" provider. */
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [index('account_user_idx').on(t.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);
