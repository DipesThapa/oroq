import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { signJwt, sha256Hex } from "../src/crypto";

const ACCOUNT = "acc-cmd";
const CHILD_TOKEN = "child-token-cmd";

async function seedPairing(): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO pairings (id, account_id, child_label, parent_public_key, child_public_key, child_token_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, ACCOUNT, "Tablet", "PK", "CK", await sha256Hex(CHILD_TOKEN), Date.now()).run();
  return id;
}

const childHeaders = { "content-type": "application/json", "x-child-token": CHILD_TOKEN };

let pairingId = "";
beforeAll(async () => { pairingId = await seedPairing(); });

function token(sub: string): Promise<string> {
  return signJwt({ sub, exp: Math.floor(Date.now() / 1000) + 600 }, env.JWT_SECRET);
}

describe("/cmd", () => {
  it("enqueues, lists, then acks commands", async () => {
    const send = await SELF.fetch(`https://x/cmd/${pairingId}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${await token(ACCOUNT)}` },
      body: JSON.stringify({ ciphertext: "CMD-1" }),
    });
    expect(send.status).toBe(200);
    const sent = await send.json() as { id: string };
    expect(typeof sent.id).toBe("string");

    const list = await SELF.fetch(`https://x/cmd/${pairingId}`, { headers: childHeaders });
    expect(list.status).toBe(200);
    const listed = await list.json() as { commands: { id: string; ciphertext: string }[] };
    expect(listed.commands).toHaveLength(1);
    expect(listed.commands[0].ciphertext).toBe("CMD-1");

    const ack = await SELF.fetch(`https://x/cmd/${pairingId}/ack`, {
      method: "POST",
      headers: childHeaders,
      body: JSON.stringify({ ids: [sent.id] }),
    });
    expect(ack.status).toBe(200);

    const after = await SELF.fetch(`https://x/cmd/${pairingId}`, { headers: childHeaders });
    expect((await after.json() as { commands: unknown[] }).commands).toHaveLength(0);
  });

  it("rejects fetch without the child token", async () => {
    const res = await SELF.fetch(`https://x/cmd/${pairingId}`);
    expect(res.status).toBe(401);
  });

  it("rejects ack without the child token (can't drop a parent's commands)", async () => {
    const res = await SELF.fetch(`https://x/cmd/${pairingId}/ack`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["whatever"] }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects fetch with a wrong child token", async () => {
    const res = await SELF.fetch(`https://x/cmd/${pairingId}`, {
      headers: { "x-child-token": "nope" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects enqueue without a token", async () => {
    const res = await SELF.fetch(`https://x/cmd/${pairingId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ciphertext: "X" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects enqueue from a different account", async () => {
    const res = await SELF.fetch(`https://x/cmd/${pairingId}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${await token("other")}` },
      body: JSON.stringify({ ciphertext: "X" }),
    });
    expect(res.status).toBe(403);
  });
});
