/**
 * Every stats client below hits another service's internal-only
 * /internal/stats endpoint (protected by internalServiceAuth, not a user
 * JWT) - never through the public gateway, same convention as every
 * other internal service-to-service call in Nexora (see
 * auth-service/src/clients/organizationServiceClient.ts, the original
 * example of this pattern).
 */
export class StatsUnavailableError extends Error {
  constructor(serviceName: string, cause: string) {
    super(`Could not fetch stats from ${serviceName}: ${cause}`);
    this.name = "StatsUnavailableError";
  }
}

export async function fetchInternalStats<TStats>(
  serviceName: string,
  baseUrl: string,
  internalSecret: string,
  organizationId: string,
): Promise<TStats> {
  const url = `${baseUrl}/internal/stats?organizationId=${encodeURIComponent(organizationId)}`;
  let response: Response;
  try {
    response = await fetch(url, { headers: { "x-internal-secret": internalSecret } });
  } catch (cause) {
    throw new StatsUnavailableError(serviceName, String(cause));
  }

  if (!response.ok) {
    throw new StatsUnavailableError(serviceName, `HTTP ${response.status}`);
  }

  const body = (await response.json()) as { data: TStats };
  return body.data;
}
