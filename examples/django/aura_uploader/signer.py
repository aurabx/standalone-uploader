"""
HMAC Signer for Aura API requests.

Implements the AURA-HMAC-SHA256 signing algorithm compatible with the
Aura Uploader API authentication requirements.
"""

import hashlib
import hmac
import json
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple
from urllib.parse import parse_qs, urlencode, urlparse


ALGORITHM = "AURA-HMAC-SHA256"
SERVICE = "aura_request"
REQUIRED_SIGNED_HEADERS = frozenset({"host", "x-aura-nonce", "x-aura-timestamp"})


@dataclass
class HttpRequest:
    """
    Represents an HTTP request to be signed.
    
    Attributes:
        method: HTTP method (GET, POST, etc.)
        base_url: Base URL of the API (e.g., "https://aura.example.com")
        url: Request path (e.g., "/api/auth/exchange")
        headers: Dictionary of HTTP headers
        query: Dictionary of query parameters
        body: Request body (dict, string, or bytes)
    """
    method: str = "GET"
    base_url: Optional[str] = None
    url: str = "/"
    headers: Dict[str, str] = field(default_factory=dict)
    query: Dict[str, Any] = field(default_factory=dict)
    body: Optional[Any] = None


class AuraHmacSigner:
    """
    Signs HTTP requests using the AURA-HMAC-SHA256 algorithm.
    
    This signer implements a signing algorithm similar to AWS Signature Version 4,
    using HMAC-SHA256 for request authentication.
    
    Example:
        >>> request = HttpRequest(
        ...     method="POST",
        ...     base_url="https://aura.example.com",
        ...     url="/api/auth/exchange",
        ...     headers={"Host": "aura.example.com", "Content-Type": "application/json"},
        ...     body={"ttl": 3600}
        ... )
        >>> AuraHmacSigner.sign_request("app-id", "app-secret", request)
        >>> # request.headers now contains Authorization header
    """
    
    @staticmethod
    def sign_request(
        app_id: str,
        app_secret: str,
        request: HttpRequest,
        timestamp: Optional[str] = None,
        nonce: Optional[str] = None
    ) -> None:
        """
        Sign an HTTP request in place.
        
        Args:
            app_id: Application ID for authentication
            app_secret: Application secret for signing
            request: HttpRequest object to sign (modified in place)
            timestamp: Optional fixed timestamp (for testing)
            nonce: Optional fixed nonce (for testing)
        """
        # Generate or use provided timestamp and nonce
        if timestamp is None:
            timestamp = str(int(time.time()))
        if nonce is None:
            nonce = str(uuid.uuid4())
        
        date = datetime.now(timezone.utc).strftime("%Y%m%d")
        
        # Ensure headers dict exists
        if request.headers is None:
            request.headers = {}
        
        # Add required headers
        request.headers["X-Aura-Timestamp"] = timestamp
        request.headers["X-Aura-Nonce"] = nonce
        
        # Normalize method
        method_upper = (request.method or "GET").upper()
        has_body = method_upper in ("POST", "PUT", "PATCH") and request.body is not None
        
        if has_body and not AuraHmacSigner._header_exists(request.headers, "Content-Type"):
            request.headers["Content-Type"] = "application/json"
        
        # Build canonical request
        canonical_path, canonical_query = AuraHmacSigner._canonicalize_url(
            request.base_url, request.url, request.query
        )
        payload_hash = AuraHmacSigner._hash_payload_sha256_hex(request.body)
        signed_headers = AuraHmacSigner._compute_signed_headers(request.headers)
        canonical_headers = AuraHmacSigner._build_canonical_headers(request.headers, signed_headers)
        
        canonical_request = "\n".join([
            method_upper,
            canonical_path,
            canonical_query,
            canonical_headers,
            signed_headers,
            payload_hash
        ])
        
        # Create string to sign
        canonical_request_hash = AuraHmacSigner._compute_sha256_hex(canonical_request.encode("utf-8"))
        credential_scope = f"{app_id}/{date}/{SERVICE}"
        
        string_to_sign = "\n".join([
            ALGORITHM,
            timestamp,
            credential_scope,
            canonical_request_hash
        ])
        
        # Key derivation
        date_key = AuraHmacSigner._compute_hmac_sha256_raw(
            f"AURA{app_secret}".encode("utf-8"),
            date.encode("utf-8")
        )
        signing_key = AuraHmacSigner._compute_hmac_sha256_raw(
            date_key,
            SERVICE.encode("utf-8")
        )
        signature_hex = AuraHmacSigner._compute_hmac_sha256_hex(
            signing_key,
            string_to_sign.encode("utf-8")
        )
        
        # Set Authorization header
        request.headers["Authorization"] = (
            f"{ALGORITHM} "
            f"Credential={app_id},"
            f"SignedHeaders={signed_headers},"
            f"Signature={signature_hex}"
        )
    
    @staticmethod
    def _header_exists(headers: Dict[str, str], name: str) -> bool:
        """Check if a header exists (case-insensitive)."""
        return any(k.lower() == name.lower() for k in headers.keys())
    
    @staticmethod
    def _get_header_value(headers: Dict[str, str], name: str) -> str:
        """Get header value by name (case-insensitive)."""
        for k, v in headers.items():
            if k.lower() == name.lower():
                return v
        return ""
    
    @staticmethod
    def _normalize_header_value(value: str) -> str:
        """Normalize header value by collapsing whitespace."""
        return " ".join(value.strip().split())
    
    @staticmethod
    def _compute_signed_headers(headers: Dict[str, str]) -> str:
        """Compute the list of signed headers."""
        signed = set(REQUIRED_SIGNED_HEADERS)
        
        if AuraHmacSigner._header_exists(headers, "Content-Type"):
            signed.add("content-type")
        
        # Only include headers with non-empty values
        signed_non_empty = []
        for header in signed:
            value = AuraHmacSigner._get_header_value(headers, header)
            if AuraHmacSigner._normalize_header_value(value):
                signed_non_empty.append(header)
        
        signed_non_empty.sort(key=str.lower)
        return ";".join(signed_non_empty)
    
    @staticmethod
    def _build_canonical_headers(headers: Dict[str, str], signed_headers_str: str) -> str:
        """Build the canonical headers string."""
        signed_list = signed_headers_str.split(";")
        lines = []
        
        for header in signed_list:
            value = AuraHmacSigner._get_header_value(headers, header)
            lines.append(f"{header}:{AuraHmacSigner._normalize_header_value(value)}")
        
        return "\n".join(lines) + "\n"
    
    @staticmethod
    def _canonicalize_url(
        base_url: Optional[str],
        url: str,
        query_map: Dict[str, Any]
    ) -> Tuple[str, str]:
        """Canonicalize the URL and query parameters."""
        # Build full URL
        if url.startswith("http://") or url.startswith("https://"):
            full_url = url
        else:
            base = base_url or ""
            full_url = base.rstrip("/") + "/" + url.lstrip("/")
        
        parsed = urlparse(full_url)
        
        # Parse existing query string
        existing_query = parse_qs(parsed.query, keep_blank_values=True)
        
        # Merge with query_map
        all_params = []
        
        for key, values in existing_query.items():
            for value in values:
                all_params.append((key, value))
        
        for key, value in query_map.items():
            all_params.append((key, str(value) if value is not None else ""))
        
        # Sort by key
        all_params.sort(key=lambda x: x[0])
        
        # Build canonical query string
        canonical_query = "&".join(f"{k}={v}" for k, v in all_params)
        
        # Canonical path
        canonical_path = parsed.path or "/"
        
        return canonical_path, canonical_query
    
    @staticmethod
    def _hash_payload_sha256_hex(body: Optional[Any]) -> str:
        """Hash the request payload."""
        if body is None:
            return AuraHmacSigner._compute_sha256_hex(b"")
        
        if isinstance(body, bytes):
            body_bytes = body
        elif isinstance(body, str):
            body_bytes = body.encode("utf-8")
        else:
            body_bytes = json.dumps(body, separators=(",", ":")).encode("utf-8")
        
        return AuraHmacSigner._compute_sha256_hex(body_bytes)
    
    @staticmethod
    def _compute_sha256_hex(data: bytes) -> str:
        """Compute SHA-256 hash and return as lowercase hex."""
        return hashlib.sha256(data).hexdigest().lower()
    
    @staticmethod
    def _compute_hmac_sha256_raw(key: bytes, data: bytes) -> bytes:
        """Compute HMAC-SHA256 and return raw bytes."""
        return hmac.new(key, data, hashlib.sha256).digest()
    
    @staticmethod
    def _compute_hmac_sha256_hex(key: bytes, data: bytes) -> str:
        """Compute HMAC-SHA256 and return as lowercase hex."""
        return hmac.new(key, data, hashlib.sha256).hexdigest().lower()
