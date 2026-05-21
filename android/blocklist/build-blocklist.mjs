#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = join(__dirname, 'sources');
const OUT_DIR = join(__dirname, '..', 'app', 'src', 'main', 'assets', 'blocklists');

/**
 * Pure, testable: normalise a raw domain list into a sorted, de-duplicated,
 * lowercased array. Trailing dots and surrounding whitespace are stripped.
 */
export function normalizeDomains(domains) {
  const set = new Set();
  for (const d of domains ?? []) {
    const clean = String(d).trim().toLowerCase().replace(/\.$/, '');
    if (clean) set.add(clean);
  }
  return [...set].sort();
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = {};
  for (const file of readdirSync(SOURCES_DIR)) {
    if (!file.endsWith('.json')) continue;
    const category = file.replace(/\.json$/, '');
    const src = JSON.parse(readFileSync(join(SOURCES_DIR, file), 'utf8'));
    const domains = normalizeDomains(src.domains);
    const body = domains.join('\n') + '\n';
    writeFileSync(join(OUT_DIR, `${category}.txt`), body);
    const version = createHash('sha256').update(body).digest('hex').slice(0, 12);
    manifest[category] = { count: domains.length, version };
    console.log(`built ${category}: ${domains.length} domains (version ${version})`);
  }
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
