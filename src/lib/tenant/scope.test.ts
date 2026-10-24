import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSeeEmployee, companyIdOf, employeeScope } from './scope';
import type { Actor } from '@/lib/auth/can';

const a = (role: Actor['role'], over: Partial<Actor> = {}): Actor => ({
  id: 'u1',
  role,
  companyId: 'c1',
  employeeId: 'e-me',
  ...over,
});

test('companyIdOf throws for an unscoped login', () => {
  assert.throws(() => companyIdOf(a('SUPER_ADMIN', { companyId: null })));
  assert.equal(companyIdOf(a('ADMIN')), 'c1');
});

test('admin / hr / accountant see the whole company', () => {
  for (const r of ['ADMIN', 'HR', 'ACCOUNTANT'] as const) {
    assert.deepEqual(employeeScope(a(r)), { companyId: 'c1' });
  }
});

test('manager sees themself and direct reports only', () => {
  assert.deepEqual(employeeScope(a('MANAGER')), {
    companyId: 'c1',
    OR: [{ id: 'e-me' }, { managerId: 'e-me' }],
  });
});

test('manager with no staff record fails closed', () => {
  const s = employeeScope(a('MANAGER', { employeeId: null }));
  assert.deepEqual(s.OR, [{ id: '__no_match__' }, { managerId: '__no_match__' }]);
});

test('canSeeEmployee enforces company and team', () => {
  const emp = (over = {}) => ({ id: 'e2', companyId: 'c1', managerId: null as string | null, ...over });
  assert.equal(canSeeEmployee(a('HR'), emp()), true);
  assert.equal(canSeeEmployee(a('HR'), emp({ companyId: 'c2' })), false);
  assert.equal(canSeeEmployee(a('MANAGER'), emp()), false);
  assert.equal(canSeeEmployee(a('MANAGER'), emp({ managerId: 'e-me' })), true);
  assert.equal(canSeeEmployee(a('MANAGER'), emp({ id: 'e-me' })), true);
  assert.equal(canSeeEmployee(a('MANAGER', { employeeId: null }), emp({ managerId: null })), false);
});
