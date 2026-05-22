import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { rateLimit } from "../src/ratelimit";

describe("rateLimit", () => {
  it("allows up to the limit, then blocks", async () => {
    expect(await rateLimit(env, "key-a", 2, 60)).toBe(true);
    expect(await rateLimit(env, "key-a", 2, 60)).toBe(true);
    expect(await rateLimit(env, "key-a", 2, 60)).toBe(false);
  });

  it("tracks keys independently", async () => {
    expect(await rateLimit(env, "key-b", 1, 60)).toBe(true);
    expect(await rateLimit(env, "key-b", 1, 60)).toBe(false);
    expect(await rateLimit(env, "key-c", 1, 60)).toBe(true);
  });
});
