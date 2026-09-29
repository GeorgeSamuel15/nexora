import { omitUndefined } from "@nexora/utils";
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "../../generated/client/index.js";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type TokenConfig,
} from "@nexora/auth";
import { parseDurationToMs, hashToken } from "@nexora/utils";
import { isRole } from "@nexora/types";
import { AppError } from "@nexora/http";
import type { AuditClient } from "@nexora/audit-client";
import {
  AccountInactiveError,
  AccountLockedError,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidOrExpiredTokenError,
  SessionRevokedError,
} from "../errors.js";
import type {
  AcceptInvitationInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from "../validation/auth.schemas.js";
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const ACCOUNT_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export interface OrganizationClient {
  bootstrapOrganization(request: {
    organizationName: string;
    ownerUserId: string;
    ownerEmail: string;
    ownerFirstName: string;
    ownerLastName: string;
  }): Promise<{
    organizationId: string;
    membershipId: string;
    role: "OWNER";
  }>;
  lookupActiveMembership(userId: string): Promise<{
    organizationId: string;
    role: string;
  }>;
  validateInvitation(token: string): Promise<{
    invitationId: string;
    email: string;
    organizationId: string;
    role: string;
  }>;
  consumeInvitation(
    invitationId: string,
    userId: string,
  ): Promise<{
    organizationId: string;
    role: string;
    membershipId: string;
  }>;
}
export interface RequestMeta {
  userAgent?: string;
  ipAddress?: string;
}
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
export interface AuthServiceDeps {
  prisma: PrismaClient;
  organizationClient: OrganizationClient;
  tokenConfig: TokenConfig;
  auditClient: AuditClient;
  /** Injectable clock for deterministic tests; defaults to real time. */
  now?: () => Date;
  /** Injectable for tests that want to assert on the raw generated token
   * instead of guessing it (password reset / email verification flows). */
  onPasswordResetTokenIssued?: (rawToken: string, userId: string) => void | Promise<void>;
  onEmailVerificationTokenIssued?: (rawToken: string, userId: string) => void | Promise<void>;
}
export function createAuthService(deps: AuthServiceDeps) {
  const { prisma, organizationClient, tokenConfig, auditClient } = deps;
  const now = deps.now ?? (() => new Date());
  async function register(
    input: RegisterInput,
    meta: RequestMeta,
  ): Promise<{
    user: {
      id: string;
      email: string;
    };
    tokens: AuthTokens;
  }> {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new EmailAlreadyRegisteredError();
    }
    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: omitUndefined({ email: input.email, passwordHash }),
    });
    // Saga: user credentials are committed first, then we ask
    // organization-service to create the org + OWNER membership. If that
    // fails, we compensate by deleting the just-created user so we don't
    // leave an orphaned account with no organization.
    let bootstrap;
    try {
      bootstrap = await organizationClient.bootstrapOrganization({
        organizationName: input.organizationName,
        ownerUserId: user.id,
        ownerEmail: user.email,
        ownerFirstName: input.firstName,
        ownerLastName: input.lastName,
      });
    } catch (err) {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {
        // Best-effort compensation; if this also fails the orphaned user
        // has no organization and register() will simply fail again on
        // next attempt with EMAIL_ALREADY_REGISTERED, which is at least
        // a safe, visible failure mode rather than a silent partial state.
      });
      throw err;
    }
    const tokens = await issueSession(user.id, bootstrap.organizationId, bootstrap.role, meta);
    await issueEmailVerificationToken(user.id);
    return { user: { id: user.id, email: user.email }, tokens };
  }
  async function acceptInvitation(
    input: AcceptInvitationInput,
    meta: RequestMeta,
  ): Promise<{
    user: {
      id: string;
      email: string;
    };
    tokens: AuthTokens;
  }> {
    // Read-only first: resolves the invited email WITHOUT consuming the
    // invitation, so the auth User is created with exactly that email -
    // never one the caller could substitute.
    const invitation = await organizationClient.validateInvitation(input.token);
    const existing = await prisma.user.findUnique({ where: { email: invitation.email } });
    if (existing) {
      throw new EmailAlreadyRegisteredError();
    }
    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: omitUndefined({ email: invitation.email, passwordHash }),
    });
    let consumed;
    try {
      consumed = await organizationClient.consumeInvitation(invitation.invitationId, user.id);
    } catch (err) {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {
        // Same best-effort compensation as register() - see comment there.
      });
      throw err;
    }
    const tokens = await issueSession(user.id, consumed.organizationId, consumed.role, meta);
    await issueEmailVerificationToken(user.id);
    return { user: { id: user.id, email: user.email }, tokens };
  }
  async function login(input: LoginInput, meta: RequestMeta): Promise<AuthTokens> {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      throw new InvalidCredentialsError();
    }
    if (!user.isActive) {
      throw new AccountInactiveError();
    }
    if (user.lockedUntil && user.lockedUntil > now()) {
      throw new AccountLockedError(user.lockedUntil);
    }
    const passwordValid = await verifyPassword(input.password, user.passwordHash);
    if (!passwordValid) {
      const failedLoginCount = user.failedLoginCount + 1;
      const shouldLock = failedLoginCount >= MAX_FAILED_LOGIN_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: omitUndefined({
          failedLoginCount,
          lockedUntil: shouldLock ? new Date(now().getTime() + ACCOUNT_LOCK_DURATION_MS) : null,
        }),
      });
      throw new InvalidCredentialsError();
    }
    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: omitUndefined({ failedLoginCount: 0, lockedUntil: null }),
      });
    }
    const membership = await organizationClient.lookupActiveMembership(user.id);
    const tokens = await issueSession(user.id, membership.organizationId, membership.role, meta);
    await auditClient.record({
      organizationId: membership.organizationId,
      actorId: user.id,
      action: "LOGIN",
      entityType: "user",
      entityId: user.id,
      ...(meta.ipAddress === undefined ? {} : { ipAddress: meta.ipAddress }),
    });
    return tokens;
  }
  async function refresh(refreshToken: string): Promise<AuthTokens> {
    let claims;
    try {
      claims = verifyRefreshToken(refreshToken, tokenConfig);
    } catch {
      throw new InvalidOrExpiredTokenError("refresh");
    }
    const session = await prisma.session.findUnique({ where: { id: claims.sessionId } });
    if (!session || session.revokedAt) {
      throw new SessionRevokedError();
    }
    if (session.expiresAt < now()) {
      throw new InvalidOrExpiredTokenError("refresh");
    }
    // Token-version + hash mismatch both indicate a stolen/replayed token
    // (someone presenting an old, already-rotated refresh token). Revoke
    // the whole session rather than silently rejecting - the legitimate
    // owner will need to log in again, which is the safe outcome.
    if (
      session.tokenVersion !== claims.tokenVersion ||
      session.refreshTokenHash !== hashToken(refreshToken)
    ) {
      await prisma.session.update({
        where: { id: session.id },
        data: omitUndefined({ revokedAt: now(), revokedReason: "token_reuse_detected" }),
      });
      throw new SessionRevokedError();
    }
    const currentUser = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!currentUser?.isActive || claims.sub !== session.userId) throw new SessionRevokedError();
    // Re-resolve membership rather than trusting the cached session role,
    // so a role change or removal made in organization-service takes
    // effect on the very next refresh instead of waiting for re-login.
    const membership = await organizationClient.lookupActiveMembership(session.userId);
    const nextTokenVersion = session.tokenVersion + 1;
    const newRefreshToken = signRefreshToken(
      { sub: session.userId, sessionId: session.id, tokenVersion: nextTokenVersion },
      tokenConfig,
    );
    assertKnownRole(membership.role);
    const newAccessToken = signAccessToken(
      {
        sub: session.userId,
        organizationId: membership.organizationId,
        role: membership.role,
        sessionId: session.id,
      },
      tokenConfig,
    );
    const rotation = await prisma.session.updateMany({
      where: { id: session.id, tokenVersion: claims.tokenVersion, revokedAt: null },
      data: omitUndefined({
        tokenVersion: nextTokenVersion,
        refreshTokenHash: hashToken(newRefreshToken),
        organizationId: membership.organizationId,
        role: membership.role,
        expiresAt: new Date(now().getTime() + parseDurationToMs(tokenConfig.refreshTokenTtl)),
      }),
    });
    if (rotation.count !== 1) throw new SessionRevokedError();
    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }
  async function logout(refreshToken: string): Promise<void> {
    let claims;
    try {
      claims = verifyRefreshToken(refreshToken, tokenConfig);
    } catch {
      // Already invalid/expired - nothing to revoke. Logout is idempotent.
      return;
    }
    const session = await prisma.session.findUnique({ where: { id: claims.sessionId } });
    if (!session || session.revokedAt) {
      return; // already logged out - idempotent, nothing new to audit
    }
    await prisma.session
      .updateMany({
        where: { id: claims.sessionId, revokedAt: null },
        data: omitUndefined({ revokedAt: now(), revokedReason: "logout" }),
      })
      .catch(() => undefined);
    await auditClient.record({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: "LOGOUT",
      entityType: "user",
      entityId: session.userId,
    });
  }
  async function forgotPassword(input: ForgotPasswordInput): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    // Deliberately do not reveal whether the email exists - same response
    // either way to avoid user enumeration.
    if (!user) {
      return;
    }
    const rawToken = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: omitUndefined({
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(now().getTime() + PASSWORD_RESET_TOKEN_TTL_MS),
      }),
    });
    // Real email delivery is notification-service's job (Phase 10) once an
    // email provider is wired up - not faked here. For now the raw token
    // is handed to the injected callback (used by dev tooling/tests) and
    // logged at debug level so local development is still usable.
    await deps.onPasswordResetTokenIssued?.(rawToken, user.id);
  }
  async function resetPassword(input: ResetPasswordInput): Promise<void> {
    const tokenHash = hashToken(input.token);
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < now()) {
      throw new InvalidOrExpiredTokenError("password-reset");
    }
    const passwordHash = await hashPassword(input.newPassword);
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: omitUndefined({ passwordHash }) }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: omitUndefined({ usedAt: now() }),
      }),
      // Force re-login everywhere after a password reset.
      prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: omitUndefined({ revokedAt: now(), revokedReason: "password_reset" }),
      }),
    ]);
  }
  async function verifyEmail(input: VerifyEmailInput): Promise<void> {
    const tokenHash = hashToken(input.token);
    const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < now()) {
      throw new InvalidOrExpiredTokenError("email-verification");
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: omitUndefined({ emailVerifiedAt: now() }),
      }),
      prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: omitUndefined({ usedAt: now() }),
      }),
    ]);
  }
  async function getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new InvalidCredentialsError();
    }
    return {
      id: user.id,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
    };
  }
  async function issueSession(
    userId: string,
    organizationId: string,
    role: string,
    meta: RequestMeta,
  ): Promise<AuthTokens> {
    const session = await prisma.session.create({
      data: omitUndefined({
        userId,
        organizationId,
        role,
        refreshTokenHash: "pending", // placeholder, replaced immediately below
        expiresAt: new Date(now().getTime() + parseDurationToMs(tokenConfig.refreshTokenTtl)),
        userAgent: meta.userAgent,
        ...(meta.ipAddress === undefined ? {} : { ipAddress: meta.ipAddress }),
      }),
    });
    const refreshToken = signRefreshToken(
      { sub: userId, sessionId: session.id, tokenVersion: 1 },
      tokenConfig,
    );
    assertKnownRole(role);
    const accessToken = signAccessToken(
      { sub: userId, organizationId, role, sessionId: session.id },
      tokenConfig,
    );
    await prisma.session.update({
      where: { id: session.id },
      data: omitUndefined({ refreshTokenHash: hashToken(refreshToken) }),
    });
    return { accessToken, refreshToken };
  }
  async function issueEmailVerificationToken(userId: string): Promise<void> {
    const rawToken = randomBytes(32).toString("hex");
    await prisma.emailVerificationToken.create({
      data: omitUndefined({
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(now().getTime() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
      }),
    });
    await deps.onEmailVerificationTokenIssued?.(rawToken, userId);
  }
  return {
    register,
    acceptInvitation,
    login,
    refresh,
    logout,
    forgotPassword,
    resetPassword,
    verifyEmail,
    getCurrentUser,
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
/** organization-service is the source of truth for roles, but it's a
 * separate service - we don't get compile-time guarantees its response
 * matches our Role union, so we check at the boundary instead of trusting
 * or silently casting a string into a narrower type. */
function assertKnownRole(role: string): asserts role is import("@nexora/types").Role {
  if (!isRole(role)) {
    throw new AppError(
      502,
      "UNKNOWN_ROLE_FROM_ORGANIZATION_SERVICE",
      `organization-service returned an unrecognized role: "${role}"`,
    );
  }
}
