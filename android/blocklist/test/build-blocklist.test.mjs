import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomains } from '../build-blocklist.mjs';

test('normalizeDomains lowercases, trims, dedupes, and sorts', () => {
  const result = normalizeDomains(['B.com', ' a.com ', 'a.com', 'C.com.']);
  assert.deepEqual(result, ['a.com', 'b.com', 'c.com']);
});

test('normalizeDomains tolerates missing or empty input', () => {
  assert.deepEqual(normalizeDomains(undefined), []);
  assert.deepEqual(normalizeDomains([]), []);
});
