/**
 * Tests for HMAC signer.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { HmacSigner } from "../../hmac/signer";
import { ALGORITHM } from "../../hmac/types";

describe("HmacSigner", () => {
  const appId = "550e8400-e29b-41d4-a716-446655440000";
  const appSecret = "test-secret-key";

  describe("constructor", () => {
    it("creates signer with valid credentials", () => {
      const signer = new HmacSigner(appId, appSecret);
      expect(signer.credentials.appId).toBe(appId);
      expect(signer.credentials.appSecret).toBe(appSecret);
    });

    it("throws error for empty appId", () => {
      expect(() => new HmacSigner("", appSecret)).toThrow("appId is required");
    });

    it("throws error for empty appSecret", () => {
      expect(() => new HmacSigner(appId, "")).toThrow("appSecret is required");
    });

    it("throws error for null appId", () => {
      expect(
        () => new HmacSigner(null as unknown as string, appSecret)
      ).toThrow("appId is required");
    });

    it("throws error for null appSecret", () => {
      expect(() => new HmacSigner(appId, null as unknown as string)).toThrow(
        "appSecret is required"
      );
    });
  });

  describe("sign", () => {
    let signer: HmacSigner;

    beforeEach(() => {
      signer = new HmacSigner(appId, appSecret);
    });

    it("adds required headers to request", async () => {
      const config: Record<string, unknown> = {
        method: "POST",
        url: "/api/test",
        headers: { Host: "example.com" },
        data: { foo: "bar" },
      };

      await signer.sign(config as any);

      expect(config.headers).toHaveProperty("X-Aura-Timestamp");
      expect(config.headers).toHaveProperty("X-Aura-Nonce");
      expect(config.headers).toHaveProperty("Authorization");
    });

    it("generates valid Authorization header format", async () => {
      const config: Record<string, unknown> = {
        method: "POST",
        url: "/api/test",
        headers: { Host: "example.com" },
        data: { test: true },
      };

      await signer.sign(config as any);

      const authHeader = (config.headers as Record<string, string>)[
        "Authorization"
      ];
      expect(authHeader).toMatch(new RegExp(`^${ALGORITHM} `));
      expect(authHeader).toContain(`Credential=${appId}`);
      expect(authHeader).toContain("SignedHeaders=");
      expect(authHeader).toContain("Signature=");
    });

    it("generates unique nonces for each request", async () => {
      const config1: Record<string, unknown> = {
        method: "GET",
        url: "/test",
        headers: {},
      };
      const config2: Record<string, unknown> = {
        method: "GET",
        url: "/test",
        headers: {},
      };

      await signer.sign(config1 as any);
      await signer.sign(config2 as any);

      const nonce1 = (config1.headers as Record<string, string>)[
        "X-Aura-Nonce"
      ];
      const nonce2 = (config2.headers as Record<string, string>)[
        "X-Aura-Nonce"
      ];

      expect(nonce1).not.toBe(nonce2);
    });

    it("generates timestamp in seconds", async () => {
      const config: Record<string, unknown> = {
        method: "GET",
        url: "/test",
        headers: {},
      };

      const beforeTime = Math.floor(Date.now() / 1000);
      await signer.sign(config as any);
      const afterTime = Math.floor(Date.now() / 1000);

      const timestamp = parseInt(
        (config.headers as Record<string, string>)["X-Aura-Timestamp"],
        10
      );

      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    });

    it("generates 64-character hex signature", async () => {
      const config: Record<string, unknown> = {
        method: "POST",
        url: "/api/test",
        headers: { Host: "example.com" },
        data: { test: true },
      };

      await signer.sign(config as any);

      const authHeader = (config.headers as Record<string, string>)[
        "Authorization"
      ];
      const signatureMatch = authHeader.match(/Signature=([a-f0-9]+)/);

      expect(signatureMatch).not.toBeNull();
      expect(signatureMatch![1]).toHaveLength(64);
    });

    it("sets Content-Type if not present for POST with data", async () => {
      const config: Record<string, unknown> = {
        method: "POST",
        url: "/api/test",
        headers: {},
        data: { test: "data" },
      };

      await signer.sign(config as any);

      expect(config.headers).toHaveProperty("Content-Type", "application/json");
    });

    it("preserves existing Content-Type", async () => {
      const config: Record<string, unknown> = {
        method: "POST",
        url: "/api/test",
        headers: { "Content-Type": "text/plain" },
      };

      await signer.sign(config as any);

      expect((config.headers as Record<string, string>)["Content-Type"]).toBe(
        "text/plain"
      );
    });

    it("includes signed headers in authorization header", async () => {
      const config: Record<string, unknown> = {
        method: "POST",
        url: "/api/test",
        headers: { Host: "example.com" },
        data: {},
      };

      await signer.sign(config as any);

      const authHeader = (config.headers as Record<string, string>)[
        "Authorization"
      ];

      // Should include required headers
      expect(authHeader).toContain("content-type");
      expect(authHeader).toContain("host");
      expect(authHeader).toContain("x-aura-nonce");
      expect(authHeader).toContain("x-aura-timestamp");
    });

    it("generates different signatures for different bodies", async () => {
      const config1: Record<string, unknown> = {
        method: "POST",
        url: "/api/test",
        headers: { Host: "example.com" },
        data: { foo: "bar" },
      };
      const config2: Record<string, unknown> = {
        method: "POST",
        url: "/api/test",
        headers: { Host: "example.com" },
        data: { foo: "baz" },
      };

      await signer.sign(config1 as any);
      await signer.sign(config2 as any);

      const sig1 = (config1.headers as Record<string, string>)[
        "Authorization"
      ].match(/Signature=([a-f0-9]+)/)![1];
      const sig2 = (config2.headers as Record<string, string>)[
        "Authorization"
      ].match(/Signature=([a-f0-9]+)/)![1];

      expect(sig1).not.toBe(sig2);
    });

    it("generates different signatures for different methods", async () => {
      const config1: Record<string, unknown> = {
        method: "GET",
        url: "/api/test",
        headers: { Host: "example.com" },
      };
      const config2: Record<string, unknown> = {
        method: "POST",
        url: "/api/test",
        headers: { Host: "example.com" },
      };

      await signer.sign(config1 as any);
      await signer.sign(config2 as any);

      const sig1 = (config1.headers as Record<string, string>)[
        "Authorization"
      ].match(/Signature=([a-f0-9]+)/)![1];
      const sig2 = (config2.headers as Record<string, string>)[
        "Authorization"
      ].match(/Signature=([a-f0-9]+)/)![1];

      expect(sig1).not.toBe(sig2);
    });

    it("generates different signatures for different URLs", async () => {
      const config1: Record<string, unknown> = {
        method: "GET",
        url: "/api/test1",
        headers: { Host: "example.com" },
      };
      const config2: Record<string, unknown> = {
        method: "GET",
        url: "/api/test2",
        headers: { Host: "example.com" },
      };

      await signer.sign(config1 as any);
      await signer.sign(config2 as any);

      const sig1 = (config1.headers as Record<string, string>)[
        "Authorization"
      ].match(/Signature=([a-f0-9]+)/)![1];
      const sig2 = (config2.headers as Record<string, string>)[
        "Authorization"
      ].match(/Signature=([a-f0-9]+)/)![1];

      expect(sig1).not.toBe(sig2);
    });
  });
});
