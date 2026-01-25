# HMAC Authentication (AURA-HMAC-SHA256)

This document describes the **exact signing algorithm** used by Aura for server-to-server calls (for example, exchanging HMAC credentials for an upload token). It is written in pseudocode so it can be implemented in any backend language.

If you are using a prebuilt Aura signer library, you should still read the **Inputs / Canonicalization** sections to avoid common integration failures (host mismatch, body mismatch, clock skew).

## What This Is For

You sign a request to Aura by adding:

- `X-Aura-Timestamp`: unix time in seconds (string)
- `X-Aura-Nonce`: UUID v4 (string)
- `Authorization`: HMAC signature header (string)

Aura verifies the signature to ensure the request was created by a party that knows `app_secret`, and that the request was not modified in transit.

## Required Request Headers

You must send these headers on the request to Aura:

- `X-Api-Key: <service_api_key>` (used for team/realm context)
- `Host: <api host>` (must match your request target host)

Additionally, if the request has a JSON body, send:

- `Content-Type: application/json`

Note: `X-Api-Key` is **not** included in the signature by our current signer; it is still required on the request.

## Authorization Header Format

```
Authorization: AURA-HMAC-SHA256 Credential=<appId>,SignedHeaders=<signed_headers>,Signature=<signature_hex>
```

Where:

- `signed_headers` is a `;`-separated list of lowercase header names
- `signature_hex` is lowercase hex

## Constants

```
ALGORITHM = "AURA-HMAC-SHA256"
SERVICE   = "aura_request"

REQUIRED_SIGNED_HEADERS = [
  "host",
  "x-aura-nonce",
  "x-aura-timestamp",
]
```

## Signing Algorithm (Pseudocode)

### Input

```
app_id: string
app_secret: string

request.method: string            // e.g. "POST"
request.base_url: string          // e.g. "https://aura.example.com/api" (optional)
request.url: string               // e.g. "/auth/exchange" or full URL
request.headers: map<string,string>
request.query: map<string,string|number|bool>  // optional
request.body: bytes|string|object|null         // optional
```

### Output

Mutate `request.headers` by adding:

```
X-Aura-Timestamp
X-Aura-Nonce
Authorization
```

### Steps

```
function sign_request(app_id, app_secret, request):
  ts    = str(floor(now_ms() / 1000))
  nonce = uuid_v4()
  date  = utc_date_yyyymmdd(now_utc())

  // Ensure headers exist
  if request.headers is null: request.headers = {}

  // Required signing headers
  request.headers["X-Aura-Timestamp"] = ts
  request.headers["X-Aura-Nonce"]     = nonce

  // If request has a body and Content-Type is missing, set it to JSON
  method_upper = upper(request.method or "GET")
  has_body = (method_upper in ["POST","PUT","PATCH"]) and (request.body is not null/undefined)
  if has_body and not header_present(request.headers, "Content-Type"):
    request.headers["Content-Type"] = "application/json"

  canonical_path, canonical_query = canonicalize_url(request.base_url, request.url, request.query)

  payload_hash = hash_payload_sha256_hex(request.body)

  signed_headers = compute_signed_headers(request.headers)
  canonical_headers = build_canonical_headers(request.headers, signed_headers)

  canonical_request = join_with_newlines([
    method_upper,
    canonical_path,
    canonical_query,
    canonical_headers,  // must end with "\n"
    signed_headers,     // e.g. "content-type;host;x-aura-nonce;x-aura-timestamp"
    payload_hash,
  ])

  canonical_request_hash = sha256_hex(utf8(canonical_request))

  credential_scope = app_id + "/" + date + "/" + SERVICE
  string_to_sign = join_with_newlines([
    ALGORITHM,
    ts,
    credential_scope,
    canonical_request_hash,
  ])

  // Key derivation
  date_key    = hmac_sha256_raw(key=utf8("AURA" + app_secret), data=utf8(date))
  signing_key = hmac_sha256_raw(key=date_key, data=utf8(SERVICE))

  signature_hex = hmac_sha256_hex(key=signing_key, data=utf8(string_to_sign))

  request.headers["Authorization"] =
    ALGORITHM + " " +
    "Credential=" + app_id + "," +
    "SignedHeaders=" + signed_headers + "," +
    "Signature=" + signature_hex

  return request
```

