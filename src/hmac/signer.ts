/**
 * HMAC-SHA256 request signer for Aura API authentication.
 *
 * Implements the AURA-HMAC-SHA256 signing protocol as specified in
 * docs/architecture/hmac-request-signing/specification.md
 *
 * @remarks
 * **WARNING: DEMO/DEVELOPMENT USE ONLY**
 *
 * This browser-compatible HMAC signer is included for demonstration and
 * development purposes only. In production environments:
 *
 * - NEVER expose HMAC secrets to the browser
 * - HMAC credential exchange should happen on your backend server
 * - Use the `@aurabx/uploader-client` package for server-side HMAC signing
 * - Your frontend should only receive ephemeral upload tokens from your backend
 *
 * @see {@link https://github.com/aurabx/uploader-client} for server-side implementation
 */

import { hmacSha256, hmacSha256Raw, sha256, generateNonce } from "./crypto";
import type {
  SignableRequest,
  HmacCredentials,
} from "./types";
import { ALGORITHM, SERVICE, REQUIRED_HEADERS } from "./types";

/**
 * HMAC request signer for Aura API authentication.
 *
 * **WARNING: This is for DEMO/DEVELOPMENT use only.**
 * In production, use `@aurabx/uploader-client` on your server.
 *
 * @example
 * ```typescript
 * // DEMO ONLY - Do not use in production browser code!
 * const signer = new HmacSigner('app-id', 'app-secret');
 *
 * // Sign an Axios request config
 * const config = { method: 'POST', url: '/api/upload/init', data: { ... } };
 * await signer.sign(config);
 * // config.headers now contains Authorization, X-Aura-Timestamp, X-Aura-Nonce
 * ```
 */
export class HmacSigner {
  private appId: string;
  private appSecret: string;

  constructor(appId: string, appSecret: string) {
    if (!appId) {
      throw new Error("appId is required and must be a string");
    }
    if (!appSecret) {
      throw new Error("appSecret is required and must be a string");
    }

    this.appId = appId;
    this.appSecret = appSecret;
  }

  /**
   * Sign a request by adding HMAC authentication headers.
   * Mutates the request config to add the required headers.
   *
   * @param config - Axios-compatible request configuration
   */
  async sign(config: SignableRequest): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = generateNonce();
    // Derive date from timestamp to ensure consistency with server
    const date = this.getDateFromTimestamp(timestamp);

    // Ensure headers object exists
    config.headers = config.headers || {};

    // Add required headers for signing
    config.headers["X-Aura-Timestamp"] = timestamp;
    config.headers["X-Aura-Nonce"] = nonce;

    // Only set Content-Type for requests with a body (POST, PUT, PATCH)
    const method = (config.method || "GET").toUpperCase();
    const hasBody =
      ["POST", "PUT", "PATCH"].includes(method) && config.data !== undefined;
    if (
      hasBody &&
      !config.headers["Content-Type"] &&
      !config.headers["content-type"]
    ) {
      config.headers["Content-Type"] = "application/json";
    }

    // Build the canonical request
    const canonical = await this.buildCanonicalRequest(config);

    // Build the string to sign
    const stringToSign = await this.buildStringToSign(
      canonical,
      timestamp,
      date
    );

    // Derive the signing key and compute signature
    const signingKey = await this.deriveSigningKey(date);
    const signature = await hmacSha256(signingKey, stringToSign);

    // Build the signed headers list (sorted, lowercase)
    const signedHeaders = this.getSignedHeadersList(config.headers);

