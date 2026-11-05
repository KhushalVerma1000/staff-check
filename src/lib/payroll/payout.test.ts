import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payableTotal, payoutRow, safeText } from './payout';

const ok = { status: 'APPROVED', bankHolder: 'Asha Rao', bankName: 'HDFC', account: '123456789012', ifsc: 'hdfc0001234' };

test('a row with approved onboarding and full bank details is ready, IFSC upper-cased', () => {
  const r = payoutRow({ code: 'E1', name: 'Asha', netPaise: 2_500_000 }, ok);
  assert.equal(r.problem, '');
  assert.equal(r.ifsc, 'HDFC0001234');
});

test('rows are held back with a reason, never silently paid', () => {
  const s = { code: 'E', name: 'N', netPaise: 100 };
  assert.match(payoutRow(s, undefined).problem, /No onboarding/);
  assert.match(payoutRow(s, { ...ok, status: 'SUBMITTED' }).problem, /not approved/);
  assert.match(payoutRow(s, { ...ok, account: null }).problem, /missing/);
  assert.match(payoutRow(s, { ...ok, ifsc: 'BAD' }).problem, /IFSC/);
  assert.match(payoutRow({ ...s, netPaise: 0 }, ok).problem, /Nothing to pay/);
});

test('the payable total counts only ready rows', () => {
  const rows = [
    payoutRow({ code: 'A', name: 'A', netPaise: 100_00 }, ok),
    payoutRow({ code: 'B', name: 'B', netPaise: 200_00 }, undefined),
    payoutRow({ code: 'C', name: 'C', netPaise: 50_00 }, ok),
  ];
  assert.equal(payableTotal(rows), 150_00);
});

test('formula-looking text is neutralised', () => {
  assert.equal(safeText('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(safeText('Asha'), 'Asha');
});
