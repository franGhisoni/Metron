import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  clearLegacyApiCache,
  clearLegacySession,
  doRefresh,
  setAccessToken,
  setOnUnauthorized,
  type RefreshResult,
} from "./api";
import { queryClient } from "./queryClient";

export type User = {
  id: string;
  email: string;
  phone: string | null;
  currencyPref: "ARS" | "USD";
  fiftyThirtyTwenty: boolean;
  liquidityAlertThreshold: string | null;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, phone?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (body: {
    phone: string | null;
    currencyPref: "ARS" | "USD";
    fiftyThirtyTwenty: boolean;
    liquidityAlertThreshold: string | null;
  }) => Promise<User>;
};

const AuthContext = createContext<AuthState | null>(null);

const clearTransactionDraft = () => {
  try {
    localStorage.removeItem("metron:transactions:quick-draft");
  } catch {
    // Private browsing can block local storage.
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const didBootstrap = useRef(false);

  const clearAuth = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    queryClient.clear();
    clearLegacySession();
    clearTransactionDraft();
    void clearLegacyApiCache();
  }, []);

  const refresh = useCallback(async () => {
    const data = await doRefresh();
    if (!data) {
      clearAuth();
      return;
    }
    setUser(data.user as User);
  }, [clearAuth]);

  useEffect(() => {
    setOnUnauthorized(() => {
      clearAuth();
    });
  }, [clearAuth]);

  useEffect(() => {
    if (didBootstrap.current) return;
    didBootstrap.current = true;

    (async () => {
      clearLegacySession();
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<RefreshResult>("/api/auth/login", { email, password });
    queryClient.clear();
    clearTransactionDraft();
    setAccessToken(res.data.accessToken);
    setUser(res.data.user as User);
  }, []);

  const register = useCallback(
    async (email: string, password: string, phone?: string) => {
      const res = await api.post<RefreshResult>("/api/auth/register", {
        email,
        password,
        phone,
      });
      queryClient.clear();
      clearTransactionDraft();
      setAccessToken(res.data.accessToken);
      setUser(res.data.user as User);
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout", {});
    } catch {
      // Local logout should not depend on the backend being reachable.
    } finally {
      clearAuth();
    }
  }, [clearAuth]);

  const updateProfile = useCallback(async (body: {
    phone: string | null;
    currencyPref: "ARS" | "USD";
    fiftyThirtyTwenty: boolean;
    liquidityAlertThreshold: string | null;
  }) => {
    const res = await api.patch<User>("/api/auth/me", body);
    setUser(res.data);
    return res.data;
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, register, logout, refresh, updateProfile }),
    [user, loading, login, register, logout, refresh, updateProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
