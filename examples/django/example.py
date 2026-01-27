#!/usr/bin/env python3
"""
Aura Uploader API Python Client Example

This script demonstrates how to use the Aura Uploader client
for authentication and upload management.
"""

import os
import sys

# Add aura_uploader to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from aura_uploader import AuraUploaderClient, AuraClientOptions
from aura_uploader.client import TokenExchangeRequest, SubmitRequest, WithdrawRequest
from aura_uploader.signer import AuraHmacSigner, HttpRequest


def run_low_level_example():
    """Demonstrate low-level token exchange using the signer directly."""
    print("\n1. Low-level token exchange example...")
    
    # Load from environment variables
    app_id = os.environ.get("AURA_APP_ID", "test-app-id")
    app_secret = os.environ.get("AURA_APP_SECRET", "test-secret-key")
    api_key = os.environ.get("AURA_API_KEY", "test-api-key")
    aura_api_url = os.environ.get("AURA_API_URL", "https://aura.example.com")
    
    # Create request
    request = HttpRequest(
        method="POST",
        base_url=aura_api_url,
        url="/api/auth/exchange",
        headers={
            "X-Api-Key": api_key,
            "Host": aura_api_url.replace("https://", "").replace("http://", "").split("/")[0],
            "Content-Type": "application/json"
        },
        body={
            "ttl": 3600,
            "scopes": ["upload:init", "upload:manage", "integration:read"]
        }
    )
    
    # Sign the request
    AuraHmacSigner.sign_request(app_id, app_secret, request)
    
    print(f"  Request signed successfully")
    print(f"  Authorization: {request.headers['Authorization'][:60]}...")
    print(f"  Timestamp: {request.headers['X-Aura-Timestamp']}")
    print(f"  Nonce: {request.headers['X-Aura-Nonce']}")


def run_client_example():
    """Demonstrate high-level client usage."""
    print("\n2. High-level client example...")
    
    # Load configuration from environment variables
    options = AuraClientOptions(
        base_url=os.environ.get("AURA_API_URL", "https://aura.example.com"),
        app_id=os.environ.get("AURA_APP_ID", "test-app-id"),
        app_secret=os.environ.get("AURA_APP_SECRET", "test-secret-key"),
        api_key=os.environ.get("AURA_API_KEY", "test-api-key")
    )
    
    print(f"  Base URL: {options.base_url}")
    print(f"  App ID: {options.app_id}")
    print(f"  API Key: {options.api_key[:10]}...")
    
    # Note: The following would make actual API calls
    # Uncomment when you have valid credentials and a running API
    
    # with AuraUploaderClient(options) as client:
    #     # Exchange token
    #     print("  Exchanging token...")
    #     token_response = client.exchange_token(TokenExchangeRequest(
    #         ttl=3600,
    #         scopes=["upload:init", "upload:manage"]
    #     ))
    #     print(f"  Token received: {token_response.access_token[:20]}...")
    #     print(f"  Expires in: {token_response.expires_in} seconds")
    #     
    #     # Submit an upload (would need a real upload_id)
    #     # response = client.submit(SubmitRequest(
    #     #     upload_id="your-upload-id",
    #     #     metadata={
    #     #         "patient_id": "12345",
    #     #         "study_type": "CT"
    #     #     }
    #     # ))
    #     
    #     # Withdraw an upload
    #     # response = client.withdraw(WithdrawRequest(
    #     #     upload_id="your-upload-id",
    #     #     reason="Duplicate upload"
    #     # ))
    
    print("  Client example completed (API calls commented out).")


def main():
    print("Aura Uploader API Python Client")
    print("=" * 35)
    
    try:
        run_low_level_example()
        run_client_example()
        print("\nAll examples completed successfully!")
    except Exception as e:
        print(f"\nError: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
