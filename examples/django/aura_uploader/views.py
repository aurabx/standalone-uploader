"""
Example Django views for the Aura Uploader Client.

These views demonstrate how to integrate the Aura Uploader Client
with Django views for common operations.
"""

import json
from typing import Any, Dict

from django.http import HttpRequest, JsonResponse
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.utils.decorators import method_decorator

from .client import SubmitRequest, WithdrawRequest
from .django import get_aura_client, handle_aura_errors, require_aura_token
from .exceptions import AuraApiException


# -----------------------------------------------------------------------------
# Function-based views
# -----------------------------------------------------------------------------

@csrf_exempt
@require_http_methods(["POST"])
@handle_aura_errors
def exchange_token_view(request: HttpRequest) -> JsonResponse:
    """
    Exchange HMAC credentials for a bearer token.
    
    POST /api/aura/exchange/
    
    Request body (optional):
        {
            "ttl": 3600,
            "scopes": ["upload:init", "upload:manage"]
        }
    
    Response:
        {
            "access_token": "...",
            "token_type": "Bearer",
            "expires_in": 3600,
            "scopes": ["upload:init", "upload:manage"]
        }
    """
    client = get_aura_client()
    
    # Parse optional request body
    ttl = None
    scopes = None
    if request.body:
        try:
            data = json.loads(request.body)
            ttl = data.get("ttl")
            scopes = data.get("scopes")
        except json.JSONDecodeError:
            pass
    
    from .client import TokenExchangeRequest
    
    req = TokenExchangeRequest(
        ttl=ttl or 3600,
        scopes=scopes
    )
    
    response = client.exchange_token(req)
    
    return JsonResponse({
        "access_token": response.access_token,
        "token_type": response.token_type,
        "expires_in": response.expires_in,
        "scopes": response.scopes
    })


@csrf_exempt
@require_http_methods(["POST"])
@handle_aura_errors
@require_aura_token
def submit_upload_view(request: HttpRequest) -> JsonResponse:
    """
    Submit an upload for processing.
    
    POST /api/aura/submit/
    
    Request body:
        {
            "upload_id": "your-upload-id",
            "metadata": {
                "patient_id": "12345",
                "study_type": "CT"
            }
        }
    
    Response:
        {
            "success": true,
            "upload_id": "your-upload-id",
            "status": "submitted",
            "message": "Upload submitted successfully"
        }
    """
    client = get_aura_client()
    
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse(
            {"error": "Invalid JSON body"},
            status=400
        )
    
    upload_id = data.get("upload_id")
    if not upload_id:
        return JsonResponse(
            {"error": "upload_id is required"},
            status=400
        )
    
    response = client.submit(SubmitRequest(
        upload_id=upload_id,
        metadata=data.get("metadata")
    ))
    
    return JsonResponse({
        "success": response.success,
        "upload_id": response.upload_id,
        "status": response.status,
        "message": response.message
    })


@csrf_exempt
@require_http_methods(["POST"])
@handle_aura_errors
@require_aura_token
def withdraw_upload_view(request: HttpRequest) -> JsonResponse:
    """
    Withdraw a previously submitted upload.
    
    POST /api/aura/withdraw/
    
    Request body:
        {
            "upload_id": "your-upload-id",
            "reason": "Duplicate upload"
        }
    
    Response:
        {
            "success": true,
            "upload_id": "your-upload-id",
            "status": "withdrawn",
            "message": "Upload withdrawn successfully"
        }
    """
    client = get_aura_client()
    
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse(
            {"error": "Invalid JSON body"},
            status=400
        )
    
    upload_id = data.get("upload_id")
    if not upload_id:
        return JsonResponse(
            {"error": "upload_id is required"},
            status=400
        )
    
    response = client.withdraw(WithdrawRequest(
        upload_id=upload_id,
        reason=data.get("reason")
    ))
    
    return JsonResponse({
        "success": response.success,
        "upload_id": response.upload_id,
        "status": response.status,
        "message": response.message
    })


# -----------------------------------------------------------------------------
# Class-based views
# -----------------------------------------------------------------------------

@method_decorator(csrf_exempt, name="dispatch")
class AuraTokenView(View):
    """
    Class-based view for token exchange.
    
    POST /api/aura/token/
    """
    
    def post(self, request: HttpRequest) -> JsonResponse:
        try:
            client = get_aura_client()
            response = client.exchange_token()
            
            return JsonResponse({
                "access_token": response.access_token,
                "token_type": response.token_type,
                "expires_in": response.expires_in,
                "scopes": response.scopes
            })
        except AuraApiException as e:
            return JsonResponse(
                {"error": str(e)},
                status=e.status_code or 500
            )


@method_decorator(csrf_exempt, name="dispatch")
class AuraUploadManageView(View):
    """
    Class-based view for upload management operations.
    
    POST /api/aura/uploads/<upload_id>/submit/
    POST /api/aura/uploads/<upload_id>/withdraw/
    """
    
    def dispatch(self, request: HttpRequest, *args, **kwargs):
        try:
            client = get_aura_client()
            client.ensure_authenticated()
            return super().dispatch(request, *args, **kwargs)
        except AuraApiException as e:
            return JsonResponse(
                {"error": str(e)},
                status=e.status_code or 500
            )
    
    def post_submit(self, request: HttpRequest, upload_id: str) -> JsonResponse:
        """Submit an upload."""
        client = get_aura_client()
        
        metadata = None
        if request.body:
            try:
                data = json.loads(request.body)
                metadata = data.get("metadata")
            except json.JSONDecodeError:
                pass
        
        response = client.submit(SubmitRequest(
            upload_id=upload_id,
            metadata=metadata
        ))
        
        return JsonResponse({
            "success": response.success,
            "upload_id": response.upload_id,
            "status": response.status,
            "message": response.message
        })
    
    def post_withdraw(self, request: HttpRequest, upload_id: str) -> JsonResponse:
        """Withdraw an upload."""
        client = get_aura_client()
        
        reason = None
        if request.body:
            try:
                data = json.loads(request.body)
                reason = data.get("reason")
            except json.JSONDecodeError:
                pass
        
        response = client.withdraw(WithdrawRequest(
            upload_id=upload_id,
            reason=reason
        ))
        
        return JsonResponse({
            "success": response.success,
            "upload_id": response.upload_id,
            "status": response.status,
            "message": response.message
        })
