# Aura Uploader Client for Django/Python

A Python client for the Aura Uploader API, with Django integration support. This client provides HMAC authentication and API methods for token exchange, upload submission, and withdrawal.

## Installation

### Requirements

- Python 3.8+
- Django 3.2+ (for Django integration features)
- requests

### Install as a package

```bash
# Install core package (no Django dependency)
pip install -e .

# Install with Django support
pip install -e ".[django]"

# Install with development/test dependencies
pip install -e ".[dev]"

# Install everything
pip install -e ".[all]"
```

### Or install dependencies manually

```bash
pip install -r requirements.txt
```

## Quick Start

### Standalone Python Usage

The client can be used without Django:

```python
from aura_uploader import AuraUploaderClient, AuraClientOptions, SubmitRequest

# Configure the client
options = AuraClientOptions(
    base_url="https://aura.example.com",
    app_id="your-app-id",
    app_secret="your-app-secret",
    api_key="your-api-key"
)

# Create client and use as context manager
with AuraUploaderClient(options) as client:
    # Exchange HMAC credentials for bearer token
    token = client.exchange_token()
    print(f"Token: {token.access_token}")
    
    # Submit an upload (token is managed automatically)
    response = client.submit(SubmitRequest(
        upload_id="your-upload-id",
        metadata={"patient_id": "12345", "study_type": "CT"}
    ))
    print(f"Submit status: {response.status}")
```

### Django Integration

#### 1. Add settings

Add the following to your Django `settings.py`:

```python
# Aura Uploader Settings
AURA_BASE_URL = "https://aura.example.com"
AURA_APP_ID = "your-app-id"
AURA_APP_SECRET = "your-app-secret"  # Keep this secret!
AURA_API_KEY = "your-api-key"

# Optional settings (with defaults)
AURA_TOKEN_TTL = 3600  # Token TTL in seconds
AURA_DEFAULT_SCOPES = ["upload:init", "upload:manage", "integration:read"]
AURA_TIMEOUT = 30  # Request timeout in seconds
```

#### 2. Add middleware (optional)

Add the middleware to ensure client cleanup after requests:

```python
MIDDLEWARE = [
    # ... other middleware
    'aura_uploader.django.AuraClientMiddleware',
]
```

#### 3. Use in views

```python
from django.http import JsonResponse
from aura_uploader.django import get_aura_client, handle_aura_errors
from aura_uploader import SubmitRequest

@handle_aura_errors
def submit_upload(request, upload_id):
    client = get_aura_client()
    
    response = client.submit(SubmitRequest(
        upload_id=upload_id,
        metadata={"source": "django-app"}
    ))
    
    return JsonResponse({
        "success": response.success,
        "status": response.status
    })
```

#### 4. URL configuration

```python
from django.urls import path
from aura_uploader.views import (
    exchange_token_view,
    submit_upload_view,
    withdraw_upload_view
)

urlpatterns = [
    path('api/aura/exchange/', exchange_token_view, name='aura_exchange'),
    path('api/aura/submit/', submit_upload_view, name='aura_submit'),
    path('api/aura/withdraw/', withdraw_upload_view, name='aura_withdraw'),
]
```

## API Reference

### AuraUploaderClient

The main client class for interacting with the Aura Uploader API.

#### Methods

##### `exchange_token(request: TokenExchangeRequest = None) -> TokenExchangeResponse`

Exchange HMAC credentials for a bearer token.

```python
response = client.exchange_token()
# or with custom parameters
response = client.exchange_token(TokenExchangeRequest(
    ttl=7200,
    scopes=["upload:init"]
))
```

##### `ensure_authenticated() -> str`

Ensure a valid access token is available, refreshing if necessary.

```python
token = client.ensure_authenticated()
```

##### `submit(request: SubmitRequest) -> SubmitResponse`

Submit an upload for processing.

```python
response = client.submit(SubmitRequest(
    upload_id="your-upload-id",
    metadata={"key": "value"}
))
```

##### `withdraw(request: WithdrawRequest) -> WithdrawResponse`

Withdraw a previously submitted upload.

```python
response = client.withdraw(WithdrawRequest(
    upload_id="your-upload-id",
    reason="Duplicate upload"
))
```

### AuraHmacSigner

Low-level HMAC signing utilities.

```python
from aura_uploader import AuraHmacSigner
from aura_uploader.signer import HttpRequest

request = HttpRequest(
    method="POST",
    base_url="https://aura.example.com",
    url="/api/auth/exchange",
    headers={
        "Host": "aura.example.com",
        "Content-Type": "application/json"
    },
    body={"ttl": 3600}
)

AuraHmacSigner.sign_request("app-id", "app-secret", request)
# request.headers now contains the Authorization header
```

## Django Decorators

### `@handle_aura_errors`

Catches `AuraApiException` and returns a JSON error response.

```python
@handle_aura_errors
def my_view(request):
    # If an AuraApiException is raised, returns JSON error response
    client = get_aura_client()
    ...
```

### `@require_aura_token`

Ensures authentication before the view executes.

```python
@require_aura_token
def my_view(request):
    # Token is guaranteed to be valid
    client = get_aura_client()
    ...
```

## Running Tests

```bash
cd examples/django

# Using pytest (requires: pip install -e ".[dev]")
pytest

# Or using unittest (no extra dependencies)
python -m unittest discover tests/
```

## Project Structure

```
examples/django/
├── aura_uploader/
│   ├── __init__.py          # Package exports
│   ├── client.py            # Main client class
│   ├── django.py            # Django integration
│   ├── exceptions.py        # Custom exceptions
│   ├── signer.py            # HMAC signing
│   └── views.py             # Example Django views
├── tests/
│   ├── __init__.py
│   └── test_signer.py       # Signature tests
├── README.md
└── requirements.txt
```

## Security Notes

- Never commit your `AURA_APP_SECRET` to version control
- Use environment variables or Django's secret management for credentials
- The client automatically handles token refresh, but tokens should be treated as sensitive data
- HMAC signatures include timestamps to prevent replay attacks

## Compatibility

This Python client produces signatures compatible with the .NET client. The test vectors in `tests/test_signer.py` verify compatibility with the signatures produced by the .NET implementation.
