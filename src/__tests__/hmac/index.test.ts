import { describe, it, expect } from 'vitest';
import * as hmac from '../../hmac';

describe('hmac barrel', () => {
  it('re-exports the signer surface', () => {
    expect(typeof hmac.HmacSigner).toBe('function');
    expect(typeof hmac.createSigner).toBe('function');
    expect(typeof hmac.hmacSha256).toBe('function');
    expect(typeof hmac.sha256).toBe('function');
    expect(typeof hmac.generateNonce).toBe('function');
  });

  it('re-exports the protocol constants', () => {
    expect(hmac.ALGORITHM).toBe('AURA-HMAC-SHA256');
    expect(hmac.SERVICE).toBe('aura_request');
    expect(Array.isArray(hmac.REQUIRED_HEADERS)).toBe(true);
    expect(hmac.REQUIRED_HEADERS.length).toBeGreaterThan(0);
  });

  it('createSigner returns an HmacSigner instance', () => {
    const signer = hmac.createSigner(
      '550e8400-e29b-41d4-a716-446655440000',
      'secret',
    );
    expect(signer).toBeInstanceOf(hmac.HmacSigner);
  });
});
