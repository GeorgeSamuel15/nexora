import type { PrismaClient } from "../generated/client/index.js";

/**
 * In-memory stand-in for PrismaClient covering exactly what
 * organization-service's services call. Real integration tests against
 * actual Postgres (via the Phase 2 docker-compose stack) should be added
 * alongside this - see services/organization-service/README.md.
 */

interface FakeOrganization {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeDepartment {
  id: string;
  organizationId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeTeam {
  id: string;
  organizationId: string;
  departmentId: string | null;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeMembership {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  tokenHash: string;
  status: string;
  invitedBy: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export function createFakePrisma() {
  const organizations = new Map<string, FakeOrganization>();
  const departments = new Map<string, FakeDepartment>();
  const teams = new Map<string, FakeTeam>();
  const memberships = new Map<string, FakeMembership>();
  const invitations = new Map<string, FakeInvitation>();

  const fake = {
    organization: {
      findUnique: async ({ where }: { where: { id?: string; slug?: string } }) => {
        if (where.id) return organizations.get(where.id) ?? null;
        if (where.slug)
          return [...organizations.values()].find((o) => o.slug === where.slug) ?? null;
        return null;
      },
      create: async ({ data }: { data: { name: string; slug: string } }) => {
        const org: FakeOrganization = {
          id: nextId("org"),
          name: data.name,
          slug: data.slug,
          settings: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        organizations.set(org.id, org);
        return org;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeOrganization>;
      }) => {
        const org = organizations.get(where.id);
        if (!org) throw new Error("organization not found");
        Object.assign(org, data, { updatedAt: new Date() });
        return org;
      },
    },
    department: {
      findMany: async ({ where }: { where: { organizationId: string } }) =>
        [...departments.values()]
          .filter((d) => d.organizationId === where.organizationId)
          .sort((a, b) => a.name.localeCompare(b.name)),
      findUnique: async ({
        where,
      }: {
        where: { organizationId_name?: { organizationId: string; name: string } };
      }) => {
        if (where.organizationId_name) {
          const { organizationId, name } = where.organizationId_name;
          return (
            [...departments.values()].find(
              (d) => d.organizationId === organizationId && d.name === name,
            ) ?? null
          );
        }
        return null;
      },
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        [...departments.values()].find(
          (d) => d.id === where.id && d.organizationId === where.organizationId,
        ) ?? null,
      create: async ({ data }: { data: { organizationId: string; name: string } }) => {
        const dept: FakeDepartment = {
          id: nextId("dept"),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        departments.set(dept.id, dept);
        return dept;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; organizationId: string };
        data: Partial<FakeDepartment>;
      }) => {
        const dept = [...departments.values()].find(
          (d) => d.id === where.id && d.organizationId === where.organizationId,
        );
        if (!dept) return { count: 0 };
        Object.assign(dept, data, { updatedAt: new Date() });
        return { count: 1 };
      },
      deleteMany: async ({ where }: { where: { id: string; organizationId: string } }) => {
        const dept = [...departments.values()].find(
          (d) => d.id === where.id && d.organizationId === where.organizationId,
        );
        if (!dept) return { count: 0 };
        departments.delete(dept.id);
        return { count: 1 };
      },
    },
    team: {
      findMany: async ({ where }: { where: { organizationId: string } }) =>
        [...teams.values()]
          .filter((t) => t.organizationId === where.organizationId)
          .sort((a, b) => a.name.localeCompare(b.name)),
      findUnique: async ({
        where,
      }: {
        where: { organizationId_name?: { organizationId: string; name: string } };
      }) => {
        if (where.organizationId_name) {
          const { organizationId, name } = where.organizationId_name;
          return (
            [...teams.values()].find(
              (t) => t.organizationId === organizationId && t.name === name,
            ) ?? null
          );
        }
        return null;
      },
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        [...teams.values()].find(
          (t) => t.id === where.id && t.organizationId === where.organizationId,
        ) ?? null,
      create: async ({
        data,
      }: {
        data: { organizationId: string; name: string; departmentId?: string };
      }) => {
        const team: FakeTeam = {
          id: nextId("team"),
          departmentId: data.departmentId ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        teams.set(team.id, team);
        return team;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeTeam> }) => {
        const team = teams.get(where.id);
        if (!team) throw new Error("team not found");
        Object.assign(team, data, { updatedAt: new Date() });
        return team;
      },
      deleteMany: async ({ where }: { where: { id: string; organizationId: string } }) => {
        const team = [...teams.values()].find(
          (t) => t.id === where.id && t.organizationId === where.organizationId,
        );
        if (!team) return { count: 0 };
        teams.delete(team.id);
        return { count: 1 };
      },
    },
    membership: {
      findFirst: async ({
        where,
      }: {
        where: {
          userId?: string;
          status?: string;
          id?: string;
          organizationId?: string;
          role?: string;
        };
      }) => {
        const list = [...memberships.values()].sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        );
        return (
          list.find(
            (m) =>
              (where.userId === undefined || m.userId === where.userId) &&
              (where.status === undefined || m.status === where.status) &&
              (where.id === undefined || m.id === where.id) &&
              (where.organizationId === undefined || m.organizationId === where.organizationId) &&
              (where.role === undefined || m.role === where.role),
          ) ?? null
        );
      },
      findMany: async ({ where }: { where: { organizationId: string; status?: string } }) =>
        [...memberships.values()]
          .filter(
            (m) =>
              m.organizationId === where.organizationId &&
              (where.status === undefined || m.status === where.status),
          )
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      create: async ({
        data,
      }: {
        data: { organizationId: string; userId: string; role: string; status: string };
      }) => {
        const membership: FakeMembership = {
          id: nextId("membership"),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        memberships.set(membership.id, membership);
        return membership;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeMembership> }) => {
        const membership = memberships.get(where.id);
        if (!membership) throw new Error("membership not found");
        Object.assign(membership, data, { updatedAt: new Date() });
        return membership;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { organizationId_userId: { organizationId: string; userId: string } };
        create: { organizationId: string; userId: string; role: string; status: string };
        update: Partial<FakeMembership>;
      }) => {
        const { organizationId, userId } = where.organizationId_userId;
        const existing = [...memberships.values()].find(
          (m) => m.organizationId === organizationId && m.userId === userId,
        );
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return existing;
        }
        const membership: FakeMembership = {
          id: nextId("membership"),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...create,
        };
        memberships.set(membership.id, membership);
        return membership;
      },
      count: async ({
        where,
      }: {
        where: { organizationId: string; role: string; status: string };
      }) =>
        [...memberships.values()].filter(
          (m) =>
            m.organizationId === where.organizationId &&
            m.role === where.role &&
            m.status === where.status,
        ).length,
    },
    invitation: {
      findMany: async ({ where }: { where: { organizationId: string; status?: string } }) =>
        [...invitations.values()]
          .filter(
            (i) =>
              i.organizationId === where.organizationId &&
              (where.status === undefined || i.status === where.status),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      findFirst: async ({
        where,
      }: {
        where: { organizationId: string; email?: string; status?: string };
      }) =>
        [...invitations.values()].find(
          (i) =>
            i.organizationId === where.organizationId &&
            (where.email === undefined || i.email === where.email) &&
            (where.status === undefined || i.status === where.status),
        ) ?? null,
      findUnique: async ({ where }: { where: { id?: string; tokenHash?: string } }) => {
        if (where.id) return invitations.get(where.id) ?? null;
        if (where.tokenHash)
          return [...invitations.values()].find((i) => i.tokenHash === where.tokenHash) ?? null;
        return null;
      },
      create: async ({
        data,
      }: {
        data: {
          organizationId: string;
          email: string;
          role: string;
          tokenHash: string;
          invitedBy: string;
          expiresAt: Date;
        };
      }) => {
        const invitation: FakeInvitation = {
          id: nextId("invitation"),
          status: "PENDING",
          acceptedAt: null,
          createdAt: new Date(),
          ...data,
        };
        invitations.set(invitation.id, invitation);
        return invitation;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; organizationId?: string; status: string; expiresAt?: { gt: Date } };
        data: Partial<FakeInvitation>;
      }) => {
        const invitation = [...invitations.values()].find(
          (i) =>
            i.id === where.id &&
            (where.organizationId === undefined || i.organizationId === where.organizationId) &&
            i.status === where.status &&
            (!where.expiresAt || i.expiresAt > where.expiresAt.gt),
        );
        if (!invitation) return { count: 0 };
        Object.assign(invitation, data);
        return { count: 1 };
      },
    },
    $transaction: async (
      operations: Promise<unknown>[] | ((tx: PrismaClient) => Promise<unknown>),
    ): Promise<unknown> =>
      typeof operations === "function"
        ? operations(fake as unknown as PrismaClient)
        : Promise.all(operations),
  };

  return fake as unknown as PrismaClient;
}
