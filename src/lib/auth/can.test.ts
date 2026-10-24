import { test } from 'node:test';
import assert from 'node:assert/strict';
import { can, type Actor } from './can';

const actor = (role: Actor['role'], companyId: string | null = 'c1', employeeId: string | null = 'e1'): Actor => ({
  id: 'u1',
  role,
  companyId,
  employeeId,
});

test('anonymous users can do nothing', () => {
  assert.equal(can(null, 'employee:view'), false);
  assert.equal(can(undefined, 'leave:request'), false);
});

test('super admin manages the platform and nothing inside a company', () => {
  const sa = actor('SUPER_ADMIN', null, null);
  assert.equal(can(sa, 'platform:manage'), true);
  assert.equal(can(sa, 'employee:view'), false);
  assert.equal(can(sa, 'attendance:mark'), false);
  assert.equal(can(sa, 'user:manage'), false);
});

test('company roles cannot manage the platform', () => {
  for (const r of ['ADMIN', 'HR', 'ACCOUNTANT', 'MANAGER'] as const) {
    assert.equal(can(actor(r), 'platform:manage'), false, r);
  }
});

test('admin can do every company action in their own company', () => {
  const a = actor('ADMIN');
  for (const act of ['employee:create', 'user:manage', 'auditLog:view', 'company:settings', 'branch:manage'] as const) {
    assert.equal(can(a, act, { companyId: 'c1' }), true, act);
  }
});

test('tenant isolation: no company role can act on another company', () => {
  for (const r of ['ADMIN', 'HR', 'ACCOUNTANT', 'MANAGER'] as const) {
    assert.equal(can(actor(r), 'employee:view', { companyId: 'other' }), false, r);
  }
});

test('a company role with no company is denied', () => {
  assert.equal(can(actor('ADMIN', null), 'employee:view'), false);
});

test('HR runs people ops but cannot manage logins or read the audit log', () => {
  const hr = actor('HR');
  assert.equal(can(hr, 'employee:create'), true);
  assert.equal(can(hr, 'leave:decide'), true);
  assert.equal(can(hr, 'user:manage'), false);
  assert.equal(can(hr, 'auditLog:view'), false);
});

test('accountant is read-only', () => {
  const ac = actor('ACCOUNTANT');
  assert.equal(can(ac, 'employee:view'), true);
  assert.equal(can(ac, 'reports:view'), true);
  assert.equal(can(ac, 'employee:edit'), false);
  assert.equal(can(ac, 'attendance:mark'), false);
  assert.equal(can(ac, 'leave:decide'), false);
});

test('manager can mark attendance and decide leave but not edit staff', () => {
  const m = actor('MANAGER');
  assert.equal(can(m, 'attendance:mark'), true);
  assert.equal(can(m, 'leave:decide'), true);
  assert.equal(can(m, 'employee:edit'), false);
  assert.equal(can(m, 'branch:manage'), false);
});
