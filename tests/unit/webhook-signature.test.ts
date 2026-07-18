import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyHubSignature } from "@/lib/meta/webhook-signature";

const SECRET = "test-app-secret";

/** Build a valid `X-Hub-Signature-256` header for the given raw body + secret. */
function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

describe("verifyHubSignature", () => {
  const body = JSON.stringify({ object: "page", entry: [{ id: "1" }] });

  it("accepts a correctly signed body", () => {
    expect(verifyHubSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a body signed with a different secret", () => {
    expect(verifyHubSignature(body, sign(body, "wrong-secret"), SECRET)).toBe(false);
  });

  it("rejects when the body was tampered after signing", () => {
    const header = sign(body);
    expect(verifyHubSignature(body + " ", header, SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyHubSignature(body, null, SECRET)).toBe(false);
  });

  it("rejects a header without the sha256= prefix", () => {
    const bare = createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
    expect(verifyHubSignature(body, bare, SECRET)).toBe(false);
  });

  it("rejects a malformed (non-hex, wrong-length) signature", () => {
    expect(verifyHubSignature(body, "sha256=not-a-real-hex-digest", SECRET)).toBe(false);
  });
});
