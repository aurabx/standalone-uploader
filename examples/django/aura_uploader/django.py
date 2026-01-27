"""
Django integration for the Aura Uploader Client.

Provides Django-specific utilities including:
- Configuration from Django settings
- Thread-safe client management
- Django view decorators
"""

import threading
from functools import wraps
from typing import Callable, Optional

from django.conf import settings
from django.http import JsonResponse

from .client import AuraClientOptions, AuraUploaderClient
from .exceptions import AuraApiException


# Thread-local storage for client instances
_local = threading.local()


def get_aura_options() -> AuraClientOptions:
    """
    Get AuraClientOptions from Django settings.
    
    Expected settings:
        AURA_BASE_URL: Base URL of the Aura API
        AURA_APP_ID: Application ID for HMAC authentication
        AURA_APP_SECRET: Application secret for HMAC authentication
        AURA_API_KEY: API key for the X-Api-Key header
        AURA_TOKEN_TTL: (optional) Token TTL in seconds (default: 3600)
        AURA_DEFAULT_SCOPES: (optional) List of default scopes
        AURA_TIMEOUT: (optional) Request timeout in seconds (default: 30)
    
    Returns:
        AuraClientOptions configured from Django settings
    
    Raises:
        AttributeError: If required settings are missing
    """
    return AuraClientOptions(
        base_url=settings.AURA_BASE_URL,
        app_id=settings.AURA_APP_ID,
        app_secret=settings.AURA_APP_SECRET,
        api_key=settings.AURA_API_KEY,
        token_ttl=getattr(settings, "AURA_TOKEN_TTL", 3600),
        default_scopes=getattr(settings, "AURA_DEFAULT_SCOPES", [
            "upload:init",
            "upload:manage",
            "integration:read"
        ]),
        timeout=getattr(settings, "AURA_TIMEOUT", 30)
    )


def get_aura_client() -> AuraUploaderClient:
    """
    Get a thread-local AuraUploaderClient instance.
    
    Creates a new client on first call per thread, reuses on subsequent calls.
    The client is configured from Django settings.
    
    Returns:
        AuraUploaderClient instance
    
    Example:
        >>> from aura_uploader.django import get_aura_client
        >>> client = get_aura_client()
        >>> response = client.submit(SubmitRequest(upload_id="..."))
    """
    if not hasattr(_local, "client") or _local.client is None:
        _local.client = AuraUploaderClient(get_aura_options())
    return _local.client


def close_aura_client() -> None:
    """
    Close the thread-local AuraUploaderClient.
    
    Should be called when the client is no longer needed, typically at
    the end of a request or when shutting down.
    """
    if hasattr(_local, "client") and _local.client is not None:
        _local.client.close()
        _local.client = None


class AuraClientMiddleware:
    """
    Django middleware for managing AuraUploaderClient lifecycle.
    
    Ensures the client is properly closed after each request.
    
    Add to MIDDLEWARE in settings.py:
        MIDDLEWARE = [
            ...
            'aura_uploader.django.AuraClientMiddleware',
        ]
    """
    
    def __init__(self, get_response: Callable):
        self.get_response = get_response
    
    def __call__(self, request):
        response = self.get_response(request)
        # Close client after request to free resources
        close_aura_client()
        return response


def handle_aura_errors(view_func: Callable) -> Callable:
    """
    Decorator that catches AuraApiException and returns a JSON error response.
    
    Example:
        >>> @handle_aura_errors
        ... def my_view(request):
        ...     client = get_aura_client()
        ...     response = client.submit(SubmitRequest(upload_id="..."))
        ...     return JsonResponse({"success": True})
    """
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        try:
            return view_func(request, *args, **kwargs)
        except AuraApiException as e:
            return JsonResponse(
                {
                    "error": str(e),
                    "status_code": e.status_code,
                },
                status=e.status_code or 500
            )
    return wrapper


def require_aura_token(view_func: Callable) -> Callable:
    """
    Decorator that ensures a valid Aura token before executing the view.
    
    Calls ensure_authenticated() on the client before the view executes.
    Useful for views that need to make multiple API calls.
    
    Example:
        >>> @require_aura_token
        ... def my_view(request):
        ...     client = get_aura_client()
        ...     # Token is already valid
        ...     response1 = client.submit(SubmitRequest(upload_id="1"))
        ...     response2 = client.submit(SubmitRequest(upload_id="2"))
        ...     return JsonResponse({"success": True})
    """
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        client = get_aura_client()
        client.ensure_authenticated()
        return view_func(request, *args, **kwargs)
    return wrapper
