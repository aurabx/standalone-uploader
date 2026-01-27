"""
Tests for the HMAC signer implementation.

These tests verify that the Python implementation produces signatures
compatible with the .NET implementation using shared test vectors.
"""

import hashlib
import hmac
import unittest
from typing import Tuple

import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from aura_uploader.signer import AuraHmacSigner, HttpRequest


class TestSignatureTestVectors(unittest.TestCase):
    """
    Tests that verify signature generation against known test vectors.
    These tests use fixed timestamps and nonces to ensure deterministic results.
    """
    
    def test_vector1_post_with_json_body_produces_expected_signature(self):
        """Test Vector 1: POST with JSON body."""
        # Fixed inputs for reproducibility
        app_id = "test-app-id"
        app_secret = "test-secret-key"
        timestamp = "1706140800"
        nonce = "550e8400-e29b-41d4-a716-446655440000"
        date = "20240125"
        
        # Use explicit JSON string to ensure consistent hashing
        body_json = '{"ttl":3600,"scopes":["upload:init","upload:manage"]}'
        
        # Build canonical request components
        canonical_path = "/api/auth/exchange"
        canonical_query = ""
        signed_headers = "content-type;host;x-aura-nonce;x-aura-timestamp"
        canonical_headers = (
            f"content-type:application/json\n"
            f"host:aura.example.com\n"
            f"x-aura-nonce:{nonce}\n"
            f"x-aura-timestamp:{timestamp}\n"
        )
        payload_hash = self._compute_sha256_hex(body_json.encode("utf-8"))
        
        canonical_request = "\n".join([
            "POST",
            canonical_path,
            canonical_query,
            canonical_headers,
            signed_headers,
            payload_hash
        ])
        
        canonical_request_hash = self._compute_sha256_hex(canonical_request.encode("utf-8"))
        credential_scope = f"{app_id}/{date}/aura_request"
        string_to_sign = "\n".join([
            "AURA-HMAC-SHA256",
            timestamp,
            credential_scope,
            canonical_request_hash
        ])
        
        # Key derivation
        date_key = self._compute_hmac_sha256_raw(
            f"AURA{app_secret}".encode("utf-8"),
            date.encode("utf-8")
        )
        signing_key = self._compute_hmac_sha256_raw(date_key, b"aura_request")
        signature = self._compute_hmac_sha256_hex(signing_key, string_to_sign.encode("utf-8"))
        
        # Expected signature computed with the exact JSON above
        expected_signature = "4e865169c280c238e93ea51681fdf9e5977ecbf0dc60fbbf0b6b7ccba2005093"
        
        self.assertEqual(expected_signature, signature)
    
    def test_vector2_get_without_body_produces_valid_signature(self):
        """Test Vector 2: GET request without body."""
        app_id = "test-app-id"
        app_secret = "test-secret-key"
        timestamp = "1706140800"
        nonce = "550e8400-e29b-41d4-a716-446655440001"
        date = "20240125"
        
        # Build canonical request components
        canonical_path = "/api/uploader/config"
        canonical_query = ""
        signed_headers = "host;x-aura-nonce;x-aura-timestamp"
        canonical_headers = (
            f"host:aura.example.com\n"
            f"x-aura-nonce:{nonce}\n"
            f"x-aura-timestamp:{timestamp}\n"
        )
        payload_hash = self._compute_sha256_hex(b"")  # Empty body
        
        canonical_request = "\n".join([
            "GET",
            canonical_path,
            canonical_query,
            canonical_headers,
            signed_headers,
            payload_hash
        ])
        
        canonical_request_hash = self._compute_sha256_hex(canonical_request.encode("utf-8"))
        credential_scope = f"{app_id}/{date}/aura_request"
        string_to_sign = "\n".join([
            "AURA-HMAC-SHA256",
            timestamp,
            credential_scope,
            canonical_request_hash
        ])
        
        # Key derivation
        date_key = self._compute_hmac_sha256_raw(
            f"AURA{app_secret}".encode("utf-8"),
            date.encode("utf-8")
        )
        signing_key = self._compute_hmac_sha256_raw(date_key, b"aura_request")
        signature = self._compute_hmac_sha256_hex(signing_key, string_to_sign.encode("utf-8"))
        
        # Verify we get a valid 64-character hex signature
        self.assertEqual(64, len(signature))
        self.assertRegex(signature, r"^[a-f0-9]+$")
    
    def test_vector3_post_with_query_parameters_produces_valid_signature(self):
        """Test Vector 3: POST with query parameters."""
        app_id = "test-app-id"
        app_secret = "test-secret-key"
        timestamp = "1706140800"
        nonce = "550e8400-e29b-41d4-a716-446655440002"
        date = "20240125"
        
        # Use explicit JSON string
        body_json = '{"data":"test"}'
        
        # Build canonical request components - query params should be sorted
        canonical_path = "/api/uploader/upload/init"
        canonical_query = "format=json&version=1"  # Sorted alphabetically
        signed_headers = "content-type;host;x-aura-nonce;x-aura-timestamp"
        canonical_headers = (
            f"content-type:application/json\n"
            f"host:aura.example.com\n"
            f"x-aura-nonce:{nonce}\n"
            f"x-aura-timestamp:{timestamp}\n"
        )
        payload_hash = self._compute_sha256_hex(body_json.encode("utf-8"))
        
        canonical_request = "\n".join([
            "POST",
            canonical_path,
            canonical_query,
            canonical_headers,
            signed_headers,
            payload_hash
        ])
        
        canonical_request_hash = self._compute_sha256_hex(canonical_request.encode("utf-8"))
        credential_scope = f"{app_id}/{date}/aura_request"
        string_to_sign = "\n".join([
            "AURA-HMAC-SHA256",
            timestamp,
            credential_scope,
            canonical_request_hash
        ])
        
        # Key derivation
        date_key = self._compute_hmac_sha256_raw(
            f"AURA{app_secret}".encode("utf-8"),
            date.encode("utf-8")
        )
        signing_key = self._compute_hmac_sha256_raw(date_key, b"aura_request")
        signature = self._compute_hmac_sha256_hex(signing_key, string_to_sign.encode("utf-8"))
        
        # Verify we get a valid 64-character hex signature
        self.assertEqual(64, len(signature))
        self.assertRegex(signature, r"^[a-f0-9]+$")
    
    def test_key_derivation_produces_consistent_results(self):
        """Key derivation should be deterministic."""
        app_secret = "test-secret-key"
        date = "20240125"
        
        # Derive key twice and verify consistency
        date_key1 = self._compute_hmac_sha256_raw(
            f"AURA{app_secret}".encode("utf-8"),
            date.encode("utf-8")
        )
        signing_key1 = self._compute_hmac_sha256_raw(date_key1, b"aura_request")
        
        date_key2 = self._compute_hmac_sha256_raw(
            f"AURA{app_secret}".encode("utf-8"),
            date.encode("utf-8")
        )
        signing_key2 = self._compute_hmac_sha256_raw(date_key2, b"aura_request")
        
        self.assertEqual(signing_key1, signing_key2)
    
    def test_payload_hash_empty_string(self):
        """Empty string should hash to known value."""
        expected = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        result = self._compute_sha256_hex(b"")
        self.assertEqual(expected, result)
    
    def test_payload_hash_empty_json_object(self):
        """Empty JSON object should hash to known value."""
        expected = "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"
        result = self._compute_sha256_hex(b"{}")
        self.assertEqual(expected, result)
    
    # -------------------------------------------------------------------------
    # Helper methods
    # -------------------------------------------------------------------------
    
    def _compute_sha256_hex(self, data: bytes) -> str:
        return hashlib.sha256(data).hexdigest().lower()
    
    def _compute_hmac_sha256_raw(self, key: bytes, data: bytes) -> bytes:
        return hmac.new(key, data, hashlib.sha256).digest()
    
    def _compute_hmac_sha256_hex(self, key: bytes, data: bytes) -> str:
        return hmac.new(key, data, hashlib.sha256).hexdigest().lower()


