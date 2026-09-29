import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  clearToken,
  getToken,
  login as apiLogin,
  setUnauthorizedHandler,
} from "../api/client";
import type { UserOut } from "../api/types";

interface AuthState {
  user: UserOut | null;
  loading: boolean;
  error: string | null;
  login: (u: string, p: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setError("Session expired. Please log in again.");
    });
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<UserOut>("/auth/me")
      .then(setUser)
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      error,
      async login(username: string, password: string) {
        setError(null);
        try {
          await apiLogin(username, password);
          const me = await api.get<UserOut>("/auth/me");
          setUser(me);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Login failed");
          throw e;
        }
      },
      logout() {
        clearToken();
        setUser(null);
      },
    }),
    [user, loading, error],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
