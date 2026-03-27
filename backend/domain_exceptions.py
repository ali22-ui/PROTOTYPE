class DomainError(Exception):
    """Base exception for domain-level errors."""


class DomainNotFoundError(DomainError):
    """Raised when a requested domain resource does not exist."""


class DomainForbiddenError(DomainError):
    """Raised when an operation is not allowed by domain rules."""


class DomainConflictError(DomainError):
    """Raised when an operation conflicts with current domain state."""
