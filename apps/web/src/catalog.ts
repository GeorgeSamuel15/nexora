export interface Field {
  key: string;
  type?: "text" | "email" | "password" | "date" | "number" | "textarea" | "select" | "items";
  optional?: boolean;
  options?: string[];
  source?: string;
  valueKey?: string;
}
export interface Action {
  label: string;
  suffix: string;
  permission?: string;
  method?: string;
  fields?: Field[];
  statuses?: string[];
}
export interface Page {
  key: string;
  title: string;
  group: string;
  endpoint: string;
  permission?: string;
  createPermission?: string;
  fields?: Field[];
  edit?: Field[];
  columns: string[];
  actions?: Action[];
  search?: boolean;
}
const f = (key: string, type: Field["type"] = "text", optional = false): Field => ({
  key,
  type,
  optional,
});
const choice = (key: string, options: string[], optional = false): Field => ({
  key,
  type: "select",
  options,
  optional,
});
const ref = (key: string, source: string, optional = false, valueKey = "id"): Field => ({
  key,
  type: "select",
  source,
  optional,
  valueKey,
});
export const roles = [
  "ADMIN",
  "HR_MANAGER",
  "FINANCE_MANAGER",
  "SALES_MANAGER",
  "PROJECT_MANAGER",
  "EMPLOYEE",
];
const priority = choice("priority", ["LOW", "MEDIUM", "HIGH", "URGENT"]);
const owner = ref("ownerId", "/memberships", false, "userId");
export const pages: Page[] = [
  {
    key: "branches",
    title: "Branches",
    group: "People & culture",
    endpoint: "/branches",
    createPermission: "organization.manage",
    fields: [f("name"), f("address", "textarea", true), f("timezone")],
    edit: [f("name"), f("address", "textarea", true), f("timezone")],
    columns: ["name", "address", "timezone"],
    actions: [
      { label: "Delete branch", suffix: "", method: "DELETE", permission: "organization.manage" },
    ],
  },
  {
    key: "performance",
    title: "Performance reviews",
    group: "People & culture",
    endpoint: "/performance-reviews",
    createPermission: "employee.update",
    fields: [
      ref("employeeId", "/memberships", false, "userId"),
      f("period"),
      f("rating", "number"),
      f("feedback", "textarea"),
      f("goals", "textarea"),
    ],
    edit: [f("period"), f("rating", "number"), f("feedback", "textarea"), f("goals", "textarea")],
    columns: ["employeeId", "period", "rating", "status"],
    actions: [
      {
        label: "Submit review",
        suffix: "/submit",
        permission: "employee.update",
        statuses: ["DRAFT"],
      },
    ],
  },
  {
    key: "employees",
    title: "People",
    group: "People & culture",
    endpoint: "/employees",
    permission: "employee.read",
    createPermission: "employee.create",
    fields: [
      f("employeeNumber"),
      f("firstName"),
      f("lastName"),
      f("email", "email"),
      f("jobTitle", "text", true),
      ref("departmentId", "/departments", true),
      ref("teamId", "/teams", true),
      ref("userId", "/memberships", true, "userId"),
      f("hireDate", "date"),
    ],
    edit: [
      f("firstName"),
      f("lastName"),
      f("jobTitle", "text", true),
      choice("employmentStatus", ["ACTIVE", "ON_LEAVE", "TERMINATED"]),
    ],
    columns: ["firstName", "lastName", "email", "jobTitle", "employmentStatus"],
    search: true,
  },
  {
    key: "departments",
    title: "Departments",
    group: "People & culture",
    endpoint: "/departments",
    createPermission: "organization.manage",
    fields: [f("name")],
    edit: [f("name")],
    columns: ["name", "createdAt"],
  },
  {
    key: "teams",
    title: "Teams",
    group: "People & culture",
    endpoint: "/teams",
    createPermission: "organization.manage",
    fields: [f("name"), ref("departmentId", "/departments", true)],
    edit: [f("name")],
    columns: ["name", "departmentId"],
  },
  {
    key: "attendance",
    title: "My attendance",
    group: "People & culture",
    endpoint: "/attendance/me",
    columns: ["date", "clockInAt", "clockOutAt", "totalMinutes"],
  },
  {
    key: "leave",
    title: "Leave requests",
    group: "People & culture",
    endpoint: "/leave-requests",
    permission: "leave.read",
    fields: [
      ref("leaveTypeId", "/leave-types"),
      f("startDate", "date"),
      f("endDate", "date"),
      f("reason", "textarea"),
    ],
    columns: ["employeeId", "startDate", "endDate", "durationDays", "status"],
    actions: [
      {
        label: "Approve",
        suffix: "/approve",
        method: "PATCH",
        permission: "leave.approve",
        statuses: ["PENDING"],
      },
      {
        label: "Reject",
        suffix: "/reject",
        method: "PATCH",
        permission: "leave.reject",
        fields: [f("rejectionReason", "textarea", true)],
        statuses: ["PENDING"],
      },
      { label: "Cancel", suffix: "/cancel", statuses: ["PENDING"] },
    ],
  },
  {
    key: "leave-types",
    title: "Leave policies",
    group: "People & culture",
    endpoint: "/leave-types",
    createPermission: "leave.configure",
    fields: [f("name"), f("defaultAnnualDays", "number", true)],
    edit: [f("name"), f("defaultAnnualDays", "number", true)],
    columns: ["name", "defaultAnnualDays", "requiresBalance", "isPaid"],
  },
  {
    key: "leave-balances",
    title: "My leave balance",
    group: "People & culture",
    endpoint: "/leave-balances/me",
    columns: ["leaveTypeId", "year", "allocatedDays", "usedDays"],
  },
  {
    key: "projects",
    title: "Projects",
    group: "Delivery",
    endpoint: "/projects",
    permission: "project.read",
    createPermission: "project.create",
    fields: [
      f("name"),
      f("description", "textarea", true),
      owner,
      priority,
      f("startDate", "date", true),
      f("dueDate", "date", true),
    ],
    edit: [
      f("name"),
      choice("status", ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]),
      priority,
      f("dueDate", "date", true),
    ],
    columns: ["name", "status", "priority", "dueDate", "progress"],
    search: true,
  },
  {
    key: "tasks",
    title: "Tasks",
    group: "Delivery",
    endpoint: "/tasks",
    permission: "task.read",
    createPermission: "task.create",
    fields: [
      ref("projectId", "/projects"),
      f("title"),
      f("description", "textarea", true),
      ref("assigneeId", "/memberships", true, "userId"),
      priority,
      f("dueDate", "date", true),
    ],
    edit: [
      f("title"),
      choice("status", ["TODO", "IN_PROGRESS", "IN_REVIEW", "COMPLETED", "CANCELLED"]),
      priority,
    ],
    columns: ["title", "status", "priority", "dueDate"],
    actions: [
      {
        label: "Complete",
        suffix: "/complete",
        permission: "task.update",
        statuses: ["TODO", "IN_PROGRESS", "IN_REVIEW"],
      },
      { label: "Comment", suffix: "/comments", fields: [f("content", "textarea")] },
    ],
  },
  {
    key: "leads",
    title: "Leads",
    group: "Relationships",
    endpoint: "/leads",
    permission: "crm.read",
    createPermission: "crm.manage",
    fields: [
      f("name"),
      f("company", "text", true),
      f("email", "email", true),
      f("phone", "text", true),
      owner,
    ],
    edit: [f("name"), choice("status", ["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED"])],
    columns: ["name", "company", "email", "status"],
    actions: [
      {
        label: "Convert to client",
        suffix: "/convert",
        permission: "crm.manage",
        statuses: ["NEW", "CONTACTED", "QUALIFIED"],
      },
    ],
  },
  {
    key: "clients",
    title: "Clients",
    group: "Relationships",
    endpoint: "/clients",
    permission: "crm.read",
    createPermission: "crm.manage",
    fields: [
      f("name"),
      f("company", "text", true),
      f("email", "email", true),
      f("phone", "text", true),
    ],
    edit: [f("name"), f("company", "text", true), f("email", "email", true)],
    columns: ["name", "company", "email", "phone"],
    search: true,
    actions: [
      {
        label: "Add contact",
        suffix: "/contacts",
        permission: "crm.manage",
        fields: [
          f("name"),
          f("email", "email", true),
          f("phone", "text", true),
          f("jobTitle", "text", true),
        ],
      },
    ],
  },
  {
    key: "pipelines",
    title: "Sales pipelines",
    group: "Relationships",
    endpoint: "/pipelines",
    permission: "crm.read",
    createPermission: "crm.manage",
    fields: [f("name")],
    columns: ["name", "stages"],
    actions: [
      {
        label: "Add stage",
        suffix: "/stages",
        permission: "crm.manage",
        fields: [f("name"), f("order", "number")],
      },
    ],
  },
  {
    key: "deals",
    title: "Deals",
    group: "Relationships",
    endpoint: "/deals",
    permission: "crm.read",
    createPermission: "crm.manage",
    fields: [
      f("title"),
      ref("clientId", "/clients"),
      owner,
      ref("pipelineId", "/pipelines"),
      ref("stageId", "@stages"),
      f("value", "number"),
      f("expectedCloseDate", "date", true),
    ],
    edit: [f("title"), f("value", "number"), f("probability", "number")],
    columns: ["title", "value", "probability", "status", "expectedCloseDate"],
    actions: [
      { label: "Mark won", suffix: "/win", permission: "crm.manage", statuses: ["OPEN"] },
      { label: "Mark lost", suffix: "/lose", permission: "crm.manage", statuses: ["OPEN"] },
    ],
  },
  {
    key: "invoices",
    title: "Invoices",
    group: "Finance",
    endpoint: "/invoices",
    permission: "finance.read",
    createPermission: "invoice.create",
    fields: [
      f("invoiceNumber"),
      ref("clientId", "/clients"),
      f("issueDate", "date"),
      f("dueDate", "date"),
      f("currency"),
      f("tax", "number", true),
      f("items", "items"),
    ],
    edit: [f("dueDate", "date"), f("notes", "textarea", true)],
    columns: ["invoiceNumber", "status", "currency", "total", "dueDate"],
    actions: [
      { label: "Send", suffix: "/send", permission: "invoice.update", statuses: ["DRAFT"] },
      {
        label: "Cancel",
        suffix: "/cancel",
        permission: "invoice.update",
        statuses: ["DRAFT", "SENT", "OVERDUE"],
      },
    ],
  },
  {
    key: "payments",
    title: "Payments",
    group: "Finance",
    endpoint: "/payments",
    permission: "finance.read",
    createPermission: "payment.create",
    fields: [
      ref("invoiceId", "/invoices"),
      f("amount", "number"),
      f("paymentDate", "date"),
      choice("method", ["BANK_TRANSFER", "CARD", "CASH", "OTHER"]),
      f("reference", "text", true),
    ],
    columns: ["invoiceId", "amount", "paymentDate", "method", "reference"],
  },
  {
    key: "expenses",
    title: "Expenses",
    group: "Finance",
    endpoint: "/expenses",
    permission: "finance.read",
    createPermission: "finance.manage",
    fields: [
      f("title"),
      f("category"),
      f("currency"),
      f("amount", "number"),
      f("date", "date"),
      f("description", "textarea", true),
    ],
    columns: ["title", "category", "amount", "date", "status"],
    actions: [
      { label: "Approve", suffix: "/approve", permission: "finance.manage", statuses: ["PENDING"] },
      {
        label: "Reject",
        suffix: "/reject",
        permission: "finance.manage",
        fields: [f("rejectionReason", "textarea", true)],
        statuses: ["PENDING"],
      },
    ],
  },
  {
    key: "documents",
    title: "Documents",
    group: "Workspace",
    endpoint: "/documents",
    permission: "document.read",
    createPermission: "document.upload",
    edit: [f("name")],
    columns: ["fileName", "mimeType", "size", "createdAt"],
    search: true,
    actions: [
      {
        label: "Share",
        suffix: "/share",
        permission: "document.upload",
        fields: [ref("userId", "/memberships", false, "userId")],
      },
    ],
  },
  {
    key: "notifications",
    title: "Notifications",
    group: "Workspace",
    endpoint: "/notifications/me",
    columns: ["title", "body", "isRead", "createdAt"],
  },
  {
    key: "memberships",
    title: "Access & roles",
    group: "Administration",
    endpoint: "/memberships",
    permission: "organization.manage",
    createPermission: "organization.manage",
    edit: [choice("role", roles)],
    columns: ["userId", "role", "status", "createdAt"],
  },
  {
    key: "invitations",
    title: "Invitations",
    group: "Administration",
    endpoint: "/invitations",
    permission: "organization.manage",
    createPermission: "organization.manage",
    fields: [f("email", "email"), choice("role", roles)],
    columns: ["email", "role", "status", "expiresAt"],
    actions: [
      {
        label: "Revoke",
        suffix: "",
        method: "DELETE",
        permission: "organization.manage",
        statuses: ["PENDING"],
      },
    ],
  },
  {
    key: "audit-logs",
    title: "Audit trail",
    group: "Administration",
    endpoint: "/audit-logs",
    permission: "audit.read",
    columns: ["action", "entityType", "actorId", "createdAt"],
  },
];
