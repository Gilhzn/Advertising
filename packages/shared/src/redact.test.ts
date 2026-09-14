import { describe, expect, it } from "vitest";
import { REDACTED, redactDeep, redactSecrets } from "./redact.js";

describe("redactSecrets", () => {
  it("redacts Authorization headers", () => {
    const out = redactSecrets("401 from GET /me (Authorization: Bearer ya29.a0AfB_abcdefghijkl)");
    expect(out).toContain("Bearer [REDACTED]");
    expect(out).not.toContain("ya29");
  });

  it("redacts secret values in query strings", () => {
    const out = redactSecrets(
      "request failed: https://graph.facebook.com/v22.0/me?access_token=EAAB123xyzQQQ&fields=id",
    );
    expect(out).toContain("access_token=[REDACTED]");
    expect(out).toContain("fields=id");
    expect(out).not.toContain("EAAB123xyzQQQ");
  });

  it("redacts secret values in JSON bodies", () => {
    const out = redactSecrets('{"refresh_token":"1//0gabcXYZ","expires_in":3600}');
    expect(out).toBe(`{"refresh_token":"${REDACTED}","expires_in":3600}`);
  });

  it("redacts token/secret/password/api_key key-value pairs", () => {
    expect(redactSecrets("password=hunter2 failed")).toContain(`password=${REDACTED}`);
    expect(redactSecrets("api_key: sk-live-1234 nope")).toContain(`api_key: ${REDACTED}`);
    expect(redactSecrets("client_secret=abc123def")).toContain(`client_secret=${REDACTED}`);
  });

  it("redacts Telegram bot tokens", () => {
    const out = redactSecrets(
      "POST https://api.telegram.org/bot123456789:AAHkl-9_ZqWxyz123/sendMessage returned 403",
    );
    expect(out).not.toContain("AAHkl");
    expect(out).toContain("bot[REDACTED]");

    const bare = redactSecrets("token is 123456789:AAHkl9ZqWxyz123456789abcd");
    expect(bare).not.toContain("AAHkl9ZqWxyz123456789abcd");
  });

  it("redacts Discord webhook tokens but keeps the webhook id", () => {
    const out = redactSecrets(
      "https://discord.com/api/webhooks/123456789012345678/AbC-dEf_ghIjKlMnOpQrStUvWxYz012345 -> 404",
    );
    expect(out).toContain("/webhooks/123456789012345678/[REDACTED]");
    expect(out).not.toContain("AbC-dEf_ghIjKlMnOpQrStUvWxYz");
  });

  it("redacts long hex blobs", () => {
    const key = "6f1d2c3b4a5968778695a4b3c2d1e0f0123456789abcdef0123456789abcdef0";
    expect(redactSecrets(`decrypt failed with key ${key}`)).toBe(`decrypt failed with key ${REDACTED}`);
  });

  it("redacts long random base64url blobs", () => {
    const token = "aB3dEfGhIjKlMnOpQrStUvWxYz0123456789";
    expect(redactSecrets(`opaque ${token} here`)).toBe(`opaque ${REDACTED} here`);
  });

  it("leaves ordinary prose, identifiers and UUIDs alone", () => {
    const msg =
      "community post requires human approval before publishing (status: awaiting_approval), post 8f14e45f-ceea-467a-9a0f-8b1f2b0b0000";
    expect(redactSecrets(msg)).toBe(msg);
    expect(redactSecrets("run_product_advisor_all_scheduled_successfully")).toBe(
      "run_product_advisor_all_scheduled_successfully",
    );
  });

  it("handles null/undefined and non-strings", () => {
    expect(redactSecrets(null)).toBe("");
    expect(redactSecrets(undefined)).toBe("");
    expect(redactSecrets(42)).toBe("42");
  });
});

describe("redactDeep", () => {
  it("redacts strings anywhere in a payload and blanks secret-named keys", () => {
    const out = redactDeep({
      postId: "abc",
      error: "failed: https://api.test/x?access_token=EAABsecret123",
      tokens: { accessToken: "aB3dEfGhIjKlMnOpQrStUvWxYz0123456789", scopes: ["read", "write"] },
      nested: [{ botToken: "123456789:AAHkl9ZqWxyz123456789abcd" }],
    });
    expect(out.postId).toBe("abc");
    expect(out.error).toContain("access_token=[REDACTED]");
    expect(out.tokens.accessToken).toBe(REDACTED);
    expect(out.tokens.scopes).toEqual(["read", "write"]);
    expect(out.nested[0]?.botToken).toBe(REDACTED);
  });

  it("passes through numbers, booleans and nulls", () => {
    expect(redactDeep({ a: 1, b: true, c: null })).toEqual({ a: 1, b: true, c: null });
  });
});

