import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendMail } from './index';
import { leaveDecidedEmail, leaveRequestedEmail, loginEmail } from './templates';

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

test('leave emails name the person, dates and decision', () => {
  const req = leaveRequestedEmail({ to: 'm@b.co', name: 'Meera', employeeName: 'Asha', type: 'Casual', from: '10 Nov 2026', until: '12 Nov 2026', days: 3, reason: 'Family event', appUrl: 'https://x.test' });
  assert.match(req.subject, /Asha/);
  assert.match(req.text, /10 Nov 2026 to 12 Nov 2026 \(3 days\)/);
  assert.match(req.text, /Family event/);
  const one = leaveRequestedEmail({ to: 'm@b.co', name: 'M', employeeName: 'A', type: 'Sick', from: '1 Nov 2026', until: '1 Nov 2026', days: 1, appUrl: 'u' });
  assert.match(one.text, /1 Nov 2026 \(1 day\)/);
  const no = leaveDecidedEmail({ to: 'a@b.co', name: 'Asha', approved: false, type: 'Casual', from: 'a', until: 'a', note: 'Release week', appUrl: 'u' });
  assert.match(no.subject, /not approved/);
  assert.match(no.text, /Release week/);
  assert.match(leaveDecidedEmail({ to: 'a@b.co', name: 'A', approved: true, type: 'Sick', from: 'a', until: 'b', appUrl: 'u' }).subject, /approved/);
});
