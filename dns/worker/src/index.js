export { StatsCounter } from './stats-do.js';

export default {
  async fetch(request) {
    return new Response('SafeBrowse DoH placeholder', { status: 200 });
  },
};
