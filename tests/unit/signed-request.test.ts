import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { parseSignedRequest } from "@/lib/meta/signed-request";

const SECRET = "test-app-secret";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Build a valid Meta-style signed_request for the given payload + secret. */
function sign(payload: object, secret = SECRET): string {
  const encodedPayload = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = createHmac("sha256", secret).update(encodedPayload).digest();
  return `${b64url(sig)}.${encodedPayload}`;
}

describe("parseSignedRequest", () => {
  it("returns the payload for a correctly signed request", () => {
    const signed = sign({ user_id: "123", algorithm: "HMAC-SHA256", issued_at: 1 });
    const result = parseSignedRequest(signed, SECRET);
    expect(result?.user_id).toBe("123");
  });

  it("rejects a request signed with a different secret", () => {
    const signed = sign({ user_id: "123" }, "wrong-secret");
    expect(parseSignedRequest(signed, SECRET)).toBeNull();
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const signed = sign({ user_id: "123" });
    const [sig] = signed.split(".");
    const forgedPayload = b64url(Buffer.from(JSON.stringify({ user_id: "999" })));
    expect(parseSignedRequest(`${sig}.${forgedPayload}`, SECRET)).toBeNull();
  });

  it("rejects a malformed request with no dot separator", () => {
    expect(parseSignedRequest("not-a-signed-request", SECRET)).toBeNull();
  });

  it("rejects a non-HMAC-SHA256 algorithm even if signed", () => {
    const signed = sign({ user_id: "123", algorithm: "PLAINTEXT" });
    expect(parseSignedRequest(signed, SECRET)).toBeNull();
  });

  it("rejects a payload missing user_id", () => {
    const signed = sign({ algorithm: "HMAC-SHA256" });
    expect(parseSignedRequest(signed, SECRET)).toBeNull();
  });
});
