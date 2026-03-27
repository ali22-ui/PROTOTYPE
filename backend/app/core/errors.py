from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from domain_exceptions import (
    DomainConflictError,
    DomainForbiddenError,
    DomainNotFoundError,
)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainNotFoundError)
    async def domain_not_found_handler(request: Request, exc: DomainNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(DomainForbiddenError)
    async def domain_forbidden_handler(request: Request, exc: DomainForbiddenError) -> JSONResponse:
        return JSONResponse(status_code=403, content={"detail": str(exc)})

    @app.exception_handler(DomainConflictError)
    async def domain_conflict_handler(request: Request, exc: DomainConflictError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})
