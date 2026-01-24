/**
 * Type definitions for HMAC request signing.
 */

/**
 * Application credentials for HMAC signing.
 */
export interface HmacCredentials {
  /** Application public ID (UUID) */
  appId: string;
  /** Application secret key */
  appSecret: string;
}

/**
 * Request configuration for signing.
 * Compatible with Axios request config.
 */
export interface SignableRequest {
  /** HTTP method (GET, POST, PUT, DELETE, etc.) */
  method?: string;
  /** Request URL (can be relative or absolute) */
  url?: string;
  /** Base URL for the request */
  baseURL?: string;
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body data */
  data?: unknown;
  /** Query parameters */
  params?: Record<string, string | number | boolean>;
}

/**
 * Parsed components of an Authorization header.
 */
export interface AuthorizationComponents {
  /** Algorithm identifier (should be 'AURA-HMAC-SHA256') */
  algorithm: string;
  /** Application public ID */
  credential: string;
  /** Semicolon-separated list of signed header names */
  signedHeaders: string;
  /** Hex-encoded signature */
  signature: string;
}

/**
 * Configuration for the HMAC signer.
 */
export interface HmacSignerConfig {
  /** Application credentials */
  credentials: HmacCredentials;
  /** Headers that should always be signed (in addition to required headers) */
  additionalSignedHeaders?: string[];
}

/**
 * Result of signing a request.
 */
export interface SignedRequestHeaders {
  /** The Authorization header value */
  Authorization: string;
  /** Unix timestamp in seconds */
  "X-Aura-Timestamp": string;
  /** UUID v4 nonce */
  "X-Aura-Nonce": string;
}

/**
 * Required headers that must be present and signed on every request.
 * Note: content-type is NOT required - it's only signed when present
 * (GET requests typically don't have content-type).
 */
export const REQUIRED_HEADERS = [
  "host",
  "x-aura-nonce",
  "x-aura-timestamp",
] as const;

/**
 * The algorithm identifier used in the Authorization header.
 */
export const ALGORITHM = "AURA-HMAC-SHA256";

/**
 * The service name used in the credential scope.
 */
export const SERVICE = "aura_request";
