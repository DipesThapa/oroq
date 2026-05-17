import { describe, it, expect } from 'vitest';
import { parseQuestionDomain, buildNxdomainResponse } from '../src/dns-message.js';

// Hex of a real DoH query for "example.com" type A, class IN
// 12-byte header (id=0xabcd, flags=0x0100, qd=1, an/ns/ar=0)
// + question: 07 'example' 03 'com' 00 + type 0001 + class 0001
const EXAMPLE_COM_QUERY = new Uint8Array([
  0xab, 0xcd, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x07, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65,
  0x03, 0x63, 0x6f, 0x6d,
  0x00,
  0x00, 0x01,
  0x00, 0x01,
]);

const PORNHUB_COM_QUERY = new Uint8Array([
  0xde, 0xad, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x07, 0x70, 0x6f, 0x72, 0x6e, 0x68, 0x75, 0x62,
  0x03, 0x63, 0x6f, 0x6d,
  0x00,
  0x00, 0x01,
  0x00, 0x01,
]);

describe('parseQuestionDomain', () => {
  it('extracts a two-label domain', () => {
    expect(parseQuestionDomain(EXAMPLE_COM_QUERY)).toBe('example.com');
  });

  it('extracts a different two-label domain', () => {
    expect(parseQuestionDomain(PORNHUB_COM_QUERY)).toBe('pornhub.com');
  });

  it('extracts a single-label root query as empty string', () => {
    const rootOnly = new Uint8Array([
      0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x01, 0x00, 0x01,
    ]);
    expect(parseQuestionDomain(rootOnly)).toBe('');
  });

  it('extracts a three-label subdomain', () => {
    // img.example.com
    const sub = new Uint8Array([
      0x00, 0x02, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x03, 0x69, 0x6d, 0x67,
      0x07, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65,
      0x03, 0x63, 0x6f, 0x6d,
      0x00,
      0x00, 0x01,
      0x00, 0x01,
    ]);
    expect(parseQuestionDomain(sub)).toBe('img.example.com');
  });

  it('throws on truncated message (header only)', () => {
    const headerOnly = new Uint8Array(12);
    expect(() => parseQuestionDomain(headerOnly)).toThrow();
  });

  it('rejects compression pointers (not allowed in question)', () => {
    // 0xc0 0x0c is a pointer — must not appear in question section
    const withPtr = new Uint8Array([
      0x00, 0x03, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xc0, 0x0c,
      0x00, 0x01, 0x00, 0x01,
    ]);
    expect(() => parseQuestionDomain(withPtr)).toThrow();
  });
});

describe('buildNxdomainResponse', () => {
  it('preserves the query ID', () => {
    const resp = buildNxdomainResponse(EXAMPLE_COM_QUERY);
    expect(resp[0]).toBe(0xab);
    expect(resp[1]).toBe(0xcd);
  });

  it('sets QR=1, AA=1, rcode=3 in flags', () => {
    const resp = buildNxdomainResponse(EXAMPLE_COM_QUERY);
    // Flags byte 1: QR=1, opcode=0, AA=1, TC=0, RD=copied (1) → 1000 0101 = 0x85
    expect(resp[2]).toBe(0x85);
    // Flags byte 2: RA=0, Z=0, rcode=3 → 0000 0011 = 0x03
    expect(resp[3]).toBe(0x03);
  });

  it('keeps QDCOUNT=1, all other counts 0', () => {
    const resp = buildNxdomainResponse(EXAMPLE_COM_QUERY);
    // QDCOUNT
    expect(resp[4]).toBe(0);
    expect(resp[5]).toBe(1);
    // ANCOUNT, NSCOUNT, ARCOUNT
    for (let i = 6; i < 12; i++) {
      expect(resp[i]).toBe(0);
    }
  });

  it('echoes the question section verbatim', () => {
    const resp = buildNxdomainResponse(EXAMPLE_COM_QUERY);
    for (let i = 12; i < EXAMPLE_COM_QUERY.length; i++) {
      expect(resp[i]).toBe(EXAMPLE_COM_QUERY[i]);
    }
  });

  it('returns a Uint8Array of identical length to the input', () => {
    const resp = buildNxdomainResponse(EXAMPLE_COM_QUERY);
    expect(resp).toBeInstanceOf(Uint8Array);
    expect(resp.length).toBe(EXAMPLE_COM_QUERY.length);
  });
});