describe("redactSecrets - credentials that carry no key name", () => {
  it("removes the password from a Postgres connection string", () => {
    const out = redactSecrets("error: connect to postgres://adv:Sup3rSecret@db.internal:5432/adv failed");
    expect(out).not.toContain("Sup3rSecret");
    expect(out).toContain("postgres://adv:[REDACTED]@");
    expect(out).toContain("db.internal");
  });

  it("removes the password from redis and amqp URLs, including a blank username", () => {
    expect(redactSecrets("redis://:h0tp4ss@cache:6379")).not.toContain("h0tp4ss");
    expect(redactSecrets("amqp://guest:guest@rabbit:5672")).not.toContain("guest:guest@");
  });

  it("removes a token embedded in an https clone URL", () => {
    const out = redactSecrets(
      "fatal: could not read https://x-access-token:ghp_AbCd1234567890abcdefghij@github.com/o/r.git",
    );
    expect(out).not.toContain("ghp_AbCd1234567890abcdefghij");
    expect(out).toContain("github.com");
  });

  it("leaves a URL without credentials untouched", () => {
    const url = "https://api.example.com/v1/posts?limit=10";
    expect(redactSecrets(url)).toBe(url);
  });

  it("removes a JWT", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r";
    expect(redactSecrets(`Authorization failed for ${jwt}`)).not.toContain("eyJzdWIiOiIxMjM0NTY3ODkw");
  });

  it("does not mangle ordinary prose or a UUID", () => {
    const text = "post 3f7c1b2a-9d4e-4c5a-8b1f-2e6d7a8c9b0d failed after 3 attempts";
    expect(redactSecrets(text)).toBe(text);
  });

  // Regression corpus for the prefixed-key bypass: `\b` cannot match between a word character and
  // `_`, so every real-world credential key name (which is almost always prefixed) was unredacted.
  // Each string below was verified to leak in full before the key anchor was changed.
  it.each([
    ["app_password=abcd-efgh-ijkl-mnop", "abcd-efgh-ijkl-mnop"],
    ["user_access_token=hunter2", "hunter2"],
    ["X_CLIENT_SECRET=shortsecretvalue", "shortsecretvalue"],
    ["MIGADU_API_KEY=hunter2hunter2", "hunter2hunter2"],
    ["OWNER_PASSWORD=Tr0ub4dor3", "Tr0ub4dor3"],
    ["bot_token: 12345:short", "12345:short"],
    ["imap_passwd = letmein", "letmein"],
    ['{"app_password": "s3cret"}', "s3cret"],
    ['{"MIGADU_API_KEY":"abc123"}', "abc123"],
    ["cookie: session=abc123def456", "abc123def456"],
    ["db_connection_string=postgres-plain-value", "postgres-plain-value"],
  ])("redacts the prefixed credential key in %s", (input, secret) => {
    expect(redactSecrets(input)).not.toContain(secret);
  });

  it("redacts a password containing a slash inside a connection string", () => {
    const out = redactSecrets("postgres://adv:pa/ss+word@db.internal:5432/adv");
    expect(out).not.toContain("pa/ss+word");
    expect(out).toContain("db.internal:5432/adv");
  });

  it("redacts the whole key=value even when the value contains a slash", () => {
    expect(redactSecrets("api_key=abc/def")).toBe("api_key=[REDACTED]");
  });

  it("redacts an AWS access key id", () => {
    expect(redactSecrets("using AKIAIOSFODNN7EXAMPLE for uploads")).not.toContain(
      "AKIAIOSFODNN7EXAMPLE",
    );
    expect(redactSecrets("ASIAY34FZKBOKMUTVV7A")).toBe("[REDACTED]");
  });

  it("redacts a whole PEM private key block, header and footer included", () => {
    const pem = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEowIBAAKCAQEA1234567890abcdefghijklmnop",
      "-----END RSA PRIVATE KEY-----",
    ].join("\n");
    expect(redactSecrets(`key load failed:\n${pem}`)).toBe("key load failed:\n[REDACTED]");
  });

  it("redacts a truncated PEM block that has no footer", () => {
    const out = redactSecrets("-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqh...");
    expect(out).not.toContain("MIIEvQIBADANBgkqh");
  });

  it("redacts an all-uppercase base32 secret that mixed-case entropy rules miss", () => {
    expect(redactSecrets("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSW")).toBe("[REDACTED]");
  });

  // False-positive guards: over-redaction destroys the diagnostic value of an error message, so
  // these have to survive the widened key rule.
  it.each([
    "the tokenizer returned 42 tokens",
    "token_count: 5",
    "password_policy_version: 3",
    "Contact sales@example.com about pricing",
    "https://api.example.com/v1/users?fields=id,name",
    "businessId=3f2b1a44-0000-4000-8000-000000000001 slug=my-cool-shop",
    "SCHEDULED_AT_UTC_FIELD_IS_REQUIRED_HERE",
  ])("leaves %s untouched", (text) => {
    expect(redactSecrets(text)).toBe(text);
  });

  it("blanks a prefixed secret key in a deep payload", () => {
    const out = redactDeep({
      meta: { appPassword: "abcd-efgh", migaduApiKey: "k1", userAccessToken: "t1" },
      note: "ok",
    });
    expect(out.meta).toEqual({
      appPassword: "[REDACTED]",
      migaduApiKey: "[REDACTED]",
      userAccessToken: "[REDACTED]",
    });
    expect(out.note).toBe("ok");
  });
});
