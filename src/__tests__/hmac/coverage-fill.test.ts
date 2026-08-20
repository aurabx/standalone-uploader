import { describe, it, expect, afterEach } from 'vitest';
import { generateNonce } from '../../hmac/crypto';
import { HmacSigner } from '../../hmac/signer';

describe('generateNonce (fallback path)', () => {
  const cryptoAny = globalThis.crypto as Crypto & { randomUUID?: unknown };
  const original = cryptoAny.randomUUID;

  afterEach(() => {
    Object.defineProperty(cryptoAny, 'randomUUID', {
      configurable: true,
      writable: true,
      value: original,
    });
  });

  it('constructs a UUID from getRandomValues when randomUUID is unavailable', () => {
    // Overwrite (rather than delete) so the "typeof === function" check fails.
    Object.defineProperty(cryptoAny, 'randomUUID', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    const nonce = generateNonce();
    expect(nonce).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe('HmacSigner — additional branches', () => {
  const appId = '550e8400-e29b-41d4-a716-446655440000';
  const appSecret = 'test-secret-key';

  it('signs a GET request with params and passes through non-signing headers', async () => {
    const signer = new HmacSigner(appId, appSecret);
    const config = {
      method: 'GET',
      url: 'https://api.example.com/things',
      headers: { 'X-Custom-Ignored': 'value' },
      params: { b: 'two', a: 1, skip: undefined as unknown as string },
    };
    await signer.sign(config as never);
    expect(config.headers).toHaveProperty('Authorization');
    // Custom header remains but is not part of SignedHeaders.
    const auth = (config.headers as Record<string, string>)['Authorization'];
    expect(auth).not.toContain('x-custom-ignored');
    // Required headers survive.
    expect(config.headers).toHaveProperty('X-Aura-Timestamp');
  });

  it('signs a POST request whose body is already a string (no re-serialisation)', async () => {
    const signer = new HmacSigner(appId, appSecret);
    const config = {
      method: 'POST',
      url: 'https://api.example.com/echo',
      headers: {},
      data: 'raw-body',
    };
    await signer.sign(config as never);
    expect((config.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
    expect((config.headers as Record<string, string>)['Authorization'])
      .toMatch(/^AURA-HMAC-SHA256 /);
  });

  it('normalises unusual URL paths (root, trailing slash, "..") without throwing', async () => {
    const signer = new HmacSigner(appId, appSecret);

    // Root path — hits the "" / "/" early return in normalizePath.
    const rootCfg = { method: 'GET', url: 'https://api.example.com', headers: {} };
    await signer.sign(rootCfg as never);
    expect((rootCfg.headers as Record<string, string>)['Authorization']).toBeTruthy();

    // Trailing slash — hits the trailing-slash re-append branch.
    const trailCfg = {
      method: 'GET',
      url: 'https://api.example.com/foo/bar/',
      headers: {},
    };
    await signer.sign(trailCfg as never);
    expect((trailCfg.headers as Record<string, string>)['Authorization']).toBeTruthy();

    // ".." segment — hits normalized.pop() and the guard against popping past root.
    const dotDotCfg = {
      method: 'GET',
      url: 'https://api.example.com/foo/../bar/../../qux',
      headers: {},
    };
    await signer.sign(dotDotCfg as never);
    expect((dotDotCfg.headers as Record<string, string>)['Authorization']).toBeTruthy();
  });
});
