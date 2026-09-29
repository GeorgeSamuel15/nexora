import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Redis } from "ioredis";
import { signAccessToken } from "@nexora/auth";
import { createApp } from "../src/app.js";
import type { BuildRoutesConfig } from "../src/routes/routeTable.js";

describe("gateway HTTP forwarding", () => {
  let server: Server;
  let gateway: ReturnType<typeof createApp>;
  const tokenConfig = {
    accessTokenSecret: "gateway-test-secret-long-enough",
    accessTokenTtl: "15m",
  };
  const token = signAccessToken(
    { sub: "user-test", organizationId: "org-test", role: "OWNER", sessionId: "session-test" },
    tokenConfig,
  );

  beforeAll(async () => {
    const upstream = express();
    upstream.use(express.raw({ type: () => true }));
    upstream.use((req, res) => {
      res.setHeader("Set-Cookie", "refresh=example; HttpOnly; SameSite=Lax");
      res.json({
        method: req.method,
        url: req.originalUrl,
        body: (req.body as Buffer).toString(),
        headers: req.headers,
      });
    });
    server = await new Promise<Server>((resolve) => {
      const listening = upstream.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const services: BuildRoutesConfig = {
      authServiceUrl: url,
      organizationServiceUrl: url,
      userServiceUrl: url,
      hrServiceUrl: url,
      projectServiceUrl: url,
      crmServiceUrl: url,
      financeServiceUrl: url,
      documentServiceUrl: url,
      notificationServiceUrl: url,
      analyticsServiceUrl: url,
      auditServiceUrl: url,
    };
    // Redis is outside this forwarding test's scope; HTTP traffic is real.
    const redis = {
      incr: async () => 1,
      expire: async () => 1,
      ttl: async () => 60,
    } as unknown as Redis;
    gateway = createApp({ redis, services, tokenConfig, corsOrigin: "http://localhost:5173" });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it("preserves the auth prefix, query, JSON body, request ID and response cookies", async () => {
    const response = await request(gateway)
      .post("/api/auth/register?source=test")
      .send({ organizationName: "Nexora" });
    expect(response.status).toBe(200);
    expect(response.body.url).toBe("/auth/register?source=test");
    expect(JSON.parse(response.body.body)).toEqual({ organizationName: "Nexora" });
    expect(response.body.headers["x-request-id"]).toBeTruthy();
    expect(response.headers["set-cookie"]).toContain("refresh=example; HttpOnly; SameSite=Lax");
  });

  it("forwards protected resource paths and strips untrusted internal credentials", async () => {
    const response = await request(gateway)
      .get("/api/invoices?status=SENT")
      .set("Authorization", `Bearer ${token}`)
      .set("x-internal-secret", "spoofed")
      .set("x-organization-id", "another-tenant");
    expect(response.status).toBe(200);
    expect(response.body.url).toBe("/invoices?status=SENT");
    expect(response.body.headers["x-internal-secret"]).toBeUndefined();
    expect(response.body.headers["x-organization-id"]).toBeUndefined();
  });

  it("forwards a multipart stream without consuming the upload", async () => {
    const response = await request(gateway)
      .post("/api/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Contract")
      .attach("file", Buffer.from("actual document bytes"), "contract.txt");
    expect(response.status).toBe(200);
    expect(response.body.url).toBe("/documents");
    expect(response.body.headers["content-type"]).toContain("multipart/form-data");
    expect(response.body.body).toContain("actual document bytes");
  });

  it("requires authentication on /me and descendants of public endpoint names", async () => {
    expect((await request(gateway).get("/api/auth/me")).status).toBe(401);
    expect((await request(gateway).post("/api/auth/register/internal")).status).toBe(401);
    expect((await request(gateway).get("/api/invoices")).status).toBe(401);
    expect((await request(gateway).post("/api/internal/organizations/bootstrap")).status).toBe(404);
  });
});
