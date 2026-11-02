import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendMail } from './index';
import { loginEmail } from './templates';

test('loginEmail carries the address, link and one-time password', () => {
  const m = loginEmail({ to: 'a@b.co', name: 'Asha', companyName: 'Acme', appUrl: 'https://x.test', tempPassword: 'Tmp-1234' });
  assert.equal(m.to, 'a@b.co');
  assert.match(m.text, /https:\/\/x\.test\/login/);
  assert.match(m.text, /Tmp-1234/);
  assert.match(m.subject, /Acme/);
  assert.match(loginEmail({ to: 'a@b.co', name: 'A', companyName: 'Acme', appUrl: 'u', tempPassword: 't', reset: true }).subject, /reset/);
});

test('sendMail returns errors instead of throwing', async () => {
  const prev = { ...process.env };
  process.env.MAIL_TRANSPORT = 'smtp';
  delete process.env.SMTP_URL;
  assert.deepEqual(await sendMail({ to: 'a@b.co', subject: 's', text: 't' }), { ok: false, error: 'SMTP_URL and MAIL_FROM must be set.' });
  process.env.MAIL_TRANSPORT = 'nope';
  assert.equal((await sendMail({ to: 'a@b.co', subject: 's', text: 't' })).ok, false);
  process.env.MAIL_TRANSPORT = 'console';
  assert.equal((await sendMail({ to: 'a@b.co', subject: 's', text: 't' })).ok, true);
  process.env = prev;
});
