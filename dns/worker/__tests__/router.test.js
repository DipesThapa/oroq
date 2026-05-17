import { describe, it, expect } from 'vitest';
import { extractLevel } from '../src/router.js';

describe('extractLevel', () => {
  it('extracts kids', () => {
    expect(extractLevel('kids.dns.cyberheroez.co.uk')).toBe('kids');
  });

  it('extracts teens', () => {
    expect(extractLevel('teens.dns.cyberheroez.co.uk')).toBe('teens');
  });

  it('extracts family', () => {
    expect(extractLevel('family.dns.cyberheroez.co.uk')).toBe('family');
  });

  it('returns null for unknown subdomain', () => {
    expect(extractLevel('something.dns.cyberheroez.co.uk')).toBe(null);
  });

  it('returns null for missing subdomain', () => {
    expect(extractLevel('dns.cyberheroez.co.uk')).toBe(null);
  });

  it('returns null for empty string', () => {
    expect(extractLevel('')).toBe(null);
  });

  it('lowercases the hostname before matching', () => {
    expect(extractLevel('KIDS.dns.cyberheroez.co.uk')).toBe('kids');
  });
});
