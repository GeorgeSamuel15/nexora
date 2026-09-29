/**
 * Nexora development seed data (build spec section 33).
 *
 * WHY THIS DRIVES THE REAL API instead of writing to databases directly:
 *
 * Nexora's data lives in ten separate Postgres databases, one per
 * service. A direct-insert seed would need ten Prisma clients, and - far
 * worse - would bypass every business rule that makes the data coherent:
 * invoice totals are computed from line items, invoice status is derived
 * from payments, project progress is computed from tasks, leave approval
 * deducts balance, and won deals publish events that produce
 * notifications and audit entries.
 *
 * Hand-inserted rows would look right in a table viewer and be subtly
 * wrong everywhere else. Driving the real endpoints means the seed data
 * is, by construction, exactly what the running system would have
 * produced - and it doubles as a smoke test of the whole stack.
 *
 * The tradeoff, stated honestly: this is slower than SQL inserts and
 * needs the whole stack running. For a dev seed that's the right trade.
 *
 * PREREQUISITES:
 *   1. pnpm infra:up  and every service migrated
 *   2. all 11 services + the gateway running
 *
 * Usage: pnpm --filter @nexora/seed seed
 */

const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:4000";

// ---------------------------------------------------------------------------
// SEED CREDENTIALS - development only.
//
// Build spec section 33: "Seed data must be clearly marked as
// development/demo data. Never use seed credentials as production
// credentials." Hence the obvious domain, the shared obvious password,
// and the hard refusal to run against NODE_ENV=production below.
// ---------------------------------------------------------------------------
const DEMO_PASSWORD = "nexora-demo-password-do-not-use";
const DEMO_DOMAIN = "demo.nexora.invalid"; // .invalid is reserved and unroutable by RFC 2606

if (process.env.NODE_ENV === "production") {
  console.error(
    "REFUSING TO SEED: NODE_ENV=production. This script creates demo accounts with a known password.",
  );
  process.exit(1);
}

interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function api<T>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(`${GATEWAY}${path}`, {
      method: options.method ?? "GET",
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch (err) {
    throw new Error(`Could not reach ${GATEWAY}${path} - is the gateway running? (${String(err)})`);
  }

  const text = await response.text();
  let parsed: ApiResult<T>;
  try {
    parsed = JSON.parse(text) as ApiResult<T>;
  } catch {
    throw new Error(`${path} returned non-JSON (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }
  if (!response.ok || !parsed.success) {
    throw new Error(
      `${options.method ?? "GET"} ${path} failed (HTTP ${response.status}): ${JSON.stringify(parsed.error)}`,
    );
  }
  return parsed.data as T;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

function log(section: string, detail = ""): void {
  console.log(`  ${section}${detail ? `: ${detail}` : ""}`);
}

async function main(): Promise<void> {
  const stamp = Date.now();
  const ownerEmail = `owner@${DEMO_DOMAIN}`;

  console.log("=".repeat(66));
  console.log("SEEDING NEXORA DEMO DATA");
  console.log("=".repeat(66));
  console.log(`gateway:  ${GATEWAY}`);
  console.log(`password: ${DEMO_PASSWORD}  (development only)\n`);

  // -- Organization + owner -------------------------------------------------
  console.log("[1/9] Organization and owner");
  const registered = await api<{ user: { id: string }; tokens: Tokens }>("/api/auth/register", {
    method: "POST",
    body: {
      email: ownerEmail,
      password: DEMO_PASSWORD,
      organizationName: "Northwind Demo Co",
      firstName: "Ada",
      lastName: "Okafor",
    },
  });
  const ownerToken = registered.tokens.accessToken;
  const ownerId = registered.user.id;
  log("owner", ownerEmail);

  // -- Departments and teams ------------------------------------------------
  console.log("\n[2/9] Departments and teams");
  const departments: Record<string, string> = {};
  for (const name of ["Engineering", "Sales", "Finance", "People Ops"]) {
    const dept = await api<{ id: string }>("/api/departments", {
      method: "POST",
      token: ownerToken,
      body: { name },
    });
    departments[name] = dept.id;
    log("department", name);
  }
  for (const [name, dept] of [
    ["Platform", "Engineering"],
    ["Revenue", "Sales"],
  ] as const) {
    await api("/api/teams", {
      method: "POST",
      token: ownerToken,
      body: { name, departmentId: departments[dept] },
    });
    log("team", `${name} (${dept})`);
  }

  // -- Invitations for the other roles --------------------------------------
  console.log("\n[3/9] Role invitations");
  const invitedRoles = [
    ["admin", "ADMIN"],
    ["hr", "HR_MANAGER"],
    ["finance", "FINANCE_MANAGER"],
    ["sales", "SALES_MANAGER"],
    ["pm", "PROJECT_MANAGER"],
    ["employee", "EMPLOYEE"],
  ] as const;
  for (const [handle, role] of invitedRoles) {
    await api("/api/invitations", {
      method: "POST",
      token: ownerToken,
      body: { email: `${handle}@${DEMO_DOMAIN}`, role },
    });
    log("invited", `${handle}@${DEMO_DOMAIN} as ${role}`);
  }
  console.log("  NOTE: invitation tokens are never returned over the API (they authorise");
  console.log("        account creation). These stay PENDING until accepted - grab tokens");
  console.log("        from organization-service's debug log to complete them.");

  // -- Employee records -----------------------------------------------------
  console.log("\n[4/9] Employee records");
  const employees: { id: string; name: string }[] = [];
  const roster = [
    ["Ada", "Okafor", "Chief Executive", "People Ops"],
    ["Bola", "Adeyemi", "Engineering Manager", "Engineering"],
    ["Chidi", "Nwosu", "Senior Engineer", "Engineering"],
    ["Dayo", "Fashola", "Account Executive", "Sales"],
    ["Emeka", "Obi", "Financial Analyst", "Finance"],
    ["Funmi", "Bello", "People Partner", "People Ops"],
  ] as const;
  for (const [i, [firstName, lastName, jobTitle, dept]] of roster.entries()) {
    const employee = await api<{ id: string }>("/api/employees", {
      method: "POST",
      token: ownerToken,
      body: {
        employeeNumber: `EMP-${String(i + 1).padStart(3, "0")}`,
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}@${DEMO_DOMAIN}`,
        jobTitle,
        departmentId: departments[dept],
        employmentType: "FULL_TIME",
        hireDate: `202${3 + (i % 3)}-0${(i % 9) + 1}-15`,
      },
    });
    employees.push({ id: employee.id, name: `${firstName} ${lastName}` });
    log("employee", `${firstName} ${lastName} - ${jobTitle}`);
  }

  // -- Attendance + leave ---------------------------------------------------
  console.log("\n[5/9] Attendance and leave");
  await api("/api/attendance/clock-in", { method: "POST", token: ownerToken });
  log("attendance", "owner clocked in (open shift)");

  const leaveType = await api<{ id: string }>("/api/leave-types", {
    method: "POST",
    token: ownerToken,
    body: { name: "Annual Leave", requiresBalance: true, defaultAnnualDays: 25, isPaid: true },
  });
  await api("/api/leave-types", {
    method: "POST",
    token: ownerToken,
    body: { name: "Sick Leave", requiresBalance: true, defaultAnnualDays: 10, isPaid: true },
  });
  await api("/api/leave-types", {
    method: "POST",
    token: ownerToken,
    body: { name: "Unpaid Leave", requiresBalance: false, isPaid: false },
  });
  log("leave types", "Annual (25d), Sick (10d), Unpaid (unlimited)");

  const approvedLeave = await api<{ id: string }>("/api/leave-requests", {
    method: "POST",
    token: ownerToken,
    body: {
      leaveTypeId: leaveType.id,
      startDate: "2026-07-06",
      endDate: "2026-07-10",
      reason: "Summer break",
    },
  });
  await api(`/api/leave-requests/${approvedLeave.id}/approve`, {
    method: "PATCH",
    token: ownerToken,
  });
  await api("/api/leave-requests", {
    method: "POST",
    token: ownerToken,
    body: {
      leaveTypeId: leaveType.id,
      startDate: "2026-09-14",
      endDate: "2026-09-15",
      reason: "Conference",
    },
  });
  log("leave", "1 approved (balance deducted), 1 pending");

  // -- Projects and tasks ---------------------------------------------------
  console.log("\n[6/9] Projects and tasks");
  const projectSpecs = [
    ["Website Revamp", "ACTIVE", "HIGH"],
    ["Mobile App v2", "ACTIVE", "URGENT"],
    ["Data Warehouse Migration", "PLANNING", "MEDIUM"],
  ] as const;
  const projects: string[] = [];
  for (const [name, status, priority] of projectSpecs) {
    const project = await api<{ id: string }>("/api/projects", {
      method: "POST",
      token: ownerToken,
      body: { name, ownerId: ownerId, priority, description: `${name} - demo project` },
    });
    if (status !== "PLANNING") {
      await api(`/api/projects/${project.id}`, {
        method: "PATCH",
        token: ownerToken,
        body: { status },
      });
    }
    projects.push(project.id);
    log("project", `${name} (${status})`);
  }

  const taskSpecs = [
    ["Design the new homepage", "HIGH", true],
    ["Implement responsive nav", "MEDIUM", true],
    ["Audit page performance", "MEDIUM", false],
    ["Write migration runbook", "HIGH", false],
    ["Set up CI for mobile builds", "URGENT", false],
  ] as const;
  for (const [i, [title, priority, complete]] of taskSpecs.entries()) {
    const task = await api<{ id: string }>("/api/tasks", {
      method: "POST",
      token: ownerToken,
      body: {
        projectId: projects[i % projects.length],
        title,
        priority,
        assigneeId: ownerId,
        dueDate: `2026-0${(i % 9) + 1}-20`,
      },
    });
    await api(`/api/tasks/${task.id}/comments`, {
      method: "POST",
      token: ownerToken,
      body: { content: "Kicking this off - demo comment." },
    });
    if (complete) {
      await api(`/api/tasks/${task.id}/complete`, { method: "POST", token: ownerToken });
    }
    log("task", `${title}${complete ? " (completed)" : ""}`);
  }

  // -- CRM ------------------------------------------------------------------
  console.log("\n[7/9] CRM: leads, clients, pipeline, deals");
  const pipeline = await api<{ id: string; stages: { id: string; name: string }[] }>(
    "/api/pipelines",
    {
      method: "POST",
      token: ownerToken,
      body: { name: "Standard Sales", stageNames: ["New", "Qualified", "Proposal", "Negotiation"] },
    },
  );
  const firstStage = pipeline.stages[0];
  if (!firstStage) throw new Error("pipeline was created without stages");
  log("pipeline", `Standard Sales (${pipeline.stages.map((s) => s.name).join(" -> ")})`);

  const leadSpecs = [
    ["Jamie Rivera", "Rivera Consulting", true],
    ["Sam Chen", "Chen Logistics", true],
    ["Priya Nair", "Nair Analytics", false],
  ] as const;
  const clientIds: string[] = [];
  for (const [name, company, convert] of leadSpecs) {
    const lead = await api<{ id: string }>("/api/leads", {
      method: "POST",
      token: ownerToken,
      body: {
        name,
        company,
        email: `${name.split(" ")[0]?.toLowerCase()}@${DEMO_DOMAIN}`,
        source: "Referral",
        ownerId,
      },
    });
    if (convert) {
      const converted = await api<{ convertedClientId: string }>(`/api/leads/${lead.id}/convert`, {
        method: "POST",
        token: ownerToken,
      });
      clientIds.push(converted.convertedClientId);
      log("lead", `${name} (${company}) -> converted to client`);
    } else {
      log("lead", `${name} (${company}) - still NEW`);
    }
  }

  const dealSpecs = [
    ["Rivera annual retainer", 120000, "won"],
    ["Chen logistics platform", 85000, "open"],
  ] as const;
  const wonDeals: { clientId: string; value: number }[] = [];
  for (const [i, [title, value, outcome]] of dealSpecs.entries()) {
    const clientId = clientIds[i % clientIds.length];
    if (!clientId) continue;
    const deal = await api<{ id: string }>("/api/deals", {
      method: "POST",
      token: ownerToken,
      body: {
        title,
        clientId,
        ownerId,
        pipelineId: pipeline.id,
        stageId: firstStage.id,
        value,
        probability: outcome === "won" ? 90 : 50,
        expectedCloseDate: "2026-08-30",
      },
    });
    if (outcome === "won") {
      await api(`/api/deals/${deal.id}/win`, { method: "POST", token: ownerToken });
      wonDeals.push({ clientId, value });
      log("deal", `${title} - WON (publishes DEAL_WON)`);
    } else {
      log("deal", `${title} - open`);
    }
  }

  // -- Finance --------------------------------------------------------------
  console.log("\n[8/9] Finance: invoices, payments, expenses");
  const invoiceSpecs = [
    ["INV-1001", 120000, "paid"],
    ["INV-1002", 45000, "partial"],
    ["INV-1003", 18000, "draft"],
  ] as const;
  for (const [number, amount, state] of invoiceSpecs) {
    const clientId = clientIds[0];
    if (!clientId) break;
    const invoice = await api<{ id: string; total: number }>("/api/invoices", {
      method: "POST",
      token: ownerToken,
      body: {
        invoiceNumber: `${number}-${stamp}`,
        clientId,
        issueDate: "2026-06-01",
        dueDate: "2026-06-30",
        tax: 0,
        currency: "USD",
        items: [{ description: "Professional services", quantity: 1, unitPrice: amount }],
      },
    });
    if (state !== "draft") {
      await api(`/api/invoices/${invoice.id}/send`, { method: "POST", token: ownerToken });
      const paid = state === "paid" ? amount : Math.round(amount * 0.4);
      await api("/api/payments", {
        method: "POST",
        token: ownerToken,
        body: {
          invoiceId: invoice.id,
          amount: paid,
          paymentDate: "2026-06-12",
          method: "bank_transfer",
        },
      });
    }
    log("invoice", `${number} ${amount} -> ${state} (status derived from payments)`);
  }

  const expenseSpecs = [
    ["Team offsite catering", "Meals", 850, "approve"],
    ["Cloud hosting - June", "Infrastructure", 2400, "approve"],
    ["Conference tickets", "Training", 1200, "pending"],
  ] as const;
  for (const [title, category, amount, action] of expenseSpecs) {
    const expense = await api<{ id: string }>("/api/expenses", {
      method: "POST",
      token: ownerToken,
      body: { title, category, amount, date: "2026-06-05", description: `${title} - demo expense` },
    });
    if (action === "approve") {
      await api(`/api/expenses/${expense.id}/approve`, { method: "POST", token: ownerToken });
    }
    log("expense", `${title} ${amount} (${action === "approve" ? "approved" : "pending"})`);
  }

  // -- Verify the derived/eventual data actually landed ---------------------
  console.log("\n[9/9] Verifying derived data");
  const dashboard = await api<{
    employees?: { totalEmployees: number };
    finance?: { revenue: number; outstandingInvoicesCount: number };
    projects?: { activeProjects: number };
    crm?: { openDeals: number };
    unavailableSections: string[];
  }>("/api/dashboard/summary", { token: ownerToken });

  if (dashboard.unavailableSections.length > 0) {
    console.log(
      `  WARNING: some services were unreachable: ${dashboard.unavailableSections.join(", ")}`,
    );
  }
  log("dashboard employees", String(dashboard.employees?.totalEmployees ?? "n/a"));
  log("dashboard active projects", String(dashboard.projects?.activeProjects ?? "n/a"));
  log("dashboard open deals", String(dashboard.crm?.openDeals ?? "n/a"));
  log("dashboard revenue", String(dashboard.finance?.revenue ?? "n/a"));

  // Events are async - give the consumers a moment, then report honestly.
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const notifications = await api<{ data: unknown[] }>("/api/notifications/me?pageSize=50", {
    token: ownerToken,
  });
  const audit = await api<{ data: unknown[] }>("/api/audit-logs?pageSize=100", {
    token: ownerToken,
  });
  log("notifications created", String(notifications.data.length));
  log("audit entries created", String(audit.data.length));
  if (notifications.data.length === 0 || audit.data.length === 0) {
    console.log("  NOTE: zero here usually means RabbitMQ isn't running or the consumers");
    console.log("        didn't connect - the rest of the seed data is still valid.");
  }

  console.log(`\n${"=".repeat(66)}`);
  console.log("SEED COMPLETE");
  console.log("=".repeat(66));
  console.log(`\nSign in at the frontend (or via /api/auth/login) with:`);
  console.log(`  email:    ${ownerEmail}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log(`\nAll demo accounts use @${DEMO_DOMAIN} (RFC 2606 reserved - unroutable).`);
}

main().catch((err) => {
  console.error("\nSEED FAILED");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
