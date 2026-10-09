import axios, { AxiosError, type AxiosRequestConfig } from "axios";

// Always use same-origin /api requests. Vite proxies them locally and nginx
// proxies them in production, avoiding browser CORS and cross-site cookie issues.
export const api = axios.create({
  withCredentials: true,
  timeout: 10_000,
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
  user: {
    id: string;
    email: string;
    phone: string | null;
    currencyPref: "ARS" | "USD";
    fiftyThirtyTwenty: boolean;
    liquidityAlertThreshold: string | null;
  };
};

export const clearLegacySession = () => {
  try {
    localStorage.removeItem("metron:session");
  } catch {
    // Storage can be unavailable in private browsing.
  }
};

export const clearLegacyApiCache = async () => {
  try {
    if ("caches" in window) await caches.delete("metron-api");
  } catch {
    // Cache Storage can be unavailable; API requests still use the network.
  }
};

// Single in-flight promise so concurrent callers share one HTTP request
let refreshPromise: Promise<RefreshResult | null> | null = null;

export const doRefresh = async (): Promise<RefreshResult | null> => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await axios.post<RefreshResult>(
          "/api/auth/refresh",
          {},
          { withCredentials: true, timeout: 10_000 }
        );
        accessToken = res.data.accessToken;
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
