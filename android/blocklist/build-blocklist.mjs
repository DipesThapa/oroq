#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
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

/**
 * Pure, testable: extract domains from hosts-format text. Each non-comment
 * line's last whitespace-separated token is the domain; sink addresses and
 * non-domain tokens are dropped.
 */
export function parseHostsList(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const domain = parts[parts.length - 1].toLowerCase();
    if (!domain || domain === 'localhost' || !domain.includes('.')) continue;
    if (domain === '0.0.0.0' || domain.startsWith('0.0.0.0')) continue;
    out.push(domain);
  }
  return out;
}

async function main() {
  const externalPath = join(SOURCES_DIR, '_external.json');
  const external = existsSync(externalPath)
    ? JSON.parse(readFileSync(externalPath, 'utf8'))
    : {};

  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = [];

  for (const file of readdirSync(SOURCES_DIR)) {
    if (!file.endsWith('.json') || file.startsWith('_')) continue;
    const category = file.replace(/\.json$/, '');
    const curated = JSON.parse(readFileSync(join(SOURCES_DIR, file), 'utf8')).domains ?? [];

    let extra = [];
    if (external[category]) {
      const resp = await fetch(external[category]);
      if (!resp.ok) throw new Error(`fetch failed for ${category}: ${resp.status}`);
      extra = parseHostsList(await resp.text());
    }

    const domains = normalizeDomains([...curated, ...extra]);
    const body = domains.join('\n') + '\n';
    writeFileSync(join(OUT_DIR, `${category}.txt`), body);
    const version = createHash('sha256').update(body).digest('hex').slice(0, 12);
    manifest.push(`${category} ${version}`);
    console.log(`built ${category}: ${domains.length} domains (version ${version})`);
  }

  writeFileSync(join(OUT_DIR, 'manifest.txt'), manifest.sort().join('\n') + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
