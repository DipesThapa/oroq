import { describe, it, expect } from "vitest";
import { sha256Hex, randomCode, randomOtp, signJwt, verifyJwt } from "../src/crypto";

describe("crypto", () => {
  it("hashes deterministically and distinctly", async () => {
    expect(await sha256Hex("abc")).toBe(await sha256Hex("abc"));
    expect(await sha256Hex("abc")).not.toBe(await sha256Hex("abd"));
  });

  it("generates 8-char codes without ambiguous characters", () => {
    const code = randomCode(8);
    expect(code).toHaveLength(8);
    expect(code).not.toMatch(/[ILO01]/);
  });

  it("generates 6-digit OTPs", () => {
    expect(randomOtp()).toMatch(/^\d{6}$/);
  });

  it("signs then verifies a JWT", async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = await signJwt({ sub: "acc1", exp }, "secret");
    const payload = await verifyJwt(token, "secret");
    expect(payload?.sub).toBe("acc1");
  });

  it("rejects a wrong-secret JWT", async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = await signJwt({ sub: "acc1", exp }, "secret");
    expect(await verifyJwt(token, "wrong")).toBeNull();
  });

  it("rejects an expired JWT", async () => {
    const exp = Math.floor(Date.now() / 1000) - 1;
    const token = await signJwt({ sub: "acc1", exp }, "secret");
    expect(await verifyJwt(token, "secret")).toBeNull();
  });
});
