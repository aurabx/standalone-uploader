"""
Aura Uploader Client.

A high-level client for interacting with the Aura Uploader API.
"""

import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import requests

from .exceptions import AuraApiException
from .signer import AuraHmacSigner, HttpRequest


@dataclass
class AuraClientOptions:
    """
    Configuration options for the Aura Uploader Client.
    
    Attributes:
        base_url: Base URL of the Aura API (e.g., "https://aura.example.com")
        app_id: Application ID for HMAC authentication
        app_secret: Application secret for HMAC authentication
        api_key: API key for the X-Api-Key header
        token_ttl: Time-to-live for access tokens in seconds (default: 3600)
        default_scopes: Default OAuth scopes for token exchange
        timeout: Request timeout in seconds (default: 30)
    """
    base_url: str
    app_id: str
    app_secret: str
    api_key: str
    token_ttl: int = 3600
    default_scopes: List[str] = field(default_factory=lambda: [
        "upload:init",
        "upload:manage",
        "integration:read"
    ])
    timeout: int = 30


@dataclass
class TokenExchangeRequest:
    """Request for token exchange."""
    ttl: int = 3600
    scopes: Optional[List[str]] = None


@dataclass
class TokenExchangeResponse:
    """Response from token exchange."""
    access_token: str
    token_type: str
    expires_in: int
    scopes: Optional[List[str]] = None


@dataclass
class SubmitRequest:
    """Request to submit an upload."""
    upload_id: str
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class SubmitResponse:
    """Response from upload submission."""
    success: bool
    upload_id: str
    status: str
    message: Optional[str] = None


@dataclass
class WithdrawRequest:
    """Request to withdraw an upload."""
    upload_id: str
    reason: Optional[str] = None


@dataclass
class WithdrawResponse:
    """Response from upload withdrawal."""
    success: bool
    upload_id: str
    status: str
    message: Optional[str] = None


