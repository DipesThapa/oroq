#!/usr/bin/env node
// Generate packed DNR static rulesets from the Android blocklists so the
// extension blocks the same domains at the network layer.
//
// Chrome DNR counts RULES, not domains: packing N domains into one rule's
// `requestDomains` keeps us far below the static-rule limits (~530 rules for
// ~529k domains at 1,000 domains/rule).
//
// Deliberately excluded: malware.txt / phishing.txt — Chrome Safe Browsing
// already covers those categories with live data; shipping a static snapshot
// adds megabytes and goes stale in days.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'blocklists');
const OUT_DIR = path.join(ROOT, 'data', 'dnr');

const DOMAINS_PER_RULE = 1000;

// category -> starting rule id (existing static_rules use ids ~1001+; keep clear)
const CATEGORIES = [
  { name: 'adult', file: 'adult.txt', idBase: 100000 },
  { name: 'drugs', file: 'drugs.txt', idBase: 200000 },
  { name: 'gambling', file: 'gambling.txt', idBase: 210000 },
  { name: 'doh', file: 'doh.txt', idBase: 220000 }
];

function loadDomains(file) {
  const text = readFileSync(path.join(SRC_DIR, file), 'utf8');
  const set = new Set();
  for (const line of text.split('\n')) {
    const d = line.trim().toLowerCase();
    if (!d || d.startsWith('#')) continue;
    // very light validation: must look like a registrable domain
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) continue;
    set.add(d);
  }
  return [...set].sort();
}

function buildRules(domains, idBase) {
  const rules = [];
  for (let i = 0; i < domains.length; i += DOMAINS_PER_RULE) {
    rules.push({
      id: idBase + rules.length + 1,
      priority: 1,
      action: { type: 'block' },
      condition: {
        requestDomains: domains.slice(i, i + DOMAINS_PER_RULE),
        resourceTypes: ['main_frame', 'sub_frame']
      }
    });
  }
  return rules;
}

mkdirSync(OUT_DIR, { recursive: true });
let totalDomains = 0;
let totalRules = 0;
const summary = [];
for (const cat of CATEGORIES) {
  const domains = loadDomains(cat.file);
  const rules = buildRules(domains, cat.idBase);
  const outPath = path.join(OUT_DIR, `${cat.name}.json`);
  writeFileSync(outPath, JSON.stringify(rules));
  totalDomains += domains.length;
  totalRules += rules.length;
  summary.push(`${cat.name}: ${domains.length} domains -> ${rules.length} rules`);
}
// eslint-disable-next-line no-console
console.log(summary.join('\n'));
// eslint-disable-next-line no-console
console.log(`TOTAL: ${totalDomains} domains in ${totalRules} rules -> data/dnr/`);
