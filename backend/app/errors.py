"""One error envelope for the whole API, identical to the mobile Backend's:
`{"detail": {"code": "...", "message": "..."}}` (+ optional `fields` / `details`)."""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, **extra):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra

    def body(self) -> dict:
        return {"detail": {"code": self.code, "message": self.message, **self.extra}}


def not_found(what: str, ident: str | None = None) -> ApiError:
    suffix = f" '{ident}'" if ident else ""
    return ApiError(404, "NOT_FOUND", f"{what}{suffix} was not found.")


def conflict(code: str, message: str, **extra) -> ApiError:
    return ApiError(409, code, message, **extra)


def invalid(message: str, code: str = "INVALID_REQUEST", **extra) -> ApiError:
    return ApiError(422, code, message, **extra)


def forbidden(message: str, code: str = "FORBIDDEN", **extra) -> ApiError:
    return ApiError(403, code, message, **extra)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        return JSONResponse(status_code=exc.status, content=exc.body(), headers=_auth_header(exc.status))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        fields: dict[str, str] = {}
        for err in exc.errors():
            loc = [str(p) for p in err["loc"] if p not in ("body", "query", "path")]
            fields[".".join(loc) or "_"] = err["msg"].removeprefix("Value error, ")
        first = next(iter(fields.values()), "The request is not valid.")
        return JSONResponse(
            status_code=422,
            content={"detail": {"code": "VALIDATION_ERROR", "message": first, "fields": fields}},
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        if isinstance(exc.detail, dict) and "code" in exc.detail:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail},
                                headers=_auth_header(exc.status_code))
        code = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}.get(exc.status_code, "HTTP_ERROR")
        return JSONResponse(status_code=exc.status_code,
                            content={"detail": {"code": code, "message": str(exc.detail)}})


def _auth_header(status: int) -> dict:
    return {"WWW-Authenticate": "Bearer"} if status == 401 else {}
