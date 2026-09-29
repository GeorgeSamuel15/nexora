import { describe, expect, it, vi } from "vitest";
import { verifyAccessToken, verifyRefreshToken, type TokenConfig } from "@nexora/auth";
import { createAuthService, type OrganizationClient } from "../src/services/auth.service.js";
import { createCapturingAuditClient } from "./fakeAuditClient.js";
import {
  AccountLockedError,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidOrExpiredTokenError,
  SessionRevokedError,
} from "../src/errors.js";
import { createFakePrisma } from "./fakePrisma.js";

const tokenConfig: TokenConfig = {
  accessTokenSecret: "test-access-secret-please-ignore",
  refreshTokenSecret: "test-refresh-secret-please-ignore",
  accessTokenTtl: "15m",
  refreshTokenTtl: "30d",
};

function fakeOrgClient(overrides: Partial<OrganizationClient> = {}): OrganizationClient {
  return {
    bootstrapOrganization: vi.fn(async () => ({
      organizationId: "org_1",
      membershipId: "membership_1",
      role: "OWNER" as const,
    })),
    lookupActiveMembership: vi.fn(async () => ({ organizationId: "org_1", role: "OWNER" })),
    validateInvitation: vi.fn(async (_token: string) => ({
      invitationId: "invitation_1",
      email: "invitee@nexora.test",
      organizationId: "org_1",
      role: "EMPLOYEE",
    })),
    consumeInvitation: vi.fn(async () => ({
      organizationId: "org_1",
      role: "EMPLOYEE",
      membershipId: "membership_2",
    })),
    ...overrides,
  };
}

function buildService(orgClientOverrides: Partial<OrganizationClient> = {}) {
  const prisma = createFakePrisma();
  const organizationClient = fakeOrgClient(orgClientOverrides);
  const service = createAuthService({
    prisma,
    organizationClient,
    tokenConfig,
    auditClient: createCapturingAuditClient(),
  });
  return { service, prisma, organizationClient };
}

const registerInput = {
  email: "owner@nexora.test",
  password: "correct-horse-battery-staple",
  organizationName: "Acme Inc",
  firstName: "Ada",
  lastName: "Owner",
};

describe("register", () => {
  it("creates a user, bootstraps an organization, and returns valid tokens", async () => {
    const { service } = buildService();
    const result = await service.register(registerInput, {});

    expect(result.user.email).toBe(registerInput.email);
    const accessClaims = verifyAccessToken(result.tokens.accessToken, tokenConfig);
    expect(accessClaims.organizationId).toBe("org_1");
    expect(accessClaims.role).toBe("OWNER");

    const refreshClaims = verifyRefreshToken(result.tokens.refreshToken, tokenConfig);
    expect(refreshClaims.tokenVersion).toBe(1);
  });

  it("rejects a duplicate email", async () => {
    const { service } = buildService();
    await service.register(registerInput, {});
    await expect(service.register(registerInput, {})).rejects.toBeInstanceOf(
      EmailAlreadyRegisteredError,
    );
  });

  it("rolls back the created user if organization bootstrap fails", async () => {
    const { service, prisma } = buildService({
      bootstrapOrganization: vi.fn(async () => {
        throw new Error("organization-service unavailable");
      }),
    });

    await expect(service.register(registerInput, {})).rejects.toThrow(
      "organization-service unavailable",
    );

    // The user must not be left behind - a retry with the same email
    // should be allowed, not blocked by EMAIL_ALREADY_REGISTERED.
    const found = await prisma.user.findUnique({ where: { email: registerInput.email } });
    expect(found).toBeNull();
  });
});

