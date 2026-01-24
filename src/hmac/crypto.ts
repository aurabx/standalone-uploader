/**
 * Browser-compatible cryptographic utilities for HMAC-SHA256 signing.
 * Uses the Web Crypto API (SubtleCrypto) for secure cryptographic operations.
 */

/**
 * Compute HMAC-SHA256 of data using a key.
 * Returns the result as a lowercase hex string.
 *
 * @param key - The key as a string or ArrayBuffer
 * @param data - The data to sign
 * @returns Hex-encoded HMAC-SHA256 signature
 */
export async function hmacSha256(
  key: string | ArrayBuffer,
  data: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = typeof key === "string" ? encoder.encode(key) : key;

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(data)
  );

  return arrayBufferToHex(signature);
}

/**
 * Compute HMAC-SHA256 and return as ArrayBuffer.
 * Used for key derivation where the result is used as a key for the next HMAC.
 *
 * @param key - The key as a string or ArrayBuffer
 * @param data - The data to sign
 * @returns ArrayBuffer containing the HMAC result
 */
export async function hmacSha256Raw(
  key: string | ArrayBuffer,
  data: string
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyData = typeof key === "string" ? encoder.encode(key) : key;

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

/**
 * Compute SHA-256 hash of data.
 * Returns the result as a lowercase hex string.
 *
 * @param data - The data to hash
 * @returns Hex-encoded SHA-256 hash
 */
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(data));

  return arrayBufferToHex(hash);
}

/**
 * Convert an ArrayBuffer to a lowercase hex string.
 *
 * @param buffer - The ArrayBuffer to convert
 * @returns Lowercase hex string
 */
export function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a UUID v4 using the crypto API.
 * Falls back to crypto.randomUUID() if available, otherwise generates manually.
 *
 * @returns UUID v4 string
 */
export function generateNonce(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Fallback for environments without randomUUID
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Set version (4) and variant (RFC4122)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
