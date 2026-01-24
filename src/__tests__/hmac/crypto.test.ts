/**
 * Tests for HMAC crypto utilities.
 */

import { describe, it, expect } from "vitest";
import {
  hmacSha256,
  sha256,
  generateNonce,
  arrayBufferToHex,
} from "../../hmac/crypto";

describe("hmacSha256", () => {
  it("computes correct HMAC-SHA256 with string key", async () => {
    const key = "secret";
    const data = "message";
    const result = await hmacSha256(key, data);

    // Expected value computed using Node.js crypto
    // crypto.createHmac('sha256', 'secret').update('message').digest('hex')
    expect(result).toBe(
      "8b5f48702995c1598c573db1e21866a9b825d4a794d169d7060a03605796360b"
    );
  });

  it("returns consistent results for same input", async () => {
    const key = "test-key";
    const data = "test-data";

    const result1 = await hmacSha256(key, data);
    const result2 = await hmacSha256(key, data);

    expect(result1).toBe(result2);
  });

  it("returns different results for different keys", async () => {
    const data = "message";

    const result1 = await hmacSha256("key1", data);
    const result2 = await hmacSha256("key2", data);

    expect(result1).not.toBe(result2);
  });

  it("returns different results for different data", async () => {
    const key = "key";

    const result1 = await hmacSha256(key, "message1");
    const result2 = await hmacSha256(key, "message2");

    expect(result1).not.toBe(result2);
  });

  it("returns 64 character hex string", async () => {
    const result = await hmacSha256("key", "data");

    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("sha256", () => {
  it("computes correct SHA-256 hash", async () => {
    const data = "hello";
    const result = await sha256(data);

    // Expected value: crypto.createHash('sha256').update('hello').digest('hex')
    expect(result).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
  });

  it("computes correct hash for empty string", async () => {
    const result = await sha256("");

    // Expected: SHA-256 of empty string
    expect(result).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("returns consistent results", async () => {
    const data = "test";

    const result1 = await sha256(data);
    const result2 = await sha256(data);

    expect(result1).toBe(result2);
  });

  it("returns 64 character hex string", async () => {
    const result = await sha256("any data");

    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("generateNonce", () => {
  it("generates valid UUID v4 format", () => {
    const nonce = generateNonce();

    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // where y is 8, 9, a, or b
    expect(nonce).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("generates unique nonces", () => {
    const nonces = new Set<string>();

    for (let i = 0; i < 100; i++) {
      nonces.add(generateNonce());
    }

    expect(nonces.size).toBe(100);
  });

  it("generates 36 character string", () => {
    const nonce = generateNonce();

    expect(nonce).toHaveLength(36);
  });
});

describe("arrayBufferToHex", () => {
  it("converts ArrayBuffer to hex string", () => {
    const buffer = new Uint8Array([0x00, 0x01, 0x0f, 0x10, 0xff]).buffer;
    const result = arrayBufferToHex(buffer);

    expect(result).toBe("00010f10ff");
  });

  it("handles empty buffer", () => {
    const buffer = new Uint8Array([]).buffer;
    const result = arrayBufferToHex(buffer);

    expect(result).toBe("");
  });

  it("pads single digit hex values with zero", () => {
    const buffer = new Uint8Array([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]).buffer;
    const result = arrayBufferToHex(buffer);

    expect(result).toBe("000102030405060708090a0b0c0d0e0f");
  });
});
