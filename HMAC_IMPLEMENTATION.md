# HMAC Authentication Implementation Guide

This guide provides comprehensive information about the HMAC signing implementation and how partners should implement it on their backend.

## Overview

The standalone uploader uses **AURA-HMAC-SHA256** authentication, which is compatible with AWS Signature Version 4 but customized for the Aura ecosystem. This ensures secure server-to-server communication while keeping HMAC secrets safely on the backend.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend     │    │    Backend      │    │   Aura API      │
│ (Browser)      │    │  (Your Server)  │    │                │
│                │    │                 │    │                │
│  Upload Token  │◄──►│  HMAC Signer   │◄──►│ Token Exchange  │
│    aubt_...    │    │                 │    │                │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## HMAC Signer Implementation Details

### Core Components

The `HmacSigner` class implements the AURA-HMAC-SHA256 protocol with these key components:

#### 1. Request Canonicalization
```typescript
// Canonical Request Format:
<HTTPMethod>
<CanonicalURI>
<CanonicalQueryString>
<CanonicalHeaders>
<SignedHeaders>
<HashedPayload>
```

#### 2. String to Sign
```typescript
// String to Sign Format:
AURA-HMAC-SHA256
<Timestamp>
<CredentialScope>
<HashedCanonicalRequest>
```

#### 3. Key Derivation
```typescript
// Key Derivation Steps:
date_key = HMAC-SHA256("AURA" + app_secret, "YYYYMMDD")
signing_key = HMAC-SHA256(date_key, "aura_request")
```

### Authentication Headers

Every signed request includes these required headers:

| Header | Format | Example |
|--------|---------|---------|
| `X-Aura-Timestamp` | Unix timestamp in seconds | `1706150400` |
| `X-Aura-Nonce` | UUID v4 | `550e8400-e29b-41d4-a716-446655440000` |
| `Authorization` | Complete signature | `AURA-HMAC-SHA256 Credential=...,SignedHeaders=...,Signature=...` |
| `X-Api-Key` | Service API key | `aura_au_standalone-uploader_...` |

### Required Headers for Signing

These headers are **always** included in the signature:
- `host` (HTTP Host header)
- `x-aura-nonce` 
- `x-aura-timestamp`

Additional headers signed when present:
- `content-type` (when request has body)

## Backend Implementation Guide

### Prerequisites

1. **Environment Variables** (Never expose to frontend):
   ```bash
   AURA_APP_ID=aura_pk_your-app-id
   AURA_APP_SECRET=aura_sk_your-app-secret  
   SERVICE_API_KEY=aura_au_standalone-uploader_your-service-key
   AURA_API_URL=https://your-aura-instance.com/api
   ```

2. **Install the Standalone Uploader**:
   ```bash
   npm install @aurabx/standalone-uploader
   ```

### Node.js Implementation

```javascript
import express from 'express';
import { HmacSigner } from '@aurabx/standalone-uploader';

const app = express();
app.use(express.json());

// Endpoint to provide upload tokens to your frontend
app.post('/api/upload-token', async (req, res) => {
  try {
    // 1. Authenticate your user session (your business logic)
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. Create HMAC signer with your credentials
    const signer = new HmacSigner(
      process.env.AURA_APP_ID,
      process.env.AURA_APP_SECRET
    );

    // 3. Prepare token exchange request
    const config = {
      method: 'POST',
      url: '/standalone/auth/exchange',
      baseURL: process.env.AURA_API_URL,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': process.env.SERVICE_API_KEY,
        'Host': new URL(process.env.AURA_API_URL).host
      },
      data: {
        ttl: 3600, // 1 hour token lifetime
        scopes: ['upload:init', 'upload:manage', 'integration:read'],
        max_uses: 100 // Optional: limit token usage
      }
    };

    // 4. Sign the request with HMAC
    await signer.sign(config);

    // 5. Exchange HMAC credentials for upload token
    const response = await fetch(`${config.baseURL}${config.url}`, {
      method: config.method,
      headers: config.headers,
      body: JSON.stringify(config.data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Token exchange failed');
    }

    const tokenData = await response.json();

    // 6. Return upload token to frontend
    res.json({
      token: tokenData.token,
      expires_at: tokenData.expires_at,
      scopes: tokenData.scopes
    });

  } catch (error) {
    console.error('Token exchange failed:', error);
    res.status(500).json({ 
      error: 'Failed to generate upload token' 
    });
  }
});
```

### Python Implementation

