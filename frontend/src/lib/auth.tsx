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
import { api, doRefresh, setAccessToken, setOnUnauthorized } from "./api";

export type User = {
  id: string;
  email: string;
  phone: string | null;
  currencyPref: "ARS" | "USD";
};

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, phone?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

// Module-level guard: prevents React 18 StrictMode's double-mount from firing two
// concurrent refresh requests with the same cookie. Both requests would carry the
// same (not-yet-rotated) token; whichever arrived second would see the token already
// revoked, trigger revokeAllUserRefreshTokens, and lock the user out on every load.
let _bootstrapped = false;

const SESSION_FLAG = "metron:has-session";
export const markSessionActive = () => localStorage.setItem(SESSION_FLAG, "1");
export const clearSessionFlag = () => localStorage.removeItem(SESSION_FLAG);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  // Always start loading=true so ProtectedRoute waits for bootstrap before redirecting.
  const [loading, setLoading] = useState(true);
  const didBootstrap = useRef(false);

  const clearAuth = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  // refresh() calls /api/auth/refresh and uses the returned user directly —
  // no extra /api/auth/me round-trip needed.
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
    // Use the module-level flag (not a ref) so the StrictMode remount also sees it.
    if (_bootstrapped || didBootstrap.current) return;
    _bootstrapped = true;
    didBootstrap.current = true;
    (async () => {
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ user: User; accessToken: string }>("/api/auth/login", {
      email,
      password,
    });
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
    markSessionActive();
  }, []);

  const register = useCallback(
    async (email: string, password: string, phone?: string) => {
      const res = await api.post<{ user: User; accessToken: string }>("/api/auth/register", {
        email,
        password,
        phone,
      });
      setAccessToken(res.data.accessToken);
      setUser(res.data.user);
      markSessionActive();
    },
    []
  );

  const logout = useCallback(async () => {
    _bootstrapped = false; // allow bootstrap to re-run after login
    try {
      await api.post("/api/auth/logout");
    } finally {
      clearSessionFlag();
      clearAuth();
    }
  }, [clearAuth]);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, register, logout, refresh }),
    [user, loading, login, register, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
