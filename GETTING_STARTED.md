# Getting Started with Standalone Auraloader

This guide walks you through integrating the Standalone Auraloader into your application.

## Prerequisites

Before you begin, you'll need the following credentials from Aurabox:

| Credential | Description | Where it's used |
|------------|-------------|-----------------|
| `SERVICE_API_KEY` | Identifies your team/realm | Backend + Frontend |
| `AURA_APP_ID` | Your application identifier | Backend only |
| `AURA_APP_SECRET` | HMAC signing secret | Backend only |
| `AURA_API_URL` | Aura API base URL | Backend + Frontend |

> **Security Note**: `AURA_APP_ID` and `AURA_APP_SECRET` must **never** be exposed to the browser.

---

## Step 1: Get an Upload Token (Backend)

The uploader requires an ephemeral upload token for authentication. Your backend exchanges HMAC-signed credentials for this token.

### How HMAC Authentication Works

1. Your backend creates a request to `/auth/exchange`
2. The request is signed using the AURA-HMAC-SHA256 protocol
3. Aura validates the signature and returns an ephemeral upload token
4. Your frontend uses this token (not the HMAC credentials) for uploads

### Node.js Implementation

```javascript
// your-backend/routes/upload-token.js
import { HmacSigner } from "@aurabx/standalone-uploader";

export async function getUploadToken(req, res) {
  // 1. Verify the user is authenticated in your system
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // 2. Create the HMAC signer with your credentials
  const signer = new HmacSigner(
    process.env.AURA_APP_ID,     // e.g., "your-app-id"
    process.env.AURA_APP_SECRET  // e.g., "your-secret-key"
  );

  // 3. Prepare the token exchange request
  const config = {
    method: "POST",
    url: "/auth/exchange",
    baseURL: process.env.AURA_API_URL,  // e.g., "https://api.aurabox.com"
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": process.env.SERVICE_API_KEY,
    },
    data: {
      ttl: 3600,  // Token lifetime in seconds (1 hour)
      scopes: ["upload:init", "upload:manage", "integration:read"],
    },
  };

  // 4. Sign the request (adds Authorization, X-Aura-Timestamp, X-Aura-Nonce headers)
  await signer.sign(config);

  // 5. Exchange for an upload token
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

  // 6. Return the upload token to your frontend
  res.json({ token, expires_at, scopes });
}
```

### Token Exchange Response

```json
{
  "token": "aubt_abc123...",
  "expires_at": "2025-01-24T12:00:00Z",
  "scopes": ["upload:init", "upload:manage", "integration:read"]
}
```

### Other Languages

For Python, .NET, Java, or Go implementations, see [HMAC_IMPLEMENTATION.md](./HMAC_IMPLEMENTATION.md) for the complete signing algorithm and test vectors.

---

## Step 2: Embed the Uploader (Frontend)

Once your backend can issue upload tokens, embed the uploader in your frontend.

### Installation

**Option A: npx skills add**
```bash
npx skills add https://github.com/aurabx/skills
```

**Option B: npm/pnpm**
```bash
pnpm add @aurabx/standalone-uploader
```

**Option C: Script tag**
```html
<script src="https://your-cdn.com/standalone-auraloader.umd.js"></script>
```

### Basic Integration

```html
<!DOCTYPE html>
<html>
<head>
  <title>DICOM Uploader</title>
</head>
<body>
  <!-- Container where the uploader will be mounted -->
  <div id="uploader-container"></div>

  <script type="module">
    import { StandaloneAuraloader } from "@aurabx/standalone-uploader";

    async function initUploader() {
      // 1. Get an upload token from YOUR backend
      const response = await fetch("/api/upload-token", {
        method: "POST",
        credentials: "include",  // Include session cookies
      });
      
      if (!response.ok) {
        console.error("Failed to get upload token");
        return;
      }
      
      const { token } = await response.json();

      // 2. Create the uploader instance
      const uploader = new StandaloneAuraloader({
        // Required configuration
        apiToken: "your-service-api-key",
        apiBaseUrl: "https://api.aurabox.com",
        uploadToken: token,
        containerId: "uploader-container",
        
        // Optional: Associate with a patient
        patientId: "patient_123",
        
        // Optional: Additional context for the upload
        context: {
          patient_id: "your-internal-patient-id",
          referral_id: "REF-456",
          patient: {
            given_names: "John",
            family_name: "Smith",
            date_of_birth: "1977-06-03",
            sex: "m"
          }
        },
        
        // Optional: Event callbacks
        callbacks: {
          onUploadComplete: (result) => {
            console.log("Upload complete!", result);
            // Navigate to results, show success message, etc.
          },
          onUploadError: (error) => {
            console.error("Upload failed:", error);
            // Show error to user
          },
          onUploadCancel: () => {
            console.log("Upload cancelled");
          },
          onStudiesFound: (studies) => {
            console.log("DICOM studies detected:", studies);
          },
          onStateChange: (state) => {
            console.log("Uploader state:", state);
          },
        },
      });

      // 3. Initialize and mount the uploader
      await uploader.init();
      await uploader.mount();
    }

    initUploader();
  </script>
</body>
</html>
```

### UMD Bundle (Script Tag)

```html
<div id="uploader"></div>

<script src="standalone-auraloader.umd.js"></script>
<script>
  async function initUploader() {
    const { token } = await fetch("/api/upload-token", {
      method: "POST",
      credentials: "include",
    }).then(r => r.json());

    const uploader = new StandaloneAuraloader({
      apiToken: "your-service-api-key",
      apiBaseUrl: "https://api.aurabox.com",
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

---

## Configuration Reference

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiToken` | `string` | Yes | Service API key for team/realm identification |
| `apiBaseUrl` | `string` | Yes | Base URL for the Aura API |
| `uploadToken` | `string` | Yes | Ephemeral token from your backend |
| `containerId` | `string` | Yes | ID of the DOM element to mount into |
| `patientId` | `string` | No | Aurabox Patient ID, if known |
| `context` | `object` | No | Additional metadata for the upload |
| `callbacks` | `object` | No | Event callbacks (see below) |

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

---

## Uploader API

Once initialized, you can control the uploader programmatically (though usually you should just let it do its thing)

```javascript
// Start the upload process
await uploader.upload();

// Cancel the current upload
await uploader.cancel();

// Reset to initial state
uploader.reset();

// Remove a specific study from the queue
uploader.removeStudy("1.2.3.4.5.6.7.8.9");

// Cleanup and unmount
uploader.destroy();
```

---

## Next Steps

- [HMAC_IMPLEMENTATION.md](./HMAC_IMPLEMENTATION.md) - Detailed HMAC signing protocol for other languages
- [README.md](./README.md) - Full API reference and backend endpoint documentation
- [examples/](./examples/) - Working example applications

## Troubleshooting

**"Unauthorized" when getting upload token**
- Ensure your `AURA_APP_ID` and `AURA_APP_SECRET` are correct
- Check that your Service API Key (`X-Api-Key` header) is valid
- Verify the timestamp is within 5 minutes of server time

**Uploader fails to initialize**
- Confirm the `uploadToken` hasn't expired
- Check that required scopes are included in the token
- Verify `apiBaseUrl` is correct and accessible

**CORS errors**
- The upload token endpoint should be on your own backend, not a direct call to Aura
- Ensure your backend is returning proper CORS headers if frontend is on a different origin
