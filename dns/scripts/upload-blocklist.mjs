#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILT_DIR = join(__dirname, '..', 'data', 'built');
const LEVELS = ['kids', 'teens', 'family'];

function buildBulkEntries(level) {
  const path = join(BUILT_DIR, `${level}.json`);
  if (!existsSync(path)) {
    throw new Error(`missing built file: ${path} — run blocklist:build first`);
  }
  const { domains, version, count } = JSON.parse(readFileSync(path, 'utf8'));
  const entries = domains.map((d) => ({
    key: `${level}:domain:${d}`,
    value: '1',
  }));
  // Bookkeeping keys
  entries.push({ key: `meta:blocklist:${level}:version`, value: version });
  entries.push({ key: `meta:blocklist:${level}:count`, value: String(count) });
  return entries;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const tmp = mkdtempSync(join(tmpdir(), 'safebrowse-kv-'));

  try {
    for (const level of LEVELS) {
      const entries = buildBulkEntries(level);
      const filePath = join(tmp, `${level}.json`);
      writeFileSync(filePath, JSON.stringify(entries));
      console.log(`prepared ${entries.length} entries for ${level}`);

      if (dryRun) {
        console.log(`  [dry-run] would upload ${filePath}`);
        continue;
      }

      // Requires `wrangler` on PATH and BLOCKLIST_KV namespace bound.
      execFileSync(
        'npx',
        ['wrangler', 'kv:bulk', 'put', '--binding', 'BLOCKLIST_KV', filePath],
        { stdio: 'inherit', cwd: join(__dirname, '..', 'worker') }
      );
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
