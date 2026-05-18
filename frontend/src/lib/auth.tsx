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
  doRefresh,
  setAccessToken,
  setOnUnauthorized,
  persistSession,
  clearPersistedSession,
  loadPersistedSession,
  updatePersistedUser,
  type RefreshResult,
} from "./api";

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

// Module-level guard: prevents React 18 StrictMode double-mount from firing
// two concurrent refreshes.
let _bootstrapped = false;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const didBootstrap = useRef(false);

  const clearAuth = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    clearPersistedSession();
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
    if (_bootstrapped || didBootstrap.current) return;
    _bootstrapped = true;
    didBootstrap.current = true;

    (async () => {
      // ── Fast path: restore from localStorage ────────────────────────────
      const stored = loadPersistedSession();
      if (stored) {
        setAccessToken(stored.accessToken);
        setUser(stored.user as User);
        setLoading(false);

        // Background-refresh to rotate the token. If it fails the user stays
        // logged in until the stored access token expires, at which point the
        // API interceptor will call clearAuth().
        doRefresh().then((fresh) => {
          if (fresh) setUser(fresh.user as User);
        });
        return;
      }

      // ── Slow path: no localStorage — try cookie or re-login ─────────────
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<RefreshResult>("/api/auth/login", { email, password });
    setAccessToken(res.data.accessToken);
    setUser(res.data.user as User);
    persistSession(res.data);
  }, []);

  const register = useCallback(
    async (email: string, password: string, phone?: string) => {
      const res = await api.post<RefreshResult>("/api/auth/register", {
        email,
        password,
        phone,
      });
      setAccessToken(res.data.accessToken);
      setUser(res.data.user as User);
      persistSession(res.data);
    },
    []
  );

  const logout = useCallback(async () => {
    _bootstrapped = false;
    const stored = loadPersistedSession();
    try {
      await api.post(
        "/api/auth/logout",
        stored?.refreshToken ? { refreshToken: stored.refreshToken } : {}
      );
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
    updatePersistedUser(res.data);
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
