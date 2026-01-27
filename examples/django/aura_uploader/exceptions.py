"""
Exceptions for the Aura Uploader Client.
"""

from typing import Optional


class AuraApiException(Exception):
    """
    Exception raised when an API request fails.
    
    Attributes:
        message: A description of the error.
        status_code: The HTTP status code from the response.
        response_content: The raw response content from the API.
    """
    
    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        response_content: Optional[str] = None
    ):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.response_content = response_content
    
    def __str__(self) -> str:
        parts = [self.message]
        if self.status_code is not None:
            parts.append(f"Status: {self.status_code}")
        return " | ".join(parts)
