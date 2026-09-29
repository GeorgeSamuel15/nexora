import type { PrismaClient } from "../generated/client/index.js";

/**
 * Minimal in-memory stand-in for PrismaClient, covering exactly the calls
 * auth.service.ts makes (user/session/passwordResetToken/
 * emailVerificationToken CRUD + a no-op $transaction). This lets the
 * service's real business logic (lockout thresholds, token rotation,
 * saga rollback, ...) run and be asserted on without a live Postgres -
 * genuine unit coverage, not a mock that just returns canned data.
 *
 * Real integration tests against actual Postgres (via the Phase 2
 * docker-compose stack) should be added alongside this, not instead of it
 * - see services/auth-service/README.md.
 */

interface FakeUser {
  id: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  isActive: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  tokenVersion: number;
  organizationId: string;
  role: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
}

interface FakeToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export function createFakePrisma() {
  const users = new Map<string, FakeUser>();
  const sessions = new Map<string, FakeSession>();
  const passwordResetTokens = new Map<string, FakeToken>();
  const emailVerificationTokens = new Map<string, FakeToken>();

  const fake = {
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) return users.get(where.id) ?? null;
        if (where.email) return [...users.values()].find((u) => u.email === where.email) ?? null;
        return null;
      },
      create: async ({ data }: { data: { email: string; passwordHash: string } }) => {
        const user: FakeUser = {
          id: nextId("user"),
          email: data.email,
          passwordHash: data.passwordHash,
          emailVerifiedAt: null,
          isActive: true,
          failedLoginCount: 0,
          lockedUntil: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        users.set(user.id, user);
        return user;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeUser> }) => {
        const user = users.get(where.id);
        if (!user) throw new Error("user not found");
        Object.assign(user, data, { updatedAt: new Date() });
        return user;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        users.delete(where.id);
      },
    },
    session: {
      create: async ({
        data,
      }: {
        data: Omit<
          FakeSession,
          "id" | "createdAt" | "revokedAt" | "revokedReason" | "tokenVersion"
        > & { tokenVersion?: number };
      }) => {
        const session: FakeSession = {
          id: nextId("session"),
          createdAt: new Date(),
          revokedAt: null,
          revokedReason: null,
          tokenVersion: 1,
          ...data,
        };
        sessions.set(session.id, session);
        return session;
      },
      findUnique: async ({ where }: { where: { id: string } }) => sessions.get(where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeSession> }) => {
        const session = sessions.get(where.id);
        if (!session) throw new Error("session not found");
        Object.assign(session, data);
        return session;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id?: string; userId?: string; revokedAt: null; tokenVersion?: number };
        data: Partial<FakeSession>;
      }) => {
        let count = 0;
        for (const session of sessions.values()) {
          const matchesId = where.id ? session.id === where.id : true;
          const matchesUser = where.userId ? session.userId === where.userId : true;
          if (
            matchesId &&
            matchesUser &&
            session.revokedAt === null &&
            (where.tokenVersion === undefined || where.tokenVersion === session.tokenVersion)
          ) {
            Object.assign(session, data);
            count += 1;
          }
        }
        return { count };
      },
    },
    passwordResetToken: {
      create: async ({
        data,
      }: {
        data: { userId: string; tokenHash: string; expiresAt: Date };
      }) => {
        const token: FakeToken = {
          id: nextId("prt"),
          usedAt: null,
          createdAt: new Date(),
          ...data,
        };
        passwordResetTokens.set(token.tokenHash, token);
        return token;
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) =>
        passwordResetTokens.get(where.tokenHash) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeToken> }) => {
        const token = [...passwordResetTokens.values()].find((t) => t.id === where.id);
        if (!token) throw new Error("token not found");
        Object.assign(token, data);
        return token;
      },
    },
    emailVerificationToken: {
      create: async ({
        data,
      }: {
        data: { userId: string; tokenHash: string; expiresAt: Date };
      }) => {
        const token: FakeToken = {
          id: nextId("evt"),
          usedAt: null,
          createdAt: new Date(),
          ...data,
        };
        emailVerificationTokens.set(token.tokenHash, token);
        return token;
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) =>
        emailVerificationTokens.get(where.tokenHash) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeToken> }) => {
        const token = [...emailVerificationTokens.values()].find((t) => t.id === where.id);
        if (!token) throw new Error("token not found");
        Object.assign(token, data);
        return token;
      },
    },
    $queryRaw: async () => [{ value: 1 }],
    // Real Prisma runs these atomically; the fake just runs them in order,
    // which is sufficient for asserting business logic (not for testing
    // actual transactional isolation - that needs real Postgres).
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };

  return fake as unknown as PrismaClient;
}
