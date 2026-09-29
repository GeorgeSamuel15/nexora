import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { verifyAccessToken } from "@nexora/auth";
import { createApp } from "../src/app.js";
import { createCapturingAuditClient } from "./fakeAuditClient.js";
import { createFakePrisma } from "./fakePrisma.js";
import { createFakeRedis } from "./fakeRedis.js";
import type { OrganizationClient } from "../src/services/auth.service.js";

const tokenConfig = {
  accessTokenSecret: "test-access-secret-please-ignore",
  refreshTokenSecret: "test-refresh-secret-please-ignore",
  accessTokenTtl: "15m",
  refreshTokenTtl: "30d",
};

function buildTestApp(prisma = createFakePrisma()) {
  const organizationClient: OrganizationClient = {
    bootstrapOrganization: vi.fn(async () => ({
      organizationId: "org_1",
      membershipId: "membership_1",
      role: "OWNER" as const,
    })),
    lookupActiveMembership: vi.fn(async () => ({ organizationId: "org_1", role: "OWNER" })),
    validateInvitation: vi.fn(async () => ({
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
  };

  return createApp({
    prisma,
    deliverMail: vi.fn(async () => {}),
    redis: createFakeRedis(),
    organizationClient,
    tokenConfig,
    corsOrigin: "http://localhost:5173",
    auditClient: createCapturingAuditClient(),
  });
}

const registerBody = {
  email: "owner@nexora.test",
  password: "correct-horse-battery-staple",
  organizationName: "Acme Inc",
  firstName: "Ada",
  lastName: "Owner",
};

describe("auth routes", () => {
  it("supports the full register -> me -> refresh -> logout flow", async () => {
    const app = buildTestApp();

    const registerRes = await request(app).post("/auth/register").send(registerBody);
    expect(registerRes.status).toBe(201);
    expect(registerRes.body.success).toBe(true);
    const { accessToken, refreshToken } = registerRes.body.data.tokens;

    const meRes = await request(app).get("/auth/me").set("Authorization", `Bearer ${accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe(registerBody.email);
    expect(meRes.body.data.role).toBe("OWNER");

    const refreshRes = await request(app).post("/auth/refresh").send({ refreshToken });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.refreshToken).not.toBe(refreshToken);

    const logoutRes = await request(app)
      .post("/auth/logout")
      .send({ refreshToken: refreshRes.body.data.refreshToken });
    expect(logoutRes.status).toBe(200);

    const refreshAfterLogout = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: refreshRes.body.data.refreshToken });
    expect(refreshAfterLogout.status).toBe(401);
    expect(refreshAfterLogout.body.error.code).toBe("SESSION_REVOKED");
  });

  it("supports accepting an invitation and logging in as that user", async () => {
    const app = buildTestApp();

    const res = await request(app)
      .post("/auth/accept-invitation")
      .send({ token: "raw-invite-token", password: "another-strong-pass-123" });

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe("invitee@nexora.test");
    const claims = verifyAccessToken(res.body.data.tokens.accessToken, tokenConfig);
    expect(claims.role).toBe("EMPLOYEE");
  });

  it("rejects /me without a token", async () => {
    const app = buildTestApp();
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("returns a validation error for a malformed register request", async () => {
    const app = buildTestApp();
    const res = await request(app).post("/auth/register").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("login rejects wrong credentials with a generic error", async () => {
    const app = buildTestApp();
    await request(app).post("/auth/register").send(registerBody);

    const res = await request(app)
      .post("/auth/login")
      .send({ email: registerBody.email, password: "totally-wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("reports health status", async () => {
    const app = buildTestApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.data.service).toBe("auth-service");
  });

  it("reports unavailable database readiness instead of healthy", async () => {
    const prisma = createFakePrisma();
    vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("Database unavailable"));
    const res = await request(buildTestApp(prisma)).get("/health");
    expect(res.status).toBe(503);
    expect(res.body.data.dependencies.database).toBe(false);
  });
});
