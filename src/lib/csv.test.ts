import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, csvRow } from './csv';

test('plain values pass through; numbers keep their sign', () => {
  assert.equal(csvCell('Asha'), 'Asha');
  assert.equal(csvCell(-2), '-2');
  assert.equal(csvCell(null), '');
});

test('quotes cells with commas, quotes and newlines', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('x\ny'), '"x\ny"');
});

test('neutralises formula injection in text', () => {
  assert.equal(csvCell('=HYPERLINK("http://evil")'), `"'=HYPERLINK(""http://evil"")"`);
  assert.equal(csvCell('+1'), `'+1`);
  assert.equal(csvCell('@SUM(A1)'), `'@SUM(A1)`);
  assert.equal(csvCell('-cmd'), `'-cmd`);
});

test('csvRow joins cells', () => assert.equal(csvRow(['E-1', 'A, B', 3]), 'E-1,"A, B",3'));
