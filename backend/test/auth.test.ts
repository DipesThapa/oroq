import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { sha256Hex, verifyJwt } from "../src/crypto";

function post(path: string, body: object): Promise<Response> {
  return SELF.fetch(`https://example.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/auth", () => {
  it("stores an OTP hash on request", async () => {
    const res = await post("/auth/request", { email: "Alice@Example.com" });
    expect(res.status).toBe(200);
    // email is normalised to lowercase
    expect(await env.KV.get("otp:alice@example.com")).not.toBeNull();
  });

  it("rejects a malformed email", async () => {
    const res = await post("/auth/request", { email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("verifies a correct OTP, creates the account, and returns a JWT", async () => {
    await env.KV.put("otp:carol@example.com", await sha256Hex("123456"));
    const res = await post("/auth/verify", { email: "carol@example.com", otp: "123456" });
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    const payload = await verifyJwt(token, env.JWT_SECRET);
    expect(typeof payload?.sub).toBe("string");
    const row = await env.DB.prepare("SELECT email FROM accounts WHERE email = ?")
      .bind("carol@example.com")
      .first();
    expect(row).not.toBeNull();
  });

  it("rejects a wrong OTP", async () => {
    await env.KV.put("otp:dave@example.com", await sha256Hex("111111"));
    const res = await post("/auth/verify", { email: "dave@example.com", otp: "999999" });
    expect(res.status).toBe(401);
  });

  it("consumes the OTP so it cannot be reused", async () => {
    await env.KV.put("otp:erin@example.com", await sha256Hex("222222"));
    await post("/auth/verify", { email: "erin@example.com", otp: "222222" });
    const second = await post("/auth/verify", { email: "erin@example.com", otp: "222222" });
    expect(second.status).toBe(401);
  });
});
