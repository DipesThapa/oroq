#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { substituteUuids } from './lib/generate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, '..', 'templates');
const BUILD_DIR = join(__dirname, '..', 'build');

const LEVELS = ['kids', 'teens', 'family'];

function main() {
  mkdirSync(BUILD_DIR, { recursive: true });
  for (const level of LEVELS) {
    const tplPath = join(TEMPLATE_DIR, `${level}.mobileconfig.template`);
    const outPath = join(BUILD_DIR, `${level}.mobileconfig`);
    const template = readFileSync(tplPath, 'utf8');
    const out = substituteUuids(template);
    writeFileSync(outPath, out);
    console.log(`wrote ${outPath}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
