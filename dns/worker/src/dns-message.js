const HEADER_LEN = 12;

/**
 * Extract the queried domain name from a DNS message (question section).
 * Returns the lowercase domain as a dot-separated string (no trailing dot).
 * Throws on malformed or compressed input.
 */
export function parseQuestionDomain(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('expected Uint8Array');
  }
  if (bytes.length < HEADER_LEN + 1) {
    throw new Error('message truncated: shorter than header + qname terminator');
  }

  const labels = [];
  let offset = HEADER_LEN;

  while (offset < bytes.length) {
    const len = bytes[offset];

    // End of name
    if (len === 0) {
      return labels.join('.').toLowerCase();
    }

    // Compression pointers (high two bits set) are not permitted in the
    // question section per RFC 1035 §4.1.4.
    if ((len & 0xc0) !== 0) {
      throw new Error('compression pointer in question is not permitted');
    }

    offset += 1;
    if (offset + len > bytes.length) {
      throw new Error('message truncated within label');
    }

    let label = '';
    for (let i = 0; i < len; i++) {
      label += String.fromCharCode(bytes[offset + i]);
    }
    labels.push(label);
    offset += len;
  }

  throw new Error('message truncated: no terminator');
}

/**
 * Build an NXDOMAIN response for the given DNS query.
 * Copies the query bytes and flips the appropriate header bits.
 */
export function buildNxdomainResponse(queryBytes) {
  if (!(queryBytes instanceof Uint8Array)) {
    throw new TypeError('expected Uint8Array');
  }
  if (queryBytes.length < HEADER_LEN) {
    throw new Error('query truncated');
  }

  const out = new Uint8Array(queryBytes);

  // Flags byte 1: keep RD (recursion desired) bit from query, set QR=1, AA=1.
  // QR is bit 7, AA is bit 2 (RFC 1035 §4.1.1).
  const flags1 = queryBytes[2];
  const rd = flags1 & 0x01;
  out[2] = 0x80 /* QR */ | 0x04 /* AA */ | rd;

  // Flags byte 2: RA=0, Z=0, rcode=3 (NXDOMAIN).
  out[3] = 0x03;

  // Zero out answer/authority/additional counts (they should already be 0
  // in a query, but be defensive).
  out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0;
  out[10] = 0; out[11] = 0;

  return out;
}