class AuraUploaderClient:
    """
    Client for the Aura Uploader API.
    
    Provides methods for authentication (token exchange) and upload management
    (submit, withdraw). Handles automatic token refresh and request signing.
    
    Example:
        >>> options = AuraClientOptions(
        ...     base_url="https://aura.example.com",
        ...     app_id="your-app-id",
        ...     app_secret="your-app-secret",
        ...     api_key="your-api-key"
        ... )
        >>> client = AuraUploaderClient(options)
        >>> 
        >>> # Exchange token
        >>> token = client.exchange_token()
        >>> print(f"Token: {token.access_token}")
        >>> 
        >>> # Submit an upload
        >>> response = client.submit(SubmitRequest(
        ...     upload_id="your-upload-id",
        ...     metadata={"patient_id": "12345"}
        ... ))
    """
    
    def __init__(
        self,
        options: AuraClientOptions,
        session: Optional[requests.Session] = None
    ):
        """
        Initialize the client.
        
        Args:
            options: Client configuration options
            session: Optional requests.Session for connection pooling
        """
        self._options = options
        self._session = session or requests.Session()
        self._owns_session = session is None
        self._access_token: Optional[str] = None
        self._token_expiry: float = 0
    
    def __enter__(self) -> "AuraUploaderClient":
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()
    
    def close(self) -> None:
        """Close the client and release resources."""
        if self._owns_session:
            self._session.close()
    
    # -------------------------------------------------------------------------
    # Auth Endpoints
    # -------------------------------------------------------------------------
    
    def exchange_token(
        self,
        request: Optional[TokenExchangeRequest] = None
    ) -> TokenExchangeResponse:
        """
        Exchange HMAC credentials for a bearer token.
        
        POST /api/auth/exchange
        
        Args:
            request: Token exchange request parameters (optional)
        
        Returns:
            TokenExchangeResponse with access token and metadata
        """
        if request is None:
            request = TokenExchangeRequest(
                ttl=self._options.token_ttl,
                scopes=self._options.default_scopes
            )
        
        body: Dict[str, Any] = {
            "ttl": request.ttl
        }
        if request.scopes:
            body["scopes"] = request.scopes
        
        http_request = self._create_signed_request(
            method="POST",
            path="api/auth/exchange",
            body=body
        )
        
        response_data = self._send_request(http_request)
        
        return TokenExchangeResponse(
            access_token=response_data.get("access_token", ""),
            token_type=response_data.get("token_type", ""),
            expires_in=response_data.get("expires_in", 0),
            scopes=response_data.get("scopes")
        )
    
    def ensure_authenticated(self) -> str:
        """
        Ensure a valid access token is available, refreshing if necessary.
        
        Returns:
            Valid access token
        """
        # Check if we have a valid token with 1 minute buffer
        if self._access_token and time.time() < (self._token_expiry - 60):
            return self._access_token
        
        # Exchange for new token
        response = self.exchange_token(TokenExchangeRequest(
            ttl=self._options.token_ttl,
            scopes=self._options.default_scopes
        ))
        
        self._access_token = response.access_token
        self._token_expiry = time.time() + response.expires_in
        
        return self._access_token
    
    # -------------------------------------------------------------------------
    # Manage Endpoints
    # -------------------------------------------------------------------------
    
    def submit(self, request: SubmitRequest) -> SubmitResponse:
        """
        Submit an upload for processing.
        
        POST /api/uploader/manage/submit
        
        Args:
            request: Submit request with upload_id and optional metadata
        
        Returns:
            SubmitResponse with status information
        """
        self.ensure_authenticated()
        
        body: Dict[str, Any] = {
            "upload_id": request.upload_id
        }
        if request.metadata:
            body["metadata"] = request.metadata
        
        http_request = self._create_authenticated_request(
            method="POST",
            path="api/uploader/manage/submit",
            body=body
        )
        
        response_data = self._send_request(http_request)
        
        return SubmitResponse(
            success=response_data.get("success", False),
            upload_id=response_data.get("upload_id", ""),
            status=response_data.get("status", ""),
            message=response_data.get("message")
        )
    
    def withdraw(self, request: WithdrawRequest) -> WithdrawResponse:
        """
        Withdraw a previously submitted upload.
        
        POST /api/uploader/manage/withdraw
        
        Args:
            request: Withdraw request with upload_id and optional reason
        
        Returns:
            WithdrawResponse with status information
        """
        self.ensure_authenticated()
        
        body: Dict[str, Any] = {
            "upload_id": request.upload_id
        }
        if request.reason:
            body["reason"] = request.reason
        
        http_request = self._create_authenticated_request(
            method="POST",
            path="api/uploader/manage/withdraw",
            body=body
        )
        
        response_data = self._send_request(http_request)
        
        return WithdrawResponse(
            success=response_data.get("success", False),
            upload_id=response_data.get("upload_id", ""),
            status=response_data.get("status", ""),
            message=response_data.get("message")
        )
    
    # -------------------------------------------------------------------------
    # Private Methods
    # -------------------------------------------------------------------------
    
    def _create_signed_request(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None
    ) -> HttpRequest:
        """Create an HMAC-signed request."""
        from urllib.parse import urlparse
        
        parsed = urlparse(self._options.base_url)
        host = parsed.netloc
        
        request = HttpRequest(
            method=method,
            base_url=self._options.base_url,
            url=f"/{path}",
            headers={
                "Host": host,
                "Content-Type": "application/json",
                "X-Api-Key": self._options.api_key
            },
            body=body
        )
        
        AuraHmacSigner.sign_request(
            self._options.app_id,
            self._options.app_secret,
            request
        )
        
        return request
    
    def _create_authenticated_request(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None
    ) -> HttpRequest:
        """Create a bearer token authenticated request."""
        return HttpRequest(
            method=method,
            base_url=self._options.base_url,
            url=f"/{path}",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._access_token}"
            },
            body=body
        )
    
    def _send_request(self, request: HttpRequest) -> Dict[str, Any]:
        """Send an HTTP request and return the JSON response."""
        url = urljoin(
            self._options.base_url.rstrip("/") + "/",
            request.url.lstrip("/")
        )
        
        # Prepare headers (exclude Host as requests handles it)
        headers = {
            k: v for k, v in request.headers.items()
            if k.lower() != "host"
        }
        
        # Prepare body
        data = None
        if request.body is not None:
            data = json.dumps(request.body, separators=(",", ":"))
        
        try:
            response = self._session.request(
                method=request.method,
                url=url,
                headers=headers,
                data=data,
                timeout=self._options.timeout
            )
        except requests.RequestException as e:
            raise AuraApiException(f"Request failed: {e}")
        
        content = response.text
        
        if not response.ok:
            raise AuraApiException(
                f"API request failed: {content}",
                status_code=response.status_code,
                response_content=content
            )
        
        try:
            return response.json()
        except json.JSONDecodeError as e:
            raise AuraApiException(
                f"Failed to decode JSON response: {e}",
                status_code=response.status_code,
                response_content=content
            )
