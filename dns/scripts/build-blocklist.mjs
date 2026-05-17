#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = join(__dirname, '..', 'data', 'sources');
const BUILT_DIR = join(__dirname, '..', 'data', 'built');

/**
 * Pure function (testable): given a map of source filename → parsed JSON,
 * return per-level built blocklists.
 */
export function buildLevels(sources) {
  const levels = sources['_levels.json'];
  const sentinels = sources['_sentinels.json'] ?? {};
  if (!levels) throw new Error('_levels.json missing');

  const out = {};
  for (const [level, categories] of Object.entries(levels)) {
    const set = new Set();

    for (const category of categories) {
      const file = `${category}.json`;
      const src = sources[file];
      if (!src) throw new Error(`category source not found: ${file}`);
      for (const d of src.domains ?? []) {
        set.add(d.toLowerCase());
      }
    }

    for (const sentinel of sentinels[level] ?? []) {
      set.add(sentinel.toLowerCase());
    }

    const domains = [...set].sort();
    const version = createHash('sha256')
      .update(domains.join('\n'))
      .digest('hex')
      .slice(0, 12);

    out[level] = { level, count: domains.length, version, domains };
  }
  return out;
}

function loadSources(dir) {
  const out = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    out[file] = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  }
  return out;
}

function main() {
  const sources = loadSources(SOURCES_DIR);
  const built = buildLevels(sources);
  mkdirSync(BUILT_DIR, { recursive: true });
  for (const [level, data] of Object.entries(built)) {
    const path = join(BUILT_DIR, `${level}.json`);
    writeFileSync(path, JSON.stringify(data, null, 2));
    console.log(`built ${level}: ${data.count} domains (version ${data.version})`);
  }
}

// CLI entrypoint: only run main when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
