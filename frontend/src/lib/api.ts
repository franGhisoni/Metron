import axios, { AxiosError, type AxiosRequestConfig } from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export const api = axios.create({
  baseURL: BASE_URL,
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

// Shape returned by POST /api/auth/refresh
export type RefreshResult = {
  accessToken: string;
  user: { id: string; email: string; phone: string | null; currencyPref: "ARS" | "USD" };
};

// Single in-flight promise so concurrent callers share one HTTP request
let refreshPromise: Promise<RefreshResult | null> | null = null;

export const doRefresh = async (): Promise<RefreshResult | null> => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await axios.post<RefreshResult>(
          `${BASE_URL}/api/auth/refresh`,
          {},
          { withCredentials: true }
        );
        accessToken = res.data.accessToken;
        return res.data;
      } catch {
        accessToken = null;
        return null;
      } finally {
        // small delay so concurrent requests share the same promise
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
