import { createContext } from "react";
import type { UserOut } from "../api/types";

export interface AuthContextValue {
  /** The signed-in user, or `null` when there is no valid session. */
  user: UserOut | null;
  /** True while a stored session is still being validated. */
  loading: boolean;
  /** The most recent auth failure, for display on the sign-in screen. */
  error: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
  clearError: () => void;
}

/**
 * Kept in its own module so `AuthProvider` (a component) and `useAuth` (a hook)
 * can both import it without mixing component and non-component exports in one
 * file, which breaks fast refresh.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);
