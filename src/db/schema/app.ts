import { sql } from 'drizzle-orm';
import { bigint, date, doublePrecision, index, integer, pgEnum, pgTable, text, timestamp, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { newId } from './ids';
import { user } from './auth';

export const companyStatusEnum = pgEnum('company_status', ['TRIAL', 'ACTIVE', 'SUSPENDED']);
export const planEnum = pgEnum('plan', ['STARTER', 'GROWTH', 'BUSINESS']);
export const branchTypeEnum = pgEnum('branch_type', ['OFFICE', 'FIELD']);
export const workTypeEnum = pgEnum('work_type', ['OFFICE', 'FIELD', 'HYBRID']);
export const employeeStatusEnum = pgEnum('employee_status', ['ACTIVE', 'INACTIVE']);
export const attendanceStatusEnum = pgEnum('attendance_status', ['PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE']);
export const attendanceSourceEnum = pgEnum('attendance_source', ['MANUAL', 'SELF']);
export const leaveTypeEnum = pgEnum('leave_type', ['CASUAL', 'SICK', 'PAID', 'UNPAID']);
export const leaveStatusEnum = pgEnum('leave_status', ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);

export const onboardingStatusEnum = pgEnum('onboarding_status', ['IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED']);
/** Why an employee left an ID / statutory field empty (design: "Skip this for now"). */
export const skipReasonEnum = pgEnum('skip_reason', ['NOT_YET', 'NOT_APPLICABLE', 'WILL_BRING_DOC']);
export type OnboardingStatus = (typeof onboardingStatusEnum.enumValues)[number];
export type SkipReason = (typeof skipReasonEnum.enumValues)[number];

/** Result of one check-in / check-out attempt. Only OK attempts change attendance; the rest are kept as an audit trail. */
export const punchOutcomeEnum = pgEnum('punch_outcome', ['OK', 'OUTSIDE_GEOFENCE', 'NO_LOCATION', 'POOR_ACCURACY']);
export const punchKindEnum = pgEnum('punch_kind', ['IN', 'OUT']);
export type PunchOutcome = (typeof punchOutcomeEnum.enumValues)[number];

export const payrollRunStatusEnum = pgEnum('payroll_run_status', ['DRAFT', 'FINALIZED']);
export type PayrollRunStatus = (typeof payrollRunStatusEnum.enumValues)[number];

export const correctionStatusEnum = pgEnum('correction_status', ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);
export type CorrectionRequestStatus = (typeof correctionStatusEnum.enumValues)[number];

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

/**
 * An employee's onboarding details. ID, statutory and bank numbers are stored
 * encrypted (AES-256-GCM, see src/lib/crypto.ts); only masked forms are ever shown to HR.
 */
export const employeeKyc = pgTable(
  'employee_kyc',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    companyId: text('company_id').notNull().references(() => company.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id').notNull().unique().references(() => employee.id, { onDelete: 'cascade' }),
    status: onboardingStatusEnum('status').notNull().default('IN_PROGRESS'),
    /** Last wizard step reached (1-5). */
    step: integer('step').notNull().default(1),
    dob: date('dob', { mode: 'date' }),
    aadhaarEnc: text('aadhaar_enc'),
    aadhaarSkip: skipReasonEnum('aadhaar_skip'),
    panEnc: text('pan_enc'),
    panSkip: skipReasonEnum('pan_skip'),
    uanEnc: text('uan_enc'),
    uanSkip: skipReasonEnum('uan_skip'),
    esicEnc: text('esic_enc'),
    esicSkip: skipReasonEnum('esic_skip'),
    bankHolder: text('bank_holder'),
    bankName: text('bank_name'),
    accountEnc: text('account_enc'),
    ifsc: text('ifsc'),
    bankSkip: skipReasonEnum('bank_skip'),
    addrLine1: text('addr_line1'),
    addrLine2: text('addr_line2'),
    city: text('city'),
    state: text('state'),
    pincode: text('pincode'),
    submittedAt: ts('submitted_at'),
    reviewedById: text('reviewed_by_id'),
    reviewedAt: ts('reviewed_at'),
    reviewNote: text('review_note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('kyc_company_status_idx').on(t.companyId, t.status)],
);

/**
 * Raw check-in attempts. Lives in Postgres for now; the spec moves it to MongoDB
 * (punch_events) behind the outbox once that client exists. Payroll never reads
 * this table, only the attendance_record rolled up from OK punches.
 */
export const punchEvent = pgTable(
  'punch_event',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    companyId: text('company_id').notNull().references(() => company.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id').notNull().references(() => employee.id, { onDelete: 'cascade' }),
    branchId: text('branch_id').references(() => branch.id, { onDelete: 'set null' }),
    ts: ts('ts').notNull().defaultNow(),
    kind: punchKindEnum('kind').notNull(),
    outcome: punchOutcomeEnum('outcome').notNull(),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    accuracyM: doublePrecision('accuracy_m'),
    /** Distance from the branch geofence centre, when both are known. */
    distanceM: doublePrecision('distance_m'),
  },
  (t) => [index('punch_company_ts_idx').on(t.companyId, t.ts), index('punch_employee_ts_idx').on(t.employeeId, t.ts)],
);

/** An employee's request to fix a day's attendance; approving it rewrites that day's attendance_record. */
export const attendanceCorrection = pgTable(
  'attendance_correction',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    companyId: text('company_id').notNull().references(() => company.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id').notNull().references(() => employee.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'date' }).notNull(),
    requestedStatus: attendanceStatusEnum('requested_status').notNull(),
    requestedCheckIn: ts('requested_check_in'),
    requestedCheckOut: ts('requested_check_out'),
    reason: text('reason').notNull(),
    status: correctionStatusEnum('status').notNull().default('PENDING'),
    decidedById: text('decided_by_id'),
    decidedAt: ts('decided_at'),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('correction_company_status_idx').on(t.companyId, t.status),
    index('correction_employee_idx').on(t.employeeId),
    // At most one open request per person per day.
    uniqueIndex('correction_one_pending_uq').on(t.employeeId, t.date).where(sql`${t.status} = 'PENDING'`),
  ],
);

/**
 * Yearly allowance per leave type for a company. A missing row means the default
 * (see src/lib/leave/balance.ts); a null allowance means unlimited (e.g. unpaid leave).
 */
export const leavePolicy = pgTable(
  'leave_policy',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    companyId: text('company_id').notNull().references(() => company.id, { onDelete: 'cascade' }),
    type: leaveTypeEnum('type').notNull(),
    /** Working days per calendar year; null = unlimited. */
    annualDays: doublePrecision('annual_days'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('leave_policy_company_type_uq').on(t.companyId, t.type)],
);

/** In-app notification for one login (the bell list). Email copies are sent separately by notify(). */
export const notification = pgTable(
  'notification',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    companyId: text('company_id').notNull().references(() => company.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    /** Event key, e.g. leave.requested, leave.decided. */
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    /** In-app link the notification opens. */
    href: text('href'),
    readAt: ts('read_at'),
    createdAt: createdAt(),
  },
  (t) => [index('notification_user_idx').on(t.userId, t.readAt, t.createdAt)],
);

/** One login's channel choices for one event kind. No row = both channels on. */
export const notificationPref = pgTable(
  'notification_pref',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    companyId: text('company_id').notNull().references(() => company.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    inApp: boolean('in_app').notNull().default(true),
    email: boolean('email').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('notification_pref_user_kind_uq').on(t.userId, t.kind)],
);

/** A company's own wording for one email. No row = the built-in default (src/lib/mail/custom.ts). */
export const emailTemplate = pgTable(
  'email_template',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    companyId: text('company_id').notNull().references(() => company.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('email_template_company_kind_uq').on(t.companyId, t.kind)],
);

/** Money columns are whole paise (bigint as a JS number: safe far beyond any salary). */
const paise = (name: string) => bigint(name, { mode: 'number' }).notNull().default(0);

/** Monthly pay components for one employee. No row = not on payroll yet. */
export const salaryStructure = pgTable(
  'salary_structure',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    companyId: text('company_id').notNull().references(() => company.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id').notNull().unique().references(() => employee.id, { onDelete: 'cascade' }),
    basicPaise: paise('basic_paise'),
    hraPaise: paise('hra_paise'),
    otherPaise: paise('other_paise'),
    updatedById: text('updated_by_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('salary_company_idx').on(t.companyId)],
);

/** Statutory switches per company. No row = everything off. */
export const payrollSettings = pgTable('payroll_settings', {
  id: text('id').primaryKey().$defaultFn(newId),
  companyId: text('company_id').notNull().unique().references(() => company.id, { onDelete: 'cascade' }),
  pfEnabled: boolean('pf_enabled').notNull().default(false),
  esicEnabled: boolean('esic_enabled').notNull().default(false),
  /** Flat monthly professional tax in paise; 0 = none. */
  professionalTaxPaise: paise('professional_tax_paise'),
  updatedAt: updatedAt(),
});

/** One payroll run per company and month. A FINALIZED run and its payslips are immutable (database triggers enforce it). */
export const payrollRun = pgTable(
  'payroll_run',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    companyId: text('company_id').notNull().references(() => company.id, { onDelete: 'cascade' }),
    /** "YYYY-MM" */
    month: text('month').notNull(),
    status: payrollRunStatusEnum('status').notNull().default('DRAFT'),
    createdById: text('created_by_id'),
    finalizedById: text('finalized_by_id'),
    finalizedAt: ts('finalized_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('payroll_run_company_month_uq').on(t.companyId, t.month)],
);

/** One person's pay for a run. Name, code and designation are copied so later edits never rewrite a payslip. */
export const payslip = pgTable(
  'payslip',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    companyId: text('company_id').notNull().references(() => company.id, { onDelete: 'cascade' }),
    runId: text('run_id').notNull().references(() => payrollRun.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id').notNull().references(() => employee.id, { onDelete: 'cascade' }),
    employeeCode: text('employee_code').notNull(),
    employeeName: text('employee_name').notNull(),
    designation: text('designation'),
    workingDays: integer('working_days').notNull(),
    paidDays: doublePrecision('paid_days').notNull(),
    unmarkedDays: integer('unmarked_days').notNull().default(0),
    basicPaise: paise('basic_paise'),
    hraPaise: paise('hra_paise'),
    otherPaise: paise('other_paise'),
    grossPaise: paise('gross_paise'),
    pfPaise: paise('pf_paise'),
    esicPaise: paise('esic_paise'),
    ptPaise: paise('pt_paise'),
    deductionsPaise: paise('deductions_paise'),
    netPaise: paise('net_paise'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('payslip_run_employee_uq').on(t.runId, t.employeeId), index('payslip_employee_idx').on(t.employeeId)],
);
