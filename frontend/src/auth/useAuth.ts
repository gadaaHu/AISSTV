import { useContext } from "react";
import { AuthContext } from "./context";

/**
 * Returns the current auth context value.
 * Must be called inside an `<AuthProvider>`.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