## Helper Functions (Pseudocode)

### Header Presence / Normalization

```
function header_present(headers, name):
  // case-insensitive
  for each k in headers.keys:
    if lower(k) == lower(name): return true
  return false

function normalize_header_value(v):
  // trim and collapse whitespace
  return collapse_whitespace(trim(v))
```

### Signed Headers

```
function compute_signed_headers(headers):
  signed = set(REQUIRED_SIGNED_HEADERS)
  if header_present(headers, "Content-Type"):
    signed.add("content-type")

  // Only include headers that have a non-empty value
  signed_nonempty = []
  for each h in signed:
    v = get_header_case_insensitive(headers, h)
    if normalize_header_value(v) != "":
      signed_nonempty.push(h)

  sort(signed_nonempty)
  return join(";", signed_nonempty)

function build_canonical_headers(headers, signed_headers_str):
  signed_list = split(signed_headers_str, ";")
  // signed_list is already sorted
  lines = []
  for each h in signed_list:
    v = get_header_case_insensitive(headers, h)
    lines.push(h + ":" + normalize_header_value(v))
  return join("\n", lines) + "\n"  // NOTE: trailing newline
```

### URL Canonicalization

This matches our signer behavior:

- If `base_url` is provided, its path is prepended to a relative `request.url`
- Query parameters are sorted lexicographically
- Path is normalized (`.` / `..`) and percent-encoded per segment

```
function canonicalize_url(base_url, url, query_map):
  // Step 1: build effective path+query
  // - if url is absolute, ignore base_url
  // - else, join base_url.pathname + url
  effective_path, effective_query_string = resolve_path_and_query(base_url, url)

  // Step 2: merge query_map into query string
  if query_map not empty:
    q2 = build_query_string(query_map)   // encode keys/values
    effective_query_string = merge_query_strings(effective_query_string, q2)

  // Step 3: sort query string
  canonical_query = sort_query_string(effective_query_string)  // "a=1&b=2" sorted by pair

  // Step 4: canonicalize path
  canonical_path = canonicalize_path(effective_path)

  return canonical_path, canonical_query

function canonicalize_path(path):
  if path is empty: path = "/"
  if not starts_with(path, "/"): path = "/" + path

  path = normalize_dot_segments(path)            // resolve "." and ".."
  segments = split(path, "/")
  encoded_segments = []
  for each seg in segments:
    // decode then encode to prevent double-encoding
    encoded_segments.push(percent_encode(decode_percent(seg)))
  result = join("/", encoded_segments)
  if not starts_with(result, "/"): result = "/" + result
  return result
```

### Payload Hashing

Important: you must hash **exactly what you send** on the wire.

```
function hash_payload_sha256_hex(body):
  if body is null/undefined/empty_string:
    return sha256_hex(utf8(""))

  if body is bytes:
    return sha256_hex(body)

  if body is string:
    return sha256_hex(utf8(body))

  // otherwise treat as object and JSON-serialize
  json = json_stringify(body)          // language default
  return sha256_hex(utf8(json))
```

## Token Exchange Call (Pseudocode)

Partners typically use this signing flow only for token exchange:

```
request = {
  method: "POST",
  base_url: AURA_API_URL,
  url: "/auth/exchange",
  headers: {
    "X-Api-Key": SERVICE_API_KEY,
    "Host": parse_url(AURA_API_URL).host,
    "Content-Type": "application/json",
  },
  body: {
    ttl: 3600,
    scopes: ["upload:init", "upload:manage", "integration:read"],
  }
}

sign_request(AURA_APP_ID, AURA_APP_SECRET, request)

response = http_send(request)
return response.json()
```

## Common Failure Modes

- Host mismatch: you signed `Host=aura.example.com` but actually sent `Host=proxy.example.com`.
- JSON mismatch: you signed one JSON serialization but sent different bytes.
- Clock skew: timestamps too far from Aura server time.
- Missing signed headers: `Host` not present at signing time.

