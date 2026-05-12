import axios, { AxiosError, type AxiosRequestConfig } from "axios";

// Always use relative paths — Vite proxy handles dev, nginx handles prod.
// Never set VITE_API_BASE_URL; doing so makes requests bypass nginx and
// breaks cookie/same-origin behaviour.
export const api = axios.create({
  withCredentials: true,
});

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken;
export const setOnUnauthorized = (cb: () => void) => {
  onUnauthorized = cb;
};

// Shape returned by /login, /register, and /refresh
export type RefreshResult = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; phone: string | null; currencyPref: "ARS" | "USD" };
};

// ── localStorage session persistence ────────────────────────────────────────
const SESSION_KEY = "metron:session";
type StoredSession = RefreshResult & { expiresAt: number };

export const persistSession = (data: RefreshResult, ttlMs = 14 * 24 * 60 * 60 * 1000) => {
  try {
    const session: StoredSession = { ...data, expiresAt: Date.now() + ttlMs };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Private-browsing mode or storage quota exceeded — silently skip.
  }
};

export const loadPersistedSession = (): (RefreshResult & { expiresAt: number }) | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session: StoredSession = JSON.parse(raw);
    if (session.expiresAt < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
};

export const clearPersistedSession = () => {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
};
// ────────────────────────────────────────────────────────────────────────────

// Single in-flight promise so concurrent callers share one HTTP request
let refreshPromise: Promise<RefreshResult | null> | null = null;

export const doRefresh = async (): Promise<RefreshResult | null> => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      // Prefer the refresh token stored in localStorage (works regardless of
      // cookie configuration). Fall back to httpOnly cookie if not available.
      const stored = loadPersistedSession();
      const body = stored?.refreshToken ? { refreshToken: stored.refreshToken } : {};

      try {
        const res = await axios.post<RefreshResult>(
          "/api/auth/refresh",
          body,
          { withCredentials: true }
        );
        accessToken = res.data.accessToken;
        persistSession(res.data);
        return res.data;
      } catch (err) {
        accessToken = null;
        if (axios.isAxiosError(err)) {
          console.error(
            "[auth] refresh failed — status:",
            err.response?.status ?? "no response",
            "body:",
            err.response?.data ?? "none"
          );
        } else {
          console.error("[auth] refresh failed — network/unexpected error:", err);
        }
        return null;
      } finally {
        setTimeout(() => {
          refreshPromise = null;
        }, 0);
      }
    })();
  }
  return refreshPromise;
};

// Kept for the response interceptor — only needs the token
const refreshAccessToken = async (): Promise<string | null> => {
  const data = await doRefresh();
  return data?.accessToken ?? null;
};

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as AxiosRequestConfig & { _retried?: boolean };
    const status = err.response?.status;
    const url = original?.url ?? "";
    const isAuthCall = url.includes("/api/auth/");

    if (status === 401 && !original?._retried && !isAuthCall) {
      original._retried = true;
      const fresh = await refreshAccessToken();
      if (fresh) {
        original.headers = {
          ...(original.headers ?? {}),
          Authorization: `Bearer ${fresh}`,
        };
        return api.request(original);
      }
      onUnauthorized?.();
    }
    return Promise.reject(err);
  }
);

export { refreshAccessToken };
