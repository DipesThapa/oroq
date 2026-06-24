import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { signJwt } from "../src/crypto";

const PARENT_KEY = "P".repeat(44);
const CHILD_KEY = "C".repeat(44);

async function accountToken(sub = "acc-test"): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 600;
  return signJwt({ sub, exp }, env.JWT_SECRET);
}

function fetchJson(path: string, init: RequestInit): Promise<Response> {
  return SELF.fetch(`https://example.com${path}`, init);
}

/** Child side: create a pairing (no auth) with the child's public key. */
async function childCreate(childPublicKey = CHILD_KEY) {
  const res = await fetchJson("/pair/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ childPublicKey }),
  });
  return res;
}

/** Parent side: join a pairing by code (authenticated). */
function parentJoin(token: string, code: string, childLabel?: string) {
  return fetchJson("/pair/join", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ code, parentPublicKey: PARENT_KEY, childLabel }),
  });
}

describe("/pair (child-led)", () => {
  it("rejects pair/create without a child public key", async () => {
    const res = await fetchJson("/pair/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("mints a child token on create (returned once, only its hash is stored)", async () => {
    const res = await childCreate();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { childToken?: string };
    expect(typeof body.childToken).toBe("string");
    expect((body.childToken ?? "").length).toBeGreaterThanOrEqual(32);
  });

  it("rejects pair/join without a token", async () => {
    const create = await childCreate();
    const { code } = (await create.json()) as { code: string };
    const res = await fetchJson("/pair/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, parentPublicKey: PARENT_KEY }),
    });
    expect(res.status).toBe(401);
  });

  it("child creates a code, parent joins it, and the record is complete", async () => {
    const create = await childCreate();
    expect(create.status).toBe(200);
    const created = (await create.json()) as { pairingId: string; code: string };
    expect(created.code).toHaveLength(8);

    const token = await accountToken();
    const join = await parentJoin(token, created.code, "Tablet");
    expect(join.status).toBe(200);
    expect(await join.json()).toMatchObject({
      pairingId: created.pairingId,
      childPublicKey: CHILD_KEY,
    });

    const get = await fetchJson(`/pair/${created.pairingId}`, { method: "GET" });
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({
      paired: true,
      parentPublicKey: PARENT_KEY,
      childPublicKey: CHILD_KEY,
      childLabel: "Tablet",
    });
  });

  it("reports not-yet-paired before the parent joins", async () => {
    const create = await childCreate();
    const { pairingId } = (await create.json()) as { pairingId: string };
    const get = await fetchJson(`/pair/${pairingId}`, { method: "GET" });
    expect(await get.json()).toMatchObject({ paired: false, parentPublicKey: null });
  });

  it("rejects an unknown code", async () => {
    const token = await accountToken();
    const res = await parentJoin(token, "ZZZZZZZZ");
    expect(res.status).toBe(404);
  });

  it("rejects re-using a consumed code", async () => {
    const create = await childCreate();
    const { code } = (await create.json()) as { code: string };
    const token = await accountToken();
    expect((await parentJoin(token, code)).status).toBe(200);
    // A successful join consumes the code, so re-using it is rejected.
    expect((await parentJoin(token, code)).status).toBe(404);
  });

  it("unpairs: the owning parent deletes the pairing and it 404s afterwards", async () => {
    const create = await childCreate();
    const { pairingId, code } = (await create.json()) as { pairingId: string; code: string };
    const token = await accountToken();
    await parentJoin(token, code);

    const del = await fetchJson(`/pair/${pairingId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.status).toBe(200);

    const get = await fetchJson(`/pair/${pairingId}`, { method: "GET" });
    expect(get.status).toBe(404);
  });

  it("forbids unpairing another account's pairing", async () => {
    const create = await childCreate();
    const { pairingId, code } = (await create.json()) as { pairingId: string; code: string };
    const ownerToken = await accountToken("acc-owner");
    await parentJoin(ownerToken, code);

    const otherToken = await accountToken("acc-other");
    const del = await fetchJson(`/pair/${pairingId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(del.status).toBe(403);
  });
});