## Debugging Tip

When debugging 401/403 from Aura, log these values (do not log secrets):

- `canonical_request`
- `string_to_sign`
- `signed_headers`
- request method + full URL + headers actually sent

---

## Test Vectors

Use these test vectors to validate your signing implementation. All intermediate values are provided so you can pinpoint where your implementation diverges.

### Test Vector 1: POST with JSON body

**Credentials**

```
app_id     = "test-app-id"
app_secret = "test-secret-key"
```

**Request (before signing)**

```
method   = "POST"
url      = "/api/auth/exchange"
host     = "aura.example.com"
body     = {"ttl":3600,"scopes":["upload:init","upload:manage"]}
```

**Fixed values (normally generated)**

```
timestamp = "1706140800"
nonce     = "550e8400-e29b-41d4-a716-446655440000"
date      = "20240125"
```

**Headers before signing**

```
Host: aura.example.com
Content-Type: application/json
```

**Headers after signing (added)**

```
X-Aura-Timestamp: 1706140800
X-Aura-Nonce: 550e8400-e29b-41d4-a716-446655440000
Authorization: AURA-HMAC-SHA256 Credential=test-app-id,SignedHeaders=content-type;host;x-aura-nonce;x-aura-timestamp,Signature=<see below>
```

**Intermediate values**

```
// Body bytes (no extra whitespace)
body_string = '{"ttl":3600,"scopes":["upload:init","upload:manage"]}'

// Payload hash
payload_hash = sha256_hex(body_string)
             = "5335037164580247d5b44ecd0bafecaed26775a65e61c2fb867f39f97cbdd303"

// Signed headers (sorted, semicolon-separated)
signed_headers = "content-type;host;x-aura-nonce;x-aura-timestamp"

// Canonical headers (sorted, colon-separated, trailing newline)
canonical_headers = "content-type:application/json\nhost:aura.example.com\nx-aura-nonce:550e8400-e29b-41d4-a716-446655440000\nx-aura-timestamp:1706140800\n"

// Canonical request (note: empty line for empty query string)
canonical_request = "POST\n/api/auth/exchange\n\ncontent-type:application/json\nhost:aura.example.com\nx-aura-nonce:550e8400-e29b-41d4-a716-446655440000\nx-aura-timestamp:1706140800\n\ncontent-type;host;x-aura-nonce;x-aura-timestamp\n5335037164580247d5b44ecd0bafecaed26775a65e61c2fb867f39f97cbdd303"

// Canonical request hash
canonical_request_hash = sha256_hex(canonical_request)
                       = "887ab1575bee5565fb640a266a685549fe23f0365536f476b61924e964baf6cb"

// Credential scope
credential_scope = "test-app-id/20240125/aura_request"

// String to sign
string_to_sign = "AURA-HMAC-SHA256\n1706140800\ntest-app-id/20240125/aura_request\n887ab1575bee5565fb640a266a685549fe23f0365536f476b61924e964baf6cb"

// Key derivation
date_key    = hmac_sha256_raw(key="AURAtest-secret-key", data="20240125")
signing_key = hmac_sha256_raw(key=date_key, data="aura_request")

// Final signature
signature = hmac_sha256_hex(key=signing_key, data=string_to_sign)
          = "e8462b1ff170baa7c2aa9af6f512d41eab13e5d36bde5d40b3c098af206f5a6f"
```

**Expected Authorization header**

```
Authorization: AURA-HMAC-SHA256 Credential=test-app-id,SignedHeaders=content-type;host;x-aura-nonce;x-aura-timestamp,Signature=e8462b1ff170baa7c2aa9af6f512d41eab13e5d36bde5d40b3c098af206f5a6f
```

### Test Vector 2: GET without body

**Credentials**

```
app_id     = "test-app-id"
app_secret = "test-secret-key"
```

**Request**

```
method = "GET"
url    = "/api/uploader/config"
host   = "aura.example.com"
body   = (none)
```

**Fixed values**

```
timestamp = "1706140800"
nonce     = "a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4d"
date      = "20240125"
```

**Headers before signing**

```
Host: aura.example.com
```