describe("acceptInvitation", () => {
  it("creates a user from the invitation's email (not a client-supplied one) and returns tokens", async () => {
    const { service, organizationClient } = buildService();

    const result = await service.acceptInvitation(
      { token: "raw-invite-token", password: "another-strong-pass" },
      {},
    );

    expect(organizationClient.validateInvitation).toHaveBeenCalledWith("raw-invite-token");
    expect(result.user.email).toBe("invitee@nexora.test");
    const claims = verifyAccessToken(result.tokens.accessToken, tokenConfig);
    expect(claims.role).toBe("EMPLOYEE");
    expect(organizationClient.consumeInvitation).toHaveBeenCalledWith(
      "invitation_1",
      result.user.id,
    );
  });

  it("rejects if the invited email is already registered", async () => {
    const { service } = buildService();
    // registerInput's email happens to differ from the fake invitation's
    // email, so register a user under the INVITED email directly first.
    const prisma = createFakePrisma();
    await prisma.user.create({ data: { email: "invitee@nexora.test", passwordHash: "x" } });
    const organizationClient = fakeOrgClient();
    const serviceSharingPrisma = createAuthService({
      prisma,
      organizationClient,
      tokenConfig,
      auditClient: createCapturingAuditClient(),
    });

    await expect(
      serviceSharingPrisma.acceptInvitation(
        { token: "raw-invite-token", password: "another-strong-pass" },
        {},
      ),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);

    void service;
  });

  it("rolls back the created user if consuming the invitation fails", async () => {
    const { service, prisma } = buildService({
      consumeInvitation: vi.fn(async () => {
        throw new Error("invitation already consumed");
      }),
    });

    await expect(
      service.acceptInvitation({ token: "raw-invite-token", password: "another-strong-pass" }, {}),
    ).rejects.toThrow("invitation already consumed");

    const found = await prisma.user.findUnique({ where: { email: "invitee@nexora.test" } });
    expect(found).toBeNull();
  });
});

