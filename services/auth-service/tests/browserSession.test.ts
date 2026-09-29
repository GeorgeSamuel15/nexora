import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { responseTokens, protectBrowserOrigin, refreshCredential } from "../src/browserSession.js";
function app() {
  const server = express();
  server.use(express.json());
  server.post("/session", (req, res) => {
    try {
      protectBrowserOrigin(req, "http://localhost:5173");
      res.json(responseTokens(req, res, { accessToken: "access", refreshToken: "secret-refresh" }));
    } catch {
      res.sendStatus(403);
    }
  });
  server.post("/refresh", (req, res) => {
    try {
      protectBrowserOrigin(req, "http://localhost:5173");
      res.json({ token: refreshCredential(req) });
    } catch {
      res.sendStatus(403);
    }
  });
  return server;
}
describe("browser session boundary", () => {
  it("keeps refresh tokens out of the browser JSON response", async () => {
    const res = await request(app())
      .post("/session")
      .set("Origin", "http://localhost:5173")
      .set("x-nexora-client", "browser")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accessToken: "access" });
    expect(res.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(res.headers["set-cookie"][0]).toContain("SameSite=Lax");
  });
  it("rejects a forged origin even when the browser header is omitted", async () => {
    const res = await request(app())
      .post("/refresh")
      .set("Origin", "https://attacker.test")
      .set("Cookie", "nexora_refresh=secret")
      .send({});
    expect(res.status).toBe(403);
  });
  it("requires the cookie for browser rotation and ignores supplied body credentials", async () => {
    const res = await request(app())
      .post("/refresh")
      .set("Origin", "http://localhost:5173")
      .set("x-nexora-client", "browser")
      .send({ refreshToken: "injected" });
    expect(res.status).toBe(403);
  });
  it("preserves explicit native-client token responses", async () => {
    const res = await request(app()).post("/session").send({});
    expect(res.body.refreshToken).toBe("secret-refresh");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});
