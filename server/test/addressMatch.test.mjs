import assert from 'node:assert/strict';
import test from 'node:test';
import { compareAddresses } from '../lib/addressMatch.js';

test('identical addresses match exactly', () => {
  const r = compareAddresses('130A Passage Street, Cleveland QLD 4163', '130A Passage Street, Cleveland QLD 4163');
  assert.equal(r.status, 'match');
  assert.equal(r.score, 1);
});

test('abbreviation and punctuation differences still match', () => {
  const r = compareAddresses('130A Passage St, Cleveland QLD 4163', '130a passage street cleveland qld 4163');
  assert.equal(r.status, 'match');
});

test('genuinely different addresses are flagged as a mismatch', () => {
  const r = compareAddresses('130A Passage Street, Cleveland QLD 4163', '27 Torres Way, Spring Mountain QLD 4300');
  assert.equal(r.status, 'mismatch');
});

test('a missing address on either side is unknown, not a false match', () => {
  assert.equal(compareAddresses(null, '27 Torres Way, Spring Mountain QLD 4300').status, 'unknown');
  assert.equal(compareAddresses('130A Passage Street, Cleveland QLD 4163', null).status, 'unknown');
  assert.equal(compareAddresses(null, null).status, 'unknown');
});
