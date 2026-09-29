/**
 * Access/refresh token helpers built on jsonwebtoken. Refresh-token
 * rotation/revocation (storing the current valid refresh token id per
 * session and invalidating it on rotation/logout) is implemented in
 * services/auth-service in Phase 3, where the session store lives - this
 * package only owns the pure sign/verify logic so it can be unit tested
 * and reused without a database.
 *
 * Requires `jsonwebtoken` to be installed (`pnpm install` at the repo root).
 */

import jwt from "jsonwebtoken";
import { isRole, type Role, type UUID } from "@nexora/types";
import { parseDurationToMs } from "@nexora/utils";

export interface AccessTokenClaims {
  sub: UUID; // userId
  organizationId: UUID;
  role: Role;
  sessionId: UUID;
}

export interface RefreshTokenClaims {
  sub: UUID; // userId
  sessionId: UUID;
  tokenVersion: number;
}

export interface TokenConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  accessTokenTtl: string; // e.g. "15m"
  refreshTokenTtl: string; // e.g. "30d"
}

export function signAccessToken(
  claims: AccessTokenClaims,
  config: Pick<TokenConfig, "accessTokenSecret" | "accessTokenTtl">,
): string {
  return jwt.sign(claims, config.accessTokenSecret, {
    expiresIn: parseDurationToMs(config.accessTokenTtl) / 1000,
    algorithm: "HS256",
    issuer: "nexora-auth",
    audience: "nexora",
  });
}

export function signRefreshToken(
  claims: RefreshTokenClaims,
  config: Pick<TokenConfig, "refreshTokenSecret" | "refreshTokenTtl">,
): string {
  return jwt.sign(claims, config.refreshTokenSecret, {
    expiresIn: parseDurationToMs(config.refreshTokenTtl) / 1000,
    algorithm: "HS256",
    issuer: "nexora-auth",
    audience: "nexora",
  });
}

export function verifyAccessToken(
  token: string,
  config: Pick<TokenConfig, "accessTokenSecret">,
): AccessTokenClaims {
  const claims = jwt.verify(token, config.accessTokenSecret, {
    algorithms: ["HS256"],
    issuer: "nexora-auth",
    audience: "nexora",
  });
  if (
    typeof claims === "string" ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    typeof claims.organizationId !== "string" ||
    !claims.organizationId ||
    typeof claims.sessionId !== "string" ||
    !claims.sessionId ||
    typeof claims.role !== "string" ||
    !isRole(claims.role)
  )
    throw new Error("Invalid access token claims");
  return claims as AccessTokenClaims;
}

export function verifyRefreshToken(
  token: string,
  config: Pick<TokenConfig, "refreshTokenSecret">,
): RefreshTokenClaims {
  const claims = jwt.verify(token, config.refreshTokenSecret, {
    algorithms: ["HS256"],
    issuer: "nexora-auth",
    audience: "nexora",
  });
  if (
    typeof claims === "string" ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    typeof claims.sessionId !== "string" ||
    !claims.sessionId ||
    !Number.isSafeInteger(claims.tokenVersion) ||
    claims.tokenVersion < 1
  )
    throw new Error("Invalid refresh token claims");
  return claims as RefreshTokenClaims;
}
