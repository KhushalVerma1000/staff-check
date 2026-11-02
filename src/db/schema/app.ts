import { date, doublePrecision, index, integer, pgEnum, pgTable, text, timestamp, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { newId } from './ids';

export const companyStatusEnum = pgEnum('company_status', ['TRIAL', 'ACTIVE', 'SUSPENDED']);
export const planEnum = pgEnum('plan', ['STARTER', 'GROWTH', 'BUSINESS']);
export const branchTypeEnum = pgEnum('branch_type', ['OFFICE', 'FIELD']);
export const workTypeEnum = pgEnum('work_type', ['OFFICE', 'FIELD', 'HYBRID']);
export const employeeStatusEnum = pgEnum('employee_status', ['ACTIVE', 'INACTIVE']);
export const attendanceStatusEnum = pgEnum('attendance_status', ['PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE']);
export const attendanceSourceEnum = pgEnum('attendance_source', ['MANUAL', 'SELF']);
export const leaveTypeEnum = pgEnum('leave_type', ['CASUAL', 'SICK', 'PAID', 'UNPAID']);
export const leaveStatusEnum = pgEnum('leave_status', ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);

export type CompanyStatus = (typeof companyStatusEnum.enumValues)[number];
export type Plan = (typeof planEnum.enumValues)[number];
export type BranchType = (typeof branchTypeEnum.enumValues)[number];
export type WorkType = (typeof workTypeEnum.enumValues)[number];
export type EmployeeStatus = (typeof employeeStatusEnum.enumValues)[number];
export type AttendanceStatus = (typeof attendanceStatusEnum.enumValues)[number];
export type AttendanceSource = (typeof attendanceSourceEnum.enumValues)[number];
export type LeaveType = (typeof leaveTypeEnum.enumValues)[number];
export type LeaveStatus = (typeof leaveStatusEnum.enumValues)[number];

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts('created_at').notNull().defaultNow();
const updatedAt = () => ts('updated_at').notNull().defaultNow().$onUpdateFn(() => new Date());

/** A client business: the tenant. Every other business table carries company_id. */
export const company = pgTable('company', {
  id: text('id').primaryKey().$defaultFn(newId),
  name: text('name').notNull(),
  /** Short unique handle shown to staff, e.g. "acme-traders". */
  slug: text('slug').notNull().unique(),
  status: companyStatusEnum('status').notNull().default('TRIAL'),
  plan: planEnum('plan').notNull().default('STARTER'),
  /** Hard cap on active employees. The product targets teams under 100. */
  employeeLimit: integer('employee_limit').notNull().default(25),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  trialEndsAt: ts('trial_ends_at'),
  suspendedAt: ts('suspended_at'),
  suspendReason: text('suspend_reason'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** An office or field location of a company (replaces the "store" concept). */
export const branch = pgTable(
  'branch',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    companyId: text('company_id').notNull().references(() => company.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: branchTypeEnum('type').notNull().default('OFFICE'),
    address: text('address'),
    city: text('city'),
    isHeadOffice: boolean('is_head_office').notNull().default(false),
    /** Geofence for check-in: centre point and radius in metres. All three set, or none. */
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    radiusM: integer('radius_m'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('branch_company_name_uq').on(t.companyId, t.name), index('branch_company_idx').on(t.companyId)],
);

export const department = pgTable(
  'department',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    companyId: text('company_id').notNull().references(() => company.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('department_company_name_uq').on(t.companyId, t.name), index('department_company_idx').on(t.companyId)],
);

export const employee = pgTable(
  'employee',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    companyId: text('company_id').notNull().references(() => company.id, { onDelete: 'cascade' }),
    /** Company-local code, unique within the company (e.g. "E-0007"). */
    code: text('code').notNull(),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    designation: text('designation'),
    workType: workTypeEnum('work_type').notNull().default('OFFICE'),
    status: employeeStatusEnum('status').notNull().default('ACTIVE'),
    branchId: text('branch_id').references(() => branch.id, { onDelete: 'set null' }),
    departmentId: text('department_id').references(() => department.id, { onDelete: 'set null' }),
    /** Direct manager. Drives what a MANAGER login can see. */
    managerId: text('manager_id').references((): import('drizzle-orm/pg-core').AnyPgColumn => employee.id, { onDelete: 'set null' }),
    joinedOn: date('joined_on', { mode: 'date' }).notNull(),
    exitedOn: date('exited_on', { mode: 'date' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('employee_company_code_uq').on(t.companyId, t.code),
    index('employee_company_status_idx').on(t.companyId, t.status),
    index('employee_manager_idx').on(t.managerId),
  ],
);

export const attendanceRecord = pgTable(
  'attendance_record',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    companyId: text('company_id').notNull().references(() => company.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id').notNull().references(() => employee.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'date' }).notNull(),
    status: attendanceStatusEnum('status').notNull(),
    checkIn: ts('check_in'),
    checkOut: ts('check_out'),
    source: attendanceSourceEnum('source').notNull().default('MANUAL'),
    note: text('note'),
    /** Field staff can record where they checked in. */
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    markedById: text('marked_by_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('attendance_employee_date_uq').on(t.employeeId, t.date),
    index('attendance_company_date_idx').on(t.companyId, t.date),
  ],
);

export const leaveRequest = pgTable(
  'leave_request',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    companyId: text('company_id').notNull().references(() => company.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id').notNull().references(() => employee.id, { onDelete: 'cascade' }),
    type: leaveTypeEnum('type').notNull(),
    fromDate: date('from_date', { mode: 'date' }).notNull(),
    toDate: date('to_date', { mode: 'date' }).notNull(),
    /** Working days requested (Mon–Sat counted, Sundays skipped). */
    days: doublePrecision('days').notNull(),
    reason: text('reason'),
    status: leaveStatusEnum('status').notNull().default('PENDING'),
    decidedById: text('decided_by_id'),
    decidedAt: ts('decided_at'),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('leave_company_status_idx').on(t.companyId, t.status), index('leave_employee_idx').on(t.employeeId)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    /** Null for platform-level (super admin) actions. */
    companyId: text('company_id').references(() => company.id, { onDelete: 'cascade' }),
    userId: text('user_id'),
    userName: text('user_name'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    detail: text('detail'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_company_created_idx').on(t.companyId, t.createdAt), index('audit_created_idx').on(t.createdAt)],
);
