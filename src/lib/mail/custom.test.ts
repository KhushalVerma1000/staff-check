import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BODY_MAX, EMAIL_KINDS, renderTemplate, templateProblems } from './custom';

test('placeholders are filled and empty optional lines leave no gap', () => {
  const r = renderTemplate(EMAIL_KINDS['leave.requested'].default, {
    name: 'Meera', employee: 'Asha', type: 'Casual', dates: '10 Nov', days: '1 day', reasonLine: '', link: 'u/leave',
  });
  assert.equal(r.subject, 'Leave request from Asha');
  assert.ok(!r.body.includes('\n\n\n'));
  assert.match(r.body, /Asha has asked for Casual leave: 10 Nov \(1 day\)\./);
});

test('an unknown placeholder is left visible, not dropped', () => {
  assert.equal(renderTemplate({ subject: 'Hi {{nope}}', body: 'x' }, {}).subject, 'Hi {{nope}}');
});

test('templateProblems flags empty, unknown and oversized text', () => {
  const ok = EMAIL_KINDS['leave.decided'].default;
  assert.deepEqual(templateProblems('leave.decided', ok), []);
  assert.match(templateProblems('leave.decided', { subject: '', body: 'x' })[0], /subject/);
  assert.match(templateProblems('leave.decided', { subject: 's', body: 'Hi {{employee}}' })[0], /\{\{employee\}\}/);
  assert.match(templateProblems('leave.requested', { subject: 's', body: 'x'.repeat(BODY_MAX + 1) })[0], /at most/);
});

test('every default uses only its own placeholders', () => {
  for (const [kind, def] of Object.entries(EMAIL_KINDS)) {
    assert.deepEqual(templateProblems(kind as keyof typeof EMAIL_KINDS, def.default), [], kind);
  }
});
