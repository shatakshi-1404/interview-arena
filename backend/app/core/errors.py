class AppError(Exception):
    """Domain error that the API layer maps to an HTTP response."""

    def __init__(self, detail: str, status_code: int = 400, headers: dict[str, str] | None = None):
        self.detail = detail
        self.status_code = status_code
        self.headers = headers
        super().__init__(detail)


class NotFound(AppError):
    def __init__(self, detail: str = "Not found"):
        super().__init__(detail, 404)


class Unauthorized(AppError):
    def __init__(self, detail: str = "Invalid credentials"):
        super().__init__(detail, 401)


class Forbidden(AppError):
    def __init__(self, detail: str = "You do not have permission to do this"):
        super().__init__(detail, 403)


class Conflict(AppError):
    def __init__(self, detail: str = "Conflict"):
        super().__init__(detail, 409)
