import { relations } from 'drizzle-orm';
import { user, session, account } from './auth';
import { attendanceRecord, auditLog, branch, company, department, employee, leaveRequest } from './app';

export const companyRelations = relations(company, ({ many }) => ({
  branches: many(branch),
  departments: many(department),
  employees: many(employee),
  users: many(user),
  attendance: many(attendanceRecord),
  leaves: many(leaveRequest),
  auditLogs: many(auditLog),
}));

export const branchRelations = relations(branch, ({ one, many }) => ({
  company: one(company, { fields: [branch.companyId], references: [company.id] }),
  employees: many(employee),
}));

export const departmentRelations = relations(department, ({ one, many }) => ({
  company: one(company, { fields: [department.companyId], references: [company.id] }),
  employees: many(employee),
}));

export const employeeRelations = relations(employee, ({ one, many }) => ({
  company: one(company, { fields: [employee.companyId], references: [company.id] }),
  branch: one(branch, { fields: [employee.branchId], references: [branch.id] }),
  department: one(department, { fields: [employee.departmentId], references: [department.id] }),
  manager: one(employee, { fields: [employee.managerId], references: [employee.id], relationName: 'reports' }),
  reports: many(employee, { relationName: 'reports' }),
  user: one(user),
  attendance: many(attendanceRecord),
  leaves: many(leaveRequest),
}));

export const userRelations = relations(user, ({ one, many }) => ({
  company: one(company, { fields: [user.companyId], references: [company.id] }),
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({ user: one(user, { fields: [session.userId], references: [user.id] }) }));
export const accountRelations = relations(account, ({ one }) => ({ user: one(user, { fields: [account.userId], references: [user.id] }) }));

export const attendanceRelations = relations(attendanceRecord, ({ one }) => ({
  company: one(company, { fields: [attendanceRecord.companyId], references: [company.id] }),
  employee: one(employee, { fields: [attendanceRecord.employeeId], references: [employee.id] }),
}));

export const leaveRelations = relations(leaveRequest, ({ one }) => ({
  company: one(company, { fields: [leaveRequest.companyId], references: [company.id] }),
  employee: one(employee, { fields: [leaveRequest.employeeId], references: [employee.id] }),
}));

export const auditRelations = relations(auditLog, ({ one }) => ({
  company: one(company, { fields: [auditLog.companyId], references: [company.id] }),
}));
