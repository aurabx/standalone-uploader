/**
 * HMAC Request Signing Module
 *
 * Provides HMAC-SHA256 request signing for Aura API authentication.
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
