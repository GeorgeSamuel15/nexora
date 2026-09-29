import { omitUndefined, toJsonObject } from "@nexora/utils";
import type { PrismaClient } from "../../generated/client/index.js";
import { NotFoundError, ConflictError } from "@nexora/http";
import { slugify, generateId } from "@nexora/utils";
import type {
  BootstrapOrganizationInput,
  MembershipLookupInput,
} from "../validation/internal.schemas.js";
import type { UpdateOrganizationInput } from "../validation/organization.schemas.js";
export interface OrganizationServiceDeps {
  prisma: PrismaClient;
  now?: () => Date;
}
const MAX_SLUG_ATTEMPTS = 5;
export function createOrganizationService(deps: OrganizationServiceDeps) {
  const { prisma } = deps;
  /** Generates a unique slug, retrying with a short random suffix on
   * collision rather than failing the whole registration over a slug
   * clash (two different companies both named "Acme" is a normal case,
   * not an error). */
  async function generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name) || "organization";
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${generateId().slice(0, 6)}`;
      const existing = await prisma.organization.findUnique({ where: { slug: candidate } });
      if (!existing) {
        return candidate;
      }
    }
    throw new ConflictError("Could not generate a unique organization slug. Please try again.");
  }
  /** Called by auth-service during registration - creates the org and its
   * OWNER membership together. Idempotency is auth-service's concern (it
   * only calls this once per registration and compensates by deleting the
   * auth User if this fails - see auth-service/src/services/auth.service.ts). */
  async function bootstrapOrganization(input: BootstrapOrganizationInput) {
    const slug = await generateUniqueSlug(input.organizationName);
    const organization = await prisma.organization.create({
      data: omitUndefined({ name: input.organizationName, slug }),
    });
    const membership = await prisma.membership.create({
      data: omitUndefined({
        organizationId: organization.id,
        userId: input.ownerUserId,
        role: "OWNER",
        status: "ACTIVE",
      }),
    });
    return { organizationId: organization.id, membershipId: membership.id, role: "OWNER" as const };
  }
  /** Called by auth-service on login/refresh. V1 assumes one active
   * organization per user (matches the doc's onboarding flow, which
   * doesn't describe multi-org switching) - if a user somehow has more
   * than one active membership, the most recently created one wins. */
  async function lookupActiveMembership(input: MembershipLookupInput) {
    const membership = await prisma.membership.findFirst({
      where: { userId: input.userId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
    if (!membership) {
      throw new NotFoundError("An active organization membership for this user");
    }
    return { organizationId: membership.organizationId, role: membership.role };
  }
  async function getOrganization(organizationId: string) {
    const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      throw new NotFoundError("Organization");
    }
    return organization;
  }
  async function updateOrganization(organizationId: string, input: UpdateOrganizationInput) {
    await getOrganization(organizationId); // 404s cleanly if the org doesn't exist
    return prisma.organization.update({
      where: { id: organizationId },
      data: omitUndefined({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.settings !== undefined ? { settings: toJsonObject(input.settings) } : {}),
      }),
    });
  }
  return { bootstrapOrganization, lookupActiveMembership, getOrganization, updateOrganization };
}
export type OrganizationService = ReturnType<typeof createOrganizationService>;
