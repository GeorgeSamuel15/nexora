/**
 * Internal service-to-service client for organization-service. This is not
 * called through the public API gateway - it hits organization-service's
 * internal port directly, the same way every service-to-service call in
 * Nexora should (never re-enter through the gateway for internal calls).
 *
 * organization-service does not exist yet as of Phase 3 - these calls will
 * fail with OrganizationServiceUnavailableError until Phase 4 implements
 * the matching routes below. The contract is defined here first so both
 * sides can be built against the same shape.
 */
import { OrganizationServiceUnavailableError } from "../errors.js";
import { env } from "../env.js";
import { logger } from "../logger.js";
import type { ApiSuccessEnvelope } from "@nexora/types";

export interface BootstrapOrganizationRequest {
  organizationName: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerFirstName: string;
  ownerLastName: string;
}

export interface BootstrapOrganizationResult {
  organizationId: string;
  membershipId: string;
  role: "OWNER";
}

export interface MembershipLookupResult {
  organizationId: string;
  role: string;
}

export interface ValidateInvitationResult {
  invitationId: string;
  email: string;
  organizationId: string;
  role: string;
}

export interface ConsumeInvitationResult {
  organizationId: string;
  role: string;
  membershipId: string;
}

async function postJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
  const url = `${env.ORGANIZATION_SERVICE_INTERNAL_URL}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": env.INTERNAL_SERVICE_SECRET,
      },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    logger.error("organization-service request failed", { url, cause: String(cause) });
    throw new OrganizationServiceUnavailableError(String(cause));
  }

  if (!response.ok) {
    logger.error("organization-service returned an error", { url, status: response.status });
    throw new OrganizationServiceUnavailableError(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ApiSuccessEnvelope<TResponse>;
  return payload.data;
}

/** Called during registration. organization-service (Phase 4) creates the
 * Organization row and an OWNER membership in one transaction. */
export async function bootstrapOrganization(
  request: BootstrapOrganizationRequest,
): Promise<BootstrapOrganizationResult> {
  return postJson<BootstrapOrganizationResult>("/internal/organizations/bootstrap", request);
}

/** Called during login/refresh to resolve the user's current organization
 * and role from the source of truth, rather than trusting a stale cached
 * value - so a role change or removal takes effect on next login. */
export async function lookupActiveMembership(userId: string): Promise<MembershipLookupResult> {
  return postJson<MembershipLookupResult>("/internal/memberships/lookup", { userId });
}

/** Read-only check of an invitation token - does NOT mark it accepted.
 * Called before creating the invitee's auth User, so the account is
 * created with exactly the invited email (never a client-supplied one). */
export async function validateInvitation(token: string): Promise<ValidateInvitationResult> {
  return postJson<ValidateInvitationResult>("/internal/invitations/validate", { token });
}

/** Called after the invitee's auth User has been created. Creates the
 * Membership and marks the invitation ACCEPTED atomically; fails if the
 * invitation was already consumed by a concurrent request. */
export async function consumeInvitation(
  invitationId: string,
  userId: string,
): Promise<ConsumeInvitationResult> {
  return postJson<ConsumeInvitationResult>("/internal/invitations/consume", {
    invitationId,
    userId,
  });
}