```python
import hashlib
import hmac
import json
import requests
import time
import uuid
from datetime import datetime
from urllib.parse import urlencode, urlparse

class AuraHmacSigner:
    def __init__(self, app_id, app_secret):
        self.app_id = app_id
        self.app_secret = app_secret
        self.algorithm = "AURA-HMAC-SHA256"
        self.service = "aura_request"
    
    def sign(self, config):
        """Sign a request configuration"""
        timestamp = str(int(time.time()))
        nonce = str(uuid.uuid4())
        date = datetime.now().strftime('%Y%m%d')
        
        # Add required headers
        headers = config.get('headers', {})
        headers['X-Aura-Timestamp'] = timestamp
        headers['X-Aura-Nonce'] = nonce
        
        # Set content-type for requests with body
        method = config.get('method', 'GET').upper()
        data = config.get('data')
        if method in ['POST', 'PUT', 'PATCH'] and data and 'content-type' not in headers:
            headers['Content-Type'] = 'application/json'
        
        # Build canonical request
        canonical = self._build_canonical_request(config, headers)
        
        # Build string to sign
        credential_scope = f"{self.app_id}/{date}/{self.service}"
        hashed_canonical = hashlib.sha256(canonical.encode()).hexdigest()
        string_to_sign = f"{self.algorithm}\n{timestamp}\n{credential_scope}\n{hashed_canonical}"
        
        # Derive signing key
        signing_key = self._derive_signing_key(date)
        
        # Compute signature
        signature = hmac.new(
            signing_key, 
            string_to_sign.encode(), 
            hashlib.sha256
        ).hexdigest()
        
        # Build signed headers list
        signed_headers = self._get_signed_headers(headers)
        
        # Set authorization header
        headers['Authorization'] = f"{self.algorithm} Credential={self.app_id},SignedHeaders={signed_headers},Signature={signature}"
        config['headers'] = headers
    
    def _derive_signing_key(self, date):
        """Derive signing key from secret and date"""
        date_key = hmac.new(
            f"AURA{self.app_secret}".encode(), 
            date.encode(), 
            hashlib.sha256
        ).digest()
        
        return hmac.new(
            date_key, 
            self.service.encode(), 
            hashlib.sha256
        ).digest()
    
    def _build_canonical_request(self, config, headers):
        """Build canonical request string"""
        method = config.get('method', 'GET').upper()
        url = config['url']
        
        # Parse URL (simplified)
        path = '/' + url.split('/')[-1] if '/' not in url else url
        query_string = ''
        
        # Build canonical headers
        canonical_headers = self._build_canonical_headers(headers)
        signed_headers = self._get_signed_headers(headers)
        
        # Hash payload
        payload_hash = hashlib.sha256(
            json.dumps(config.get('data', ''), separators=(',', ':')).encode()
        ).hexdigest()
        
        return f"{method}\n{path}\n{query_string}\n{canonical_headers}\n{signed_headers}\n{payload_hash}"
    
    def _build_canonical_headers(self, headers):
        """Build canonical headers string"""
        required_headers = ['host', 'x-aura-nonce', 'x-aura-timestamp']
        if 'content-type' in headers:
            required_headers.append('content-type')
        
        canonical = {}
        for key, value in headers.items():
            if key.lower() in required_headers:
                canonical[key.lower()] = value.strip()
        
        # Sort and format
        sorted_headers = sorted(canonical.items())
        return '\n'.join(f"{key}:{value}" for key, value in sorted_headers) + '\n'
    
    def _get_signed_headers(self, headers):
        """Get signed headers list"""
        required_headers = ['host', 'x-aura-nonce', 'x-aura-timestamp']
        if 'content-type' in headers:
            required_headers.append('content-type')
        
        return ';'.join(sorted(required_headers))

# Usage
app = Flask(__name__)

@app.route('/api/upload-token', methods=['POST'])
def get_upload_token():
    # Your user authentication logic here
    if not session.get('user'):
        return jsonify({'error': 'Unauthorized'}), 401
    
    signer = AuraHmacSigner(
        app.config['AURA_APP_ID'],
        app.config['AURA_APP_SECRET']
    )
    
    config = {
        'method': 'POST',
        'url': '/standalone/auth/exchange',
        'baseURL': app.config['AURA_API_URL'],
        'headers': {
            'Content-Type': 'application/json',
            'X-Api-Key': app.config['SERVICE_API_KEY']
        },
        'data': {
            'ttl': 3600,
            'scopes': ['upload:init', 'upload:manage', 'integration:read']
        }
    }
    
    signer.sign(config)
    
    response = requests.post(
        f"{config['baseURL']}{config['url']}",
        headers=config['headers'],
        json=config['data']
    )
    
    if response.status_code != 200:
        return jsonify({'error': 'Token exchange failed'}), 500
    
    token_data = response.json()
    return jsonify(token_data)
```

