import { useCallback, useEffect, useState } from "react";

/** Persisted theme choice. `system` follows the OS setting. */
export const THEME_STORAGE_KEY = "aisstv.theme";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(DARK_QUERY).matches;
}

function readStoredPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // Storage can be unavailable; fall through to the default.
  }
  return "system";
}

export interface UseThemeResult {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
  /** Flips between light and dark, leaving `system` behind. */
  toggle: () => void;
}

/**
 * Class-based theming.
 *
 * `index.html` applies the stored theme before first paint so there is no flash;
 * this hook keeps the DOM class in sync afterwards and follows the OS setting
 * while the preference is `system`.
 */
export function useTheme(): UseThemeResult {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    readStoredPreference,
  );
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  // Track the OS setting, so `system` stays live rather than being sampled once.
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolved: ResolvedTheme =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Non-fatal: the choice just will not survive a reload.
    }
  }, []);

  const toggle = useCallback(() => {
    setPreference(resolved === "dark" ? "light" : "dark");
  }, [resolved, setPreference]);

  return { preference, resolved, setPreference, toggle };
}
