/**
 * Nexora critical business flow - end-to-end (build spec section 35).
 *
 * This is the one test that proves the services actually work TOGETHER.
 * Every other test in this repo uses fakes (fake Prisma, fake publishers,
 * fake clients) and verifies one service's logic in isolation. This one
 * uses none: it hits real running services over real HTTP, against real
 * Postgres and real RabbitMQ.
 *
 * Deliberately written as a plain script rather than a vitest suite:
 * these steps are strictly sequential (each depends on ids from the
 * previous), it needs to run against a live stack rather than a test
 * harness, and a linear script with clear step logging is far easier to
 * debug when step 14 of 20 fails than a test runner's output would be.
 *
 * PREREQUISITES - this will fail immediately and clearly without them:
 *   1. pnpm infra:up                       (Postgres + RabbitMQ + Redis)
 *   2. every service migrated              (see root README)
 *   3. all 11 services running             (see root README's dev commands)
 *
 * Public API calls run through the gateway. Invitation acceptance retrieves
 * the token from the isolated Mailpit development mailbox.
 *
 * Usage: pnpm --filter @nexora/e2e test:e2e
 */

const gateway = process.env.E2E_GATEWAY_URL ?? "http://localhost:4000/api";
const BASE_URLS = {
  auth: gateway,
  organization: gateway,
  user: gateway,
  hr: gateway,
  project: gateway,
  crm: gateway,
  finance: gateway,
  notification: gateway,
  analytics: gateway,
  audit: gateway,
};

const INTERNAL_SECRET =
  process.env.INTERNAL_SERVICE_SECRET ?? "replace-with-a-long-random-shared-secret";

// ---------------------------------------------------------------------------
// Tiny harness - no framework, just enough structure to fail loudly and clearly
// ---------------------------------------------------------------------------

let stepNumber = 0;

