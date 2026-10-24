import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from './slug';

test('slugify', () => {
  assert.equal(slugify('Acme Traders Pvt. Ltd.'), 'acme-traders-pvt-ltd');
  assert.equal(slugify('  Café   Mumbai!! '), 'cafe-mumbai');
  assert.equal(slugify('!!!'), 'company');
  assert.ok(slugify('x'.repeat(100)).length <= 40);
});
