import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import type { Tone } from "../../lib/constants";
import { cn } from "../../lib/utils";
import { toneClasses } from "./Badge";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { IconButton } from "./IconButton";

interface ToastItem {
  id: string;
  tone: Tone;
  message: string;
  description?: string;
}

export interface ToastApi {
  success: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
  dismiss: (id: string) => void;
}

/** Errors linger a little longer: they usually need reading twice. */
const TOAST_DURATION_MS = 5_000;
const ERROR_DURATION_MS = 8_000;

const TOAST_ICONS: Record<Tone, IconName> = {
  neutral: "info",
  brand: "info",
  success: "check",
  warning: "alert",
  danger: "alert",
  info: "info",
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const fallbackCount = useRef(0);

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const nextId = useCallback((): string => {
    // `crypto.randomUUID` needs a secure context (https or localhost); the
    // timestamp plus counter keeps ids unique when it is unavailable.
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    fallbackCount.current += 1;
    return `toast-${Date.now()}-${fallbackCount.current}`;
  }, []);

  const push = useCallback(
    (tone: Tone, message: string, description?: string) => {
      const id = nextId();
      setToasts((current) => [...current, { id, tone, message, description }]);

      const timer = setTimeout(
        () => {
          timers.current.delete(id);
          setToasts((current) => current.filter((toast) => toast.id !== id));
        },
        tone === "danger" ? ERROR_DURATION_MS : TOAST_DURATION_MS,
      );
      timers.current.set(id, timer);
    },
    [nextId],
  );

  // One effect to clear every outstanding timer when the provider unmounts.
  // The map is captured once here, so the cleanup cannot see a different ref.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, description) => push("success", message, description),
      error: (message, description) => push("danger", message, description),
      info: (message, description) => push("info", message, description),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed top-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border p-3 shadow-lg",
              toneClasses[toast.tone],
            )}
          >
            <Icon
              name={TOAST_ICONS[toast.tone]}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold break-words">
                {toast.message}
              </p>
              {toast.description ? (
                <p className="mt-0.5 text-xs opacity-90">
                  {toast.description}
                </p>
              ) : null}
            </div>
            <IconButton
              icon="close"
              label={`Dismiss: ${toast.message}`}
              size="sm"
              className="-mt-1 -mr-1 h-7 w-7"
              onClick={() => dismiss(toast.id)}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs beside its provider; the barrel re-exports both on purpose.
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error("useToast must be used inside a <ToastProvider>.");
  }
  return api;
}
