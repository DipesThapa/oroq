import { describe, it, expect } from 'vitest';
import { substituteUuids } from '../lib/generate.js';

const TEMPLATE = `
<key>PayloadUUID</key>
<string>{{UUID_OUTER}}</string>
<key>InnerPayloadUUID</key>
<string>{{UUID_INNER}}</string>
`;

describe('substituteUuids', () => {
  it('replaces UUID_OUTER and UUID_INNER placeholders', () => {
    const out = substituteUuids(TEMPLATE);
    expect(out).not.toContain('{{UUID_OUTER}}');
    expect(out).not.toContain('{{UUID_INNER}}');
  });

  it('produces uppercase UUIDs in canonical 8-4-4-4-12 format', () => {
    const out = substituteUuids(TEMPLATE);
    const uuidRegex = /[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/g;
    const matches = out.match(uuidRegex);
    expect(matches).toHaveLength(2);
  });

  it('produces distinct UUIDs for OUTER and INNER on the same call', () => {
    const out = substituteUuids(TEMPLATE);
    const uuids = out.match(/[0-9A-F-]{36}/g);
    expect(uuids[0]).not.toBe(uuids[1]);
  });

  it('produces different UUIDs across calls', () => {
    const a = substituteUuids(TEMPLATE);
    const b = substituteUuids(TEMPLATE);
    expect(a).not.toBe(b);
  });

  it('leaves non-placeholder content untouched', () => {
    const out = substituteUuids(TEMPLATE);
    expect(out).toContain('<key>PayloadUUID</key>');
    expect(out).toContain('<key>InnerPayloadUUID</key>');
  });
});
