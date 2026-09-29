/**
 * auth-service-specific domain errors. The base AppError class, the
 * generic errors (ValidationError, UnauthorizedError, ForbiddenError,
 * NotFoundError, ConflictError), and the centralized error handler now
 * live in @nexora/http - only the errors unique to auth-service's domain
 * stay here.
 */
import { AppError } from "@nexora/http";

export class EmailAlreadyRegisteredError extends AppError {
  constructor() {
    super(409, "EMAIL_ALREADY_REGISTERED", "An account with this email already exists.");
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }
}

export class AccountLockedError extends AppError {
  constructor(lockedUntil: Date) {
    super(423, "ACCOUNT_LOCKED", "Too many failed login attempts. Try again later.", {
      lockedUntil: lockedUntil.toISOString(),
    });
  }
}

export class AccountInactiveError extends AppError {
  constructor() {
    super(403, "ACCOUNT_INACTIVE", "This account has been deactivated.");
  }
}

export class InvalidOrExpiredTokenError extends AppError {
  constructor(
    tokenKind: "refresh" | "access" | "email-verification" | "password-reset" | "invitation",
  ) {
    super(401, "INVALID_OR_EXPIRED_TOKEN", `The ${tokenKind} token is invalid or has expired.`);
  }
}

export class SessionRevokedError extends AppError {
  constructor() {
    super(401, "SESSION_REVOKED", "This session has been revoked. Please log in again.");
  }
}

export class OrganizationServiceUnavailableError extends AppError {
  constructor(cause?: string) {
    super(
      503,
      "ORGANIZATION_SERVICE_UNAVAILABLE",
      "Could not reach the organization service to complete this request.",
      cause ? { cause } : undefined,
    );
  }
}