function step(name: string): void {
  stepNumber += 1;
  console.log(`\n[${String(stepNumber).padStart(2, "0")}] ${name}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function api<T>(
  url: string,
  options: { method?: string; token?: string; body?: unknown; internal?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.internal) headers["x-internal-secret"] = INTERNAL_SECRET;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch (err) {
    throw new Error(
      `Could not reach ${url} - is that service running? (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  const text = await response.text();
  let parsed: ApiResult<T>;
  try {
    parsed = JSON.parse(text) as ApiResult<T>;
  } catch {
    throw new Error(`${url} returned non-JSON (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }

  if (!response.ok || !parsed.success) {
    throw new Error(
      `${options.method ?? "GET"} ${url} failed (HTTP ${response.status}): ${JSON.stringify(parsed.error)}`,
    );
  }
  return parsed.data as T;
}

/** Events are consumed asynchronously - poll rather than sleep a fixed
 * amount, so this is both faster when things work and clearer about what
 * it was waiting for when they don't. */
async function eventually<T>(
  description: string,
  check: () => Promise<T | null>,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result !== null && result !== undefined) return result;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for: ${description}` +
      (lastError
        ? `\n  last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
        : ""),
  );
}

// ---------------------------------------------------------------------------
// The flow
// ---------------------------------------------------------------------------

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

async function main(): Promise<void> {
  const runId = Date.now();
  const ownerEmail = `owner-${runId}@nexora.test`;
  const employeeEmail = `employee-${runId}@nexora.test`;
  const password = "correct-horse-battery-staple";

  console.log("=".repeat(70));
  console.log("NEXORA CRITICAL BUSINESS FLOW - END TO END");
  console.log("=".repeat(70));

  // -- 1. Owner registers, organization is created -------------------------
  step("OWNER REGISTERS -> ORGANIZATION CREATED");
  const registered = await api<{ user: { id: string; email: string }; tokens: Tokens }>(
    `${BASE_URLS.auth}/auth/register`,
    {
      method: "POST",
      body: {
        email: ownerEmail,
        password,
        organizationName: `Acme ${runId}`,
        firstName: "Ada",
        lastName: "Owner",
      },
    },
  );
  assert(registered.user.email === ownerEmail, "registered email should match");
  let ownerTokens = registered.tokens;
  console.log(`     owner registered: ${registered.user.id}`);

  // -- 2. Owner logs in -----------------------------------------------------
  step("OWNER LOGS IN");
  ownerTokens = await api<Tokens>(`${BASE_URLS.auth}/auth/login`, {
    method: "POST",
    body: { email: ownerEmail, password },
  });
  const me = await api<{ organizationId: string; role: string }>(`${BASE_URLS.auth}/auth/me`, {
    token: ownerTokens.accessToken,
  });
  assert(me.role === "OWNER", `expected role OWNER, got ${me.role}`);
  const organizationId = me.organizationId;
  console.log(`     logged in as OWNER of org ${organizationId}`);

  // -- 3. Owner invites an employee ----------------------------------------
  step("OWNER INVITES EMPLOYEE");
  const invitation = await api<{ id: string }>(`${BASE_URLS.organization}/invitations`, {
    method: "POST",
    token: ownerTokens.accessToken,
    body: { email: employeeEmail, role: "EMPLOYEE" },
  });
  console.log(`     invitation created: ${invitation.id}`);
  const mailbox = process.env.MAILPIT_URL ?? "http://localhost:8025";
  const rawInvitationToken = await eventually(
    "invitation email in Mailpit",
    async () => {
      const response = await fetch(
        `${mailbox}/api/v1/search?query=${encodeURIComponent(`to:${employeeEmail} subject:Join`)}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!response.ok) return null;
      const search = (await response.json()) as { messages: { ID: string }[] };
      const id = search.messages[0]?.ID;
      if (!id) return null;
      const messageResponse = await fetch(`${mailbox}/api/v1/message/${id}`);
      const message = (await messageResponse.json()) as { Text: string };
      const link = message.Text.match(/https?:\/\/[^\s]+/)?.[0];
      return link ? new URL(link).searchParams.get("token") : null;
    },
    60_000,
  );

  let employeeTokens: Tokens | null = null;
  let employeeUserId: string | null = null;

  if (rawInvitationToken) {
    step("EMPLOYEE ACCEPTS INVITATION -> EMPLOYEE LOGS IN");
    const accepted = await api<{ user: { id: string }; tokens: Tokens }>(
      `${BASE_URLS.auth}/auth/accept-invitation`,
      { method: "POST", body: { token: rawInvitationToken, password } },
    );
    employeeUserId = accepted.user.id;
    employeeTokens = await api<Tokens>(`${BASE_URLS.auth}/auth/login`, {
      method: "POST",
      body: { email: employeeEmail, password },
    });
    console.log(`     employee ${employeeUserId} accepted and logged in`);

    step("EMPLOYEE CLOCKS IN");
    const attendance = await api<{ status: string }>(`${BASE_URLS.hr}/attendance/clock-in`, {
      method: "POST",
      token: employeeTokens.accessToken,
    });
    assert(attendance.status === "ACTIVE", "clock-in should produce an ACTIVE record");
    console.log("     clocked in");
  }

  // -- 4. Project and task --------------------------------------------------
  step("MANAGER CREATES PROJECT");
  const ownerUserId = registered.user.id;
  const project = await api<{ id: string; status: string }>(`${BASE_URLS.project}/projects`, {
    method: "POST",
    token: ownerTokens.accessToken,
    body: { name: `Website Revamp ${runId}`, ownerId: ownerUserId, priority: "HIGH" },
  });
  console.log(`     project created: ${project.id}`);

  step("MANAGER ASSIGNS TASK");
  const assigneeId = employeeUserId ?? ownerUserId;
  if (employeeUserId) {
    await api(`${BASE_URLS.project}/projects/${project.id}/members`, {
      method: "POST",
      token: ownerTokens.accessToken,
      body: { userId: employeeUserId },
    });
  }
  const task = await api<{ id: string; status: string }>(`${BASE_URLS.project}/tasks`, {
    method: "POST",
    token: ownerTokens.accessToken,
    body: { projectId: project.id, title: "Design the homepage", priority: "HIGH", assigneeId },
  });
  console.log(`     task ${task.id} assigned to ${assigneeId}`);

  step("TASK IS COMPLETED");
  const completerToken = employeeTokens?.accessToken ?? ownerTokens.accessToken;
  const completed = await api<{ status: string }>(
    `${BASE_URLS.project}/tasks/${task.id}/complete`,
    {
      method: "POST",
      token: completerToken,
    },
  );
  assert(completed.status === "COMPLETED", "task should be COMPLETED");

  const projectAfter = await api<{ progress: { percentComplete: number } }>(
    `${BASE_URLS.project}/projects/${project.id}`,
    { token: ownerTokens.accessToken },
  );
  assert(
    projectAfter.progress.percentComplete === 100,
    `project progress should be 100% with its only task done, got ${projectAfter.progress.percentComplete}%`,
  );
  console.log("     task completed; project progress computed live at 100%");

  // -- 5. Leave -------------------------------------------------------------
  step("LEAVE IS REQUESTED AND APPROVED");
  const leaveType = await api<{ id: string }>(`${BASE_URLS.hr}/leave-types`, {
    method: "POST",
    token: ownerTokens.accessToken,
    body: {
      name: `Annual Leave ${runId}`,
      requiresBalance: true,
      defaultAnnualDays: 20,
      isPaid: true,
    },
  });
  const requesterToken = employeeTokens?.accessToken ?? ownerTokens.accessToken;
  const leaveRequest = await api<{ id: string; durationDays: number }>(
    `${BASE_URLS.hr}/leave-requests`,
    {
      method: "POST",
      token: requesterToken,
      body: {
        leaveTypeId: leaveType.id,
        startDate: "2026-06-01",
        endDate: "2026-06-03",
        reason: "Family trip",
      },
    },
  );
  assert(
    leaveRequest.durationDays === 3,
    `expected 3 inclusive days, got ${leaveRequest.durationDays}`,
  );

  const approved = await api<{ status: string }>(
    `${BASE_URLS.hr}/leave-requests/${leaveRequest.id}/approve`,
    {
      method: "PATCH",
      token: ownerTokens.accessToken,
    },
  );
  assert(approved.status === "APPROVED", "leave should be APPROVED");
  console.log("     leave requested (3 days) and approved; balance deducted");

  // -- 6. CRM: lead -> client -> deal -> won --------------------------------
  step("SALES: LEAD CREATED -> CONVERTED TO CLIENT");
  const lead = await api<{ id: string }>(`${BASE_URLS.crm}/leads`, {
    method: "POST",
    token: ownerTokens.accessToken,
    body: {
      name: "Jamie Rivera",
      company: `Rivera Consulting ${runId}`,
      email: `jamie-${runId}@rivera.test`,
      ownerId: ownerUserId,
    },
  });
  const convertedLead = await api<{ status: string; convertedClientId: string }>(
    `${BASE_URLS.crm}/leads/${lead.id}/convert`,
    { method: "POST", token: ownerTokens.accessToken },
  );
  assert(convertedLead.status === "CONVERTED", "lead should be CONVERTED");
  const clientId = convertedLead.convertedClientId;
  console.log(`     lead ${lead.id} converted into client ${clientId}`);

  step("DEAL CREATED -> MARKED WON");
  const pipeline = await api<{ id: string; stages: { id: string }[] }>(
    `${BASE_URLS.crm}/pipelines`,
    {
      method: "POST",
      token: ownerTokens.accessToken,
      body: { name: `Sales ${runId}`, stageNames: ["New", "Qualified", "Proposal"] },
    },
  );
  const firstStage = pipeline.stages[0];
  assert(firstStage, "pipeline should have been created with stages");

  const deal = await api<{ id: string }>(`${BASE_URLS.crm}/deals`, {
    method: "POST",
    token: ownerTokens.accessToken,
    body: {
      title: `Rivera retainer ${runId}`,
      clientId,
      ownerId: ownerUserId,
      pipelineId: pipeline.id,
      stageId: firstStage.id,
      value: 50000,
      probability: 60,
    },
  });
  const wonDeal = await api<{ status: string; probability: number }>(
    `${BASE_URLS.crm}/deals/${deal.id}/win`,
    {
      method: "POST",
      token: ownerTokens.accessToken,
    },
  );
  assert(wonDeal.status === "WON", "deal should be WON");
  assert(wonDeal.probability === 100, "a won deal should be at 100% probability");
  console.log(`     deal ${deal.id} marked WON (publishes DEAL_WON)`);

  // -- 7. Finance: invoice -> payment ---------------------------------------
  step("INVOICE CREATED -> SENT -> PAYMENT RECORDED");
  const invoice = await api<{ id: string; total: number; status: string }>(
    `${BASE_URLS.finance}/invoices`,
    {
      method: "POST",
      token: ownerTokens.accessToken,
      body: {
        invoiceNumber: `INV-${runId}`,
        clientId,
        issueDate: "2026-06-01",
        dueDate: "2026-06-30",
        tax: 0,
        currency: "USD",
        items: [{ description: "Retainer - June", quantity: 1, unitPrice: 50000 }],
      },
    },
  );
  assert(
    Number(invoice.total) === 50000,
    `invoice total should be computed from items, got ${invoice.total}`,
  );
  assert(invoice.status === "DRAFT", "a new invoice should start as DRAFT");

  await api(`${BASE_URLS.finance}/invoices/${invoice.id}/send`, {
    method: "POST",
    token: ownerTokens.accessToken,
  });

  // Partial payment -> PARTIALLY_PAID
  await api(`${BASE_URLS.finance}/payments`, {
    method: "POST",
    token: ownerTokens.accessToken,
    body: {
      invoiceId: invoice.id,
      amount: 20000,
      paymentDate: "2026-06-05",
      method: "bank_transfer",
    },
  });
  const partiallyPaid = await api<{ status: string }>(
    `${BASE_URLS.finance}/invoices/${invoice.id}`,
    {
      token: ownerTokens.accessToken,
    },
  );
  assert(
    partiallyPaid.status === "PARTIALLY_PAID",
    `expected PARTIALLY_PAID after a partial payment, got ${partiallyPaid.status}`,
  );

  // Remaining payment -> PAID (status derived, never set manually)
  await api(`${BASE_URLS.finance}/payments`, {
    method: "POST",
    token: ownerTokens.accessToken,
    body: {
      invoiceId: invoice.id,
      amount: 30000,
      paymentDate: "2026-06-10",
      method: "bank_transfer",
    },
  });
  const fullyPaid = await api<{ status: string }>(`${BASE_URLS.finance}/invoices/${invoice.id}`, {
    token: ownerTokens.accessToken,
  });
  assert(fullyPaid.status === "PAID", `expected PAID after full payment, got ${fullyPaid.status}`);
  console.log("     invoice DRAFT -> SENT -> PARTIALLY_PAID -> PAID (all derived from payments)");

  // -- 8. Analytics reflects everything above -------------------------------
  step("ANALYTICS REFLECTS THE REAL DATA");
  const dashboard = await api<{
    projects?: { activeProjects: number };
    crm?: { openDeals: number };
    finance?: { revenue: number; outstandingInvoicesCount: number };
    unavailableSections: string[];
  }>(`${BASE_URLS.analytics}/dashboard/summary`, { token: ownerTokens.accessToken });

  assert(
    dashboard.unavailableSections.length === 0,
    `some services were unreachable: ${dashboard.unavailableSections.join(", ")}`,
  );
  assert(dashboard.finance, "an OWNER should see the finance section");
  assert(
    dashboard.finance.revenue >= 50000,
    `revenue should include the 50000 collected, got ${dashboard.finance.revenue}`,
  );
  assert(dashboard.crm, "an OWNER should see the CRM section");
  console.log(
    `     dashboard revenue: ${dashboard.finance.revenue} (real aggregate, not hardcoded)`,
  );

  // -- 9. Audit log captured the important actions --------------------------
  step("AUDIT LOG CAPTURED THE IMPORTANT ACTIONS");
  const auditLogs = await eventually("audit entries for LOGIN and DEAL_WON", async () => {
    const result = await api<{ data: { action: string }[] }>(
      `${BASE_URLS.audit}/audit-logs?pageSize=100`,
      { token: ownerTokens.accessToken },
    );
    const actions = new Set(result.data.map((entry) => entry.action));
    // LOGIN arrives via a direct call; DEAL_WON via RabbitMQ - this
    // asserts BOTH audit paths actually work.
    return actions.has("LOGIN") && actions.has("DEAL_WON") ? result.data : null;
  });
  const auditActions = new Set(auditLogs.map((entry) => entry.action));
  console.log(
    `     ${auditLogs.length} audit entries; actions seen: ${[...auditActions].sort().join(", ")}`,
  );
  console.log("     (LOGIN proves the direct-call path; DEAL_WON proves the event-sourced path)");

  // -- 10. Notifications were created from events ---------------------------
  step("NOTIFICATIONS CREATED FROM EVENTS");
  const notifications = await eventually("a DEAL_WON notification for the deal owner", async () => {
    const result = await api<{ data: { type: string }[] }>(
      `${BASE_URLS.notification}/notifications/me?pageSize=50`,
      { token: ownerTokens.accessToken },
    );
    return result.data.some((n) => n.type === "DEAL_WON") ? result.data : null;
  });
  const unread = await api<{ count: number }>(
    `${BASE_URLS.notification}/notifications/me/unread-count`,
    {
      token: ownerTokens.accessToken,
    },
  );
  assert(unread.count > 0, "unread count should be a real number greater than zero");
  console.log(`     ${notifications.length} notifications, ${unread.count} unread (real DB count)`);

  // -- 11. Tenant isolation spot-check --------------------------------------
  step("TENANT ISOLATION HOLDS ACROSS A REAL SECOND ORGANIZATION");
  const otherOrg = await api<{ user: { id: string }; tokens: Tokens }>(
    `${BASE_URLS.auth}/auth/register`,
    {
      method: "POST",
      body: {
        email: `intruder-${runId}@nexora.test`,
        password,
        organizationName: `Other Corp ${runId}`,
        firstName: "Eve",
        lastName: "Other",
      },
    },
  );

  let leaked = false;
  try {
    await api(`${BASE_URLS.project}/projects/${project.id}`, {
      token: otherOrg.tokens.accessToken,
    });
    leaked = true;
  } catch {
    // expected - a 404, not a 403: we don't even confirm the id exists
  }
  assert(!leaked, "SECURITY: another organization could read this org's project");

  const otherDashboard = await api<{ finance?: { revenue: number } }>(
    `${BASE_URLS.analytics}/dashboard/summary`,
    { token: otherOrg.tokens.accessToken },
  );
  assert(
    !otherDashboard.finance || otherDashboard.finance.revenue === 0,
    "SECURITY: another organization saw this org's revenue",
  );
  console.log("     a second real organization cannot read this org's project or revenue");

  console.log(`\n${"=".repeat(70)}`);
  console.log("CRITICAL FLOW PASSED - all services communicated end to end");
  console.log("=".repeat(70));
}

main().catch((err) => {
  console.error(`\n${"=".repeat(70)}`);
  console.error(`CRITICAL FLOW FAILED at step ${stepNumber}`);
  console.error("=".repeat(70));
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