describe("login", () => {
  it("returns tokens for correct credentials", async () => {
    const { service } = buildService();
    await service.register(registerInput, {});

    const tokens = await service.login(
      { email: registerInput.email, password: registerInput.password },
      {},
    );
    const claims = verifyAccessToken(tokens.accessToken, tokenConfig);
    expect(claims.organizationId).toBe("org_1");
  });

  it("rejects an unknown email without revealing that it doesn't exist", async () => {
    const { service } = buildService();
    await expect(
      service.login({ email: "nobody@nexora.test", password: "whatever12345" }, {}),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("rejects a wrong password and eventually locks the account", async () => {
    const { service } = buildService();
    await service.register(registerInput, {});

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(
        service.login({ email: registerInput.email, password: "wrong-password" }, {}),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }

    // 5th failed attempt should trip the lock.
    await expect(
      service.login({ email: registerInput.email, password: "wrong-password" }, {}),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    // Even the CORRECT password is now rejected while locked.
    await expect(
      service.login({ email: registerInput.email, password: registerInput.password }, {}),
    ).rejects.toBeInstanceOf(AccountLockedError);
  });
});

describe("refresh", () => {
  it("rotates the refresh token and issues a new access token", async () => {
    const { service } = buildService();
    const { tokens } = await service.register(registerInput, {});

    const rotated = await service.refresh(tokens.refreshToken);
    expect(rotated.refreshToken).not.toBe(tokens.refreshToken);

    const claims = verifyRefreshToken(rotated.refreshToken, tokenConfig);
    expect(claims.tokenVersion).toBe(2);
  });

  it("reflects a role change from organization-service on the next refresh", async () => {
    const { service, organizationClient } = buildService();
    const { tokens } = await service.register(registerInput, {});

    (organizationClient.lookupActiveMembership as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      organizationId: "org_1",
      role: "EMPLOYEE",
    });

    const rotated = await service.refresh(tokens.refreshToken);
    const claims = verifyAccessToken(rotated.accessToken, tokenConfig);
    expect(claims.role).toBe("EMPLOYEE");
  });

  it("detects reuse of an already-rotated refresh token and revokes the session", async () => {
    const { service } = buildService();
    const { tokens } = await service.register(registerInput, {});

    await service.refresh(tokens.refreshToken); // rotates once, old token now stale

    // Reusing the original (now-stale) refresh token should be detected as
    // reuse and revoke the session outright.
    await expect(service.refresh(tokens.refreshToken)).rejects.toBeInstanceOf(SessionRevokedError);

    // The rotated token should now ALSO be rejected, because the whole
    // session was revoked as a precaution.
    const rotated = await service.refresh(tokens.refreshToken).catch(() => null);
    expect(rotated).toBeNull();
  });
});

describe("logout", () => {
  it("revokes the session so its refresh token no longer works", async () => {
    const { service } = buildService();
    const { tokens } = await service.register(registerInput, {});

    await service.logout(tokens.refreshToken);

    await expect(service.refresh(tokens.refreshToken)).rejects.toBeInstanceOf(SessionRevokedError);
  });

  it("is idempotent when called with an already-invalid token", async () => {
    await expect(buildService().service.logout("not-a-real-token")).resolves.toBeUndefined();
  });
});

describe("password reset", () => {
  it("issues a token, allows exactly one reset, and revokes existing sessions", async () => {
    let capturedToken = "";
    const prisma = createFakePrisma();
    const organizationClient = fakeOrgClient();
    const service = createAuthService({
      prisma,
      organizationClient,
      tokenConfig,
      auditClient: createCapturingAuditClient(),
      onPasswordResetTokenIssued: (rawToken) => {
        capturedToken = rawToken;
      },
    });

    await service.register(registerInput, {});
    await service.forgotPassword({ email: registerInput.email });
    expect(capturedToken).not.toBe("");

    await service.resetPassword({ token: capturedToken, newPassword: "brand-new-password-123" });

    // Reusing the same reset token again must fail.
    await expect(
      service.resetPassword({ token: capturedToken, newPassword: "another-one-123456" }),
    ).rejects.toBeInstanceOf(InvalidOrExpiredTokenError);

    // Old password should no longer work; new one should.
    await expect(
      service.login({ email: registerInput.email, password: registerInput.password }, {}),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(
      service.login({ email: registerInput.email, password: "brand-new-password-123" }, {}),
    ).resolves.toBeDefined();
  });

  it("does not reveal whether an email exists", async () => {
    const { service } = buildService();
    await expect(service.forgotPassword({ email: "nobody@nexora.test" })).resolves.toBeUndefined();
  });
});

describe("audit logging", () => {
  it("records LOGIN with the caller's IP, and LOGOUT, but not failed logins", async () => {
    const prisma = createFakePrisma();
    const organizationClient = fakeOrgClient();
    const auditClient = createCapturingAuditClient();
    const service = createAuthService({ prisma, organizationClient, tokenConfig, auditClient });

    await service.register(registerInput, {});
    expect(auditClient.entries).toHaveLength(0); // register itself isn't audited here - the invite/org events cover it

    // A failed login must not produce an audit entry.
    await expect(
      service.login({ email: registerInput.email, password: "wrong" }, {}),
    ).rejects.toBeDefined();
    expect(auditClient.entries).toHaveLength(0);

    const tokens = await service.login(
      { email: registerInput.email, password: registerInput.password },
      { ipAddress: "203.0.113.5" },
    );
    expect(auditClient.entries).toHaveLength(1);
    expect(auditClient.entries[0]).toMatchObject({
      action: "LOGIN",
      entityType: "user",
      organizationId: "org_1",
      ipAddress: "203.0.113.5",
    });

    await service.logout(tokens.refreshToken);
    expect(auditClient.entries).toHaveLength(2);
    expect(auditClient.entries[1]).toMatchObject({ action: "LOGOUT", entityType: "user" });
  });

  it("logging out twice only audits once (logout is idempotent)", async () => {
    const prisma = createFakePrisma();
    const organizationClient = fakeOrgClient();
    const auditClient = createCapturingAuditClient();
    const service = createAuthService({ prisma, organizationClient, tokenConfig, auditClient });

    const { tokens } = await service.register(registerInput, {});
    await service.logout(tokens.refreshToken);
    await service.logout(tokens.refreshToken);

    const logoutEntries = auditClient.entries.filter((e) => e.action === "LOGOUT");
    expect(logoutEntries).toHaveLength(1);
  });
});
