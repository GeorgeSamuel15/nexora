import React, { useEffect, useState, createContext, useContext } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  NavLink,
  Link,
  Outlet,
  useNavigate,
  useParams,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Bell,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  X,
  LogOut,
  Layers,
  ChevronRight,
} from "lucide-react";
import { api, request, setToken, rows, display, label, errorMessage, type Row } from "./api";
import { pages, type Page, type Field, type Action } from "./catalog";
import { RecordForm } from "./Form";
import "./style.css";
interface User extends Row {
  id: string;
  email: string;
  firstName: string;
  role: string;
  permissions: string[];
}
const Session = createContext<{ user: User | null; reload: () => Promise<void> }>({
  user: null,
  reload: async () => {},
});
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15000, refetchOnWindowFocus: false } },
});
function useCan() {
  const { user } = useContext(Session);
  return (permission?: string) => !permission || !!user?.permissions.includes(permission);
}
function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="error" role="alert">
      {errorMessage(error)}
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [onClose]);
  return (
    <div className="modal-backdrop">
      <section role="dialog" aria-modal="true" aria-label={title} className="modal">
        <div className="section-head">
          <h2>{title}</h2>
          <button autoFocus className="icon subtle" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Details({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") return <p>{display(value)}</p>;
  if (Array.isArray(value))
    return (
      <div className="detail-list">
        {value.length ? (
          value.map((v, i) => (
            <div className="card" key={i}>
              <Details value={v} />
            </div>
          ))
        ) : (
          <p className="muted">No records yet.</p>
        )}
      </div>
    );
  return (
    <dl className="details">
      {Object.entries(value)
        .filter(([k]) => !/[Tt]oken|password|organizationId/.test(k))
        .map(([key, v]) => (
          <React.Fragment key={key}>
            <dt>{label(key)}</dt>
            <dd>{v && typeof v === "object" ? <Details value={v} /> : display(v)}</dd>
          </React.Fragment>
        ))}
    </dl>
  );
}
function Dashboard() {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => request("/dashboard/summary") });
  const { user } = useContext(Session);
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORKSPACE, AT A GLANCE</p>
          <h1>Good to see you, {user?.firstName || "there"}.</h1>
          <p className="muted">A clear view of your people, projects, and business.</p>
        </div>
        <span className="date">
          {new Date().toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      </header>
      {q.isPending ? (
        <p className="loading">Loading your workspace…</p>
      ) : q.isError ? (
        <ErrorBox error={q.error} />
      ) : (
        <div className="dashboard-grid">
          {Object.entries(q.data as Row).map(([key, value]) =>
            key === "unavailableSections" ? (
              Array.isArray(value) && value.length > 0 ? (
                <div className="error" key={key}>
                  Temporarily unavailable: {value.join(", ")}.{" "}
                  <button className="subtle" onClick={() => void q.refetch()}>
                    Retry
                  </button>
                </div>
              ) : null
            ) : (
              <section className="card metric" key={key}>
                <div className="section-head">
                  <h2>{label(key)}</h2>
                  <ArrowUpRight size={20} />
                </div>
                <Details value={value} />
              </section>
            ),
          )}
        </div>
      )}
      <section className="welcome-panel">
        <Layers size={36} />
        <div>
          <h2>Make room for meaningful work.</h2>
          <p>Keep the details connected. Your team can take care of the rest.</p>
        </div>
        <Link className="button light" to="/app/projects">
          View projects <ArrowUpRight size={17} />
        </Link>
      </section>
    </>
  );
}
function Resource({ page }: { page: Page }) {
  const routeParams = useParams();
  const [pageNumber, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ row?: Row; action?: Action; create?: boolean } | null>(null);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID());
  const can = useCan();
  const { user } = useContext(Session);
  const client = useQueryClient();
  const endpoint =
    page.key === "leave" && !can("leave.approve") ? "/leave-requests/me" : page.endpoint;
  useEffect(() => {
    if (routeParams.id) {
      void request(`${page.endpoint}/${routeParams.id}`)
        .then((row) => setModal({ row: row as Row }))
        .catch(setError);
    }
  }, [routeParams.id, page.endpoint]);
  const query = useQuery({
    queryKey: [page.key, pageNumber, search],
    queryFn: () =>
      request(
        `${endpoint}?page=${pageNumber}&pageSize=20${page.search ? `&search=${encodeURIComponent(search)}` : ""}`,
      ),
  });
  const records = rows(query.data);
  const pagination = (
    query.data as { pagination?: { totalPages: number; total: number } } | undefined
  )?.pagination;
  async function mutate(path: string, method = "POST", data: unknown = {}) {
    setBusy(true);
    setError(undefined);
    try {
      await request(path, method, data);
      await client.invalidateQueries();
      setModal(null);
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    const body = new FormData();
    body.append("file", file);
    await mutate("/documents", "POST", body);
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">{page.group.toUpperCase()}</p>
          <h1>{page.title}</h1>
          <p className="muted">Manage your {page.title.toLowerCase()} in one place.</p>
        </div>
        <div className="actions">
          {page.key === "attendance" &&
            ["clock-in", "clock-out"].map((a) => (
              <button
                key={a}
                disabled={busy}
                onClick={() => void mutate(`/attendance/${a}`).catch(() => {})}
              >
                {label(a)}
              </button>
            ))}
          {page.key === "notifications" && (
            <button
              disabled={busy}
              onClick={() => void mutate("/notifications/read-all").catch(() => {})}
            >
              Mark all read
            </button>
          )}
          {page.key === "documents" && can("document.upload") && (
            <label className="button">
              Upload document
              <input
                hidden
                type="file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file).catch(() => {});
                }}
              />
            </label>
          )}
          {page.fields && can(page.createPermission) && (
            <button onClick={() => setModal({ create: true })}>
              <Plus size={17} />
              Add {page.title.toLowerCase()}
            </button>
          )}
        </div>
      </header>
      {error ? <ErrorBox error={error} /> : null}
      <section className="card table-card">
        <div className="table-toolbar">
          <h2>{pagination ? `${pagination.total} records` : "All records"}</h2>
          {page.search && (
            <div className="search">
              <Search size={17} />
              <input
                aria-label={`Search ${page.title}`}
                placeholder="Search records…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          )}
          <button className="subtle" onClick={() => void query.refetch()}>
            Refresh
          </button>
        </div>
        {query.isPending ? (
          <p className="loading">Loading records…</p>
        ) : query.isError ? (
          <ErrorBox error={query.error} />
        ) : records.length === 0 ? (
          <div className="empty">
            <Layers size={30} />
            <h3>No {page.title.toLowerCase()} yet</h3>
            <p>New records will appear here.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {page.columns.map((c) => (
                    <th key={c}>{label(c)}</th>
                  ))}
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((row, i) => (
                  <tr key={String(row.id ?? i)}>
                    {page.columns.map((c, j) => (
                      <td key={c}>
                        {j === 0 ? (
                          <button className="text-button" onClick={() => setModal({ row })}>
                            {display(row[c])}
                          </button>
                        ) : c === "status" || c === "employmentStatus" ? (
                          <span className={`badge ${String(row[c]).toLowerCase()}`}>
                            {display(row[c]).replaceAll("_", " ")}
                          </span>
                        ) : (
                          display(row[c])
                        )}
                      </td>
                    ))}
                    <td>
                      <button
                        className="icon subtle"
                        aria-label="View record"
                        onClick={() => setModal({ row })}
                      >
                        <ChevronRight size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pagination && (
          <div className="pagination">
            <button
              className="subtle"
              disabled={pageNumber <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span>
              Page {pageNumber} of {Math.max(1, pagination.totalPages)}
            </span>
            <button
              className="subtle"
              disabled={pageNumber >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </section>
      {modal && (
        <Modal
          title={
            modal.create
              ? `Add ${page.title.toLowerCase()}`
              : (modal.action?.label ?? "Record details")
          }
          onClose={() => setModal(null)}
        >
          {modal.create ? (
            <RecordForm
              fields={page.fields ?? []}
              initial={{ ownerId: user?.id }}
              onSubmit={async (data) => {
                await mutate(
                  page.endpoint,
                  "POST",
                  page.key === "payments" ? { ...data, idempotencyKey: paymentKey } : data,
                );
                setPaymentKey(crypto.randomUUID());
              }}
              onCancel={() => setModal(null)}
            />
          ) : modal.action ? (
            <RecordForm
              fields={modal.action.fields ?? []}
              initial={modal.action.method === "PATCH" ? (modal.row ?? {}) : {}}
              onSubmit={(data) =>
                mutate(
                  `${page.endpoint}/${String(modal.row?.id)}${modal.action?.suffix ?? ""}`,
                  modal.action?.method ?? "POST",
                  data,
                )
              }
              onCancel={() => setModal(modal.row ? { row: modal.row } : null)}
            />
          ) : (
            <>
              <Details value={modal.row} />
              {page.key === "notifications" && (
                <NotificationLink row={modal.row ?? {}} onNavigate={() => setModal(null)} />
              )}
              <div className="actions detail-actions">
                {page.edit && can(page.createPermission) && (
                  <button
                    onClick={() =>
                      setModal({
                        ...modal,
                        action: {
                          label: "Edit record",
                          suffix: "",
                          method: "PATCH",
                          fields: page.edit!,
                        },
                      })
                    }
                  >
                    Edit
                  </button>
                )}
                {page.actions
                  ?.filter(
                    (a) =>
                      can(a.permission) &&
                      (!a.statuses || a.statuses.includes(String(modal.row?.status))),
                  )
                  .map((a) => (
                    <button
                      className="subtle"
                      key={a.label}
                      onClick={() => setModal({ ...modal, action: a })}
                    >
                      {a.label}
                    </button>
                  ))}
                {page.key === "notifications" && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void mutate(`/notifications/${String(modal.row?.id)}/read`).catch(() => {})
                    }
                  >
                    Mark read
                  </button>
                )}
                {page.key === "documents" && (
                  <button
                    onClick={() => {
                      void api
                        .get(`/documents/${String(modal.row?.id)}/download`, {
                          responseType: "blob",
                        })
                        .then((r) => {
                          const url = URL.createObjectURL(r.data);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = String(modal.row?.fileName ?? "document");
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        })
                        .catch(setError);
                    }}
                  >
                    Download
                  </button>
                )}
                {page.key === "invoices" && (
                  <button onClick={() => window.print()}>Print invoice</button>
                )}
              </div>
              {["tasks", "projects", "clients", "invoices", "deals", "pipelines"].includes(
                page.key,
              ) && <Related page={page} id={String(modal.row?.id)} />}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
function NotificationLink({ row, onNavigate }: { row: Row; onNavigate: () => void }) {
  const metadata = row.metadata as Row | undefined;
  const mapping: Record<string, string> = {
    taskId: "tasks",
    projectId: "projects",
    invoiceId: "invoices",
    documentId: "documents",
  };
  for (const [key, path] of Object.entries(mapping)) {
    if (typeof metadata?.[key] === "string")
      return (
        <Link className="button" onClick={onNavigate} to={`/app/${path}/${metadata[key]}`}>
          Open related record
        </Link>
      );
  }
  return null;
}
function Related({ page, id }: { page: Page; id: string }) {
  const suffix =
    page.key === "tasks"
      ? "/comments"
      : page.key === "clients"
        ? "/contacts"
        : page.key === "invoices"
          ? "/payments"
          : page.key === "deals"
            ? "/activities"
            : page.key === "pipelines"
              ? "/board"
              : "";
  const q = useQuery({
    queryKey: [page.key, id, suffix],
    queryFn: () => request(`${page.endpoint}/${id}${suffix}`),
  });
  return (
    <section className="related">
      <h3>{suffix ? label(suffix.slice(1)) : "Project details"}</h3>
      {q.isPending ? (
        <p>Loading…</p>
      ) : q.isError ? (
        <ErrorBox error={q.error} />
      ) : (
        <Details value={q.data} />
      )}
    </section>
  );
}
function Settings() {
  const q = useQuery({ queryKey: ["organization"], queryFn: () => request("/organizations/me") });
  const can = useCan();
  const c = useQueryClient();
  return (
    <>
      <header className="page-heading">
        <h1>Organization settings</h1>
      </header>
      <section className="card">
        {q.isPending ? (
          <p>Loading…</p>
        ) : q.isError ? (
          <ErrorBox error={q.error} />
        ) : can("organization.manage") ? (
          <RecordForm
            fields={[{ key: "name" }]}
            initial={q.data as Row}
            onSubmit={async (data) => {
              await request("/organizations/me", "PATCH", data);
              await c.invalidateQueries({ queryKey: ["organization"] });
            }}
          />
        ) : (
          <Details value={q.data} />
        )}
      </section>
    </>
  );
}
function Profile() {
  const { user } = useContext(Session);
  return (
    <>
      <header className="page-heading">
        <h1>Your profile</h1>
      </header>
      <section className="card">
        <Details value={user} />
        <Link to="/forgot-password">Reset your password</Link>
        <Preferences />
      </section>
    </>
  );
}
function Preferences() {
  const query = useQuery({
    queryKey: ["preferences"],
    queryFn: () => request("/notifications/preferences/me"),
  });
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  return (
    <section className="related">
      <h2>Notification preferences</h2>
      {query.isPending ? (
        <p>Loading…</p>
      ) : query.isError ? (
        <ErrorBox error={query.error} />
      ) : (
        <label>
          <input
            type="checkbox"
            checked={Boolean((query.data as Row).inApp)}
            disabled={busy}
            onChange={(e) => {
              setBusy(true);
              setError(undefined);
              void request("/notifications/preferences/me", "PUT", { inApp: e.target.checked })
                .then(() => query.refetch())
                .catch(setError)
                .finally(() => setBusy(false));
            }}
          />{" "}
          Receive in-app notifications
        </label>
      )}
      {error ? <ErrorBox error={error} /> : null}
    </section>
  );
}
function Layout() {
  const { user, reload } = useContext(Session);
  const [mobile, setMobile] = useState(false);
  const can = useCan();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => setMobile(false), [location.pathname]);
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <Link className="brand" to="/app">
          <span className="brand-mark">n</span>nexora<span className="brand-dot">®</span>
        </Link>
        <div className="workspace">
          <div className="avatar">{user.firstName?.[0] ?? "N"}</div>
          <div>
            <strong>Your workspace</strong>
            <small>{label(user.role.toLowerCase())}</small>
          </div>
        </div>
        <nav aria-label="Main navigation">
          <NavLink end to="/app">
            <LayoutDashboard size={17} />
            Overview
          </NavLink>
          {[...new Set(pages.map((p) => p.group))].map((group) => (
            <React.Fragment key={group}>
              {pages.some((p) => p.group === group && can(p.permission)) && (
                <p className="nav-group">{group}</p>
              )}
              {pages
                .filter((p) => p.group === group && can(p.permission))
                .map((p) => (
                  <NavLink key={p.key} to={`/app/${p.key}`}>
                    {p.title}
                  </NavLink>
                ))}
            </React.Fragment>
          ))}
          <NavLink to="/app/settings">Settings</NavLink>
        </nav>
        <button
          className="logout"
          onClick={() => {
            void request("/auth/logout", "POST", {})
              .then(async () => {
                setToken("");
                queryClient.clear();
                await reload();
                navigate("/login");
              })
              .catch((e) => window.alert(errorMessage(e)));
          }}
        >
          <LogOut size={16} />
          Sign out
        </button>
      </aside>
      <div className="main">
        <div className="topbar">
          <button
            className="icon subtle mobile-toggle"
            onClick={() => setMobile(!mobile)}
            aria-label="Toggle navigation"
          >
            <Menu size={22} />
          </button>
          <span className="muted">
            Workspace <ChevronRight size={13} />{" "}
            {pages.find((p) => location.pathname.endsWith(p.key))?.title ?? "Overview"}
          </span>
          <div>
            <Link aria-label="Notifications" to="/app/notifications">
              <Bell size={19} />
            </Link>
            <Link className="avatar" to="/app/profile">
              {user.firstName?.[0] ?? "N"}
            </Link>
          </div>
        </div>
        <main>
          <Outlet />
        </main>
        <footer>
          Nexora <span>A little more clarity. A lot more possibility.</span>
        </footer>
      </div>
    </div>
  );
}
const authFields: Record<string, Field[]> = {
  login: [
    { key: "email", type: "email" },
    { key: "password", type: "password" },
  ],
  register: [
    { key: "organizationName" },
    { key: "firstName" },
    { key: "lastName" },
    { key: "email", type: "email" },
    { key: "password", type: "password" },
  ],
  "forgot-password": [{ key: "email", type: "email" }],
  "reset-password": [{ key: "newPassword", type: "password" }],
  "verify-email": [],
  "accept-invitation": [{ key: "password", type: "password" }],
};
function AuthPage() {
  const { kind = "login" } = useParams();
  const navigate = useNavigate();
  const { reload } = useContext(Session);
  const [message, setMessage] = useState("");
  const fields = authFields[kind];
  if (!fields) return <Navigate to="/login" />;
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Link className="brand" to="/">
          <span className="brand-mark">n</span>nexora
        </Link>
        <p className="eyebrow">ONE CONNECTED WORKSPACE</p>
        <h1>
          Less scattered.
          <br />
          More together.
        </h1>
        <p>
          People, projects, and the bigger picture.
          <br />
          Give your business room to grow.
        </p>
        <div className="orb" />
      </div>
      <main className="auth-main">
        <div className="auth-card">
          <p className="eyebrow">WELCOME TO NEXORA</p>
          <h1>{kind === "login" ? "Welcome back." : label(kind)}</h1>
          <p className="muted">
            {kind === "login"
              ? "Sign in to pick up where you left off."
              : "A more connected workday starts here."}
          </p>
          {message ? (
            <div role="status" className="success">
              {message}
              <p>
                <Link to="/login">Back to sign in</Link>
              </p>
            </div>
          ) : (
            <RecordForm
              key={kind}
              fields={fields}
              submitLabel={
                kind === "login" ? "Sign in" : kind === "verify-email" ? "Verify email" : "Continue"
              }
              onSubmit={async (data) => {
                const token = new URLSearchParams(location.search).get("token");
                if (["reset-password", "verify-email", "accept-invitation"].includes(kind)) {
                  if (!token)
                    throw new Error(
                      "This link is missing its token. Please use the complete link from your email.",
                    );
                  data.token = token;
                }
                const result = (await request(`/auth/${kind}`, "POST", data)) as Row;
                const tokens = (result.tokens ?? result) as Row;
                if (typeof tokens.accessToken === "string") {
                  setToken(tokens.accessToken);
                  await reload();
                  navigate("/app");
                } else
                  setMessage(String(result.message ?? "Your request was completed successfully."));
              }}
            />
          )}
          <div className="auth-links">
            <Link to="/login">Sign in</Link>
            <Link to="/register">Create workspace</Link>
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
function Landing() {
  return (
    <div className="landing">
      <header>
        <Link className="brand" to="/">
          <span className="brand-mark">n</span>nexora
        </Link>
        <Link className="button light" to="/login">
          Sign in <ArrowUpRight size={16} />
        </Link>
      </header>
      <main>
        <p className="eyebrow">WORK BETTER. TOGETHER.</p>
        <h1>
          Your business.
          <br />
          One clear picture.
        </h1>
        <p>
          Bring your people, projects, customers, and finances
          <br />
          together in a workspace that makes sense.
        </p>
        <Link className="button" to="/register">
          Create your workspace <ArrowUpRight size={18} />
        </Link>
        <div className="landing-grid">
          {[
            "People & culture",
            "Projects & delivery",
            "Customer relationships",
            "Business finances",
          ].map((v, i) => (
            <div key={v}>
              <span>0{i + 1}</span>
              <h2>{v}</h2>
              <Layers size={32} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
function Application() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  async function reload() {
    try {
      setUser((await request("/auth/me")) as User);
    } catch {
      setUser(null);
    }
  }
  useEffect(() => {
    void request("/auth/refresh", "POST", {})
      .then(async (r) => {
        setToken(String((r as Row).accessToken));
        await reload();
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  if (loading)
    return (
      <div className="boot">
        <span className="brand-mark">n</span>
        <p>Opening your workspace…</p>
      </div>
    );
  return (
    <Session.Provider value={{ user, reload }}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/:kind" element={<AuthPage />} />
        <Route path="/app" element={<Layout />}>
          <Route index element={<Dashboard />} />
          {pages.map((page) => (
            <Route
              key={page.key}
              path={page.key}
              element={
                !page.permission || user?.permissions.includes(page.permission) ? (
                  <Resource key={page.key} page={page} />
                ) : (
                  <div className="empty">
                    <h1>Access restricted</h1>
                    <p>Your role does not have access to this page.</p>
                  </div>
                )
              }
            />
          ))}
          {["projects", "tasks", "invoices", "documents"].map((key) => {
            const page = pages.find((p) => p.key === key)!;
            return (
              <Route
                key={`${key}-detail`}
                path={`${key}/:id`}
                element={<Resource key={key} page={page} />}
              />
            );
          })}
          {Object.entries({
            dashboard: "",
            organization: "settings",
            "crm/leads": "leads",
            "crm/clients": "clients",
            "crm/deals": "deals",
            "finance/invoices": "invoices",
            "finance/expenses": "expenses",
            "finance/payments": "payments",
            "admin/users": "memberships",
            "admin/audit-logs": "audit-logs",
          }).map(([from, to]) => (
            <Route key={from} path={from} element={<Navigate replace to={`/app/${to}`} />} />
          ))}
          <Route
            path="finance/invoices/:id"
            element={<Resource page={pages.find((p) => p.key === "invoices")!} />}
          />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Route>
      </Routes>
    </Session.Provider>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Application />
    </BrowserRouter>
  </QueryClientProvider>,
);
