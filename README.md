# Standalone Auraloader

A standalone DICOM uploader component for embedding in external applications. This package provides a complete, self-contained upload widget that handles DICOM file processing, validation, zipping, and upload via Tus (resumable) uploads.

**This library is only required by (and can only be implemented by) Aurabox integration partners. Contact Aurabox for more information.**

## Table of Contents

- [Installation](#installation)
- [Authentication Flow](#authentication-flow)
- [HMAC Implementation Guide](#hmac-implementation-guide)
- [Usage](#usage)
- [API](#api)
- [Backend Requirements](#backend-requirements)
- [Security Best Practices](#security-best-practices)
- [Development](#development)

## Installation

### Via npx skills add

```bash
npx skills add https://github.com/aurabx/skills
```

### Via npm/pnpm

```bash
pnpm add @aurabx/standalone-uploader
```

### Via script tag

```html
<!-- All CSS is bundled - no external stylesheets required -->
<script src="https://your-cdn.com/standalone-auraloader.umd.js"></script>
```

## Authentication Flow

**⚠️ IMPORTANT: HMAC secrets must NEVER be exposed to the browser!**

The standalone uploader uses a secure two-phase authentication flow:

### Phase 1: Backend Token Exchange (Server-to-Server)

Your **backend** exchanges HMAC credentials for an ephemeral upload token:

```javascript
// YOUR BACKEND (Node.js example)
import { HmacSigner } from "@aurabx/standalone-uploader";

async function getUploadToken(req, res) {
  // HMAC credentials stay on the backend
  const signer = new HmacSigner(
    process.env.AURA_APP_ID,
    process.env.AURA_APP_SECRET
  );

  const config = {
    method: "POST",
    url: "/auth/exchange",
    baseURL: "https://aura-instance.com/api",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": process.env.SERVICE_API_KEY,
    },
    data: {
      ttl: 3600, // Token valid for 1 hour
      scopes: ["upload:init", "upload:manage"],
    },
  };

  // Sign the request with HMAC
  await signer.sign(config);

  // Exchange for upload token
  const response = await fetch(`${config.baseURL}${config.url}`, {
    method: config.method,
    headers: config.headers,
    body: JSON.stringify(config.data),
  });

  const { token, expires_at } = await response.json();

  // Return token to your frontend
  res.json({ token, expires_at });
}
```

### Phase 2: Browser Upload with Token

Your **frontend** uses the ephemeral token to upload files:

```javascript
// YOUR FRONTEND (Browser)
import { StandaloneAuraloader } from "@aurabx/standalone-uploader";

async function initializeUploader() {
  // Get upload token from YOUR backend (not Aura backend)
  // e.g.
  const { token } = await fetch("/api/upload-token").then((r) => r.json());

  // Load the StandaloneAuraloader component
  const uploader = new StandaloneAuraloader({
    apiToken: "your-service-api-key", // For team/realm identification, e.g. process.env.SERVICE_API_KEY
    apiBaseUrl: "https://aura-instance.com/api",
    uploadToken: token, // Ephemeral token from your backend
    containerId: "uploader-container",
    patientId: "patient_123", // Optional
    context: { 
        // Used to match patients (depends in integration)
        patient_id: "your-patient-id",
        // Optional additional information
        referral_id: "your-referral-id",
        // Patient metadata (for creating a new patient)
        patient: {
          "given_names": "john",
          "family_name": "smith",
          "date_of_birth": "1977-06-03",
          "sex": "m"
        }
    },
    callbacks: {
      onUploadComplete: (result) => console.log("Upload complete!", result),
      onUploadError: (error) => console.error("Upload failed:", error),
    },
  });

  await uploader.init();
  await uploader.mount();
}
```

## Usage

### ES Module

```javascript
import { StandaloneAuraloader } from "@aurabx/standalone-uploader";

const uploader = new StandaloneAuraloader({
  apiToken: "your-service-api-key",
  apiBaseUrl: "https://aura-instance.com/api",
  uploadToken: "aubt_...", // Obtained from your backend
  containerId: "uploader-container",
  patientId: "patient_123", // Optional
  context: { source: "external-app" }, // Optional
  callbacks: {
    onUploadComplete: (result) => {
      console.log("Upload complete!", result);
    },
    onUploadError: (error) => {
      console.error("Upload failed:", error);
    },
  },
});

await uploader.init();
await uploader.mount();
```

### Script Tag (UMD)

```html
<div id="uploader"></div>

<script src="standalone-auraloader.umd.js"></script>
<script>
  // Get upload token from your backend first
  async function initUploader() {
    const { token } = await fetch("/api/upload-token").then((r) => r.json());

    const uploader = new StandaloneAuraloader({
      apiToken: "your-service-api-key",
      apiBaseUrl: "https://aura-instance.com/api",
      uploadToken: token,
      containerId: "uploader",
      callbacks: {
        onUploadComplete: (result) => console.log("Complete!", result),
        onUploadError: (error) => console.error("Error:", error),
      },
    });

    await uploader.init();
    await uploader.mount();
  }

  initUploader();
</script>
```

## HMAC Implementation Guide

📖 **For comprehensive implementation details, see [HMAC_IMPLEMENTATION.md](./HMAC_IMPLEMENTATION.md)**

### Quick Reference

The AURA-HMAC-SHA256 protocol requires:

1. **Required Headers** (always signed):
   - `X-Aura-Timestamp` - Unix timestamp (seconds)
   - `X-Aura-Nonce` - UUID v4 per request
   - `Authorization` - Complete HMAC signature

2. **Key Components**:
   - Request canonicalization (AWS Signature V4 compatible)
   - String to sign: `ALGORITHM\\nTIMESTAMP\\nCREDENTIAL_SCOPE\\nHASHED_REQUEST`
   - Key derivation: `date_key → signing_key`

3. **Security Rules**:
   - ✅ HMAC secrets NEVER exposed to browser
   - ✅ User authentication before token issuance
   - ✅ Rate limiting on token exchange (10/minute)
   - ✅ Appropriate token TTL and scopes

4. **Implementation Options**:
   - Node.js: Use built-in `HmacSigner` class
   - Python/Java/Go: Implement AURA-HMAC-SHA256 protocol
   - See detailed guide for complete examples

## Configuration

| Option        | Type     | Required | Description                                   |
| ------------- | -------- | -------- |-----------------------------------------------|
| `apiToken`    | `string` | Yes      | Service API key for team/realm identification |
| `apiBaseUrl`  | `string` | Yes      | Base URL for the Aura API                     |
| `uploadToken` | `string` | Yes      | Ephemeral upload token (from your backend)    |
| `containerId` | `string` | Yes      | ID of the container element                   |
| `patientId`   | `string` | No       | Aurabox Patient ID, if known                  |
| `context`     | `object` | No       | Extra metadata sent during upload init        |
| `callbacks`   | `object` | No       | Event callbacks                               |

### Upload Token Format

Upload tokens are ephemeral bearer tokens:

- **Prefix**: `aubt_` (AUra Bearer Token)
- **Lifetime**: Default 1 hour, maximum 24 hours
- **Scope-limited**: Can restrict to specific operations
- **Obtained from**: Your backend via HMAC exchange

### Callbacks

```typescript
interface Callbacks {
  onUploadComplete?: (result: UploadResult) => void;
  onUploadError?: (error: AuraloaderError) => void;
  onUploadCancel?: () => void;
  onStudiesFound?: (studies: StudyInfo[]) => void;
  onStateChange?: (state: UploaderState) => void;
}
```

## API

### Methods

| Method             | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `init()`           | Initialize the uploader (fetches config from server) |
| `mount()`          | Mount the UI to the DOM                              |
| `upload()`         | Start the upload process                             |
| `cancel()`         | Cancel the current upload                            |
| `reset()`          | Reset to initial state                               |
| `removeStudy(uid)` | Remove a study from the queue                        |
| `destroy()`        | Cleanup and unmount                                  |

## Backend Requirements

### Aura API Endpoints

The standalone uploader expects the following endpoints under your `apiBaseUrl`:

#### Token Exchange (HMAC authenticated - backend only)

`POST /auth/exchange` - Exchange HMAC credentials for upload token

- **Auth**: HMAC-signed request + Service API key via `X-Api-Key` header
- **Body**:
  ```json
  {
    "ttl": 3600,
    "scopes": ["upload:init", "upload:manage", "integration:read"],
    "max_uses": 100
  }
  ```
- **Returns**:
  ```json
  {
    "token": "aubt_...",
    "expires_at": "2025-01-24T12:00:00Z",
    "scopes": ["upload:init", "upload:manage"],
    "max_uses": 100
  }
  ```
- **Rate limit**: 10 requests/minute

#### Configuration Endpoint (Upload token authenticated - browser)

`GET /uploader/config` - Returns upload configuration (Tus endpoint, credentials)

- **Auth**: Upload token (scope: `integration:read`) + Service API key
- **Headers**: `X-Api-Key: <service-api-key>`, `Authorization: Bearer <upload-token>`
- **Returns**:
  ```json
  {
    "lift": {
      "endpoint": "https://tus-server.com/files/",
      "token": "tus-auth-token",
      "bucket": "uploads"
    },
    "mode": "bulk"
  }
  ```
- **Rate limit**: 30 requests/minute

#### Upload Lifecycle Endpoints (Upload token authenticated - browser)

`POST /uploader/upload/init` - Initialize upload session

- **Auth**: Upload token (scope: `upload:init`) + Service API key
- **Body**:
  ```json
  {
    "upload_id": "uuid-v4",
    "studies": { "study-uid": { "patient_name": "...", ... } },
    "mode": "bulk",
    "source": "standalone-uploader",
    "patient_id": "PAT-123",
    "context": { "referral_id": "REF-456" }
  }
  ```
- **Returns**:
  ```json
  {
    "studies": [{ "id": "internal-study-id" }]
  }
  ```

`POST /uploader/upload/start` - Mark upload as started

- **Auth**: Upload token (scope: `upload:manage`) + Service API key
- **Body**: `{ "upload_id": "...", "assembly_id": "...", "mode": "uploader" }`

`POST /uploader/upload/complete` - Mark upload as complete

- **Auth**: Upload token (scope: `upload:manage`) + Service API key
- **Body**: `{ "upload_id": "...", "assembly_id": "...", "mode": "uploader" }`

`POST /uploader/upload/error` - Report upload error

- **Auth**: Upload token (scope: `upload:manage`) + Service API key
- **Body**: `{ "upload_id": "...", "message": "error message", "mode": "uploader" }`

`POST /uploader/upload/cancel` - Cancel upload

- **Auth**: Upload token (scope: `upload:manage`) + Service API key
- **Body**: `{ "upload_id": "...", "mode": "uploader" }`

**Rate limit**: 60 requests/minute for all upload lifecycle endpoints

### Your Backend Implementation

You need to implement an endpoint to exchange HMAC credentials for upload tokens.

📖 **For complete implementation details, see [HMAC_IMPLEMENTATION.md](./HMAC_IMPLEMENTATION.md)**

Here's a simplified Node.js example:

```javascript
// Example: /api/upload-token
import { HmacSigner } from "@aurabx/standalone-uploader";

app.post("/api/upload-token", async (req, res) => {
  // 1. Authenticate your user session
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // 2. Sign request with HMAC (using secrets from environment)
  const signer = new HmacSigner(
    process.env.AURA_APP_ID,
    process.env.AURA_APP_SECRET
  );

  const config = {
    method: "POST",
    url: "/auth/exchange",
    baseURL: process.env.AURA_API_URL,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": process.env.SERVICE_API_KEY,
    },
    data: {
      ttl: 3600, // 1 hour
      scopes: ["upload:init", "upload:manage", "integration:read"],
    },
  };

  await signer.sign(config);

  // 3. Call Aura's token exchange endpoint
  const response = await fetch(`${config.baseURL}${config.url}`, {
    method: config.method,
    headers: config.headers,
    body: JSON.stringify(config.data),
  });

  if (!response.ok) {
    const error = await response.json();
    return res.status(response.status).json(error);
  }

  const { token, expires_at, scopes } = await response.json();

  // 4. Return upload token to your frontend
  res.json({ token, expires_at, scopes });
});
```

**Key Implementation Points:**
- ✅ HMAC secrets stay on backend (never exposed to browser)
- ✅ User authentication before token issuance  
- ✅ Proper error handling and rate limiting
- ✅ Use of appropriate scopes and TTL

## Security Best Practices

1. **NEVER expose HMAC secrets to browsers** - Keep them on your backend
2. **Validate user sessions** before issuing upload tokens
3. **Use short token lifetimes** (1 hour recommended)
4. **Restrict token scopes** to minimum required operations
5. **Implement rate limiting** on your token exchange endpoint

## Development

```bash
# Install dependencies
pnpm install

# Run typecheck
pnpm typecheck

# Build
pnpm build

# Dev server (for examples)
pnpm dev
```

### Example Application

The `examples/index.html` demonstrates the complete authentication flow including HMAC exchange:

- **Step 1**: Backend token exchange (simulated in browser for demo purposes)
- **Step 2**: Initialize uploader with obtained token
- Includes Service API key, HMAC credentials, and upload token fields
- Shows proper error handling and token validation

**⚠️ Security Warning**: The example includes HMAC exchange in the browser for demonstration purposes only. In production:

1. HMAC credentials (`app.id` and `app.secret`) must NEVER be exposed to the browser
2. Token exchange must happen on your backend server
3. Your frontend should fetch tokens from YOUR backend endpoint (e.g., `/api/upload-token`)

The example is useful for:

- Understanding the two-phase authentication flow
- Testing the uploader component locally
- Seeing how HMAC signing works (for backend implementation reference)
- Debugging authentication issues

## License

UNLICENSED - Proprietary software