    // Set the Authorization header
    config.headers[
      "Authorization"
    ] = `${ALGORITHM} Credential=${this.appId},SignedHeaders=${signedHeaders},Signature=${signature}`;
  }

  /**
   * Build the canonical request string.
   *
   * Format:
   * ```
   * <HTTPMethod>
   * <CanonicalURI>
   * <CanonicalQueryString>
   * <CanonicalHeaders>
   * <SignedHeaders>
   * <HashedPayload>
   * ```
   */
  private async buildCanonicalRequest(
    config: SignableRequest
  ): Promise<string> {
    const method = (config.method || "GET").toUpperCase();
    const { path, queryString } = this.parseUrl(config);
    const canonicalHeaders = this.buildCanonicalHeaders(config.headers || {});
    const signedHeaders = this.getSignedHeadersList(config.headers || {});
    const hashedPayload = await this.hashPayload(config.data);

    return [
      method,
      path,
      queryString,
      canonicalHeaders,
      signedHeaders,
      hashedPayload,
    ].join("\n");
  }

  /**
   * Build the string to sign.
   *
   * Format:
   * ```
   * AURA-HMAC-SHA256
   * <Timestamp>
   * <CredentialScope>
   * <HashedCanonicalRequest>
   * ```
   */
  private async buildStringToSign(
    canonicalRequest: string,
    timestamp: string,
    date: string
  ): Promise<string> {
    const credentialScope = `${this.appId}/${date}/${SERVICE}`;
    const hashedCanonical = await sha256(canonicalRequest);

    return [ALGORITHM, timestamp, credentialScope, hashedCanonical].join("\n");
  }

  /**
   * Derive the signing key from the secret and date.
   *
   * ```
   * date_key = HMAC-SHA256("AURA" + app_secret, date)
   * signing_key = HMAC-SHA256(date_key, "aura_request")
   * ```
   */
  private async deriveSigningKey(date: string): Promise<ArrayBuffer> {
    const dateKey = await hmacSha256Raw(`AURA${this.appSecret}`, date);
    return hmacSha256Raw(dateKey, SERVICE);
  }

  /**
   * Parse URL to extract path and query string.
   * Applies RFC 3986 URI encoding and path normalization.
   */
  private parseUrl(config: SignableRequest): {
    path: string;
    queryString: string;
  } {
    let url = config.url || "/";

    // Combine baseURL path with url
    // e.g., baseURL = "https://example.com/api", url = "/users" -> path = "/api/users"
    if (config.baseURL) {
      try {
        const baseUrlObj = new URL(config.baseURL);
        const basePath = baseUrlObj.pathname.replace(/\/$/, ""); // Remove trailing slash

        // If url is relative, prepend the base path
        if (!url.startsWith("http")) {
          url = url.startsWith("/")
            ? `${basePath}${url}`
            : `${basePath}/${url}`;
        }
      } catch {
        // If baseURL parsing fails, just use url as-is
      }
    }

    // Parse the URL to get path and query
    let path: string;
    let queryString = "";

    const queryIndex = url.indexOf("?");
    if (queryIndex !== -1) {
      path = url.substring(0, queryIndex);
      queryString = url.substring(queryIndex + 1);
    } else {
      path = url;
    }

    // Handle params object (merge with existing query string)
    if (config.params && Object.keys(config.params).length > 0) {
      const paramsQuery = this.buildQueryString(config.params);
      queryString = queryString ? `${queryString}&${paramsQuery}` : paramsQuery;
    }

    // Sort query parameters alphabetically
    if (queryString) {
      queryString = this.sortQueryString(queryString);
    }

    // Ensure path starts with /
    if (!path.startsWith("/")) {
      path = "/" + path;
    }

    // Remove any protocol/host from path if present
    try {
      const parsed = new URL(path, "http://localhost");
      path = parsed.pathname;
    } catch {
      // Path is already just a path
    }

    // Normalize and encode the path (RFC 3986)
    path = this.getCanonicalPath(path);

    return { path, queryString };
  }

  /**
   * Get the canonical URI path.
   *
   * Applies RFC 3986 URI encoding (like AWS Signature V4):
   * - Path segments are percent-encoded
   * - Path is normalized (e.g., /foo/../bar becomes /bar)
   * - Double slashes are collapsed
   */
  private getCanonicalPath(path: string): string {
    if (!path || path === "/") {
      return "/";
    }

    // Normalize path: resolve . and .. segments
    path = this.normalizePath(path);

    // URI-encode each path segment per RFC 3986
    const segments = path.split("/");
    const encodedSegments = segments.map((segment) => {
      // Decode first to avoid double-encoding, then encode
      return encodeURIComponent(decodeURIComponent(segment));
    });

    let canonicalPath = encodedSegments.join("/");

    // Ensure path starts with /
    if (!canonicalPath.startsWith("/")) {
      canonicalPath = "/" + canonicalPath;
    }

    return canonicalPath;
  }

  /**
   * Normalize a path by resolving . and .. segments.
   */
  private normalizePath(path: string): string {
    if (path === "" || path === "/") {
      return "/";
    }

    const hasLeadingSlash = path.startsWith("/");
    const hasTrailingSlash = path.endsWith("/") && path.length > 1;

    // Split into segments
    const segments = path.split("/");
    const normalized: string[] = [];

    for (const segment of segments) {
      if (segment === "" || segment === ".") {
        // Skip empty segments and current directory references
        continue;
      }

      if (segment === "..") {
        // Go up one directory (but don't go above root)
        if (normalized.length > 0) {
          normalized.pop();
        }
      } else {
        normalized.push(segment);
      }
    }

    // Rebuild path
    let result = normalized.join("/");

    if (hasLeadingSlash) {
      result = "/" + result;
    }

    if (hasTrailingSlash && result !== "/") {
      result += "/";
    }

    return result || "/";
  }

  /**
   * Build a query string from params object.
   */
  private buildQueryString(
    params: Record<string, string | number | boolean>
  ): string {
    return Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
      )
      .join("&");
  }

  /**
   * Sort query string parameters alphabetically.
   */
  private sortQueryString(queryString: string): string {
    return queryString.split("&").sort().join("&");
  }

  /**
   * Build canonical headers string.
   * Headers are sorted alphabetically, lowercased, with trimmed values.
   * Headers with empty values are excluded.
   */
  private buildCanonicalHeaders(headers: Record<string, string>): string {
    const normalizedHeaders: Record<string, string> = {};

    // Normalize header names to lowercase
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      const normalizedValue = this.normalizeHeaderValue(value || "");

      // Only include headers that should be signed AND have a value
      if (this.shouldSignHeader(lowerKey) && normalizedValue !== "") {
        normalizedHeaders[lowerKey] = normalizedValue;
      }
    }

    // Sort and format
    return (
      Object.entries(normalizedHeaders)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}:${value}`)
        .join("\n") + "\n"
    );
  }

  /**
   * Get the signed headers list (sorted, semicolon-separated).
   * Only includes headers with non-empty values.
   */
  private getSignedHeadersList(headers: Record<string, string>): string {
    const signedHeaders: string[] = [];

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      const normalizedValue = this.normalizeHeaderValue(value || "");

      if (
        this.shouldSignHeader(lowerKey) &&
        normalizedValue !== "" &&
        !signedHeaders.includes(lowerKey)
      ) {
        signedHeaders.push(lowerKey);
      }
    }

    return signedHeaders.sort().join(";");
  }

  /**
   * Check if a header should be included in the signature.
   */
  private shouldSignHeader(headerName: string): boolean {
    const lowerName = headerName.toLowerCase();

    // Always sign required headers
    if ((REQUIRED_HEADERS as readonly string[]).includes(lowerName)) {
      return true;
    }

    // Sign content-type if present (not required - GET requests don't have it)
    if (lowerName === "content-type") {
      return true;
    }

    // Don't sign other headers by default
    return false;
  }

  /**
   * Normalize a header value (trim whitespace, collapse multiple spaces).
   */
  private normalizeHeaderValue(value: string): string {
    return value.trim().replace(/\s+/g, " ");
  }

  /**
   * Hash the request payload.
   * Returns the SHA-256 hash of the payload as hex.
   */
  private async hashPayload(data: unknown): Promise<string> {
    if (data === undefined || data === null || data === "") {
      // Empty body hash
      return sha256("");
    }

    let body: string;
    if (typeof data === "string") {
      body = data;
    } else {
      body = JSON.stringify(data);
    }

    return sha256(body);
  }

  /**
   * Get the date in YYYYMMDD format from a Unix timestamp.
   * Uses UTC to match server-side behavior.
   */
  private getDateFromTimestamp(timestamp: string): string {
    const date = new Date(parseInt(timestamp, 10) * 1000);
    return date.toISOString().slice(0, 10).replace(/-/g, "");
  }

  /**
   * Get the credentials used by this signer.
   */
  get credentials(): HmacCredentials {
    return {
      appId: this.appId,
      appSecret: this.appSecret,
    };
  }
}

/**
 * Create a new HMAC signer instance.
 *
 * @param appId - Application public ID
 * @param appSecret - Application secret
 * @returns HmacSigner instance
 */
export function createSigner(appId: string, appSecret: string): HmacSigner {
  return new HmacSigner(appId, appSecret);
}