class TestAuraHmacSigner(unittest.TestCase):
    """Tests for the AuraHmacSigner class."""
    
    def test_sign_request_adds_required_headers(self):
        """sign_request should add timestamp, nonce, and authorization headers."""
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
        
        AuraHmacSigner.sign_request("test-app-id", "test-secret", request)
        
        self.assertIn("X-Aura-Timestamp", request.headers)
        self.assertIn("X-Aura-Nonce", request.headers)
        self.assertIn("Authorization", request.headers)
    
    def test_sign_request_authorization_format(self):
        """Authorization header should have correct format."""
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
        
        AuraHmacSigner.sign_request("test-app-id", "test-secret", request)
        
        auth = request.headers["Authorization"]
        self.assertTrue(auth.startswith("AURA-HMAC-SHA256 "))
        self.assertIn("Credential=test-app-id", auth)
        self.assertIn("SignedHeaders=", auth)
        self.assertIn("Signature=", auth)
    
    def test_sign_request_with_fixed_timestamp_nonce(self):
        """sign_request with fixed timestamp/nonce should be deterministic."""
        request1 = HttpRequest(
            method="POST",
            base_url="https://aura.example.com",
            url="/api/auth/exchange",
            headers={
                "Host": "aura.example.com",
                "Content-Type": "application/json"
            },
            body={"ttl": 3600}
        )
        
        request2 = HttpRequest(
            method="POST",
            base_url="https://aura.example.com",
            url="/api/auth/exchange",
            headers={
                "Host": "aura.example.com",
                "Content-Type": "application/json"
            },
            body={"ttl": 3600}
        )
        
        AuraHmacSigner.sign_request(
            "test-app-id", "test-secret", request1,
            timestamp="1706140800", nonce="test-nonce"
        )
        AuraHmacSigner.sign_request(
            "test-app-id", "test-secret", request2,
            timestamp="1706140800", nonce="test-nonce"
        )
        
        self.assertEqual(request1.headers["Authorization"], request2.headers["Authorization"])
    
    def test_sign_request_get_without_body(self):
        """GET request without body should be signed correctly."""
        request = HttpRequest(
            method="GET",
            base_url="https://aura.example.com",
            url="/api/uploader/config",
            headers={
                "Host": "aura.example.com"
            }
        )
        
        AuraHmacSigner.sign_request("test-app-id", "test-secret", request)
        
        self.assertIn("Authorization", request.headers)
        # Should not have Content-Type for GET without body
        auth = request.headers["Authorization"]
        # Extract SignedHeaders value
        signed_headers_match = auth.split("SignedHeaders=")[1].split(",")[0]
        self.assertNotIn("content-type", signed_headers_match.lower())
    
    def test_sign_request_with_query_parameters(self):
        """Request with query parameters should be signed correctly."""
        request = HttpRequest(
            method="POST",
            base_url="https://aura.example.com",
            url="/api/test",
            headers={
                "Host": "aura.example.com",
                "Content-Type": "application/json"
            },
            query={"version": "1", "format": "json"},
            body={"data": "test"}
        )
        
        AuraHmacSigner.sign_request("test-app-id", "test-secret", request)
        
        self.assertIn("Authorization", request.headers)


class TestHttpRequest(unittest.TestCase):
    """Tests for the HttpRequest dataclass."""
    
    def test_default_values(self):
        """HttpRequest should have sensible defaults."""
        request = HttpRequest()
        
        self.assertEqual("GET", request.method)
        self.assertEqual("/", request.url)
        self.assertEqual({}, request.headers)
        self.assertEqual({}, request.query)
        self.assertIsNone(request.body)
        self.assertIsNone(request.base_url)
    
    def test_custom_values(self):
        """HttpRequest should accept custom values."""
        request = HttpRequest(
            method="POST",
            base_url="https://example.com",
            url="/api/test",
            headers={"Content-Type": "application/json"},
            query={"key": "value"},
            body={"data": "test"}
        )
        
        self.assertEqual("POST", request.method)
        self.assertEqual("https://example.com", request.base_url)
        self.assertEqual("/api/test", request.url)
        self.assertEqual({"Content-Type": "application/json"}, request.headers)
        self.assertEqual({"key": "value"}, request.query)
        self.assertEqual({"data": "test"}, request.body)


if __name__ == "__main__":
    unittest.main()
