import axios from "axios";
export type Row = Record<string, unknown>;
export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  timeout: 20000,
  headers: { "x-nexora-client": "browser" },
});
let accessToken = "";
let refreshing: Promise<void> | undefined;
export function setToken(token: string) {
  accessToken = token;
}
api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (
      error.response?.status === 401 &&
      config &&
      !config.retried &&
      !config.url.startsWith("/auth/")
    ) {
      config.retried = true;
      refreshing ??= api
        .post("/auth/refresh", {})
        .then((r) => {
          setToken(r.data.data.accessToken);
        })
        .finally(() => {
          refreshing = undefined;
        });
      await refreshing;
      return api(config);
    }
    return Promise.reject(error);
  },
);
export async function request(path: string, method = "GET", data?: unknown): Promise<unknown> {
  return (await api.request({ url: path, method, data })).data.data;
}
export function errorMessage(error: unknown): string {
  return axios.isAxiosError(error)
    ? (error.response?.data?.error?.message ?? error.message)
    : error instanceof Error
      ? error.message
      : "Something went wrong. Please try again.";
}
export function rows(value: unknown): Row[] {
  if (Array.isArray(value)) return value as Row[];
  if (value && typeof value === "object" && "data" in value && Array.isArray(value.data))
    return value.data as Row[];
  return [];
}
export function label(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
export function display(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object")
    return Array.isArray(value)
      ? `${value.length} items`
      : Object.entries(value)
          .map(([k, v]) => `${label(k)}: ${display(v)}`)
          .join(" · ");
  return String(value);
}
