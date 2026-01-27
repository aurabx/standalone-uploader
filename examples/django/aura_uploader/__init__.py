"""
Aura Uploader Client for Django/Python.

A Python client for the Aura Uploader API, providing HMAC authentication
and API methods for token exchange, upload submission, and withdrawal.
"""

from .signer import AuraHmacSigner
from .client import AuraUploaderClient, AuraClientOptions
from .exceptions import AuraApiException

__all__ = [
    "AuraHmacSigner",
    "AuraUploaderClient",
    "AuraClientOptions",
    "AuraApiException",
]

__version__ = "1.0.0"
