# Aura Uploader API .NET Client

This directory contains a complete C# implementation of the Aura Uploader API client, including HMAC-SHA256 authentication.

## Files

- **AuraUploaderClient.cs** - High-level API client for auth and manage endpoints
- **AuraHmacSigner.cs** - Core HMAC signing implementation
- **TokenExchangeExample.cs** - Low-level token exchange example
- **Aura.UploaderClient.Tests/** - Unit test project

## Quick Start

```csharp
using Aura.UploaderClient;

// Configure the client
var options = new AuraClientOptions
{
    BaseUrl = "https://aura.example.com",
    AppId = "your-app-id",
    AppSecret = "your-app-secret",
    ApiKey = "your-api-key"
};

using var client = new AuraUploaderClient(options);

// Exchange token (handled automatically, but can be done explicitly)
var tokenResponse = await client.ExchangeTokenAsync(new TokenExchangeRequest
{
    Ttl = 3600,
    Scopes = new[] { "upload:init", "upload:manage" }
});

// Submit an upload for processing
var submitResponse = await client.SubmitAsync(new SubmitRequest
{
    UploadId = "upload-123",
    Metadata = new Dictionary<string, object>
    {
        { "patient_id", "12345" },
        { "study_type", "CT" }
    }
});

// Withdraw an upload
var withdrawResponse = await client.WithdrawAsync(new WithdrawRequest
{
    UploadId = "upload-123",
    Reason = "Duplicate upload"
});
```

## API Endpoints

The client covers the following endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/exchange` | Exchange HMAC credentials for bearer token |
| POST | `/api/uploader/manage/submit` | Submit upload for processing |
| POST | `/api/uploader/manage/withdraw` | Withdraw a submitted upload |

## Low-Level Usage

For more control, use `AuraHmacSigner` directly:

```csharp
using Aura.UploaderClient;

var request = new AuraHmacSigner.HttpRequest
{
    Method = "POST",
    BaseUrl = "https://aura.example.com",
    Url = "/api/auth/exchange",
    Headers = new Dictionary<string, string>
    {
        { "X-Api-Key", "your-api-key" },
        { "Host", "aura.example.com" },
        { "Content-Type", "application/json" }
    },
    Body = new
    {
        ttl = 3600,
        scopes = new[] { "upload:init", "upload:manage" }
    }
};

// Sign the request
AuraHmacSigner.SignRequest(appId, appSecret, request);

// Send with HttpClient
using var httpClient = new HttpClient();
var httpRequest = new HttpRequestMessage
{
    Method = new HttpMethod(request.Method),
    RequestUri = new Uri(new Uri(request.BaseUrl), request.Url),
    Content = request.Body != null ? 
        new StringContent(JsonSerializer.Serialize(request.Body), Encoding.UTF8, "application/json") : 
        null
};

// Copy headers (except Host which is handled by HttpClient)
foreach (var header in request.Headers)
{
    if (!header.Key.Equals("Host", StringComparison.OrdinalIgnoreCase))
    {
        httpRequest.Headers.TryAddWithoutValidation(header.Key, header.Value);
    }
}

var response = await httpClient.SendAsync(httpRequest);
```

### Environment Variables

Set these environment variables for the examples:

```bash
export AURA_APP_ID="your-app-id"
export AURA_APP_SECRET="your-app-secret"
export AURA_API_KEY="your-api-key"
export AURA_API_URL="https://api.aura.com"
```

## Security Notes

- Store `appSecret` securely (environment variables, Azure Key Vault, etc.)
- Use HTTPS for all requests
- Implement proper error handling and retry logic
- Consider rate limiting for production use

## Running Tests

Run the unit tests with:

```bash
cd Aura.UploaderClient.Tests
dotnet test
```

Or from the parent directory:

```bash
dotnet test Aura.UploaderClient.Tests
```

## Dependencies

- .NET 10.0 or later
- System.Security.Cryptography (built-in)
- System.Text.Json (built-in)

### Test Dependencies

- xUnit.v3 3.2.2