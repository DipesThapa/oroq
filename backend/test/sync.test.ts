import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { signJwt, sha256Hex } from "../src/crypto";

const ACCOUNT = "acc-sync";
const CHILD_TOKEN = "child-token-sync";

/** Inserts a paired pairing owned by ACCOUNT and returns its id. */
async function seedPairing(paired: boolean): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO pairings (id, account_id, child_label, parent_public_key, child_public_key, child_token_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, ACCOUNT, "Tablet", "PK", paired ? "CK" : null, await sha256Hex(CHILD_TOKEN), Date.now()).run();
  return id;
}

const childHeaders = { "content-type": "application/json", "x-child-token": CHILD_TOKEN };

let pairedId = "";
let unpairedId = "";

beforeAll(async () => {
  pairedId = await seedPairing(true);
  unpairedId = await seedPairing(false);
});

function token(sub: string): Promise<string> {
  return signJwt({ sub, exp: Math.floor(Date.now() / 1000) + 600 }, env.JWT_SECRET);
}

describe("/sync", () => {
  it("stores then returns the latest ciphertext", async () => {
    const put = await SELF.fetch(`https://x/sync/${pairedId}`, {
      method: "POST",
      headers: childHeaders,
      body: JSON.stringify({ ciphertext: "BLOB-1" }),
    });
    expect(put.status).toBe(200);

    const get = await SELF.fetch(`https://x/sync/${pairedId}`, {
      headers: { authorization: `Bearer ${await token(ACCOUNT)}` },
    });
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({ ciphertext: "BLOB-1" });
  });

  it("overwrites with the newest upload", async () => {
    await SELF.fetch(`https://x/sync/${pairedId}`, {
      method: "POST", headers: childHeaders, body: JSON.stringify({ ciphertext: "BLOB-2" }),
    });
    const get = await SELF.fetch(`https://x/sync/${pairedId}`, {
      headers: { authorization: `Bearer ${await token(ACCOUNT)}` },
    });
    expect(await get.json()).toMatchObject({ ciphertext: "BLOB-2" });
  });

  it("accepts a notify flag and still stores the blob (best-effort push)", async () => {
    const res = await SELF.fetch(`https://x/sync/${pairedId}`, {
      method: "POST",
      headers: childHeaders,
      body: JSON.stringify({ ciphertext: "BLOB-NOTIFY", notify: true }),
    });
    expect(res.status).toBe(200);
    const get = await SELF.fetch(`https://x/sync/${pairedId}`, {
      headers: { authorization: `Bearer ${await token(ACCOUNT)}` },
    });
    expect(await get.json()).toMatchObject({ ciphertext: "BLOB-NOTIFY" });
  });

  it("rejects an upload to an unpaired pairing", async () => {
    const res = await SELF.fetch(`https://x/sync/${unpairedId}`, {
      method: "POST",
      headers: childHeaders,
      body: JSON.stringify({ ciphertext: "BLOB" }),
    });
    expect(res.status).toBe(409);
  });

  it("rejects an upload without the child token", async () => {
    const res = await SELF.fetch(`https://x/sync/${pairedId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ciphertext: "BLOB" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a GET without a token", async () => {
    const res = await SELF.fetch(`https://x/sync/${pairedId}`);
    expect(res.status).toBe(401);
  });

  it("rejects a GET from a different account", async () => {
    const res = await SELF.fetch(`https://x/sync/${pairedId}`, {
      headers: { authorization: `Bearer ${await token("someone-else")}` },
    });
    expect(res.status).toBe(403);
  });
});
