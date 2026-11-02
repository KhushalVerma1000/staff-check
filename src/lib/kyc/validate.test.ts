import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aadhaarError, accountError, ifscError, maskTail, panError, pincodeError, uanError, verhoeffValid } from './validate';
import { decryptField, encryptField } from '../crypto';

// 2363 is a valid Verhoeff number; build a 12-digit Aadhaar-shaped one by computing the check digit.
function withCheck(base: string): string {
  for (let d = 0; d < 10; d++) if (verhoeffValid(base + d)) return base + d;
  throw new Error('unreachable');
}

test('aadhaar: length, leading digit and check digit', () => {
  const good = withCheck('29876543210');
  assert.equal(aadhaarError(good), null);
  assert.equal(aadhaarError(`${good.slice(0, 4)} ${good.slice(4, 8)} ${good.slice(8)}`), null);
  const bad = good.slice(0, 11) + String((Number(good[11]) + 1) % 10);
  assert.match(aadhaarError(bad) ?? '', /check digit/);
  assert.match(aadhaarError('123') ?? '', /12 digits/);
  assert.match(aadhaarError('0' + good.slice(1)) ?? '', /12 digits/);
});

test('pan, uan, ifsc, account, pincode', () => {
  assert.equal(panError('abcde1234f'), null);
  assert.ok(panError('ABCDE12345'));
  assert.equal(uanError('1012 3456 7890'), null);
  assert.ok(uanError('123'));
  assert.equal(ifscError('hdfc0001234'), null);
  assert.ok(ifscError('HDFC1001234'));
  assert.equal(accountError('123456789012'), null);
  assert.ok(accountError('12345'));
  assert.equal(pincodeError('411001'), null);
  assert.ok(pincodeError('011001'));
});

test('maskTail shows only the last four', () => {
  assert.equal(maskTail('4821 7730 6620'), '•••• 6620');
  assert.equal(maskTail(null), '—');
});

test('field encryption round-trips, is randomised, and rejects tampering or a wrong key', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const other = Buffer.alloc(32, 9).toString('base64');
  const a = encryptField('ABCDE1234F', key);
  assert.notEqual(a, encryptField('ABCDE1234F', key));
  assert.equal(decryptField(a, key), 'ABCDE1234F');
  assert.throws(() => decryptField(a, other));
  const [v, iv, tag, ct] = a.split(':');
  assert.throws(() => decryptField([v, iv, tag, Buffer.from('x').toString('base64') + ct].join(':'), key));
  assert.throws(() => encryptField('x', Buffer.alloc(8).toString('base64')), /32 bytes/);
});