**Intermediate values**

```
// No body → hash of empty string
payload_hash = sha256_hex("")
             = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

// Signed headers (no content-type for GET)
signed_headers = "host;x-aura-nonce;x-aura-timestamp"

// Canonical headers
canonical_headers = "host:aura.example.com\nx-aura-nonce:a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4d\nx-aura-timestamp:1706140800\n"

// Canonical request
canonical_request = "GET\n/api/uploader/config\n\nhost:aura.example.com\nx-aura-nonce:a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4d\nx-aura-timestamp:1706140800\n\nhost;x-aura-nonce;x-aura-timestamp\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

// Canonical request hash
canonical_request_hash = "d94e35db6dae4d6a686981a8780c875c002e2be9cfdafef75cdab392617845b3"

// Final signature
signature = "463e4d074c8d3c1dd6a18f09c322ff699ea08fceb6aa65419cf8df59710712a1"
```

**Expected Authorization header**

```
Authorization: AURA-HMAC-SHA256 Credential=test-app-id,SignedHeaders=host;x-aura-nonce;x-aura-timestamp,Signature=463e4d074c8d3c1dd6a18f09c322ff699ea08fceb6aa65419cf8df59710712a1
```

### Test Vector 3: POST with query parameters

**Request**

```
method = "POST"
url    = "/api/uploader/upload/init?mode=bulk&source=test"
host   = "aura.example.com"
body   = {"upload_id":"abc-123"}
```

**Fixed values**

```
timestamp = "1706140800"
nonce     = "11111111-2222-3333-4444-555555555555"
date      = "20240125"
```

**Intermediate values**

```
// Query string is sorted alphabetically
canonical_query = "mode=bulk&source=test"

// Canonical request includes sorted query
canonical_request = "POST\n/api/uploader/upload/init\nmode=bulk&source=test\n<canonical_headers>\n<signed_headers>\n<payload_hash>"
```

---

## Reference Request

This is a complete, concrete example you can use to test your implementation end-to-end.

**Credentials**

```
app_id     = "aura_pk_testapp123"
app_secret = "aura_sk_supersecretkey456"
```

**Request**

```
POST https://aura.example.com/api/auth/exchange
Host: aura.example.com
Content-Type: application/json
X-Api-Key: aura_au_myservice_abc123

{"ttl":3600,"scopes":["upload:init","upload:manage","integration:read"]}
```

**Use these fixed values for reproducibility**

```
timestamp = "1706184000"
nonce     = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
date      = "20240125"
```

**Intermediate values**

```
// Body
body_string = '{"ttl":3600,"scopes":["upload:init","upload:manage","integration:read"]}'

// Payload hash
payload_hash = "3aff517eea808aa374890ccf5a9345750a1e5d3abe35d61a27bde24168014b26"

// Canonical request hash
canonical_request_hash = "a232b96ddec6bbca2324af28d32472626841ec29d6d82f496c4a0e82cacdc76a"

// Credential scope
credential_scope = "aura_pk_testapp123/20240125/aura_request"

// Final signature
signature = "e675cc3c898d218247eb590ee5b4b1727f6ab3dc80c39195c20c8e342c88642c"
```

**Expected Authorization header**

```
Authorization: AURA-HMAC-SHA256 Credential=aura_pk_testapp123,SignedHeaders=content-type;host;x-aura-nonce;x-aura-timestamp,Signature=e675cc3c898d218247eb590ee5b4b1727f6ab3dc80c39195c20c8e342c88642c
```

**Validation steps**

1. Compute `payload_hash = sha256_hex('{"ttl":3600,"scopes":["upload:init","upload:manage","integration:read"]}')`
2. Build `canonical_request` with the exact format shown above
3. Build `string_to_sign`
4. Derive `signing_key` from `"AURA" + app_secret` → date → service
5. Compute `signature = hmac_sha256_hex(signing_key, string_to_sign)`
6. Compare your signature with `e675cc3c898d218247eb590ee5b4b1727f6ab3dc80c39195c20c8e342c88642c`

If your signature matches, your implementation is correct. If not, compare each intermediate value to find where your implementation diverges.
