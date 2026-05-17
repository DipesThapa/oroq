import { describe, it, expect } from 'vitest';
import { interpretResults } from '../public/assets/verify.js';

describe('interpretResults', () => {
  it('reports network error when the allow probe failed', () => {
    expect(interpretResults({
      allow: false, kids: false, teens: false, family: false,
    })).toEqual({ status: 'network', level: null });
  });

  it('reports no-filter when allow loads and all level probes load', () => {
    expect(interpretResults({
      allow: true, kids: true, teens: true, family: true,
    })).toEqual({ status: 'no-filter', level: null });
  });

  it('reports kids when only the kids probe is blocked', () => {
    expect(interpretResults({
      allow: true, kids: false, teens: true, family: true,
    })).toEqual({ status: 'protected', level: 'kids' });
  });

  it('reports teens when only the teens probe is blocked', () => {
    expect(interpretResults({
      allow: true, kids: true, teens: false, family: true,
    })).toEqual({ status: 'protected', level: 'teens' });
  });

  it('reports family when only the family probe is blocked', () => {
    expect(interpretResults({
      allow: true, kids: true, teens: true, family: false,
    })).toEqual({ status: 'protected', level: 'family' });
  });

  it('reports unknown when multiple level probes are blocked', () => {
    expect(interpretResults({
      allow: true, kids: false, teens: false, family: true,
    })).toEqual({ status: 'unknown', level: null });
  });
});
