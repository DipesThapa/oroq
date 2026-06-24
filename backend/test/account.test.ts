import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { signJwt } from "../src/crypto";

const ACCOUNT = "acc-del";
const OTHER = "acc-other-del";

function token(sub: string): Promise<string> {
  return signJwt({ sub, exp: Math.floor(Date.now() / 1000) + 600 }, env.JWT_SECRET);
}

let pairingId = "";

beforeAll(async () => {
  await env.DB.prepare("INSERT INTO accounts (id, email, created_at) VALUES (?, ?, ?)")
    .bind(ACCOUNT, "del@example.com", Date.now())
    .run();
  pairingId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO pairings (id, account_id, child_label, parent_public_key, child_public_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(pairingId, ACCOUNT, "Tablet", "PK", "CK", Date.now()).run();
  await env.DB.prepare("INSERT INTO push_tokens (account_id, token, created_at) VALUES (?, ?, ?)")
    .bind(ACCOUNT, "fcm-tok", Date.now())
    .run();
  await env.KV.put(`summary:${pairingId}`, "BLOB");
  await env.KV.put(`cmds:${pairingId}`, "[]");
});

describe("DELETE /account", () => {
  it("rejects without a token", async () => {
    const res = await SELF.fetch("https://x/account", { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("deletes the account, its pairings, push tokens, and KV traces", async () => {
    const res = await SELF.fetch("https://x/account", {
      method: "DELETE",
      headers: { authorization: `Bearer ${await token(ACCOUNT)}` },
    });
    expect(res.status).toBe(200);

    const acct = await env.DB.prepare("SELECT id FROM accounts WHERE id = ?").bind(ACCOUNT).first();
    expect(acct).toBeNull();
    const pair = await env.DB.prepare("SELECT id FROM pairings WHERE account_id = ?").bind(ACCOUNT).first();
    expect(pair).toBeNull();
    const push = await env.DB.prepare("SELECT token FROM push_tokens WHERE account_id = ?").bind(ACCOUNT).first();
    expect(push).toBeNull();
    expect(await env.KV.get(`summary:${pairingId}`)).toBeNull();
    expect(await env.KV.get(`cmds:${pairingId}`)).toBeNull();
  });

  it("is idempotent for an already-deleted account", async () => {
    const res = await SELF.fetch("https://x/account", {
      method: "DELETE",
      headers: { authorization: `Bearer ${await token(ACCOUNT)}` },
    });
    expect(res.status).toBe(200);
  });

  it("only touches the caller's own data", async () => {
    // Seed a second account with a pairing, delete a DIFFERENT (empty) caller,
    // and confirm the second account's data survives.
    await env.DB.prepare("INSERT INTO accounts (id, email, created_at) VALUES (?, ?, ?)")
      .bind(OTHER, "other@example.com", Date.now())
      .run();
    const otherPairing = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO pairings (id, account_id, parent_public_key, created_at) VALUES (?, ?, ?, ?)`,
    ).bind(otherPairing, OTHER, "PK", Date.now()).run();

    const res = await SELF.fetch("https://x/account", {
      method: "DELETE",
      headers: { authorization: `Bearer ${await token("acc-nonexistent")}` },
    });
    expect(res.status).toBe(200);

    const survives = await env.DB.prepare("SELECT id FROM pairings WHERE id = ?").bind(otherPairing).first();
    expect(survives).not.toBeNull();
  });
});
