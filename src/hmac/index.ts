/**
 * HMAC Request Signing Module
 *
 * Provides HMAC-SHA256 request signing for Aura API authentication.
 *
 * @remarks
 * **WARNING: DEMO/DEVELOPMENT USE ONLY**
 *
 * This browser-compatible HMAC module is included for demonstration purposes.
 * In production:
 *
 * - Use {@link https://www.npmjs.com/package/@aurabx/uploader-client | @aurabx/uploader-client} for server-side HMAC signing
 * - NEVER expose HMAC secrets to the browser
 * - Your frontend should only receive ephemeral upload tokens
 *
 * @see {@link https://www.npmjs.com/package/@aurabx/uploader-client} - Server-side HMAC signing for Node.js
 *
 * @packageDocumentation
 */

export { HmacSigner, createSigner } from "./signer";
export { hmacSha256, sha256, generateNonce } from "./crypto";
export type {
  HmacCredentials,
  SignableRequest,
  SignedRequestHeaders,
  AuthorizationComponents,
  HmacSignerConfig,
} from "./types";
export { ALGORITHM, SERVICE, REQUIRED_HEADERS } from "./types";
