export class StatsCounter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/incr') {
      const type = url.searchParams.get('type');
      if (type !== 'queries' && type !== 'blocks') {
        return new Response('bad type', { status: 400 });
      }
      const current = (await this.state.storage.get(type)) ?? 0;
      const next = current + 1;
      await this.state.storage.put(type, next);
      return new Response(String(next));
    }

    if (request.method === 'POST' && url.pathname === '/install') {
      const hash = url.searchParams.get('hash');
      if (!hash) return new Response('hash required', { status: 400 });
      // Stored as set entries keyed "h:<hash>"; existence-only marker.
      await this.state.storage.put(`h:${hash}`, 1);
      return new Response('ok');
    }

    if (request.method === 'GET' && url.pathname === '/snapshot') {
      const queries = (await this.state.storage.get('queries')) ?? 0;
      const blocks = (await this.state.storage.get('blocks')) ?? 0;
      // Count keys prefixed "h:" to get unique installs.
      const hashes = await this.state.storage.list({ prefix: 'h:' });
      return Response.json({
        queries,
        blocks,
        installs: hashes.size,
      });
    }

    return new Response('not found', { status: 404 });
  }
}
