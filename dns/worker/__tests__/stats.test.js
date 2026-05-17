import { describe, it, expect } from 'vitest';
import { hashClientIp, dateKey } from '../src/stats.js';

describe('hashClientIp', () => {
  it('returns a 12-character hex string', async () => {
    const hash = await hashClientIp('1.2.3.4', 'salt-abc', 'kids');
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });

  it('is deterministic given same inputs', async () => {
    const a = await hashClientIp('1.2.3.4', 'salt-abc', 'kids');
    const b = await hashClientIp('1.2.3.4', 'salt-abc', 'kids');
    expect(a).toBe(b);
  });

  it('changes when salt changes', async () => {
    const a = await hashClientIp('1.2.3.4', 'salt-old', 'kids');
    const b = await hashClientIp('1.2.3.4', 'salt-new', 'kids');
    expect(a).not.toBe(b);
  });

  it('changes when level changes', async () => {
    const a = await hashClientIp('1.2.3.4', 'salt', 'kids');
    const b = await hashClientIp('1.2.3.4', 'salt', 'teens');
    expect(a).not.toBe(b);
  });

  it('changes when ip changes', async () => {
    const a = await hashClientIp('1.2.3.4', 'salt', 'kids');
    const b = await hashClientIp('1.2.3.5', 'salt', 'kids');
    expect(a).not.toBe(b);
  });
});

describe('dateKey', () => {
  it('formats a Date as YYYY-MM-DD in UTC', () => {
    const d = new Date('2026-05-17T23:50:00Z');
    expect(dateKey(d)).toBe('2026-05-17');
  });

  it('rolls into the next day at UTC midnight', () => {
    const d = new Date('2026-05-18T00:00:00Z');
    expect(dateKey(d)).toBe('2026-05-18');
  });
});
