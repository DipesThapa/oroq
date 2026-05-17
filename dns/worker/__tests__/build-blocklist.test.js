// This test exercises the pure `buildLevels` function from the Node-based
// build script. It works inside the workers pool because we set
// compatibility_flags = ["nodejs_compat"] in wrangler.toml, which exposes
// node:crypto. The script's node:fs imports are loaded but never invoked
// because `buildLevels` itself does no IO.

import { describe, it, expect } from 'vitest';
import { buildLevels } from '../../scripts/build-blocklist.mjs';

const SOURCES = {
  '_levels.json': {
    kids: ['adult', 'social'],
    teens: ['adult'],
    family: ['adult'],
  },
  '_sentinels.json': {
    kids:   ['kids-sentinel.example'],
    teens:  ['teens-sentinel.example'],
    family: ['family-sentinel.example'],
  },
  'adult.json': {
    category: 'adult',
    domains: ['pornhub.com', 'xvideos.com'],
  },
  'social.json': {
    category: 'social',
    domains: ['tiktok.com'],
  },
};

describe('buildLevels', () => {
  it('merges categories per level definition', () => {
    const result = buildLevels(SOURCES);
    expect(result.kids.domains.sort()).toEqual(
      ['kids-sentinel.example', 'pornhub.com', 'tiktok.com', 'xvideos.com']
    );
    expect(result.teens.domains.sort()).toEqual(
      ['pornhub.com', 'teens-sentinel.example', 'xvideos.com']
    );
    expect(result.family.domains.sort()).toEqual(
      ['family-sentinel.example', 'pornhub.com', 'xvideos.com']
    );
  });

  it('dedupes domains across categories', () => {
    const sources = {
      ...SOURCES,
      'social.json': { category: 'social', domains: ['pornhub.com'] },
    };
    const result = buildLevels(sources);
    const kidsCount = result.kids.domains.filter((d) => d === 'pornhub.com').length;
    expect(kidsCount).toBe(1);
  });

  it('lowercases all domains', () => {
    const sources = {
      ...SOURCES,
      'adult.json': { category: 'adult', domains: ['PORNHUB.COM'] },
    };
    const result = buildLevels(sources);
    expect(result.kids.domains).toContain('pornhub.com');
    expect(result.kids.domains).not.toContain('PORNHUB.COM');
  });

  it('includes version hash for cache busting', () => {
    const result = buildLevels(SOURCES);
    expect(result.kids.version).toMatch(/^[0-9a-f]+$/);
  });

  it('throws when a referenced category is missing', () => {
    const broken = {
      ...SOURCES,
      '_levels.json': { kids: ['adult', 'gambling'], teens: [], family: [] },
    };
    expect(() => buildLevels(broken)).toThrow(/gambling/);
  });
});
