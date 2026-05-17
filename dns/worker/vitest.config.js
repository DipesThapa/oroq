import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        // isolatedStorage adds heavy cleanup machinery that's failing in this
        // version (0.5.41) when DOs are involved. We isolate state explicitly
        // in beforeEach where needed; turn it off for stability.
        isolatedStorage: false,
        // Run all test files in a single shared runtime to avoid runtime
        // start-up resource pressure when multiple files run together.
        singleWorker: true,
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
});
