import type { Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "@nexora/http";
import type { AuthTokens } from "./services/auth.service.js";
const COOKIE = "nexora_refresh";
export function browserClient(req: Request): boolean {
  return req.header("x-nexora-client") === "browser";
}
export function cookieToken(req: Request): string | undefined {
  const part = req.headers.cookie
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${COOKIE}=`));
  if (!part) return undefined;
  try {
    return decodeURIComponent(part.slice(COOKIE.length + 1));
  } catch {
    return undefined;
  }
}
export function protectBrowserOrigin(req: Request, origin: string): void {
  if ((browserClient(req) || cookieToken(req)) && req.header("origin") !== origin)
    throw new ForbiddenError();
}
export function responseTokens(
  req: Request,
  res: Response,
  tokens: AuthTokens,
): AuthTokens | { accessToken: string } {
  if (!browserClient(req)) return tokens;
  res.cookie(COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 30 * 86400_000,
  });
  return { accessToken: tokens.accessToken };
}
export function refreshCredential(req: Request): string {
  const value: unknown = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
  const token = browserClient(req)
    ? cookieToken(req)
    : typeof value === "string"
      ? value
      : cookieToken(req);
  if (!token) throw new UnauthorizedError("Refresh session is missing.");
  return token;
}
export function clearSession(res: Response): void {
  res.clearCookie(COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
  });
}
