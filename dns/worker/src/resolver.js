/**
 * Forward a binary DNS query to a DoH-compatible upstream and return the
 * binary response bytes.
 */
export async function resolveUpstream(upstreamUrl, queryBytes) {
  const resp = await fetch(upstreamUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/dns-message' },
    body: queryBytes,
  });

  if (!resp.ok) {
    throw new Error(`upstream returned ${resp.status}`);
  }

  const buf = await resp.arrayBuffer();
  return new Uint8Array(buf);
}
