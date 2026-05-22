import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomains, parseHostsList } from '../build-blocklist.mjs';

test('normalizeDomains lowercases, trims, dedupes, and sorts', () => {
  const result = normalizeDomains(['B.com', ' a.com ', 'a.com', 'C.com.']);
  assert.deepEqual(result, ['a.com', 'b.com', 'c.com']);
});

test('normalizeDomains tolerates missing or empty input', () => {
  assert.deepEqual(normalizeDomains(undefined), []);
  assert.deepEqual(normalizeDomains([]), []);
});

test('parseHostsList extracts domains from hosts-format lines', () => {
  const text = '# comment\n0.0.0.0 evil.com\n0.0.0.0 bad.net\n\nplain.org\n';
  assert.deepEqual(parseHostsList(text), ['evil.com', 'bad.net', 'plain.org']);
});

test('parseHostsList drops comments, blanks, and non-domains', () => {
  const text = '# header\n\n0.0.0.0 localhost\n0.0.0.0\nnotadomain\n0.0.0.0 ok.com\n';
  assert.deepEqual(parseHostsList(text), ['ok.com']);
});
