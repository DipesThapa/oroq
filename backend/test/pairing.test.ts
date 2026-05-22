import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { signJwt } from "../src/crypto";

const PARENT_KEY = "P".repeat(44);
const CHILD_KEY = "C".repeat(44);

async function accountToken(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 600;
  return signJwt({ sub: "acc-test", exp }, env.JWT_SECRET);
}

function fetchJson(path: string, init: RequestInit): Promise<Response> {
  return SELF.fetch(`https://example.com${path}`, init);
}

describe("/pair", () => {
  it("rejects pair/create without a token", async () => {
    const res = await fetchJson("/pair/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentPublicKey: PARENT_KEY }),
    });
    expect(res.status).toBe(401);
  });

  it("creates a pairing + code, lets a child join, and exposes the record", async () => {
    const token = await accountToken();
    const create = await fetchJson("/pair/create", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ parentPublicKey: PARENT_KEY, childLabel: "Tablet" }),
    });
    expect(create.status).toBe(200);
    const created = (await create.json()) as { pairingId: string; code: string };
    expect(created.code).toHaveLength(8);

    const join = await fetchJson("/pair/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: created.code, childPublicKey: CHILD_KEY }),
    });
    expect(join.status).toBe(200);
    expect(await join.json()).toMatchObject({
      pairingId: created.pairingId,
      parentPublicKey: PARENT_KEY,
    });

    const get = await fetchJson(`/pair/${created.pairingId}`, { method: "GET" });
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({
      paired: true,
      childPublicKey: CHILD_KEY,
      childLabel: "Tablet",
    });
  });

  it("rejects an unknown code", async () => {
    const res = await fetchJson("/pair/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "ZZZZZZZZ", childPublicKey: CHILD_KEY }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects re-using a consumed code", async () => {
    const token = await accountToken();
    const create = await fetchJson("/pair/create", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ parentPublicKey: PARENT_KEY }),
    });
    const { code } = (await create.json()) as { code: string };
    const body = JSON.stringify({ code, childPublicKey: CHILD_KEY });
    const headers = { "content-type": "application/json" };
    const first = await fetchJson("/pair/join", { method: "POST", headers, body });
    expect(first.status).toBe(200);
    // A successful join consumes the code, so re-using it is rejected.
    const second = await fetchJson("/pair/join", { method: "POST", headers, body });
    expect(second.status).toBe(404);
  });
});