## Security Best Practices

### 1. **Never Expose Secrets to Frontend**
```javascript
// ❌ NEVER do this in browser:
const signer = new HmacSigner(appId, appSecret);

// ✅ ALWAYS do this on backend:
const signer = new HmacSigner(
  process.env.AURA_APP_ID,     // Environment variable
  process.env.AURA_APP_SECRET   // Environment variable  
);
```

### 2. **Validate User Sessions**
Always authenticate your users before issuing upload tokens:
```javascript
// Your business logic first
if (!req.session.user || !req.session.user.isAuthenticated) {
  return res.status(401).json({ error: 'Unauthorized' });
}

// Then issue token
const token = await generateUploadToken();
```

### 3. **Use Appropriate Token Scopes**
- `integration:read` - Get upload configuration
- `upload:init` - Initialize upload sessions  
- `upload:manage` - Start/complete/cancel uploads

### 4. **Set Reasonable Token TTL**
```javascript
data: {
  ttl: 3600,        // 1 hour (recommended)
  scopes: [...],      // Minimum required scopes
  max_uses: 100      // Optional: limit usage
}
```

### 5. **Implement Rate Limiting**
```javascript
// Example rate limiting on your token endpoint
import rateLimit from 'express-rate-limit';

const tokenLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 10,               // 10 requests per minute per user
  keyGenerator: (req) => req.session.userId
});

app.post('/api/upload-token', tokenLimiter, getUploadToken);
```

## API Endpoints Reference

### Token Exchange
```
POST /standalone/auth/exchange
Headers: X-Api-Key, Authorization (HMAC signed)
Body: { ttl, scopes, max_uses? }
Response: { token, expires_at, scopes }
Rate Limit: 10 requests/minute
```

### Required Headers
- `X-Api-Key`: Service API key for team/realm identification
- `Authorization`: HMAC signature in format: `AURA-HMAC-SHA256 Credential=...,SignedHeaders=...,Signature=...`
- `X-Aura-Timestamp`: Unix timestamp (must be within 5 minutes)
- `X-Aura-Nonce`: Unique UUID per request (prevents replay attacks)

## Troubleshooting

### Common Errors

1. **403 Forbidden** - Invalid HMAC signature
   - Check clock synchronization (timestamps must be within ±5 minutes)
   - Verify app ID and secret are correct
   - Ensure Host header is included in signature

2. **401 Unauthorized** - Invalid API key or token
   - Verify Service API key is valid
   - Check token hasn't expired
   - Ensure token has required scopes

3. **429 Too Many Requests** - Rate limited
   - Implement exponential backoff
   - Check token endpoint rate limits (10/minute)
   - Consider increasing TTL to reduce frequency

### Debugging

Enable debug logging to see canonical request and string to sign:

```javascript
// For debugging, add to your signer:
console.log('Canonical Request:', canonical);
console.log('String to Sign:', stringToSign);
console.log('Signing Key:', signingKey);
```

## Integration Checklist

- [ ] Store HMAC credentials in environment variables
- [ ] Implement user authentication before token exchange
- [ ] Use appropriate token scopes and TTL
- [ ] Implement rate limiting on token endpoint  
- [ ] Add error handling and logging
- [ ] Test with production Aura endpoint
- [ ] Validate token expiration handling
- [ ] Implement proper security headers

## Testing Your Implementation

### Unit Test Example
```javascript
import { HmacSigner } from '@aurabx/standalone-uploader';

describe('HMAC Implementation', () => {
  test('should sign request correctly', async () => {
    const signer = new HmacSigner('test-app-id', 'test-app-secret');
    
    const config = {
      method: 'POST',
      url: '/standalone/auth/exchange',
      baseURL: 'https://api.aura.com',
      headers: {
        'Content-Type': 'application/json'
      },
      data: { ttl: 3600, scopes: ['upload:init'] }
    };
    
    await signer.sign(config);
    
    expect(config.headers['Authorization']).toMatch(/^AURA-HMAC-SHA256/);
    expect(config.headers['X-Aura-Timestamp']).toBeDefined();
    expect(config.headers['X-Aura-Nonce']).toBeDefined();
  });
});
```

This comprehensive guide should enable partners to implement secure HMAC authentication correctly while maintaining security best practices.