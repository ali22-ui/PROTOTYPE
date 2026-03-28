from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from domain_exceptions import (
    DomainConflictError,
    DomainForbiddenError,
    DomainNotFoundError,
)


def _add_cors_headers(response: JSONResponse, request: Request) -> JSONResponse:
    """Add CORS headers to error responses."""
    settings = get_settings()
    origin = request.headers.get("origin", "")
    
    # Check if origin is allowed
    allowed_origins = settings.cors_origins_list
    if "*" in allowed_origins or origin in allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin or "*"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
    
    return response


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainNotFoundError)
    async def domain_not_found_handler(request: Request, exc: DomainNotFoundError) -> JSONResponse:
        response = JSONResponse(status_code=404, content={"detail": str(exc)})
        return _add_cors_headers(response, request)

    @app.exception_handler(DomainForbiddenError)
    async def domain_forbidden_handler(request: Request, exc: DomainForbiddenError) -> JSONResponse:
        response = JSONResponse(status_code=403, content={"detail": str(exc)})
        return _add_cors_headers(response, request)

    @app.exception_handler(DomainConflictError)
    async def domain_conflict_handler(request: Request, exc: DomainConflictError) -> JSONResponse:
        response = JSONResponse(status_code=409, content={"detail": str(exc)})
        return _add_cors_headers(response, request)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        import logging
        logging.error(f"Unhandled exception: {exc}", exc_info=True)
        response = JSONResponse(status_code=500, content={"detail": "Internal Server Error"})
        return _add_cors_headers(response, request)
